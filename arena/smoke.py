"""Small smoke entrypoints for Makefile targets."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path

from deepagents.backends import LocalShellBackend

from .agent import create_session
from .judge_executor import create_judge_executor, snapshot_backend_workspace
from .judge_graph import JudgeGraph
from .models import AcceptanceCheck, Challenge, ScoringPolicy, Submission


def smoke_agent() -> None:
    os.environ.setdefault("OPENROUTER_API_KEY", "sk-or-test")
    os.environ.setdefault("DEEPAGENT_SANDBOX_PROVIDER", "local")
    session = create_session("smoke")
    try:
        print(session.thread_id, session.provider, type(session.backend).__name__)
    finally:
        session.close()


def smoke_judge() -> None:
    with tempfile.TemporaryDirectory(prefix="vibecode-judge-smoke-") as tmp:
        root = Path(tmp)
        sandbox_root = root / "sandbox"
        backend = LocalShellBackend(root_dir=sandbox_root, virtual_mode=True, inherit_env=False)
        backend.write("/workspace/answer.txt", "ok")
        snapshot_root = root / "snapshots"
        pointer = snapshot_backend_workspace(backend, "smoke-submission", root_dir=snapshot_root)
        executor = create_judge_executor()
        executor.root_dir = snapshot_root
        try:
            report = JudgeGraph(executor=executor).report(
                Submission(
                    id="smoke-submission",
                    attempt_id="smoke-attempt",
                    archive_pointer=pointer,
                    instruction_count=1,
                ),
                Challenge(
                    id="smoke-challenge",
                    title="Smoke judge",
                    prompt="Write answer.txt",
                    rubric="File exists and command passes.",
                    acceptance_checks=[
                        AcceptanceCheck(name="file", command="test -f answer.txt", weight=1.0),
                    ],
                ),
                ScoringPolicy(instruction_penalty=0.01),
            )
        finally:
            executor.close()
        print(json.dumps(report.score.model_dump(), sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("target", choices=["agent", "judge"])
    args = parser.parse_args()
    if args.target == "agent":
        smoke_agent()
    else:
        smoke_judge()


if __name__ == "__main__":
    main()
