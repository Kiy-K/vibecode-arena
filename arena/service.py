"""Unified application API for HTTP, Gradio, and tests."""

from __future__ import annotations

import os
from typing import Any, Callable

from pydantic import BaseModel

from .agent import AgentSession, create_session
from .judge_executor import create_judge_executor
from .judge_graph import JudgeGraph, JudgeReport, OpenRouterRubricReviewer
from .match_flow import JudgeResult, MatchFlow, MatchFlowView, SubmissionResult
from .match_store import (
    CreateMatchRequest,
    HostAccessView,
    InMemoryMatchStore,
    MatchStore,
    MatchView,
    ParticipantAccessView,
)
from .models import Challenge, ScoringPolicy, Submission
from .vibecoder import ThreadMessage, VibecoderRunner


class ArenaServiceError(Exception):
    pass


class ThreadNotFound(ArenaServiceError):
    pass


class AgentRunFailed(ArenaServiceError):
    pass


class FileAccessFailed(ArenaServiceError):
    pass


class JudgeRunFailed(ArenaServiceError):
    pass


class JudgeRequest(BaseModel):
    submission: Submission
    challenge: Challenge
    policy: ScoringPolicy = ScoringPolicy()
    use_llm_rubric: bool = False


class ThreadResponse(BaseModel):
    thread_id: str
    sandbox_provider: str


class MessageResponse(BaseModel):
    thread_id: str
    content: str


class FileEntry(BaseModel):
    path: str
    type: str


SessionFactory = Callable[[], AgentSession]


class ArenaService:
    """Stable API boundary shared by FastAPI and future Gradio handlers."""

    def __init__(
        self,
        *,
        session_factory: SessionFactory = create_session,
        match_store: MatchStore | None = None,
        judge_graph: JudgeGraph | None = None,
        match_flow: MatchFlow | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._match_store = match_store or InMemoryMatchStore()
        self._judge_graph = judge_graph or JudgeGraph(executor=create_judge_executor())
        self._match_flow = match_flow or MatchFlow(
            match_store=self._match_store,
            vibecoder=VibecoderRunner(session_factory=self._attempt_session),
            judge_graph=self._judge_graph,
        )
        self._sessions: dict[str, AgentSession] = {}

    @property
    def sessions(self) -> dict[str, AgentSession]:
        return self._sessions

    def health(self) -> dict[str, str]:
        return {"status": "ok"}

    def create_thread(self) -> ThreadResponse:
        session = self._session_factory()
        self._sessions[session.thread_id] = session
        return ThreadResponse(thread_id=session.thread_id, sandbox_provider=session.provider)

    def send_thread_message(self, thread_id: str, content: str) -> MessageResponse:
        session = self._session(thread_id)
        session.messages.append({"role": "user", "content": content})
        try:
            result = session.agent.invoke(
                {"messages": session.messages},
                config={"configurable": {"thread_id": thread_id}},
            )
        except Exception as exc:
            raise AgentRunFailed("agent run failed") from exc

        response = _last_message_text(result)
        session.messages.append({"role": "assistant", "content": response})
        return MessageResponse(thread_id=thread_id, content=response)

    def list_thread_files(self, thread_id: str, path: str = "/") -> list[FileEntry]:
        session = self._session(thread_id)
        result = session.backend.ls(path)
        if getattr(result, "error", None):
            raise FileAccessFailed("could not list files")
        entries = getattr(result, "entries", [])
        return [_file_entry(entry) for entry in entries]

    def read_thread_file(self, thread_id: str, path: str) -> dict[str, str]:
        session = self._session(thread_id)
        result = session.backend.read(path)
        if getattr(result, "error", None):
            raise FileAccessFailed("could not read file")
        file_data = getattr(result, "file_data", {})
        return {"path": path, "content": _file_content(file_data)}

    def delete_thread(self, thread_id: str) -> dict[str, bool]:
        session = self._sessions.pop(thread_id, None)
        if session is None:
            raise ThreadNotFound("thread not found")
        session.close()
        return {"deleted": True}

    def create_match(self, request: CreateMatchRequest) -> HostAccessView:
        return self._match_store.create_match(request)

    def join_match(self, code: str, name: str, model_choice: str) -> ParticipantAccessView:
        return self._match_store.join_match(code, name, model_choice)

    def rejoin(self, token: str) -> HostAccessView | ParticipantAccessView:
        return self._match_store.rejoin(token)

    def get_match_view(self, code: str) -> MatchView:
        return self._match_store.get_match_view(code)

    def start_match(self, code: str, host_token: str) -> MatchFlowView:
        return self._match_flow.start_match(code, host_token)

    def get_match_flow(self, code: str) -> MatchFlowView:
        return self._match_flow.get_match_flow(code)

    def send_attempt_instruction(
        self,
        attempt_id: str,
        participant_token: str,
        content: str,
    ) -> ThreadMessage:
        return self._match_flow.send_instruction(attempt_id, participant_token, content)

    def submit_attempt(self, attempt_id: str, participant_token: str) -> SubmissionResult:
        return self._match_flow.submit_attempt(attempt_id, participant_token)

    def judge_attempt(self, attempt_id: str) -> JudgeResult:
        return self._match_flow.judge_attempt(attempt_id)

    def judge_submission(self, request: JudgeRequest) -> JudgeReport:
        try:
            graph = self._judge_graph
            if request.use_llm_rubric or _judge_use_llm():
                graph = JudgeGraph(rubric_reviewer=OpenRouterRubricReviewer())
            return graph.report(request.submission, request.challenge, request.policy)
        except Exception as exc:
            raise JudgeRunFailed("judge run failed") from exc

    def _session(self, thread_id: str) -> AgentSession:
        session = self._sessions.get(thread_id)
        if session is None:
            raise ThreadNotFound("thread not found")
        return session

    def _attempt_session(self, thread_id: str | None) -> AgentSession:
        try:
            return self._session_factory(thread_id)  # type: ignore[misc]
        except TypeError:
            return self._session_factory()


def _file_entry(entry: Any) -> FileEntry:
    path = entry.get("path", "") if isinstance(entry, dict) else getattr(entry, "path", "")
    is_dir = entry.get("is_dir") if isinstance(entry, dict) else getattr(entry, "is_dir", False)
    return FileEntry(path=str(path), type="directory" if is_dir else "file")


def _file_content(file_data: Any) -> str:
    if isinstance(file_data, dict):
        return str(file_data.get("content", ""))
    return str(getattr(file_data, "content", ""))


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


def _judge_use_llm() -> bool:
    return os.getenv("JUDGE_USE_LLM", "").lower() in {"1", "true", "yes", "on"}
