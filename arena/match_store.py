"""Match store seam.

The rest of the app should think in Match records and access views, not Redis keys.
"""

from __future__ import annotations

import secrets
from typing import Protocol
from uuid import uuid4

from pydantic import BaseModel, Field

from .models import Challenge, Match, ModelPolicy, Participant, ScoringPolicy


MATCH_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


class MatchStoreError(ValueError):
    pass


class MatchNotFound(MatchStoreError):
    pass


class MatchNotJoinable(MatchStoreError):
    pass


class InvalidModelChoice(MatchStoreError):
    pass


class InvalidToken(MatchStoreError):
    pass


class CreateMatchRequest(BaseModel):
    challenges: list[Challenge] = Field(min_length=1)
    model_policy: ModelPolicy
    scoring_policy: ScoringPolicy = Field(default_factory=ScoringPolicy)


class ParticipantSummary(BaseModel):
    id: str
    name: str
    model_choice: str


class MatchView(BaseModel):
    id: str
    code: str
    status: str
    current_round: int
    challenges: list[Challenge]
    scoring_policy: ScoringPolicy
    participants: list[ParticipantSummary]
    allowed_models: list[str]


class HostAccessView(BaseModel):
    token: str
    match: MatchView


class ParticipantAccessView(BaseModel):
    token: str
    participant_id: str
    match: MatchView


class MatchStore(Protocol):
    def create_match(self, request: CreateMatchRequest) -> HostAccessView:
        ...

    def join_match(self, code: str, name: str, model_choice: str) -> ParticipantAccessView:
        ...

    def rejoin(self, token: str) -> HostAccessView | ParticipantAccessView:
        ...

    def get_match_view(self, code: str) -> MatchView:
        ...

    def start_match(self, code: str, host_token: str) -> MatchView:
        ...


class InMemoryMatchStore:
    def __init__(self) -> None:
        self._matches_by_code: dict[str, Match] = {}
        self._host_tokens: dict[str, str] = {}
        self._participant_tokens: dict[str, tuple[str, str]] = {}

    def create_match(self, request: CreateMatchRequest) -> HostAccessView:
        code = self._new_match_code()
        host_token = self._new_token()
        match = Match(
            id=self._new_id("match"),
            code=code,
            host={"token": host_token},
            model_policy=request.model_policy,
            scoring_policy=request.scoring_policy,
            challenges=request.challenges,
        )
        self._matches_by_code[match.code] = match
        self._host_tokens[host_token] = match.code
        return HostAccessView(token=host_token, match=self._view(match))

    def join_match(self, code: str, name: str, model_choice: str) -> ParticipantAccessView:
        match = self._get(code)
        if match.status != "waiting":
            raise MatchNotJoinable("match has already started")
        if not match.model_policy.allows(model_choice):
            raise InvalidModelChoice("model is not allowed in this match")

        token = self._new_token()
        participant = Participant(
            id=self._new_id("participant"),
            name=name,
            token=token,
            model_choice=model_choice,
        )
        match.participants.append(participant)
        self._participant_tokens[token] = (match.code, participant.id)
        return ParticipantAccessView(
            token=token,
            participant_id=participant.id,
            match=self._view(match),
        )

    def rejoin(self, token: str) -> HostAccessView | ParticipantAccessView:
        host_match_code = self._host_tokens.get(token)
        if host_match_code is not None:
            return HostAccessView(token=token, match=self.get_match_view(host_match_code))

        participant_access = self._participant_tokens.get(token)
        if participant_access is None:
            raise InvalidToken("token does not match any host or participant")

        match_code, participant_id = participant_access
        return ParticipantAccessView(
            token=token,
            participant_id=participant_id,
            match=self.get_match_view(match_code),
        )

    def get_match_view(self, code: str) -> MatchView:
        return self._view(self._get(code))

    def start_match(self, code: str, host_token: str) -> MatchView:
        match = self._get(code)
        if match.host.token != host_token:
            raise InvalidToken("host token does not control this match")
        match.status = "playing"
        return self._view(match)

    def _get(self, code: str) -> Match:
        match = self._matches_by_code.get(code.upper())
        if match is None:
            raise MatchNotFound("match not found")
        return match

    def _new_match_code(self) -> str:
        while True:
            code = "".join(secrets.choice(MATCH_CODE_ALPHABET) for _ in range(6))
            if code not in self._matches_by_code:
                return code

    def _new_token(self) -> str:
        return secrets.token_urlsafe(32)

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"

    def _view(self, match: Match) -> MatchView:
        return MatchView(
            id=match.id,
            code=match.code,
            status=match.status,
            current_round=match.current_round,
            challenges=match.challenges,
            scoring_policy=match.scoring_policy,
            participants=[
                ParticipantSummary(
                    id=participant.id,
                    name=participant.name,
                    model_choice=participant.model_choice,
                )
                for participant in match.participants
            ],
            allowed_models=match.model_policy.allowed_models,
        )
