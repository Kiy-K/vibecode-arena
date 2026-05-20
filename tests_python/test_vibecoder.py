from dataclasses import dataclass, field
from pathlib import Path

import pytest

from arena.agent import AgentSession
from arena.models import Challenge
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
    def __init__(self) -> None:
        self.invocations: list[dict] = []
        self.streams: list[dict] = []

    def invoke(self, payload: dict, config: dict) -> dict:
        self.invocations.append({"payload": payload, "config": config})
        return {"messages": [{"role": "assistant", "content": "built files in /workspace"}]}

    def stream(self, payload: dict, config: dict, stream_mode: list[str], subgraphs: bool, version: str):
        self.streams.append(
            {
                "payload": payload,
                "config": config,
                "stream_mode": stream_mode,
                "subgraphs": subgraphs,
                "version": version,
            }
        )
        yield {"type": "updates", "ns": (), "data": {"model_request": {}}}
        yield {"type": "messages", "ns": (), "data": ({"content": "done"}, {})}


@dataclass
class FakeSandbox:
    id: str = "sandbox-1"
    deleted: bool = False

    def delete(self) -> None:
        self.deleted = True


def make_challenge() -> Challenge:
    return Challenge(
        id="landing-card",
        title="Landing Card",
        prompt="Build a polished Gradio-compatible frontend artifact.",
        rubric="Visual fidelity, responsiveness, and simple code.",
    )


def make_session(thread_id: str | None) -> AgentSession:
    return AgentSession(
        thread_id=thread_id or "thread-1",
        provider="daytona",
        backend=FakeBackend(),
        agent=FakeAgent(),
        sandbox=FakeSandbox(),
    )


@dataclass
class FakeExecutableBackend:
    cwd: Path


@dataclass
class FakeCompositeBackend(FakeBackend):
    default: FakeExecutableBackend | None = None


def test_start_attempt_seeds_context_files() -> None:
    runner = VibecoderRunner(session_factory=make_session)

    runtime = runner.start_attempt(
        match_id="match-1",
        participant_id="participant-1",
        challenge=make_challenge(),
        model_choice="openrouter/free",
    )

    files = runtime.session.backend.files
    assert "/context/challenge.md" in files
    assert "Landing Card" in files["/context/challenge.md"]
    assert "/context/participant.md" in files
    assert files["/workspace/README.md"].startswith("# Workspace")


def test_send_context_writes_instruction_and_invokes_agent() -> None:
    runner = VibecoderRunner(session_factory=make_session)
    runtime = runner.start_attempt(
        match_id="match-1",
        participant_id="participant-1",
        challenge=make_challenge(),
        model_choice="openrouter/free",
    )

    message = runner.send_context(runtime.id, "Make it dense and responsive.")

    assert message.content == "built files in /workspace"
    assert message.instruction_count == 1
    assert runtime.session.backend.files["/context/instructions/0001.md"] == "Make it dense and responsive."
    assert runtime.session.agent.invocations[0]["config"]["configurable"]["attempt_id"] == runtime.id


def test_send_context_rejects_empty_content() -> None:
    runner = VibecoderRunner(session_factory=make_session)
    runtime = runner.start_attempt(
        match_id="match-1",
        participant_id="participant-1",
        challenge=make_challenge(),
        model_choice="openrouter/free",
    )

    with pytest.raises(ValueError, match="context content is required"):
        runner.send_context(runtime.id, " ")


def test_stream_context_returns_normalized_events() -> None:
    runner = VibecoderRunner(session_factory=make_session)
    runtime = runner.start_attempt(
        match_id="match-1",
        participant_id="participant-1",
        challenge=make_challenge(),
        model_choice="openrouter/free",
    )

    events = runner.stream_context(runtime.id, "Build it live.")

    assert [event.kind for event in events] == ["update", "message"]
    assert events[0].source == "main"
    assert events[1].content == "done"
    assert runtime.session.agent.streams[0]["stream_mode"] == ["updates", "messages", "custom"]
    assert runtime.session.agent.streams[0]["subgraphs"] is True
    assert runtime.session.messages[-1] == {"role": "assistant", "content": "done"}


def test_snapshot_submission_returns_sandbox_pointer() -> None:
    runner = VibecoderRunner(session_factory=make_session)
    runtime = runner.start_attempt(
        match_id="match-1",
        participant_id="participant-1",
        challenge=make_challenge(),
        model_choice="openrouter/free",
    )
    runner.send_context(runtime.id, "Build it.")

    submission = runner.snapshot_submission(runtime.id)

    assert submission.attempt_id == runtime.id
    assert submission.instruction_count == 1
    assert submission.archive_pointer.startswith("daytona://sandbox/sandbox-1/workspace")


def test_snapshot_submission_copies_local_workspace(tmp_path) -> None:
    sandbox_root = tmp_path / "sandbox"
    workspace = sandbox_root / "workspace"
    workspace.mkdir(parents=True)
    (workspace / "answer.txt").write_text("ok")

    def make_local_session(thread_id: str | None) -> AgentSession:
        return AgentSession(
            thread_id=thread_id or "thread-1",
            provider="local",
            backend=FakeCompositeBackend(default=FakeExecutableBackend(cwd=sandbox_root)),
            agent=FakeAgent(),
        )

    runner = VibecoderRunner(session_factory=make_local_session)
    runtime = runner.start_attempt(
        match_id="match-1",
        participant_id="participant-1",
        challenge=make_challenge(),
        model_choice="openrouter/free",
    )

    submission = runner.snapshot_submission(runtime.id)

    assert submission.archive_pointer.startswith("local-snapshot://")


def test_close_attempt_closes_session() -> None:
    runner = VibecoderRunner(session_factory=make_session)
    runtime = runner.start_attempt(
        match_id="match-1",
        participant_id="participant-1",
        challenge=make_challenge(),
        model_choice="openrouter/free",
    )

    runner.close_attempt(runtime.id)

    assert runtime.session.sandbox.deleted is True
    with pytest.raises(KeyError, match="unknown attempt"):
        runner.snapshot_submission(runtime.id)
