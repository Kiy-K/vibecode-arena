"""Domain records for Vibecode Arena."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


MATCH_CODE_LENGTH = 6
REFERENCE_ASSET_MAX_BYTES = 1_000_000
REFERENCE_ASSETS_MAX_TOTAL_BYTES = 5_000_000
RETENTION_HOURS = 24

MatchStatus = Literal["waiting", "playing", "revealing", "finished"]
AttemptStatus = Literal["active", "submitted", "missed", "interrupted", "judged"]
Role = Literal["host", "participant"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ModelPolicy(BaseModel):
    allowed_models: list[str] = Field(min_length=1)

    @field_validator("allowed_models")
    @classmethod
    def require_unique_models(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("allowed models must be unique")
        return value

    def allows(self, model: str) -> bool:
        return model in self.allowed_models


class ScoringPolicy(BaseModel):
    time_bonus_weight: float = Field(default=0.0, ge=0.0)
    instruction_penalty: float = Field(default=0.0, ge=0.0)


class ReferenceAsset(BaseModel):
    name: str = Field(min_length=1)
    media_type: str = Field(min_length=1)
    data_base64: str = Field(min_length=1)
    size_bytes: int = Field(ge=0, le=REFERENCE_ASSET_MAX_BYTES)


class AcceptanceCheck(BaseModel):
    name: str = Field(min_length=1)
    command: str = Field(min_length=1)
    weight: float = Field(gt=0.0)


class Challenge(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    rubric: str = Field(min_length=1)
    acceptance_checks: list[AcceptanceCheck] = Field(default_factory=list)
    reference_assets: list[ReferenceAsset] = Field(default_factory=list)
    check_weight: float = Field(default=0.5, ge=0.0)
    rubric_weight: float = Field(default=0.5, ge=0.0)

    @model_validator(mode="after")
    def validate_weights_and_assets(self) -> "Challenge":
        if self.check_weight + self.rubric_weight <= 0:
            raise ValueError("challenge judging weights must be positive")
        total_asset_bytes = sum(asset.size_bytes for asset in self.reference_assets)
        if total_asset_bytes > REFERENCE_ASSETS_MAX_TOTAL_BYTES:
            raise ValueError("reference assets exceed match total size cap")
        return self


class Participant(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    token: str = Field(min_length=24)
    model_choice: str = Field(min_length=1)
    joined_at: datetime = Field(default_factory=utc_now)


class HostAccess(BaseModel):
    token: str = Field(min_length=24)


class Submission(BaseModel):
    id: str = Field(min_length=1)
    attempt_id: str = Field(min_length=1)
    archive_pointer: str = Field(min_length=1)
    submitted_at: datetime = Field(default_factory=utc_now)
    instruction_count: int = Field(ge=0)


class Score(BaseModel):
    submission_id: str = Field(min_length=1)
    value: float = Field(ge=0.0)
    check_score: float = Field(default=0.0, ge=0.0)
    rubric_score: float = Field(default=0.0, ge=0.0)
    instruction_penalty: float = Field(default=0.0, ge=0.0)
    time_bonus: float = Field(default=0.0, ge=0.0)
    feedback: str = ""


class ChallengeAttempt(BaseModel):
    id: str = Field(min_length=1)
    match_id: str = Field(min_length=1)
    challenge_id: str = Field(min_length=1)
    participant_id: str = Field(min_length=1)
    thread_id: str = Field(min_length=1)
    sandbox_id: str | None = None
    status: AttemptStatus = "active"
    deadline_at: datetime
    latest_submission_id: str | None = None
    score: Score | None = None


class Match(BaseModel):
    id: str = Field(min_length=1)
    code: str = Field(min_length=MATCH_CODE_LENGTH, max_length=MATCH_CODE_LENGTH)
    host: HostAccess
    status: MatchStatus = "waiting"
    model_policy: ModelPolicy
    scoring_policy: ScoringPolicy = Field(default_factory=ScoringPolicy)
    challenges: list[Challenge] = Field(min_length=1)
    participants: list[Participant] = Field(default_factory=list)
    current_round: int = 0
    created_at: datetime = Field(default_factory=utc_now)
    finished_at: datetime | None = None

    @field_validator("code")
    @classmethod
    def normalize_match_code(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def validate_participant_models(self) -> "Match":
        for participant in self.participants:
            if not self.model_policy.allows(participant.model_choice):
                raise ValueError("participant model choice is not allowed by model policy")
        return self

