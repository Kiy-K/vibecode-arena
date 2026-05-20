"""Competition-facing wrapper around DeepAgent sessions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable
from uuid import uuid4

from .agent import AgentSession, create_session
from .judge_executor import snapshot_backend_workspace, snapshot_local_workspace
from .models import Challenge, Submission


CONTEXT_DIR = "/context"
WORKSPACE_DIR = "/workspace"


@dataclass
class AttemptRuntime:
    id: str
    match_id: str
    participant_id: str
    challenge_id: str
    model_choice: str
    thread_id: str
    session: AgentSession
    instruction_count: int = 0


@dataclass(frozen=True)
class ThreadMessage:
    attempt_id: str
    thread_id: str
    content: str
    instruction_count: int


@dataclass(frozen=True)
class StreamEvent:
    attempt_id: str
    thread_id: str
    kind: str
    source: str
    content: str


SessionFactory = Callable[[str | None], AgentSession]


class VibecoderRunner:
    """Starts and drives one sandboxed Vibecoder per challenge attempt."""

    def __init__(self, session_factory: SessionFactory = create_session) -> None:
        self._session_factory = session_factory
        self._attempts: dict[str, AttemptRuntime] = {}

    def start_attempt(
        self,
        *,
        match_id: str,
        participant_id: str,
        challenge: Challenge,
        model_choice: str,
    ) -> AttemptRuntime:
        attempt_id = uuid4().hex
        session = self._session_factory(attempt_id)
        runtime = AttemptRuntime(
            id=attempt_id,
            match_id=match_id,
            participant_id=participant_id,
            challenge_id=challenge.id,
            model_choice=model_choice,
            thread_id=session.thread_id,
            session=session,
        )
        self._seed_context(runtime, challenge)
        self._attempts[attempt_id] = runtime
        return runtime

    def send_context(self, attempt_id: str, content: str) -> ThreadMessage:
        runtime = self._require_attempt(attempt_id)
        message = self._record_instruction(runtime, content)
        runtime.session.messages.append(message)
        result = runtime.session.agent.invoke(
            {"messages": runtime.session.messages},
            config=_run_config(runtime),
        )
        response = _last_message_text(result)
        runtime.session.messages.append({"role": "assistant", "content": response})
        return ThreadMessage(
            attempt_id=attempt_id,
            thread_id=runtime.thread_id,
            content=response,
            instruction_count=runtime.instruction_count,
        )

    def stream_context(self, attempt_id: str, content: str) -> list[StreamEvent]:
        runtime = self._require_attempt(attempt_id)
        message = self._record_instruction(runtime, content)
        runtime.session.messages.append(message)

        response_parts: list[str] = []
        events: list[StreamEvent] = []
        for chunk in runtime.session.agent.stream(
            {"messages": runtime.session.messages},
            config=_run_config(runtime),
            stream_mode=["updates", "messages", "custom"],
            subgraphs=True,
            version="v2",
        ):
            event = _stream_event(runtime, chunk)
            if event is not None:
                events.append(event)
                if event.kind == "message":
                    response_parts.append(event.content)

        if response_parts:
            runtime.session.messages.append({"role": "assistant", "content": "".join(response_parts)})
        return events

    def snapshot_submission(self, attempt_id: str) -> Submission:
        runtime = self._require_attempt(attempt_id)
        submission_id = uuid4().hex
        return Submission(
            id=submission_id,
            attempt_id=attempt_id,
            archive_pointer=_archive_pointer(runtime, submission_id),
            instruction_count=runtime.instruction_count,
        )

    def close_attempt(self, attempt_id: str) -> None:
        runtime = self._attempts.pop(attempt_id, None)
        if runtime is not None:
            runtime.session.close()

    def _seed_context(self, runtime: AttemptRuntime, challenge: Challenge) -> None:
        self._write_file(runtime.session.backend, f"{CONTEXT_DIR}/challenge.md", _challenge_markdown(challenge))
        self._write_file(
            runtime.session.backend,
            f"{CONTEXT_DIR}/participant.md",
            (
                f"# Participant\n\n"
                f"- Match: {runtime.match_id}\n"
                f"- Participant: {runtime.participant_id}\n"
                f"- Model choice: {runtime.model_choice}\n"
            ),
        )
        self._write_file(
            runtime.session.backend,
            f"{WORKSPACE_DIR}/README.md",
            "# Workspace\n\nBuild the submission in this directory.\n",
        )

    def _write_file(self, backend: Any, path: str, content: str) -> None:
        result = backend.write(path, content)
        if getattr(result, "error", None):
            raise RuntimeError(f"could not write sandbox file: {path}")

    def _record_instruction(self, runtime: AttemptRuntime, content: str) -> dict[str, str]:
        if not content.strip():
            raise ValueError("context content is required")

        runtime.instruction_count += 1
        instruction_path = f"{CONTEXT_DIR}/instructions/{runtime.instruction_count:04d}.md"
        self._write_file(runtime.session.backend, instruction_path, content)
        return {
            "role": "user",
            "content": (
                f"Participant context engineering update #{runtime.instruction_count} "
                f"was saved at {instruction_path}.\n\n"
                "Use the planning/todo tool, inspect /context/challenge.md, then work in /workspace."
            ),
        }

    def _require_attempt(self, attempt_id: str) -> AttemptRuntime:
        runtime = self._attempts.get(attempt_id)
        if runtime is None:
            raise KeyError(f"unknown attempt: {attempt_id}")
        return runtime


def _challenge_markdown(challenge: Challenge) -> str:
    checks = "\n".join(
        f"- {check.name}: `{check.command}` (weight {check.weight})"
        for check in challenge.acceptance_checks
    ) or "- None"
    return (
        f"# {challenge.title}\n\n"
        f"Challenge ID: {challenge.id}\n\n"
        "## Prompt\n\n"
        f"{challenge.prompt}\n\n"
        "## Rubric\n\n"
        f"{challenge.rubric}\n\n"
        "## Acceptance Checks\n\n"
        f"{checks}\n"
    )


def _content(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(
            str(item.get("text", item)) if isinstance(item, dict) else str(item) for item in value
        )
    return str(value or "")


def _last_message_text(result: dict[str, Any]) -> str:
    messages = result.get("messages", [])
    if not messages:
        return ""
    last = messages[-1]
    content = getattr(last, "content", None)
    if content is None and isinstance(last, dict):
        content = last.get("content")
    return _content(content)


def _run_config(runtime: AttemptRuntime) -> dict[str, dict[str, str]]:
    return {"configurable": {"thread_id": runtime.thread_id, "attempt_id": runtime.id}}


def _stream_event(runtime: AttemptRuntime, chunk: dict[str, Any]) -> StreamEvent | None:
    kind = str(chunk.get("type", ""))
    source = _stream_source(chunk.get("ns", ()))
    data = chunk.get("data")

    if kind == "messages" and isinstance(data, tuple) and data:
        token = data[0]
        content = _content(token.get("content", "") if isinstance(token, dict) else getattr(token, "content", ""))
        if content:
            return StreamEvent(runtime.id, runtime.thread_id, "message", source, content)
        tool_chunks = (token.get("tool_call_chunks") if isinstance(token, dict) else getattr(token, "tool_call_chunks", None)) or []
        if tool_chunks:
            names = ", ".join(str(item.get("name")) for item in tool_chunks if item.get("name"))
            if names:
                return StreamEvent(runtime.id, runtime.thread_id, "tool_call", source, names)
        token_type = token.get("type", "") if isinstance(token, dict) else getattr(token, "type", "")
        if token_type == "tool":
            token_content = token.get("content", "") if isinstance(token, dict) else getattr(token, "content", "")
            return StreamEvent(runtime.id, runtime.thread_id, "tool_result", source, _content(token_content))
        return None

    if kind == "updates":
        if isinstance(data, dict):
            return StreamEvent(runtime.id, runtime.thread_id, "update", source, ", ".join(str(key) for key in data))
        return StreamEvent(runtime.id, runtime.thread_id, "update", source, _content(data))

    if kind == "custom":
        return StreamEvent(runtime.id, runtime.thread_id, "custom", source, _content(data))

    return None


def _stream_source(namespace: Any) -> str:
    if not namespace:
        return "main"
    if isinstance(namespace, (list, tuple)):
        for segment in namespace:
            segment_text = str(segment)
            if segment_text.startswith("tools:"):
                return "subagent"
    return "main"


def _archive_pointer(runtime: AttemptRuntime, submission_id: str) -> str:
    try:
        return snapshot_backend_workspace(runtime.session.backend, submission_id)
    except (AttributeError, FileNotFoundError, RuntimeError, ValueError):
        pass
    if runtime.session.provider == "local":
        source_root = _local_source_root(runtime.session.backend)
        if source_root is not None:
            return snapshot_local_workspace(source_root, submission_id)
    sandbox_id = getattr(runtime.session.sandbox, "id", None) or runtime.thread_id
    return (
        f"{runtime.session.provider}://sandbox/{sandbox_id}/workspace"
        f"?attempt={runtime.id}&submission={submission_id}"
    )


def _local_source_root(backend: Any) -> Any | None:
    executable_backend = getattr(backend, "default", backend)
    return getattr(executable_backend, "cwd", None)
