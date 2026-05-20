"""LangGraph judge workflow for scoring submissions."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

from langchain_openrouter import ChatOpenRouter
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from .models import Challenge, Score, ScoringPolicy, Submission


DEFAULT_JUDGE_MODEL = "openrouter/free"


class CheckResult(BaseModel):
    name: str
    command: str
    passed: bool
    weight: float = Field(gt=0.0)
    output: str = ""


class JudgeReport(BaseModel):
    submission_id: str
    check_results: list[CheckResult]
    score: Score


class RubricReview(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    feedback: str = Field(default="")


class JudgeExecutor(Protocol):
    def run(self, archive_pointer: str, command: str) -> tuple[bool, str]:
        ...


class DeterministicExecutor:
    """Default executor for local graph tests before sandbox restore exists."""

    def run(self, archive_pointer: str, command: str) -> tuple[bool, str]:
        if "fail" in command.lower():
            return False, "deterministic executor marked command as failed"
        return True, "deterministic executor marked command as passed"


class RubricReviewer(Protocol):
    def review(
        self,
        *,
        submission: Submission,
        challenge: Challenge,
        check_results: list[CheckResult],
        check_score: float,
    ) -> RubricReview:
        ...


class DeterministicRubricReviewer:
    def review(
        self,
        *,
        submission: Submission,
        challenge: Challenge,
        check_results: list[CheckResult],
        check_score: float,
    ) -> RubricReview:
        if not challenge.rubric.strip():
            return RubricReview(score=0.0, feedback="No rubric provided.")
        if check_results and not any(result.passed for result in check_results):
            return RubricReview(score=0.25, feedback="All acceptance checks failed.")
        if check_results and all(result.passed for result in check_results):
            return RubricReview(score=1.0, feedback="All acceptance checks passed.")
        return RubricReview(score=0.75, feedback="Some acceptance checks passed.")


class OpenRouterRubricReviewer:
    """LLM rubric reviewer for prototype judging through OpenRouter."""

    def __init__(self, model: str | None = None) -> None:
        _load_dotenv()
        model_name = (model or os.getenv("JUDGE_MODEL") or os.getenv("DEEPAGENT_MODEL") or DEFAULT_JUDGE_MODEL)
        self.model_name = model_name.removeprefix("openrouter:")
        self._model = ChatOpenRouter(model=self.model_name, temperature=0.0, max_tokens=512)
        self._structured_model = self._model.with_structured_output(RubricReview)

    def review(
        self,
        *,
        submission: Submission,
        challenge: Challenge,
        check_results: list[CheckResult],
        check_score: float,
    ) -> RubricReview:
        result = self._structured_model.invoke(
            [
                {
                    "role": "system",
                    "content": (
                        "You are the Vibecode Arena judge. Return a strict score from 0.0 to 1.0 "
                        "and concise feedback. Judge only from the challenge rubric and check results. "
                        "Do not invent files or behavior you cannot observe."
                    ),
                },
                {
                    "role": "user",
                    "content": _rubric_prompt(submission, challenge, check_results, check_score),
                },
            ]
        )
        if isinstance(result, RubricReview):
            return result
        return RubricReview.model_validate(result)


class JudgeState(TypedDict, total=False):
    submission: Submission
    challenge: Challenge
    policy: ScoringPolicy
    archive_pointer: str
    check_results: list[CheckResult]
    check_score: float
    rubric_score: float
    rubric_feedback: str
    instruction_penalty: float
    time_bonus: float
    feedback: str
    score: Score
    report: JudgeReport


@dataclass
class JudgeGraph:
    executor: JudgeExecutor | None = None
    rubric_reviewer: RubricReviewer | None = None

    def __post_init__(self) -> None:
        self._executor = self.executor or DeterministicExecutor()
        self._rubric_reviewer = self.rubric_reviewer or DeterministicRubricReviewer()
        self._checkpointer = MemorySaver()
        self._graph = self._build_graph()

    def judge(self, submission: Submission, challenge: Challenge, policy: ScoringPolicy) -> Score:
        result = self.report(submission, challenge, policy)
        return result.score

    def report(self, submission: Submission, challenge: Challenge, policy: ScoringPolicy) -> JudgeReport:
        state = self._graph.invoke(
            {
                "submission": submission,
                "challenge": challenge,
                "policy": policy,
            },
            config={"configurable": {"thread_id": f"judge-{submission.id}"}},
        )
        return state["report"]

    def _build_graph(self):
        graph = StateGraph(JudgeState)
        graph.add_node("load_submission", self._load_submission)
        graph.add_node("run_acceptance_checks", self._run_acceptance_checks)
        graph.add_node("rubric_review", self._rubric_review)
        graph.add_node("calculate_score", self._calculate_score)
        graph.add_node("finalize_feedback", self._finalize_feedback)
        graph.add_edge(START, "load_submission")
        graph.add_edge("load_submission", "run_acceptance_checks")
        graph.add_edge("run_acceptance_checks", "rubric_review")
        graph.add_edge("rubric_review", "calculate_score")
        graph.add_edge("calculate_score", "finalize_feedback")
        graph.add_edge("finalize_feedback", END)
        return graph.compile(checkpointer=self._checkpointer, name="judge-graph")

    def _load_submission(self, state: JudgeState) -> JudgeState:
        submission = state["submission"]
        return {"archive_pointer": submission.archive_pointer}

    def _run_acceptance_checks(self, state: JudgeState) -> JudgeState:
        challenge = state["challenge"]
        archive_pointer = state["archive_pointer"]
        results = [
            _check_result(check.name, check.command, check.weight, self._executor.run(archive_pointer, check.command))
            for check in challenge.acceptance_checks
        ]
        return {"check_results": results, "check_score": _weighted_check_score(results)}

    def _rubric_review(self, state: JudgeState) -> JudgeState:
        submission = state["submission"]
        challenge = state["challenge"]
        check_results = state["check_results"]
        review = self._rubric_reviewer.review(
            submission=submission,
            challenge=challenge,
            check_results=check_results,
            check_score=state["check_score"],
        )
        return {
            "rubric_score": _score_value(review.score),
            "rubric_feedback": review.feedback,
        }

    def _calculate_score(self, state: JudgeState) -> JudgeState:
        submission = state["submission"]
        challenge = state["challenge"]
        policy = state["policy"]
        check_score = state["check_score"]
        rubric_score = state["rubric_score"]
        instruction_penalty = _score_value(submission.instruction_count * policy.instruction_penalty)
        time_bonus = _score_value(policy.time_bonus_weight)
        raw_score = (
            (check_score * challenge.check_weight)
            + (rubric_score * challenge.rubric_weight)
            + time_bonus
            - instruction_penalty
        )
        score = Score(
            submission_id=submission.id,
            value=_score_value(max(0.0, raw_score)),
            check_score=_score_value(check_score),
            rubric_score=_score_value(rubric_score),
            instruction_penalty=instruction_penalty,
            time_bonus=time_bonus,
        )
        return {
            "score": score,
            "instruction_penalty": instruction_penalty,
            "time_bonus": time_bonus,
        }

    def _finalize_feedback(self, state: JudgeState) -> JudgeState:
        submission = state["submission"]
        check_results = state["check_results"]
        score = state["score"]
        rubric_feedback = state.get("rubric_feedback", "")
        passed = sum(1 for result in check_results if result.passed)
        total = len(check_results)
        feedback = (
            f"Checks passed: {passed}/{total}. "
            f"Check score: {score.check_score:.2f}. "
            f"Rubric score: {score.rubric_score:.2f}. "
            f"Instruction penalty: {score.instruction_penalty:.2f}."
        )
        if rubric_feedback:
            feedback = f"{feedback} Rubric: {rubric_feedback}"
        final_score = score.model_copy(update={"feedback": feedback})
        return {
            "score": final_score,
            "feedback": feedback,
            "report": JudgeReport(
                submission_id=submission.id,
                check_results=check_results,
                score=final_score,
            ),
        }


def _check_result(name: str, command: str, weight: float, result: tuple[bool, str]) -> CheckResult:
    passed, output = result
    return CheckResult(
        name=name,
        command=command,
        weight=weight,
        passed=passed,
        output=output,
    )


def _weighted_check_score(results: list[CheckResult]) -> float:
    if not results:
        return 1.0
    total_weight = sum(result.weight for result in results)
    if total_weight <= 0:
        return 0.0
    passed_weight = sum(result.weight for result in results if result.passed)
    return passed_weight / total_weight


def _score_value(value: float) -> float:
    return round(value, 6)


def _rubric_prompt(
    submission: Submission,
    challenge: Challenge,
    check_results: list[CheckResult],
    check_score: float,
) -> str:
    checks = "\n".join(
        (
            f"- {result.name}: {'passed' if result.passed else 'failed'}; "
            f"command={result.command!r}; weight={result.weight}; output={result.output[:500]!r}"
        )
        for result in check_results
    ) or "- No acceptance checks were configured."
    return (
        f"Submission ID: {submission.id}\n"
        f"Archive pointer: {submission.archive_pointer}\n"
        f"Instruction count: {submission.instruction_count}\n\n"
        f"Challenge: {challenge.title}\n"
        f"Prompt:\n{challenge.prompt}\n\n"
        f"Rubric:\n{challenge.rubric}\n\n"
        f"Acceptance check score: {check_score:.3f}\n"
        f"Acceptance check results:\n{checks}\n"
    )


def _load_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"'")
            if key and key not in os.environ:
                os.environ[key] = value
