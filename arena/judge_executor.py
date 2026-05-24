"""Judge executors and submission snapshot helpers."""

from __future__ import annotations

import os
import re
import shutil
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from deepagents.backends import LocalShellBackend


LOCAL_SNAPSHOT_SCHEME = "local-snapshot://"
DEFAULT_SNAPSHOT_ROOT = Path(tempfile.gettempdir()) / "vibecode-arena-submissions"
DEFAULT_JUDGE_SANDBOX_ROOT = Path(tempfile.gettempdir()) / "vibecode-arena-judge"
SNAPSHOT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


class LocalJudgeExecutor:
    """Runs acceptance checks against copied local submission snapshots."""

    def __init__(self, *, root_dir: Path | None = None, timeout_seconds: int = 20) -> None:
        self.root_dir = root_dir or DEFAULT_SNAPSHOT_ROOT
        self.timeout_seconds = timeout_seconds

    def run(self, archive_pointer: str, command: str) -> tuple[bool, str]:
        workspace = self._workspace(archive_pointer)
        if workspace is None:
            return False, _pointer_error(archive_pointer)
        if not workspace.exists():
            return False, f"snapshot workspace not found: {archive_pointer}"

        try:
            result = subprocess.run(
                ["/bin/sh", "-lc", command],
                cwd=workspace,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                env={"PATH": _judge_path()},
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            output = (exc.stdout or "") + (exc.stderr or "")
            return False, f"{output}\n[Command timed out after {self.timeout_seconds}s]"

        output = result.stdout
        if result.stderr:
            output = f"{output}[stderr] {result.stderr}"
        status = "succeeded" if result.returncode == 0 else "failed"
        return result.returncode == 0, f"{output}\n[Command {status} with exit code {result.returncode}]"

    def _workspace(self, archive_pointer: str) -> Path | None:
        snapshot_id = _snapshot_id(archive_pointer)
        if snapshot_id is None:
            return None
        return self.root_dir / snapshot_id / "workspace"


class SandboxJudgeExecutor:
    """Restores local snapshots into a sandbox backend before running checks."""

    def __init__(
        self,
        *,
        backend_factory: Callable[[], Any],
        root_dir: Path | None = None,
        timeout_seconds: int = 20,
    ) -> None:
        self.root_dir = root_dir or DEFAULT_SNAPSHOT_ROOT
        self.backend = backend_factory()
        self.timeout_seconds = timeout_seconds
        self.workspace_dir = getattr(self.backend, "_judge_workspace", "workspace")
        self._restored: set[str] = set()

    def run(self, archive_pointer: str, command: str) -> tuple[bool, str]:
        snapshot_id = _snapshot_id(archive_pointer)
        if snapshot_id is None:
            return False, _pointer_error(archive_pointer)
        try:
            self._restore(snapshot_id)
        except OSError as exc:
            return False, f"could not restore snapshot: {exc}"

        result = self.backend.execute(f"cd {shlex.quote(self.workspace_dir)} && {command}", timeout=self.timeout_seconds)
        output = getattr(result, "output", "")
        exit_code = getattr(result, "exit_code", None)
        if exit_code is None:
            return True, output
        status = "succeeded" if exit_code == 0 else "failed"
        return exit_code == 0, f"{output}\n[Command {status} with exit code {exit_code}]"

    def close(self) -> None:
        sandbox = getattr(self.backend, "_daytona_sandbox", None)
        if sandbox is None:
            return
        cleanup = getattr(sandbox, "delete", None) or getattr(sandbox, "stop", None)
        if callable(cleanup):
            cleanup()

    def _restore(self, snapshot_id: str) -> None:
        if snapshot_id in self._restored:
            return
        workspace = self.root_dir / snapshot_id / "workspace"
        if not workspace.exists():
            raise FileNotFoundError(f"snapshot workspace not found: {snapshot_id}")
        files = [
            (_sandbox_workspace_path(self.workspace_dir, path.relative_to(workspace).as_posix()), path.read_bytes())
            for path in workspace.rglob("*")
            if path.is_file()
        ]
        results = self.backend.upload_files(files)
        for result in results:
            if getattr(result, "error", None):
                raise RuntimeError(
                    f"could not upload file: {getattr(result, 'path', '')}: {getattr(result, 'error', '')}"
                )
        self._restored.add(snapshot_id)


def create_judge_executor() -> SandboxJudgeExecutor:
    provider = os.getenv("JUDGE_SANDBOX_PROVIDER", "local").lower()
    if provider == "local":
        return SandboxJudgeExecutor(backend_factory=_local_judge_backend)
    if provider == "daytona":
        return SandboxJudgeExecutor(backend_factory=_daytona_judge_backend)
    raise ValueError(f"unsupported judge sandbox provider: {provider}")


def snapshot_local_workspace(
    source_root: Path,
    submission_id: str,
    *,
    root_dir: Path | None = None,
) -> str:
    if not SNAPSHOT_ID_PATTERN.fullmatch(submission_id):
        raise ValueError("invalid submission id")

    source_workspace = source_root / "workspace"
    if not source_workspace.exists():
        raise FileNotFoundError(f"workspace not found: {source_workspace}")

    snapshot_root = root_dir or DEFAULT_SNAPSHOT_ROOT
    destination = snapshot_root / submission_id / "workspace"
    if destination.exists():
        shutil.rmtree(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source_workspace, destination)
    return f"{LOCAL_SNAPSHOT_SCHEME}{submission_id}"


def snapshot_backend_workspace(
    backend: Any,
    submission_id: str,
    *,
    root_dir: Path | None = None,
) -> str:
    if not SNAPSHOT_ID_PATTERN.fullmatch(submission_id):
        raise ValueError("invalid submission id")

    glob_result = backend.glob("/workspace/**")
    if getattr(glob_result, "error", None):
        raise RuntimeError("could not list workspace files")

    matches = getattr(glob_result, "matches", [])
    file_paths = [
        str(match.get("path", "") if isinstance(match, dict) else getattr(match, "path", ""))
        for match in matches
        if not (match.get("is_dir") if isinstance(match, dict) else getattr(match, "is_dir", False))
    ]
    if not file_paths:
        raise FileNotFoundError("workspace has no files")

    downloads = backend.download_files(file_paths)
    snapshot_root = root_dir or DEFAULT_SNAPSHOT_ROOT
    destination = snapshot_root / submission_id / "workspace"
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)

    for item in downloads:
        if getattr(item, "error", None):
            raise RuntimeError(f"could not download workspace file: {getattr(item, 'path', '')}")
        source_path = str(getattr(item, "path", ""))
        relative = _workspace_relative_path(source_path)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(getattr(item, "content", b"") or b"")

    return f"{LOCAL_SNAPSHOT_SCHEME}{submission_id}"


def _snapshot_id(archive_pointer: str) -> str | None:
    if not archive_pointer.startswith(LOCAL_SNAPSHOT_SCHEME):
        return None
    snapshot_id = archive_pointer.removeprefix(LOCAL_SNAPSHOT_SCHEME)
    if not SNAPSHOT_ID_PATTERN.fullmatch(snapshot_id):
        return None
    return snapshot_id


def _workspace_relative_path(path: str) -> Path:
    prefix = "/workspace/"
    if not path.startswith(prefix):
        raise ValueError(f"path outside workspace: {path}")
    relative = path.removeprefix(prefix)
    if not relative or ".." in Path(relative).parts:
        raise ValueError(f"unsafe workspace path: {path}")
    return Path(relative)


def _pointer_error(archive_pointer: str) -> str:
    if archive_pointer.startswith(LOCAL_SNAPSHOT_SCHEME):
        return "invalid snapshot id"
    return "unsupported archive pointer"


def _judge_path() -> str:
    executable_dir = str(Path(sys.executable).parent)
    return os.pathsep.join([executable_dir, "/usr/local/bin", "/usr/bin", "/bin"])


def _local_judge_backend() -> LocalShellBackend:
    root = DEFAULT_JUDGE_SANDBOX_ROOT / uuid4().hex
    root.mkdir(parents=True, exist_ok=True)
    backend = LocalShellBackend(root_dir=root, virtual_mode=True, inherit_env=False)
    backend._judge_workspace = "workspace"
    return backend


def _daytona_judge_backend() -> Any:
    from daytona import Daytona
    from langchain_daytona import DaytonaSandbox

    client = Daytona()
    sandbox = client.create()
    backend = DaytonaSandbox(sandbox=sandbox)
    backend._daytona_client = client
    backend._daytona_sandbox = sandbox
    backend._judge_workspace = "/home/daytona/workspace"
    return backend


def _sandbox_workspace_path(workspace_dir: str, relative_path: str) -> str:
    return f"{workspace_dir.rstrip('/')}/{relative_path}"
