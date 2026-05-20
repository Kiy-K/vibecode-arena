from arena.judge_graph import JudgeGraph, RubricReview
from arena.models import AcceptanceCheck, Challenge, ScoringPolicy, Submission


class FakeExecutor:
    def __init__(self, outcomes: dict[str, bool]) -> None:
        self.outcomes = outcomes
        self.commands: list[tuple[str, str]] = []

    def run(self, archive_pointer: str, command: str) -> tuple[bool, str]:
        self.commands.append((archive_pointer, command))
        passed = self.outcomes.get(command, True)
        return passed, f"{command} {'passed' if passed else 'failed'}"


class FakeRubricReviewer:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def review(self, **kwargs) -> RubricReview:
        self.calls.append(kwargs)
        return RubricReview(score=0.42, feedback="LLM-style review")


def submission(instruction_count: int = 0) -> Submission:
    return Submission(
        id="submission-1",
        attempt_id="attempt-1",
        archive_pointer="daytona://sandbox/sandbox-1/workspace",
        instruction_count=instruction_count,
    )


def challenge() -> Challenge:
    return Challenge(
        id="challenge-1",
        title="Build card",
        prompt="Build a card UI",
        rubric="Visual polish and correctness",
        acceptance_checks=[
            AcceptanceCheck(name="syntax", command="python -m compileall .", weight=1.0),
            AcceptanceCheck(name="tests", command="pytest", weight=3.0),
        ],
        check_weight=0.6,
        rubric_weight=0.4,
    )


def test_judge_graph_combines_check_and_rubric_scores() -> None:
    executor = FakeExecutor({"python -m compileall .": True, "pytest": True})
    graph = JudgeGraph(executor=executor)

    score = graph.judge(submission(), challenge(), ScoringPolicy())

    assert score.value == 1.0
    assert score.check_score == 1.0
    assert score.rubric_score == 1.0
    assert "Checks passed: 2/2" in score.feedback
    assert executor.commands == [
        ("daytona://sandbox/sandbox-1/workspace", "python -m compileall ."),
        ("daytona://sandbox/sandbox-1/workspace", "pytest"),
    ]


def test_failed_check_affects_score_without_crashing() -> None:
    executor = FakeExecutor({"python -m compileall .": True, "pytest": False})
    graph = JudgeGraph(executor=executor)

    report = graph.report(submission(), challenge(), ScoringPolicy())

    assert report.check_results[0].passed is True
    assert report.check_results[1].passed is False
    assert report.score.check_score == 0.25
    assert report.score.rubric_score == 0.75
    assert report.score.value == 0.45


def test_instruction_penalty_reduces_score() -> None:
    graph = JudgeGraph(executor=FakeExecutor({}))

    score = graph.judge(
        submission(instruction_count=3),
        challenge(),
        ScoringPolicy(instruction_penalty=0.1),
    )

    assert score.instruction_penalty == 0.3
    assert score.value == 0.7


def test_no_acceptance_checks_still_uses_rubric() -> None:
    graph = JudgeGraph(executor=FakeExecutor({}))
    no_check_challenge = Challenge(
        id="challenge-2",
        title="Build text",
        prompt="Build anything",
        rubric="Readable and relevant",
        check_weight=0.5,
        rubric_weight=0.5,
    )

    score = graph.judge(submission(), no_check_challenge, ScoringPolicy())

    assert score.check_score == 1.0
    assert score.rubric_score == 0.75
    assert score.value == 0.875


def test_pluggable_rubric_reviewer_drives_rubric_score() -> None:
    reviewer = FakeRubricReviewer()
    graph = JudgeGraph(executor=FakeExecutor({}), rubric_reviewer=reviewer)

    score = graph.judge(submission(), challenge(), ScoringPolicy())

    assert score.rubric_score == 0.42
    assert score.value == 0.768
    assert "LLM-style review" in score.feedback
    assert reviewer.calls[0]["submission"].id == "submission-1"
