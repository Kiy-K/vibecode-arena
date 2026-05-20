# ROADMAP

## Goal

Build Vibecode Arena as a Hugging Face hackathon app:

- Gradio frontend for Hosts and Participants.
- DeepAgents power contestant-side autonomous building as **Vibecoders**.
- LangGraph powers **Judge graph** evaluation.
- Daytona provides isolated sandboxes.
- Upstash Redis REST stores Match records.

This roadmap is implementation order, not product marketing. Each phase should leave the repo runnable and tested.

## Ground Rules

- Keep Redis hidden behind a small Match store interface.
- Keep DeepAgent construction hidden behind the Vibecoder seam.
- Keep LangGraph judging hidden behind the Judge graph seam.
- Keep FastAPI and Gradio behind the unified `ArenaService` application boundary.
- Prefer fake adapters in tests before live provider calls.
- Do not add UI complexity before domain behavior works.
- Do not reintroduce SvelteKit, Cloudflare Worker, Bun, Wrangler, or E2B.

## Success Criteria

Hackathon MVP is successful when:

1. Host creates a Match in Gradio with at least one Custom Challenge.
2. Participants join by Match code, choose an allowed model, and receive hidden rejoin tokens.
3. Each Participant gets a fresh Daytona sandbox per Challenge attempt.
4. Participant sends context engineering to a Vibecoder, which runs autonomously.
5. Participant can create multiple Submissions before Deadline; latest valid Submission counts.
6. Judge graph evaluates latest Submissions using acceptance checks and rubric scoring.
7. Leaderboard groups Participants by Model choice.
8. Gradio Match view refreshes every two seconds and supports manual refresh.
9. Match records survive process restart in Upstash Redis; active attempts become interrupted.

## Phase 0: Current Baseline

Status: done.

Implemented:

- Python-only repo skeleton.
- `arena.agent.create_session()` for DeepAgent + sandbox backend.
- `arena.api` FastAPI smoke routes.
- `arena.models` domain records.
- `CONTEXT.md` glossary.
- ADRs for Python DeepAgents rewrite, Gradio on Hugging Face, Upstash Redis.

Verification:

- `make test`
- `make smoke`

## Phase 1: Match Store Seam

Purpose: make Redis boring and invisible.

Files:

- `arena/match_store.py`
- `tests_python/test_match_store.py`

Interface:

```python
class MatchStore:
    def create_match(self, request: CreateMatchRequest) -> HostAccessView: ...
    def join_match(self, code: str, name: str, model_choice: str) -> ParticipantAccessView: ...
    def rejoin(self, token: str) -> HostAccessView | ParticipantAccessView: ...
    def get_match_view(self, code: str) -> MatchView: ...
```

Implementation notes:

- Start with an in-memory adapter that satisfies the interface.
- Add Upstash adapter after behavior tests pass.
- Generate Match code, Host token, Participant token server-side.
- Reject late joins once Match status is not `waiting`.
- Reject model choice outside Model policy.
- Store enough data for Gradio Match view without exposing tokens.

Tests:

- Create Match returns code and hidden Host token.
- Join before start creates separate Participants for repeated browser tabs.
- Rejoin with token restores Host or Participant access.
- Join after start is rejected.
- Invalid model choice is rejected.

Done when:

- Tests pass against in-memory adapter.
- Upstash adapter passes same behavior tests with fake HTTP client or local stub.

## Phase 2: Gradio Match Shell

Purpose: let users drive Match setup without touching Redis details.

Files:

- `arena/gradio_app.py`
- `app.py` for Hugging Face Spaces entrypoint if needed.
- `tests_python/test_gradio_flows.py` for pure handler tests.

UI sections:

- Create Match.
- Join Match.
- Rejoin by token.
- Lobby view.
- Match view / Leaderboard placeholder.

Implementation notes:

- Use Gradio `State` for current Host/Participant access.
- Token display hidden by default, explicit reveal/copy action.
- Timer refreshes Match view every two seconds.
- Manual refresh button uses same view function.
- Keep Gradio handlers thin; call Match store.

Tests:

- Create handler returns Match code and Host state.
- Join handler returns Participant state.
- Rejoin handler restores access.
- Match view hides private tokens.

Done when:

- `make test` passes.
- `make dev` or Hugging Face app entry launches Gradio UI.

## Phase 3: Vibecoder Seam

Purpose: separate contestant DeepAgent work from Match state.

Status: in progress. This moved ahead of the Gradio shell because the DeepAgent runtime is the critical competition primitive.

Files:

- `arena/vibecoder.py`
- `tests_python/test_vibecoder.py`

Interface:

```python
class VibecoderRunner:
    def start_attempt(self, match_id: str, participant_id: str, challenge: Challenge, model_choice: str) -> AttemptRuntime: ...
    def send_context(self, attempt_id: str, content: str) -> ThreadMessage: ...
    def stream_context(self, attempt_id: str, content: str) -> list[StreamEvent]: ...
    def snapshot_submission(self, attempt_id: str) -> Submission: ...
    def close_attempt(self, attempt_id: str) -> None: ...
```

Implementation notes:

- Move/rename current `arena.agent` concepts only when this seam exists.
- DeepAgent receives Participant context engineering.
- Daytona sandbox is fresh per Challenge attempt.
- Local backend remains smoke-test only.
- `/context/` is a protected host-side filesystem route; `/workspace` stays on the executable sandbox backend.
- `/skills/` is a read-only skill route for progressive-disclosure Vibecoder workflows.
- Agent sessions use an in-process checkpointer; `DEEPAGENT_REQUIRE_EXECUTE_APPROVAL=1` enables execute interrupts when the frontend can approve/reject them.
- `stream_context()` normalizes DeepAgents streaming chunks for Gradio live logs.
- Instruction budget enforcement belongs above or inside this seam, but Redis remains store-owned.

Tests:

- Local fake backend creates attempt runtime.
- Context message increments instruction count.
- Snapshot returns Daytona-style archive pointer shape using fake backend.
- Closing attempt cleans sandbox handle.

Done when:

- Participants can run a Vibecoder from a Gradio handler in local smoke mode.

## Phase 4: Match Round Lifecycle

Purpose: make competition real before judging.

Status: skeleton done. `MatchFlow` creates attempts on Match start, forwards Instructions to the Vibecoder, creates Submissions, invokes the Judge graph, attaches Scores to attempts, and exposes flat plus by-model Leaderboards. Full round progression and persistence are still pending.

Files:

- `arena/match_flow.py`
- `tests_python/test_match_flow.py`

Behavior:

- Host starts Match. Implemented.
- Every Participant gets a Challenge attempt for current Challenge. Implemented.
- Participant Instructions are forwarded into the owning Vibecoder attempt. Implemented.
- Participant can create a Submission from the current workspace. Implemented.
- Judge graph can score the latest Submission for an attempt. Implemented.
- Match flow exposes flat and grouped-by-model Leaderboards after Judging. Implemented.
- Deadline rejects new Instructions and Submissions. Skeleton implemented for active-attempt checks.
- All Participants submitted -> round ends early.
- No Submission before Deadline -> Missed attempt with zero Score.
- Reveal starts only after Judging finishes or attempts are missed/interrupted.

Tests:

- Starting Match creates attempts for every Participant.
- No late join after start.
- Owning Participant token is required for Instructions and Submissions.
- Submitted attempt rejects more Instructions.
- Judge requires a Submission.
- Judged attempts appear in the flat Leaderboard and grouped Leaderboards by Model choice.

Done when:

- Gradio can show waiting, playing, revealing, finished states.

## Phase 5: Judge Graph Seam

Purpose: LangGraph judges Submissions without mutating Participant workspaces.

Status: in progress. LangGraph seam, provider-neutral snapshot, sandbox judge executor, Daytona judge smoke, OpenRouter rubric reviewer, Match lifecycle handoff, and Leaderboard integration exist.

Files:

- `arena/judge_graph.py`
- `tests_python/test_judge_graph.py`

Interface:

```python
class JudgeGraph:
    def judge(self, submission: Submission, challenge: Challenge, policy: ScoringPolicy) -> Score: ...
```

Graph shape:

1. Restore Submission archive into Judge sandbox.
2. Run acceptance checks.
3. Run rubric assessment.
4. Combine with Scoring policy.
5. Return Score and feedback.

Implementation notes:

- Start with deterministic fake graph that scores from provided check/rubric inputs.
- Add LangGraph nodes one at a time.
- Use Graph API with explicit nodes for load, checks, rubric, scoring, and feedback.
- Submission snapshots copy `/workspace` through the DeepAgents filesystem interface into `local-snapshot://...`.
- `SandboxJudgeExecutor` restores snapshots into a judge backend and runs Acceptance checks there. Local dev uses `LocalShellBackend`; production-like smoke uses Daytona.
- Judge sandbox is per Match and restored from clean snapshot or deleted/recreated between runs.
- Never expose secrets to judge sandbox except provider credentials needed to run sandbox operations.

Tests:

- Check score and rubric score combine by Challenge weights.
- Instruction penalty reduces Score.
- Failed check affects Score but does not crash judging.
- Judge graph returns feedback for Gradio Reveal.

Done when:

- Latest Submissions receive Scores.
- Leaderboard updates after Judging.

## Phase 6: Upstash Adapter

Purpose: replace in-memory Match store with hackathon persistence.

Files:

- `arena/upstash_store.py`
- `tests_python/test_upstash_store.py`

Env:

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Implementation notes:

- Use HTTPS REST API; avoid TCP Redis.
- TTL defaults to 24 hours after Match finish.
- Store records as JSON Pydantic dumps.
- Token lookup keys should not expose token values in logs.
- Use optimistic updates only where race risk matters for hackathon flows.

Tests:

- Use fake HTTP client for commands.
- Confirm TTL set on finished Match records.
- Confirm token lookup resolves without scanning all Matches.

Done when:

- Same Match store behavior tests pass against Upstash adapter fake.
- Optional live smoke against real Upstash passes without printing secrets.

## Phase 7: Leaderboard and Reveal Polish

Purpose: make competition understandable.

Files:

- `arena/leaderboard.py`
- Gradio view handlers.

Behavior:

- Group Leaderboards by Model choice.
- Show score, rank, instruction count, status.
- Reveal Submissions and feedback only after round ends.
- Show interrupted/missed attempts clearly.

Tests:

- Leaderboard groups by model.
- Ties sort stably by Submission time or Participant name.
- Reveal hides Submissions before round end.

Done when:

- Gradio surface can run one full multi-participant Match manually.

## Phase 8: Hugging Face Spaces Readiness

Purpose: deployable demo.

Files:

- `app.py`
- `README.md`
- `.env.example`

Checklist:

- Gradio app launches with `python app.py`.
- README lists HF Secrets: `OPENROUTER_API_KEY`, `DAYTONA_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Local smoke path documented with `DEEPAGENT_SANDBOX_PROVIDER=local`.
- No committed secrets.
- No provider stack traces shown to users.

Done when:

- Fresh clone + secrets -> Gradio app starts.
- One real Daytona Vibecoder attempt works.
- One fake or real Judge graph path scores a Submission.

## Deferred Until After Hackathon MVP

- Full auth beyond bearer tokens.
- Durable Thread/sandbox resume after process restart.
- Object storage for large assets.
- Full archive browser.
- Anti-cheat beyond sandbox isolation and post-round reveal.
- Multi-space orchestration.
- Advanced real-time transport beyond Gradio polling.
