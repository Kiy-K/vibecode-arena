"""Competition lifecycle conductor.

This module connects Match records, Vibecoder attempts, Submissions, and the
Judge graph. Persistence is intentionally in-memory for the skeleton; Redis can
replace this state behind the same service boundary later.
"""

from __future__ import annotations

from datetime import timedelta
from pydantic import BaseModel, Field

from .judge_graph import JudgeGraph, JudgeReport
from .match_store import (
    MatchStore,
    MatchView,
    ParticipantAccessView,
)
from .models import ChallengeAttempt, Score, Submission, utc_now
from .vibecoder import ThreadMessage, VibecoderRunner


DEFAULT_DEADLINE_SECONDS = 10 * 60


class MatchFlowError(ValueError):
    pass


class AttemptNotFound(MatchFlowError):
    pass


class AttemptNotActive(MatchFlowError):
    pass


class PermissionDenied(MatchFlowError):
    pass


class SubmissionNotFound(MatchFlowError):
    pass


class AttemptView(BaseModel):
    id: str
    match_id: str
    challenge_id: str
    participant_id: str
    thread_id: str
    status: str
    latest_submission_id: str | None = None
    score: Score | None = None


class LeaderboardEntry(BaseModel):
    participant_id: str
    model_choice: str
    score: Score


class LeaderboardGroup(BaseModel):
    model_choice: str
    entries: list[LeaderboardEntry] = Field(default_factory=list)


class MatchFlowView(BaseModel):
    match: MatchView
    attempts: list[AttemptView]
    leaderboard: list[LeaderboardEntry] = Field(default_factory=list)
    leaderboards_by_model: list[LeaderboardGroup] = Field(default_factory=list)


class SubmissionResult(BaseModel):
    attempt: AttemptView
    submission: Submission


class JudgeResult(BaseModel):
    attempt: AttemptView
    report: JudgeReport


class MatchFlow:
    """Coordinates the end-to-end competition skeleton."""

    def __init__(
        self,
        *,
        match_store: MatchStore,
        vibecoder: VibecoderRunner,
        judge_graph: JudgeGraph,
        deadline_seconds: int = DEFAULT_DEADLINE_SECONDS,
    ) -> None:
        self._match_store = match_store
        self._vibecoder = vibecoder
        self._judge_graph = judge_graph
        self._deadline_seconds = deadline_seconds
        self._attempts_by_id: dict[str, ChallengeAttempt] = {}
        self._attempt_ids_by_match: dict[str, list[str]] = {}
        self._match_codes_by_id: dict[str, str] = {}
        self._submissions_by_id: dict[str, Submission] = {}

    def start_match(self, code: str, host_token: str) -> MatchFlowView:
        match = self._match_store.start_match(code, host_token)
        if self._attempt_ids_by_match.get(match.id):
            return self.get_match_flow(match.code)

        self._match_codes_by_id[match.id] = match.code
        challenge = match.challenges[match.current_round]
        deadline_at = utc_now() + timedelta(seconds=self._deadline_seconds)
        attempt_ids: list[str] = []
        for participant in match.participants:
            runtime = self._vibecoder.start_attempt(
                match_id=match.id,
                participant_id=participant.id,
                challenge=challenge,
                model_choice=participant.model_choice,
            )
            attempt = ChallengeAttempt(
                id=runtime.id,
                match_id=match.id,
                challenge_id=challenge.id,
                participant_id=participant.id,
                thread_id=runtime.thread_id,
                sandbox_id=getattr(getattr(runtime.session, "sandbox", None), "id", None),
                deadline_at=deadline_at,
            )
            self._attempts_by_id[attempt.id] = attempt
            attempt_ids.append(attempt.id)
        self._attempt_ids_by_match[match.id] = attempt_ids
        attempts = [self._attempt_view(self._attempts_by_id[id_]) for id_ in attempt_ids]
        return self._flow_view(match, attempts)

    def get_match_flow(self, code: str) -> MatchFlowView:
        match = self._match_store.get_match_view(code)
        attempts = [
            self._attempt_view(self._attempts_by_id[id_])
            for id_ in self._attempt_ids_by_match.get(match.id, [])
        ]
        return self._flow_view(match, attempts)

    def send_instruction(self, attempt_id: str, participant_token: str, content: str) -> ThreadMessage:
        attempt = self._require_attempt(attempt_id)
        self._require_participant(attempt, participant_token)
        self._require_active(attempt)
        return self._vibecoder.send_context(attempt_id, content)

    def submit_attempt(self, attempt_id: str, participant_token: str) -> SubmissionResult:
        attempt = self._require_attempt(attempt_id)
        self._require_participant(attempt, participant_token)
        self._require_active(attempt)
        submission = self._vibecoder.snapshot_submission(attempt_id)
        self._submissions_by_id[submission.id] = submission
        attempt.latest_submission_id = submission.id
        attempt.status = "submitted"
        return SubmissionResult(attempt=self._attempt_view(attempt), submission=submission)

    def judge_attempt(self, attempt_id: str) -> JudgeResult:
        attempt = self._require_attempt(attempt_id)
        if attempt.latest_submission_id is None:
            raise SubmissionNotFound("attempt has no submission")
        submission = self._submissions_by_id[attempt.latest_submission_id]
        match = self._match_by_id(attempt.match_id)
        challenge = _challenge_by_id(match, attempt.challenge_id)
        report = self._judge_graph.report(submission, challenge, match.scoring_policy)
        attempt.score = report.score
        attempt.status = "judged"
        return JudgeResult(attempt=self._attempt_view(attempt), report=report)

    def _require_attempt(self, attempt_id: str) -> ChallengeAttempt:
        attempt = self._attempts_by_id.get(attempt_id)
        if attempt is None:
            raise AttemptNotFound("attempt not found")
        return attempt

    def _require_active(self, attempt: ChallengeAttempt) -> None:
        if attempt.status != "active":
            raise AttemptNotActive("attempt is not active")
        if utc_now() > attempt.deadline_at:
            attempt.status = "missed"
            raise AttemptNotActive("attempt deadline has passed")

    def _require_participant(self, attempt: ChallengeAttempt, token: str) -> ParticipantAccessView:
        access = self._match_store.rejoin(token)
        if not isinstance(access, ParticipantAccessView):
            raise PermissionDenied("participant token required")
        if access.match.id != attempt.match_id or access.participant_id != attempt.participant_id:
            raise PermissionDenied("token does not control this attempt")
        return access

    def _match_by_id(self, match_id: str) -> MatchView:
        code = self._match_codes_by_id.get(match_id)
        if code is None:
            raise MatchFlowError("match not found for attempt")
        return self._match_store.get_match_view(code)

    def _attempt_view(self, attempt: ChallengeAttempt) -> AttemptView:
        return AttemptView(
            id=attempt.id,
            match_id=attempt.match_id,
            challenge_id=attempt.challenge_id,
            participant_id=attempt.participant_id,
            thread_id=attempt.thread_id,
            status=attempt.status,
            latest_submission_id=attempt.latest_submission_id,
            score=attempt.score,
        )

    def _flow_view(self, match: MatchView, attempts: list[AttemptView]) -> MatchFlowView:
        leaderboard = self._leaderboard(match)
        return MatchFlowView(
            match=match,
            attempts=attempts,
            leaderboard=leaderboard,
            leaderboards_by_model=self._leaderboards_by_model(match, leaderboard),
        )

    def _leaderboard(self, match: MatchView) -> list[LeaderboardEntry]:
        model_choices = {participant.id: participant.model_choice for participant in match.participants}
        entries = [
            LeaderboardEntry(
                participant_id=attempt.participant_id,
                model_choice=model_choices.get(attempt.participant_id, ""),
                score=attempt.score,
            )
            for attempt in self._attempts_for_match(match.id)
            if attempt.score is not None
        ]
        return sorted(entries, key=lambda entry: entry.score.value, reverse=True)

    def _leaderboards_by_model(
        self,
        match: MatchView,
        leaderboard: list[LeaderboardEntry],
    ) -> list[LeaderboardGroup]:
        groups = [
            LeaderboardGroup(
                model_choice=model,
                entries=[entry for entry in leaderboard if entry.model_choice == model],
            )
            for model in match.allowed_models
        ]
        return [group for group in groups if group.entries]

    def _attempts_for_match(self, match_id: str) -> list[ChallengeAttempt]:
        return [
            self._attempts_by_id[id_]
            for id_ in self._attempt_ids_by_match.get(match_id, [])
        ]


def _challenge_by_id(match: MatchView, challenge_id: str):
    for challenge in match.challenges:
        if challenge.id == challenge_id:
            return challenge
    raise MatchFlowError("challenge not found for attempt")
