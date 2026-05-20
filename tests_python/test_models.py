from datetime import timedelta

import pytest
from pydantic import ValidationError

from arena.models import (
    REFERENCE_ASSET_MAX_BYTES,
    AcceptanceCheck,
    Challenge,
    ChallengeAttempt,
    HostAccess,
    Match,
    ModelPolicy,
    Participant,
    ReferenceAsset,
    Submission,
    utc_now,
)


def challenge() -> Challenge:
    return Challenge(
        id="challenge-1",
        title="Build counter",
        prompt="Create a counter UI",
        rubric="Judge visual polish and working increment/decrement buttons",
        acceptance_checks=[AcceptanceCheck(name="tests", command="pytest", weight=1.0)],
    )


def test_match_normalizes_code_and_accepts_allowed_model() -> None:
    match = Match(
        id="match-1",
        code="abc123",
        host=HostAccess(token="h" * 24),
        model_policy=ModelPolicy(allowed_models=["openrouter/free"]),
        challenges=[challenge()],
        participants=[
            Participant(
                id="participant-1",
                name="Ada",
                token="p" * 24,
                model_choice="openrouter/free",
            )
        ],
    )

    assert match.code == "ABC123"
    assert match.participants[0].model_choice == "openrouter/free"


def test_match_rejects_participant_model_outside_policy() -> None:
    with pytest.raises(ValidationError):
        Match(
            id="match-1",
            code="ABC123",
            host=HostAccess(token="h" * 24),
            model_policy=ModelPolicy(allowed_models=["openrouter/free"]),
            challenges=[challenge()],
            participants=[
                Participant(
                    id="participant-1",
                    name="Ada",
                    token="p" * 24,
                    model_choice="anthropic/claude",
                )
            ],
        )


def test_reference_asset_caps_are_enforced() -> None:
    with pytest.raises(ValidationError):
        ReferenceAsset(
            name="reference.png",
            media_type="image/png",
            data_base64="x",
            size_bytes=REFERENCE_ASSET_MAX_BYTES + 1,
        )


def test_submission_and_attempt_link_latest_scored_snapshot() -> None:
    submission = Submission(
        id="submission-1",
        attempt_id="attempt-1",
        archive_pointer="daytona://archive/submission-1",
        instruction_count=3,
    )
    attempt = ChallengeAttempt(
        id="attempt-1",
        match_id="match-1",
        challenge_id="challenge-1",
        participant_id="participant-1",
        thread_id="thread-1",
        deadline_at=utc_now() + timedelta(minutes=5),
        latest_submission_id=submission.id,
        status="submitted",
    )

    assert attempt.latest_submission_id == submission.id
    assert submission.archive_pointer.startswith("daytona://")

