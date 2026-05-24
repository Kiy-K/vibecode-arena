"""Monolithic Gradio surface for Vibecode Arena."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import gradio as gr

from .match_flow import AttemptView, MatchFlowView
from .match_store import CreateMatchRequest, HostAccessView, ParticipantAccessView
from .models import Challenge, ModelPolicy
from .service import ArenaService


DEFAULT_MODELS = "openrouter/free"


@dataclass(frozen=True)
class UiState:
    role: str = ""
    token: str = ""
    match_code: str = ""
    participant_id: str = ""


class GradioArena:
    """Thin Gradio handlers over ArenaService."""

    def __init__(self, service: ArenaService | None = None) -> None:
        self.service = service or ArenaService()

    def create_match(
        self,
        title: str,
        prompt: str,
        rubric: str,
        models_text: str,
    ) -> tuple[UiState, str, dict[str, Any], list[list[Any]], list[list[Any]], str]:
        request = CreateMatchRequest(
            challenges=[
                Challenge(
                    id=_slug(title) or "challenge-1",
                    title=title.strip(),
                    prompt=prompt.strip(),
                    rubric=rubric.strip(),
                )
            ],
            model_policy=ModelPolicy(allowed_models=_models(models_text)),
        )
        access = self.service.create_match(request)
        state = UiState(role="host", token=access.token, match_code=access.match.code)
        return self._view_outputs(state, f"Host match created: {access.match.code}")

    def join_match(
        self,
        code: str,
        name: str,
        model_choice: str,
    ) -> tuple[UiState, str, dict[str, Any], list[list[Any]], list[list[Any]], str]:
        access = self.service.join_match(code.strip(), name.strip(), model_choice.strip())
        state = UiState(
            role="participant",
            token=access.token,
            match_code=access.match.code,
            participant_id=access.participant_id,
        )
        return self._view_outputs(state, f"Joined match {access.match.code} as {name.strip()}")

    def rejoin(self, token: str) -> tuple[UiState, str, dict[str, Any], list[list[Any]], list[list[Any]], str]:
        access = self.service.rejoin(token.strip())
        if isinstance(access, HostAccessView):
            state = UiState(role="host", token=access.token, match_code=access.match.code)
            return self._view_outputs(state, f"Host rejoined match {access.match.code}")
        state = UiState(
            role="participant",
            token=access.token,
            match_code=access.match.code,
            participant_id=access.participant_id,
        )
        return self._view_outputs(state, f"Participant rejoined match {access.match.code}")

    def start_match(
        self,
        state: UiState,
    ) -> tuple[UiState, str, dict[str, Any], list[list[Any]], list[list[Any]], str]:
        self._require_host(state)
        self.service.start_match(state.match_code, state.token)
        return self._view_outputs(state, "Match started")

    def refresh(
        self,
        state: UiState,
    ) -> tuple[UiState, str, dict[str, Any], list[list[Any]], list[list[Any]], str]:
        if not state.match_code:
            return state, "No active match", {}, [], [], ""
        return self._view_outputs(state, "Refreshed")

    def send_instruction(
        self,
        state: UiState,
        attempt_id: str,
        content: str,
    ) -> tuple[UiState, str, dict[str, Any], list[list[Any]], list[list[Any]], str]:
        self._require_participant(state)
        message = self.service.send_attempt_instruction(attempt_id.strip(), state.token, content.strip())
        return self._view_outputs(state, f"Instruction {message.instruction_count}: {message.content}")

    def submit_attempt(
        self,
        state: UiState,
        attempt_id: str,
    ) -> tuple[UiState, str, dict[str, Any], list[list[Any]], list[list[Any]], str]:
        self._require_participant(state)
        result = self.service.submit_attempt(attempt_id.strip(), state.token)
        return self._view_outputs(state, f"Submitted {result.submission.id}")

    def judge_attempt(
        self,
        state: UiState,
        attempt_id: str,
    ) -> tuple[UiState, str, dict[str, Any], list[list[Any]], list[list[Any]], str]:
        if not state.role:
            raise ValueError("join or rejoin first")
        result = self.service.judge_attempt(attempt_id.strip())
        return self._view_outputs(state, f"Judged {result.report.submission_id}: {result.report.score.value:.3f}")

    def _view_outputs(
        self,
        state: UiState,
        status: str,
    ) -> tuple[UiState, str, dict[str, Any], list[list[Any]], list[list[Any]], str]:
        flow = _flow_or_match(self.service, state.match_code)
        return (
            state,
            status,
            _match_summary(flow),
            _attempt_rows(flow, state.participant_id),
            _leaderboard_rows(flow),
            state.token,
        )

    def _require_host(self, state: UiState) -> None:
        if state.role != "host" or not state.token:
            raise ValueError("host access required")

    def _require_participant(self, state: UiState) -> None:
        if state.role != "participant" or not state.token:
            raise ValueError("participant access required")


def build_app(service: ArenaService | None = None) -> gr.Blocks:
    arena = GradioArena(service)
    with gr.Blocks(title="Vibecode Arena") as demo:
        state = gr.State(UiState())

        gr.Markdown("# Vibecode Arena")
        status = gr.Textbox(label="Status", interactive=False)
        token = gr.Textbox(label="Access token", interactive=False, type="password")

        with gr.Tabs():
            with gr.Tab("Host"):
                title = gr.Textbox(label="Challenge title", value="Build card")
                prompt = gr.Textbox(label="Prompt", lines=5, value="Build a polished responsive UI.")
                rubric = gr.Textbox(label="Rubric", lines=4, value="Visual polish, responsiveness, and correctness.")
                models = gr.Textbox(label="Allowed models", value=DEFAULT_MODELS)
                create_btn = gr.Button("Create Match", variant="primary")
                start_btn = gr.Button("Start Match")

            with gr.Tab("Participant"):
                code = gr.Textbox(label="Match code")
                name = gr.Textbox(label="Name")
                model_choice = gr.Textbox(label="Model choice", value="openrouter/free")
                join_btn = gr.Button("Join Match", variant="primary")
                rejoin_token = gr.Textbox(label="Rejoin token", type="password")
                rejoin_btn = gr.Button("Rejoin")
                attempt_id = gr.Textbox(label="Attempt ID")
                instruction = gr.Textbox(label="Instruction", lines=5)
                instruction_btn = gr.Button("Send Instruction")
                submit_btn = gr.Button("Submit")

            with gr.Tab("Judge"):
                judge_attempt_id = gr.Textbox(label="Attempt ID")
                judge_btn = gr.Button("Judge Attempt")

        refresh_btn = gr.Button("Refresh")
        match_json = gr.JSON(label="Match")
        attempts = gr.Dataframe(
            headers=["attempt_id", "participant_id", "challenge_id", "status", "score"],
            label="Attempts",
            interactive=False,
        )
        leaderboard = gr.Dataframe(
            headers=["model", "participant_id", "score", "feedback"],
            label="Leaderboard",
            interactive=False,
        )

        outputs = [state, status, match_json, attempts, leaderboard, token]
        create_btn.click(arena.create_match, [title, prompt, rubric, models], outputs)
        join_btn.click(arena.join_match, [code, name, model_choice], outputs)
        rejoin_btn.click(arena.rejoin, [rejoin_token], outputs)
        start_btn.click(arena.start_match, [state], outputs)
        refresh_btn.click(arena.refresh, [state], outputs)
        instruction_btn.click(arena.send_instruction, [state, attempt_id, instruction], outputs)
        submit_btn.click(arena.submit_attempt, [state, attempt_id], outputs)
        judge_btn.click(arena.judge_attempt, [state, judge_attempt_id], outputs)

    return demo


def _flow_or_match(service: ArenaService, code: str) -> MatchFlowView | None:
    if not code:
        return None
    return service.get_match_flow(code)


def _match_summary(flow: MatchFlowView | None) -> dict[str, Any]:
    if flow is None:
        return {}
    return {
        "code": flow.match.code,
        "status": flow.match.status,
        "round": flow.match.current_round,
        "participants": [participant.model_dump() for participant in flow.match.participants],
        "allowed_models": flow.match.allowed_models,
    }


def _attempt_rows(flow: MatchFlowView | None, participant_id: str = "") -> list[list[Any]]:
    if flow is None:
        return []
    attempts = flow.attempts
    if participant_id:
        attempts = [attempt for attempt in attempts if attempt.participant_id == participant_id]
    return [_attempt_row(attempt) for attempt in attempts]


def _attempt_row(attempt: AttemptView) -> list[Any]:
    score = "" if attempt.score is None else attempt.score.value
    return [attempt.id, attempt.participant_id, attempt.challenge_id, attempt.status, score]


def _leaderboard_rows(flow: MatchFlowView | None) -> list[list[Any]]:
    if flow is None:
        return []
    return [
        [entry.model_choice, entry.participant_id, entry.score.value, entry.score.feedback]
        for entry in flow.leaderboard
    ]


def _models(models_text: str) -> list[str]:
    models = [item.strip() for item in models_text.replace("\n", ",").split(",") if item.strip()]
    if not models:
        raise ValueError("at least one model is required")
    return models


def _slug(value: str) -> str:
    return "-".join(part for part in "".join(char.lower() if char.isalnum() else "-" for char in value).split("-") if part)
