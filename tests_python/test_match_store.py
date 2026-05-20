import pytest

from arena.match_store import (
    CreateMatchRequest,
    InMemoryMatchStore,
    InvalidModelChoice,
    InvalidToken,
    MatchNotJoinable,
)
from arena.models import Challenge, ModelPolicy


def challenge() -> Challenge:
    return Challenge(
        id="challenge-1",
        title="Build counter",
        prompt="Create a counter UI",
        rubric="Judge visual polish and behavior",
    )


def create_request() -> CreateMatchRequest:
    return CreateMatchRequest(
        challenges=[challenge()],
        model_policy=ModelPolicy(allowed_models=["openrouter/free", "anthropic/claude"]),
    )


def test_create_match_returns_host_access_and_public_view_without_tokens() -> None:
    store = InMemoryMatchStore()

    access = store.create_match(create_request())

    assert access.token
    assert access.match.code
    assert access.match.status == "waiting"
    assert access.match.allowed_models == ["openrouter/free", "anthropic/claude"]
    assert access.token not in access.match.model_dump_json()


def test_join_match_creates_separate_participants_for_repeated_tabs() -> None:
    store = InMemoryMatchStore()
    host = store.create_match(create_request())

    first = store.join_match(host.match.code, "Ada", "openrouter/free")
    second = store.join_match(host.match.code, "Ada", "openrouter/free")

    assert first.participant_id != second.participant_id
    assert first.token != second.token
    assert len(second.match.participants) == 2
    assert first.token not in second.match.model_dump_json()
    assert second.token not in second.match.model_dump_json()


def test_join_rejects_model_outside_policy() -> None:
    store = InMemoryMatchStore()
    host = store.create_match(create_request())

    with pytest.raises(InvalidModelChoice):
        store.join_match(host.match.code, "Ada", "google/gemini")


def test_rejoin_restores_host_or_participant_access() -> None:
    store = InMemoryMatchStore()
    host = store.create_match(create_request())
    participant = store.join_match(host.match.code, "Ada", "openrouter/free")

    host_rejoin = store.rejoin(host.token)
    participant_rejoin = store.rejoin(participant.token)

    assert host_rejoin.match.code == host.match.code
    assert participant_rejoin.match.code == host.match.code
    assert getattr(participant_rejoin, "participant_id") == participant.participant_id


def test_rejoin_rejects_unknown_token() -> None:
    store = InMemoryMatchStore()

    with pytest.raises(InvalidToken):
        store.rejoin("not-a-real-token")


def test_join_after_start_is_rejected() -> None:
    store = InMemoryMatchStore()
    host = store.create_match(create_request())

    store.start_match(host.match.code, host.token)

    with pytest.raises(MatchNotJoinable):
        store.join_match(host.match.code, "Ada", "openrouter/free")


def test_start_match_requires_host_token() -> None:
    store = InMemoryMatchStore()
    host = store.create_match(create_request())

    with pytest.raises(InvalidToken):
        store.start_match(host.match.code, "wrong-token")

