from dataclasses import dataclass

import arena.api as api
from arena.agent import _load_dotenv
from arena.api import (
    JoinMatchRequest,
    StartMatchRequest,
    create_match,
    delete_thread,
    get_match,
    health,
    join_match,
    judge_submission,
    list_files,
    read_file,
    sessions,
    start_match,
)
from arena.match_store import CreateMatchRequest
from arena.models import Challenge, ModelPolicy, Submission
from arena.service import JudgeRequest


@dataclass
class FakeResult:
    error: str | None = None
    entries: list[dict] | None = None
    file_data: dict | None = None


class FakeBackend:
    def write(self, path: str, content: str) -> FakeResult:
        return FakeResult()

    def ls(self, path: str) -> FakeResult:
        assert path == "/"
        return FakeResult(entries=[{"path": "/hello.txt", "is_dir": False}])

    def read(self, path: str) -> FakeResult:
        assert path == "/hello.txt"
        return FakeResult(file_data={"content": "hi"})


class FakeAgent:
    def invoke(self, payload: dict, config: dict) -> dict:
        return {"messages": [{"role": "assistant", "content": "ok"}]}


class FakeSession:
    thread_id = "thread-1"
    provider = "local"
    backend = FakeBackend()
    agent = FakeAgent()
    messages: list[dict[str, str]] = []
    closed = False

    def close(self) -> None:
        self.closed = True


def test_health() -> None:
    assert health() == {"status": "ok"}


def test_load_dotenv_does_not_override_existing_env(tmp_path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("EXISTING=from-file\nNEW_VALUE='loaded'\n# skip\n")
    monkeypatch.setenv("EXISTING", "from-env")

    _load_dotenv(env_file)

    assert __import__("os").environ["EXISTING"] == "from-env"
    assert __import__("os").environ["NEW_VALUE"] == "loaded"


def test_file_listing_and_read_use_backend_result_shapes() -> None:
    sessions["fake"] = FakeSession()
    try:
        entries = list_files("fake", path="/")
        content = read_file("fake", "/hello.txt")
    finally:
        delete_thread("fake")

    assert entries[0].path == "/hello.txt"
    assert entries[0].type == "file"
    assert content == {"path": "/hello.txt", "content": "hi"}


def test_match_routes_use_shared_service_layer(monkeypatch) -> None:
    from arena.service import ArenaService

    monkeypatch.setattr(api, "service", ArenaService(session_factory=lambda: FakeSession()))

    host = create_match(
        CreateMatchRequest(
            challenges=[
                Challenge(
                    id="challenge-1",
                    title="Build card",
                    prompt="Build a card UI",
                    rubric="Visual polish",
                )
            ],
            model_policy=ModelPolicy(allowed_models=["openrouter/free"]),
        )
    )

    participant = join_match(
        host.match.code,
        JoinMatchRequest(name="Ada", model_choice="openrouter/free"),
    )
    started = start_match(host.match.code, StartMatchRequest(host_token=host.token))
    view = get_match(host.match.code)

    assert participant.match.code == host.match.code
    assert started.match.status == "playing"
    assert started.attempts[0].participant_id == participant.participant_id
    assert view.participants[0].name == "Ada"


def test_judge_route_returns_report() -> None:
    report = judge_submission(
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

    assert report.submission_id == "sub-1"
    assert report.score.value > 0
