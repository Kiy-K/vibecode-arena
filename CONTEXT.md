# Context

## Domain Language

- **Arena**: Competition where participants use DeepAgents to build code in sandboxed workspaces against a shared challenge.
- **Host**: Person who creates a Match, configures its Challenges, time limits, and model policy, then starts it.
- **Match code**: Short shareable code that lets someone join a Match before it starts.
- **Participant**: One competitor controlling one Thread and one sandbox workspace for one challenge attempt. Multiple browser tabs from the same human are separate Participants.
- **Participant token**: Server-issued secret stored by the client that lets a browser tab reconnect to its Participant after refresh.
- **Host token**: Server-issued secret stored by the client that authorizes Match control after refresh.
- **Rejoin**: Flow where a Host or Participant pastes a token into the Gradio surface to recover access after refresh or lost session state. Tokens are hidden by default and exposed only through an explicit copy or reveal action.
- **Model choice**: Model selected by a Participant when joining a Match. The Model choice is locked for every Challenge attempt in that Match.
- **Model policy**: Set of models allowed in a Match. Participants choose one allowed model before the Match starts.
- **Challenge attempt**: One Participant trying one Challenge in one Match with a fresh sandbox workspace. A Challenge attempt may have multiple submissions before it ends; the latest submission is the scored submission. Sandbox contents do not carry between Challenge attempts.
- **Missed attempt**: Challenge attempt with no Submission before the Deadline. A Missed attempt receives zero Score for that Challenge.
- **Challenge**: Prompt or spec plus acceptance checks, reference assets, and judging rubric for one round. A Challenge is not generated code, a sandbox, or a submission.
- **Custom Challenge**: Challenge authored by a Host for a Match, including prompt, reference assets, acceptance checks, and judging rubric.
- **Reference asset**: Small Host-provided Challenge artifact stored inline in Redis. Reference assets are capped at 1 MB per asset and 5 MB total per Match.
- **Acceptance check**: Host-authored check for a Challenge. Acceptance checks may include arbitrary code, but run only inside an isolated judge sandbox.
- **Judge sandbox**: Sandbox used to run Acceptance checks and rubric evaluation. Local dev uses `LocalShellBackend` and is not isolated. Production-like Judging uses Daytona. A Match has one Judge sandbox that is restored from a clean snapshot or deleted and recreated between Submission judging runs.
- **Match**: One competition instance with Participants, shared start time, shared deadlines, leaderboard, and one or more Challenges played as rounds. Participants must join before the Match starts; late join is not allowed.
- **Vibecoder**: DeepAgent instance that receives a Participant's context engineering and runs autonomously in a sandbox to create a Submission.
- **Judge graph**: LangGraph workflow that evaluates Submissions using acceptance checks, rubric assessment, and scoring policy.
- **Thread**: One interactive Vibecoder conversation plus its sandbox-backed workspace.
- **Sandbox provider**: External or local backend satisfying DeepAgents filesystem/execute interface.
- **Agent session**: In-memory Python object tying thread id, DeepAgent graph, sandbox backend, optional provider sandbox handle, and chat messages.
- **Match record**: Upstash Redis-backed record of Match metadata, Participants, Challenge attempts, Submissions, and Scores. Match records survive process restarts, but active Threads and sandbox workspaces may be lost; affected Challenge attempts become interrupted.
- **Interrupted attempt**: Challenge attempt whose active Thread or sandbox workspace was lost before a final Submission could be judged.
- **Context engineering**: Participant-authored instructions, constraints, examples, and references given to a Vibecoder before or during a Challenge attempt.
- **Instruction**: Participant prompt asking the Vibecoder to create or modify code in sandbox.
- **Thread message**: Instruction or DeepAgent response in a Thread. Thread messages may include strategy or explanation, but only workspace snapshots become Submissions.
- **Instruction budget**: Maximum number of Instructions allowed for a Challenge attempt. Using more Instructions can reduce Score according to Match configuration.
- **Submission**: Snapshot of a Participant workspace selected for judging at a point in time. Submission contents are stored behind an archive pointer. Local prototype Submissions use `local-snapshot://...`; Daytona Submissions should later use a provider archive pointer.
- **Retention window**: Period after Match finish during which Match records and Submission archives remain available. The default Retention window is 24 hours.
- **Deadline**: Time after which new Instructions and Submissions are rejected for a Challenge attempt. A Submission created before the Deadline remains valid even if Judging finishes after the Deadline.
- **Judging**: Evaluation of a Submission using deterministic checks, optional LLM rubric assessment, and Scoring policy, combined into a Score.
- **Score**: Weighted result of Judging used to rank Participants on a leaderboard.
- **Scoring policy**: Rules that combine Judging results, time bonus, and Instruction penalty. A Challenge owns rubric and acceptance-check weights; a Match owns global modifiers such as time bonus and Instruction penalty.
- **Leaderboard**: Ranking of Participants by Score. A Match exposes a flat Leaderboard and grouped Leaderboards by Model choice so Participants using different models can be compared fairly.
- **Reveal**: Post-round visibility of Submissions and judging feedback. Submissions are not visible to other Participants before the round ends.
- **Round progression**: Movement from one Challenge to the next in a Match. A round ends when its Deadline arrives or when all Participants have submitted, then moves to Reveal after Judging completes.
- **Gradio surface**: Hackathon frontend for Hugging Face Spaces. The Gradio surface presents Match creation, Participant actions, Thread messages, Submissions, and Leaderboards.
- **Match view**: Redis-backed snapshot rendered by the Gradio surface. The Gradio surface refreshes Match views by timer polling every two seconds and by manual refresh.

## Current Direction

Rewrite favors deep Python module seams:

- `arena.api` handles protocol concerns.
- `arena.match_flow` coordinates Match starts, Challenge attempts, Submissions, Judging, Scores, and Leaderboard views.
- `arena.agent` hides DeepAgents, model, subagents, sandbox provider adapters, and lifecycle.
- `arena.vibecoder` owns Challenge attempt context, Instructions, and Submission snapshot creation.
- `arena.judge_executor` owns Submission snapshot materialization and Acceptance check execution.
- `arena.judge_graph` owns Judging workflow and Score creation.

Legacy UI/game stack has been deleted from active project context.
