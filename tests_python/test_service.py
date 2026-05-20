from dataclasses import dataclass, field

import pytest

from arena.service import ArenaService, ThreadNotFound


@dataclass
class FakeResult:
    error: str | None = None
    entries: list[dict] | None = None
    file_data: dict | None = None


@dataclass
class FakeBackend:
    files: dict[str, str] = field(default_factory=lambda: {"/hello.txt": "hi"})

    def ls(self, path: str) -> FakeResult:
        return FakeResult(entries=[{"path": path.rstrip("/") + "/hello.txt", "is_dir": False}])

    def read(self, path: str) -> FakeResult:
        return FakeResult(file_data={"content": self.files[path]})


class FakeAgent:
    def invoke(self, payload: dict, config: dict) -> dict:
        return {"messages": [{"role": "assistant", "content": "ok"}]}


@dataclass
class FakeSession:
    thread_id: str = "thread-1"
    provider: str = "local"
    backend: FakeBackend = field(default_factory=FakeBackend)
    agent: FakeAgent = field(default_factory=FakeAgent)
    messages: list[dict[str, str]] = field(default_factory=list)
    closed: bool = False

    def close(self) -> None:
        self.closed = True


def test_service_owns_thread_lifecycle() -> None:
    session = FakeSession()
    service = ArenaService(session_factory=lambda: session)

    thread = service.create_thread()
    message = service.send_thread_message(thread.thread_id, "hello")
    files = service.list_thread_files(thread.thread_id, "/")
    content = service.read_thread_file(thread.thread_id, "/hello.txt")
    deleted = service.delete_thread(thread.thread_id)

    assert thread.sandbox_provider == "local"
    assert message.content == "ok"
    assert files[0].path == "/hello.txt"
    assert content == {"path": "/hello.txt", "content": "hi"}
    assert deleted == {"deleted": True}
    assert session.closed is True
    with pytest.raises(ThreadNotFound):
        service.delete_thread(thread.thread_id)


def test_service_judges_submission_with_injected_graph() -> None:
    class FakeJudgeGraph:
        def report(self, submission, challenge, policy):
            return {"submission_id": submission.id, "score": {"value": 1.0}}

    from arena.models import Challenge, Submission
    from arena.service import JudgeRequest

    service = ArenaService(session_factory=lambda: FakeSession(), judge_graph=FakeJudgeGraph())
    report = service.judge_submission(
        JudgeRequest(
            submission=Submission(
                id="sub-1",
                attempt_id="attempt-1",
                archive_pointer="local://workspace",
                instruction_count=0,
            ),
            challenge=Challenge(
                id="challenge-1",
                title="Build",
                prompt="Build it",
                rubric="Good",
            ),
        )
    )

    assert report["submission_id"] == "sub-1"


def test_service_default_judge_runs_local_snapshot_checks(tmp_path) -> None:
    from arena.judge_executor import snapshot_local_workspace
    from arena.models import AcceptanceCheck, Challenge, Submission
    from arena.service import JudgeRequest

    source_root = tmp_path / "sandbox"
    workspace = source_root / "workspace"
    workspace.mkdir(parents=True)
    (workspace / "answer.txt").write_text("ok")
    pointer = snapshot_local_workspace(source_root, "sub-1", root_dir=tmp_path / "snapshots")

    service = ArenaService(session_factory=lambda: FakeSession())
    service._judge_graph._executor.root_dir = tmp_path / "snapshots"
    report = service.judge_submission(
        JudgeRequest(
            submission=Submission(
                id="sub-1",
                attempt_id="attempt-1",
                archive_pointer=pointer,
                instruction_count=0,
            ),
            challenge=Challenge(
                id="challenge-1",
                title="Build",
                prompt="Build it",
                rubric="Good",
                acceptance_checks=[AcceptanceCheck(name="file", command="test -f missing.txt", weight=1.0)],
            ),
        )
    )

    assert report.check_results[0].passed is False
    assert report.score.check_score == 0.0
