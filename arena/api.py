"""FastAPI transport for the unified Arena service."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from .judge_graph import JudgeReport
from .match_flow import (
    AttemptNotActive,
    AttemptNotFound,
    JudgeResult,
    MatchFlowView,
    PermissionDenied,
    SubmissionNotFound,
    SubmissionResult,
)
from .match_store import (
    CreateMatchRequest,
    HostAccessView,
    InvalidModelChoice,
    InvalidToken,
    MatchNotFound,
    MatchNotJoinable,
    MatchView,
    ParticipantAccessView,
)
from .service import (
    AgentRunFailed,
    ArenaService,
    FileAccessFailed,
    FileEntry,
    JudgeRequest,
    JudgeRunFailed,
    MessageResponse,
    ThreadNotFound,
    ThreadResponse,
)


app = FastAPI(title="Vibecode Arena DeepAgent", version="0.1.0")
service = ArenaService()
sessions = service.sessions


class MessageRequest(BaseModel):
    content: str = Field(min_length=1)


class JoinMatchRequest(BaseModel):
    name: str = Field(min_length=1)
    model_choice: str = Field(min_length=1)


class RejoinRequest(BaseModel):
    token: str = Field(min_length=1)


class StartMatchRequest(BaseModel):
    host_token: str = Field(min_length=1)


class AttemptInstructionRequest(BaseModel):
    participant_token: str = Field(min_length=1)
    content: str = Field(min_length=1)


class SubmitAttemptRequest(BaseModel):
    participant_token: str = Field(min_length=1)


@app.get("/health")
def health() -> dict[str, str]:
    return service.health()


@app.post("/threads")
def create_thread() -> ThreadResponse:
    try:
        return service.create_thread()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not create agent session") from exc


@app.post("/threads/{thread_id}/messages")
def send_message(thread_id: str, req: MessageRequest) -> MessageResponse:
    try:
        return service.send_thread_message(thread_id, req.content)
    except ThreadNotFound as exc:
        raise HTTPException(status_code=404, detail="Thread not found") from exc
    except AgentRunFailed as exc:
        raise HTTPException(status_code=502, detail="Agent run failed") from exc


@app.get("/threads/{thread_id}/files")
def list_files(thread_id: str, path: str = Query("/")) -> list[FileEntry]:
    try:
        return service.list_thread_files(thread_id, path)
    except ThreadNotFound as exc:
        raise HTTPException(status_code=404, detail="Thread not found") from exc
    except FileAccessFailed as exc:
        raise HTTPException(status_code=400, detail="Could not list files")


@app.get("/threads/{thread_id}/files/content")
def read_file(thread_id: str, path: str) -> dict[str, str]:
    try:
        return service.read_thread_file(thread_id, path)
    except ThreadNotFound as exc:
        raise HTTPException(status_code=404, detail="Thread not found") from exc
    except FileAccessFailed as exc:
        raise HTTPException(status_code=400, detail="Could not read file")


@app.delete("/threads/{thread_id}")
def delete_thread(thread_id: str) -> dict[str, bool]:
    try:
        return service.delete_thread(thread_id)
    except ThreadNotFound as exc:
        raise HTTPException(status_code=404, detail="Thread not found") from exc


@app.post("/matches")
def create_match(req: CreateMatchRequest) -> HostAccessView:
    return service.create_match(req)


@app.get("/matches/{code}")
def get_match(code: str) -> MatchView:
    try:
        return service.get_match_view(code)
    except MatchNotFound as exc:
        raise HTTPException(status_code=404, detail="Match not found") from exc


@app.post("/matches/{code}/join")
def join_match(code: str, req: JoinMatchRequest) -> ParticipantAccessView:
    try:
        return service.join_match(code, req.name, req.model_choice)
    except MatchNotFound as exc:
        raise HTTPException(status_code=404, detail="Match not found") from exc
    except MatchNotJoinable as exc:
        raise HTTPException(status_code=409, detail="Match is not joinable") from exc
    except InvalidModelChoice as exc:
        raise HTTPException(status_code=400, detail="Model is not allowed") from exc


@app.post("/access/rejoin")
def rejoin(req: RejoinRequest) -> HostAccessView | ParticipantAccessView:
    try:
        return service.rejoin(req.token)
    except InvalidToken as exc:
        raise HTTPException(status_code=404, detail="Token not found") from exc


@app.post("/matches/{code}/start")
def start_match(code: str, req: StartMatchRequest) -> MatchFlowView:
    try:
        return service.start_match(code, req.host_token)
    except MatchNotFound as exc:
        raise HTTPException(status_code=404, detail="Match not found") from exc
    except InvalidToken as exc:
        raise HTTPException(status_code=403, detail="Invalid host token") from exc


@app.get("/matches/{code}/flow")
def get_match_flow(code: str) -> MatchFlowView:
    try:
        return service.get_match_flow(code)
    except MatchNotFound as exc:
        raise HTTPException(status_code=404, detail="Match not found") from exc


@app.post("/attempts/{attempt_id}/instructions")
def send_attempt_instruction(attempt_id: str, req: AttemptInstructionRequest):
    try:
        return service.send_attempt_instruction(attempt_id, req.participant_token, req.content)
    except AttemptNotFound as exc:
        raise HTTPException(status_code=404, detail="Attempt not found") from exc
    except PermissionDenied as exc:
        raise HTTPException(status_code=403, detail="Participant token does not control attempt") from exc
    except AttemptNotActive as exc:
        raise HTTPException(status_code=409, detail="Attempt is not active") from exc


@app.post("/attempts/{attempt_id}/submit")
def submit_attempt(attempt_id: str, req: SubmitAttemptRequest) -> SubmissionResult:
    try:
        return service.submit_attempt(attempt_id, req.participant_token)
    except AttemptNotFound as exc:
        raise HTTPException(status_code=404, detail="Attempt not found") from exc
    except PermissionDenied as exc:
        raise HTTPException(status_code=403, detail="Participant token does not control attempt") from exc
    except AttemptNotActive as exc:
        raise HTTPException(status_code=409, detail="Attempt is not active") from exc


@app.post("/attempts/{attempt_id}/judge")
def judge_attempt(attempt_id: str) -> JudgeResult:
    try:
        return service.judge_attempt(attempt_id)
    except AttemptNotFound as exc:
        raise HTTPException(status_code=404, detail="Attempt not found") from exc
    except SubmissionNotFound as exc:
        raise HTTPException(status_code=409, detail="Attempt has no submission") from exc


@app.post("/judge")
def judge_submission(req: JudgeRequest) -> JudgeReport:
    try:
        return service.judge_submission(req)
    except JudgeRunFailed as exc:
        raise HTTPException(status_code=502, detail="Judge run failed") from exc
