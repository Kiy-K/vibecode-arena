from dataclasses import dataclass, field

import pytest

from arena.agent import AgentSession
from arena.judge_graph import JudgeGraph
from arena.match_flow import AttemptNotActive, MatchFlow, PermissionDenied, SubmissionNotFound
from arena.match_store import CreateMatchRequest, InMemoryMatchStore
from arena.models import Challenge, ModelPolicy
from arena.vibecoder import VibecoderRunner


@dataclass
class FakeWriteResult:
    error: str | None = None


@dataclass
class FakeBackend:
    files: dict[str, str] = field(default_factory=dict)

    def write(self, path: str, content: str) -> FakeWriteResult:
        self.files[path] = content
        return FakeWriteResult()


class FakeAgent:
    def invoke(self, payload: dict, config: dict) -> dict:
        return {"messages": [{"role": "assistant", "content": "submission ready"}]}


@dataclass
class FakeSandbox:
    id: str = "sandbox-1"


def make_session(thread_id: str | None) -> AgentSession:
    return AgentSession(
        thread_id=thread_id or "thread-1",
        provider="daytona",
        backend=FakeBackend(),
        agent=FakeAgent(),
        sandbox=FakeSandbox(),
    )


def challenge() -> Challenge:
    return Challenge(
        id="challenge-1",
        title="Build card",
        prompt="Build a card UI",
        rubric="Visual polish",
    )


def create_request() -> CreateMatchRequest:
    return CreateMatchRequest(
        challenges=[challenge()],
        model_policy=ModelPolicy(allowed_models=["openrouter/free", "anthropic/claude"]),
    )


def make_flow():
    store = InMemoryMatchStore()
    flow = MatchFlow(
        match_store=store,
        vibecoder=VibecoderRunner(session_factory=make_session),
        judge_graph=JudgeGraph(),
    )
    return store, flow


def test_start_match_creates_attempt_per_participant() -> None:
    store, flow = make_flow()
    host = store.create_match(create_request())
    first = store.join_match(host.match.code, "Ada", "openrouter/free")
    second = store.join_match(host.match.code, "Grace", "openrouter/free")

    view = flow.start_match(host.match.code, host.token)

    assert view.match.status == "playing"
    assert {attempt.participant_id for attempt in view.attempts} == {
        first.participant_id,
        second.participant_id,
    }
    assert all(attempt.status == "active" for attempt in view.attempts)


def test_instruction_submit_and_judge_attempt() -> None:
    store, flow = make_flow()
    host = store.create_match(create_request())
    participant = store.join_match(host.match.code, "Ada", "openrouter/free")
    started = flow.start_match(host.match.code, host.token)
    attempt_id = started.attempts[0].id

    message = flow.send_instruction(attempt_id, participant.token, "Make it responsive.")
    submitted = flow.submit_attempt(attempt_id, participant.token)
    judged = flow.judge_attempt(attempt_id)

    assert message.content == "submission ready"
    assert message.instruction_count == 1
    assert submitted.submission.instruction_count == 1
    assert submitted.attempt.status == "submitted"
    assert judged.attempt.status == "judged"
    assert judged.report.score.value > 0


def test_match_flow_exposes_leaderboard_after_judging() -> None:
    store, flow = make_flow()
    host = store.create_match(create_request())
    participant = store.join_match(host.match.code, "Ada", "openrouter/free")
    started = flow.start_match(host.match.code, host.token)
    attempt_id = started.attempts[0].id

    flow.submit_attempt(attempt_id, participant.token)
    flow.judge_attempt(attempt_id)

    view = flow.get_match_flow(host.match.code)

    assert view.leaderboard[0].participant_id == participant.participant_id
    assert view.leaderboard[0].score.value > 0


def test_match_flow_groups_leaderboard_by_model_choice() -> None:
    store, flow = make_flow()
    host = store.create_match(create_request())
    openrouter = store.join_match(host.match.code, "Ada", "openrouter/free")
    anthropic = store.join_match(host.match.code, "Grace", "anthropic/claude")
    started = flow.start_match(host.match.code, host.token)

    for attempt in started.attempts:
        token = openrouter.token if attempt.participant_id == openrouter.participant_id else anthropic.token
        flow.submit_attempt(attempt.id, token)
        flow.judge_attempt(attempt.id)

    view = flow.get_match_flow(host.match.code)
    by_model = {group.model_choice: group.entries for group in view.leaderboards_by_model}

    assert by_model["openrouter/free"][0].participant_id == openrouter.participant_id
    assert by_model["anthropic/claude"][0].participant_id == anthropic.participant_id


def test_attempt_requires_owning_participant_token() -> None:
    store, flow = make_flow()
    host = store.create_match(create_request())
    first = store.join_match(host.match.code, "Ada", "openrouter/free")
    second = store.join_match(host.match.code, "Grace", "openrouter/free")
    started = flow.start_match(host.match.code, host.token)
    first_attempt = next(attempt for attempt in started.attempts if attempt.participant_id == first.participant_id)

    with pytest.raises(PermissionDenied):
        flow.send_instruction(first_attempt.id, second.token, "Take over.")


def test_submitted_attempt_rejects_more_instructions_and_judge_requires_submission() -> None:
    store, flow = make_flow()
    host = store.create_match(create_request())
    participant = store.join_match(host.match.code, "Ada", "openrouter/free")
    started = flow.start_match(host.match.code, host.token)
    attempt_id = started.attempts[0].id

    with pytest.raises(SubmissionNotFound):
        flow.judge_attempt(attempt_id)

    flow.submit_attempt(attempt_id, participant.token)

    with pytest.raises(AttemptNotActive):
        flow.send_instruction(attempt_id, participant.token, "Too late.")
