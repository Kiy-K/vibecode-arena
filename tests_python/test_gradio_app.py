from dataclasses import dataclass, field

from arena.agent import AgentSession
from arena.gradio_app import GradioArena
from arena.service import ArenaService


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
        return {"messages": [{"role": "assistant", "content": "built"}]}


@dataclass
class FakeSandbox:
    id: str = "sandbox-1"


def make_session(thread_id: str | None = None) -> AgentSession:
    return AgentSession(
        thread_id=thread_id or "thread-1",
        provider="daytona",
        backend=FakeBackend(),
        agent=FakeAgent(),
        sandbox=FakeSandbox(),
    )


def make_arena() -> GradioArena:
    return GradioArena(ArenaService(session_factory=make_session))


def test_gradio_handlers_create_join_and_start_match() -> None:
    arena = make_arena()

    host_state, status, match, attempts, leaderboard, token = arena.create_match(
        "Build card",
        "Build a responsive card",
        "Visual polish",
        "openrouter/free, anthropic/claude",
    )
    participant_state, _, _, _, _, _ = arena.join_match(
        host_state.match_code,
        "Ada",
        "openrouter/free",
    )
    started_state, started_status, started_match, started_attempts, _, _ = arena.start_match(host_state)

    assert status.startswith("Host match created")
    assert match["code"] == host_state.match_code
    assert token == host_state.token
    assert participant_state.participant_id
    assert started_state.role == "host"
    assert started_status == "Match started"
    assert started_match["status"] == "playing"
    assert len(started_attempts) == 1


def test_gradio_handlers_submit_judge_and_render_leaderboard() -> None:
    arena = make_arena()
    host_state, *_ = arena.create_match("Build card", "Build it", "Good", "openrouter/free")
    participant_state, *_ = arena.join_match(host_state.match_code, "Ada", "openrouter/free")
    _, _, _, attempts, _, _ = arena.start_match(host_state)
    attempt_id = attempts[0][0]

    _, instruction_status, _, _, _, _ = arena.send_instruction(
        participant_state,
        attempt_id,
        "Make it dense.",
    )
    _, submit_status, _, submitted_attempts, _, _ = arena.submit_attempt(participant_state, attempt_id)
    _, judge_status, _, _, leaderboard, _ = arena.judge_attempt(participant_state, attempt_id)

    assert instruction_status == "Instruction 1: built"
    assert submit_status.startswith("Submitted ")
    assert submitted_attempts[0][3] == "submitted"
    assert judge_status.startswith("Judged ")
    assert leaderboard[0][0] == "openrouter/free"
    assert leaderboard[0][1] == participant_state.participant_id
