"""DeepAgent factory plus sandbox lifecycle."""

from __future__ import annotations

import os
import shutil
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, FilesystemBackend, LocalShellBackend
from deepagents.middleware.filesystem import FilesystemPermission
from deepagents.middleware.summarization import create_summarization_tool_middleware
from langchain_quickjs import CodeInterpreterMiddleware
from langchain_openrouter import ChatOpenRouter
from langgraph.checkpoint.memory import MemorySaver


DEFAULT_MODEL = "openrouter/free"
DEFAULT_PROVIDER = "daytona"
DOTENV_PATH = Path(".env")
SKILLS_ROOT = Path(__file__).resolve().parent.parent / "skills"


SYSTEM_PROMPT = """You are Vibecode Arena, a coding game agent.

Goal:
- Build UI component submissions inside sandbox filesystem.
- Start every non-trivial run by using the planning/todo tool.
- Keep challenge and participant context in files, then read only what is needed.
- Use sandbox tools to write files, run checks, inspect failures, improve output.
- Use the interpreter for structured transforms, batching, or tool composition inside the agent loop.
- Delegate isolated subtasks to subagents when it keeps the main context focused.
- Return concise progress plus final file paths changed.

Rules:
- Work in sandbox only.
- Treat /context as source material and /workspace as the submission workspace.
- Prefer small runnable artifacts.
- Run commands through sandbox execute tool.
- Never claim code works unless you ran relevant command or explain why not.
"""


SUBAGENTS = [
    {
        "name": "ui-builder",
        "description": "Builds UI components and app files in sandbox.",
        "system_prompt": "Create clean, runnable UI code. Keep files focused.",
    },
    {
        "name": "visual-reviewer",
        "description": "Reviews component output against prompt/reference.",
        "system_prompt": "Find visual gaps, styling mismatches, and polish issues.",
    },
    {
        "name": "test-runner",
        "description": "Runs sandbox commands and diagnoses failures.",
        "system_prompt": "Run checks, summarize failing command, propose minimal fix.",
    },
]


def _load_dotenv(path: Path = DOTENV_PATH) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


@dataclass
class AgentSession:
    thread_id: str
    provider: str
    backend: Any
    agent: Any
    sandbox: Any | None = None
    context_root: Path | None = None
    checkpointer: Any | None = None
    messages: list[dict[str, str]] = field(default_factory=list)

    def close(self) -> None:
        if self.provider == "daytona" and self.sandbox is not None:
            cleanup = getattr(self.sandbox, "delete", None) or getattr(self.sandbox, "stop", None)
            if callable(cleanup):
                cleanup()
        if self.context_root is not None:
            shutil.rmtree(self.context_root, ignore_errors=True)


def _openrouter_model() -> ChatOpenRouter:
    model = os.getenv("DEEPAGENT_MODEL", DEFAULT_MODEL).removeprefix("openrouter:")
    return ChatOpenRouter(model=model, temperature=0.2, max_tokens=4096)


def _middleware(model: ChatOpenRouter, backend: Any) -> list[Any]:
    return [
        CodeInterpreterMiddleware(skills_backend=backend),
        create_summarization_tool_middleware(model, backend),
    ]


def _permissions() -> list[FilesystemPermission]:
    return [
        FilesystemPermission(operations=["write"], paths=["/context/**"], mode="deny"),
        FilesystemPermission(operations=["write"], paths=["/skills/**"], mode="deny"),
    ]


def _context_backend(thread_id: str) -> tuple[FilesystemBackend, Path]:
    root = Path(tempfile.gettempdir()) / "vibecode-arena-context" / thread_id
    root.mkdir(parents=True, exist_ok=True)
    return FilesystemBackend(root_dir=root, virtual_mode=True), root


def _skills_backend() -> FilesystemBackend:
    SKILLS_ROOT.mkdir(parents=True, exist_ok=True)
    return FilesystemBackend(root_dir=SKILLS_ROOT, virtual_mode=True)


def _composite_backend(executable_backend: Any, thread_id: str) -> tuple[CompositeBackend, Path]:
    context_backend, context_root = _context_backend(thread_id)
    return (
        CompositeBackend(
            default=executable_backend,
            routes={
                "/context/": context_backend,
                "/skills/": _skills_backend(),
            },
        ),
        context_root,
    )


def _daytona_backend() -> tuple[Any, Any]:
    from daytona import Daytona
    from langchain_daytona import DaytonaSandbox

    sandbox = Daytona().create()
    return DaytonaSandbox(sandbox=sandbox), sandbox


def _local_backend(thread_id: str) -> tuple[Any, None]:
    root = Path(tempfile.gettempdir()) / "vibecode-arena-sandboxes" / thread_id
    root.mkdir(parents=True, exist_ok=True)
    return LocalShellBackend(root_dir=root, virtual_mode=True, inherit_env=False), None


def _execute_approval_enabled() -> bool:
    return os.getenv("DEEPAGENT_REQUIRE_EXECUTE_APPROVAL", "").lower() in {"1", "true", "yes", "on"}


def _interrupt_on() -> dict[str, Any]:
    if not _execute_approval_enabled():
        return {}
    return {
        "execute": {"allowed_decisions": ["approve", "reject"]},
    }


def create_session(thread_id: str | None = None) -> AgentSession:
    _load_dotenv()
    thread_id = thread_id or uuid4().hex
    provider = os.getenv("DEEPAGENT_SANDBOX_PROVIDER", DEFAULT_PROVIDER).lower()

    if provider == "daytona":
        executable_backend, sandbox = _daytona_backend()
    elif provider == "local":
        executable_backend, sandbox = _local_backend(thread_id)
    else:
        raise ValueError(f"Unsupported sandbox provider: {provider}")

    backend, context_root = _composite_backend(executable_backend, thread_id)
    model = _openrouter_model()
    checkpointer = MemorySaver()
    agent = create_deep_agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        backend=backend,
        middleware=_middleware(model, backend),
        subagents=SUBAGENTS,
        skills=["/skills/"],
        permissions=_permissions(),
        interrupt_on=_interrupt_on(),
        checkpointer=checkpointer,
        name="vibecode-arena",
    )
    return AgentSession(
        thread_id=thread_id,
        provider=provider,
        backend=backend,
        sandbox=sandbox,
        agent=agent,
        context_root=context_root,
        checkpointer=checkpointer,
    )
