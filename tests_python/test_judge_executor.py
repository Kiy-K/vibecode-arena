from pathlib import Path

from deepagents.backends import LocalShellBackend

from arena.judge_executor import (
    LocalJudgeExecutor,
    SandboxJudgeExecutor,
    snapshot_backend_workspace,
    snapshot_local_workspace,
)


class FakeDownload:
    def __init__(self, path: str, content: bytes | None = None, error: str | None = None) -> None:
        self.path = path
        self.content = content
        self.error = error


class FakeGlob:
    def __init__(self, matches: list[dict], error: str | None = None) -> None:
        self.matches = matches
        self.error = error


class FakeBackend:
    def __init__(self) -> None:
        self.files = {
            "/workspace/app.py": b"print('ok')\n",
            "/workspace/pkg/data.txt": b"data",
        }

    def glob(self, pattern: str) -> FakeGlob:
        assert pattern == "/workspace/**"
        return FakeGlob(
            [
                {"path": "/workspace/app.py", "is_dir": False},
                {"path": "/workspace/pkg/data.txt", "is_dir": False},
                {"path": "/workspace/pkg", "is_dir": True},
            ]
        )

    def download_files(self, paths: list[str]) -> list[FakeDownload]:
        return [FakeDownload(path, self.files[path]) for path in paths]


def test_local_snapshot_executor_runs_command_in_workspace(tmp_path) -> None:
    source_root = tmp_path / "sandbox"
    workspace = source_root / "workspace"
    workspace.mkdir(parents=True)
    (workspace / "answer.txt").write_text("ok")
    pointer = snapshot_local_workspace(source_root, "submission-1", root_dir=tmp_path / "snapshots")

    passed, output = LocalJudgeExecutor(root_dir=tmp_path / "snapshots").run(pointer, "test -f answer.txt")

    assert passed is True
    assert "exit code 0" in output


def test_local_snapshot_executor_captures_failed_command(tmp_path) -> None:
    source_root = tmp_path / "sandbox"
    (source_root / "workspace").mkdir(parents=True)
    pointer = snapshot_local_workspace(source_root, "submission-1", root_dir=tmp_path / "snapshots")

    passed, output = LocalJudgeExecutor(root_dir=tmp_path / "snapshots").run(
        pointer,
        "printf 'bad' >&2; exit 7",
    )

    assert passed is False
    assert "bad" in output
    assert "exit code 7" in output


def test_local_snapshot_executor_rejects_unknown_or_unsafe_pointer(tmp_path) -> None:
    executor = LocalJudgeExecutor(root_dir=tmp_path / "snapshots")

    unsupported = executor.run("daytona://sandbox/x/workspace", "echo no")
    traversal = executor.run("local-snapshot://../secret", "echo no")

    assert unsupported[0] is False
    assert "unsupported archive pointer" in unsupported[1]
    assert traversal[0] is False
    assert "invalid snapshot id" in traversal[1]


def test_snapshot_replaces_previous_copy_without_mutating_source(tmp_path) -> None:
    source_root = tmp_path / "sandbox"
    workspace = source_root / "workspace"
    workspace.mkdir(parents=True)
    (workspace / "answer.txt").write_text("v1")
    snapshot_root = tmp_path / "snapshots"

    pointer = snapshot_local_workspace(source_root, "submission-1", root_dir=snapshot_root)
    (workspace / "answer.txt").write_text("v2")
    snapshot_local_workspace(source_root, "submission-1", root_dir=snapshot_root)

    snapshot_file = snapshot_root / pointer.removeprefix("local-snapshot://") / "workspace" / "answer.txt"
    assert snapshot_file.read_text() == "v2"
    assert (workspace / "answer.txt").read_text() == "v2"


def test_backend_snapshot_uses_deepagents_filesystem_interface(tmp_path) -> None:
    pointer = snapshot_backend_workspace(
        FakeBackend(),
        "submission-1",
        root_dir=tmp_path / "snapshots",
    )

    passed, output = LocalJudgeExecutor(root_dir=tmp_path / "snapshots").run(
        pointer,
        "python app.py && test -f pkg/data.txt",
    )

    assert passed is True
    assert "exit code 0" in output


def test_sandbox_judge_executor_restores_snapshot_into_backend(tmp_path) -> None:
    source_root = tmp_path / "sandbox"
    workspace = source_root / "workspace"
    workspace.mkdir(parents=True)
    (workspace / "answer.txt").write_text("ok")
    pointer = snapshot_local_workspace(source_root, "submission-1", root_dir=tmp_path / "snapshots")
    judge_root = tmp_path / "judge"

    executor = SandboxJudgeExecutor(
        root_dir=tmp_path / "snapshots",
        backend_factory=lambda: LocalShellBackend(root_dir=judge_root, virtual_mode=True, inherit_env=False),
    )

    passed, output = executor.run(pointer, "test -f answer.txt")

    assert passed is True
    assert "exit code 0" in output
    assert (judge_root / "workspace" / "answer.txt").read_text() == "ok"


def test_sandbox_judge_executor_reports_failed_command(tmp_path) -> None:
    source_root = tmp_path / "sandbox"
    (source_root / "workspace").mkdir(parents=True)
    pointer = snapshot_local_workspace(source_root, "submission-1", root_dir=tmp_path / "snapshots")

    executor = SandboxJudgeExecutor(
        root_dir=tmp_path / "snapshots",
        backend_factory=lambda: LocalShellBackend(
            root_dir=tmp_path / "judge",
            virtual_mode=True,
            inherit_env=False,
        ),
    )

    passed, output = executor.run(pointer, "test -f missing.txt")

    assert passed is False
    assert "exit code" in output.lower()
