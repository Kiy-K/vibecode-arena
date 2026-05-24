# AGENTS.md

## Project

Vibecode Arena is now Python-first. Old SvelteKit, Cloudflare Worker, Bun, Wrangler, E2B, and browser game files are legacy and should not be reintroduced.

## Stack

- Python 3.11+
- FastAPI HTTP surface
- LangChain DeepAgents runtime
- OpenRouter model gateway via `langchain-openrouter`
- DeepAgents sandbox backend, default Daytona via `langchain-daytona`

## Commands

```bash
make dev      # run FastAPI app on 127.0.0.1:8790
make gradio   # run monolithic Gradio app on 127.0.0.1:7860
make test     # run Python tests
make smoke    # create local DeepAgent session without remote sandbox
make judge-smoke # snapshot local workspace and run real judge acceptance command
make daytona-judge-smoke # run judge acceptance command in live Daytona sandbox
make clean    # remove Python caches
```

Direct equivalents:

```bash
uv run uvicorn arena.api:app --host 127.0.0.1 --port 8790
uv run python app.py
uv run pytest tests_python
```

The Makefile includes `.env` when present and falls back to `UV_PROJECT_ENVIRONMENT=.venv`, `UV_CACHE_DIR=.uv-cache`, and `UV_LINK_MODE=copy`.

## Env

```bash
OPENROUTER_API_KEY=sk-or-...
DAYTONA_API_KEY=...
DEEPAGENT_MODEL=openrouter/free
DEEPAGENT_SANDBOX_PROVIDER=daytona
JUDGE_MODEL=openrouter/free
JUDGE_USE_LLM=0
JUDGE_SANDBOX_PROVIDER=local
```

`DEEPAGENT_SANDBOX_PROVIDER=local` is for smoke tests only. It uses `LocalShellBackend`, which is not isolated.
`JUDGE_SANDBOX_PROVIDER=daytona` is production-like judge mode. It restores snapshots into a Daytona sandbox before running Acceptance checks.

## Module Map

- `arena/api.py`: FastAPI route module. Owns HTTP request/response models and translates service errors to HTTP errors.
- `arena/service.py`: Unified application API. FastAPI, future Gradio handlers, and tests should call this boundary.
- `arena/gradio_app.py`: Monolithic Gradio surface. Owns UI handlers and renders Match, attempt, and Leaderboard views from `ArenaService`.
- `arena/match_flow.py`: Competition lifecycle conductor. Owns Match-to-attempt wiring, Instruction forwarding, Submission creation, Judge graph handoff, and Leaderboard views.
- `arena/agent.py`: DeepAgent module. Owns model construction, subagents, sandbox backend adapter selection, session lifecycle.
- `arena/vibecoder.py`: Competition runner seam. Owns attempt context seeding, instruction streaming, and submission snapshots.
- `arena/judge_graph.py`: LangGraph judge workflow. Owns acceptance check scoring, rubric scoring, and final Score creation.
- `arena/judge_executor.py`: Judge executor adapters and local Submission snapshot helper.
- `skills/`: DeepAgents skill source mounted at `/skills/` and loaded through progressive disclosure.
- `tests_python/`: Python test surface. Tests public modules, not old TS tree.

## Architecture Rules

- Keep DeepAgent construction behind `create_session()`.
- Keep Match lifecycle orchestration behind `arena.match_flow.MatchFlow`.
- Keep Leaderboard derivation inside `MatchFlow`; Gradio and FastAPI should render the provided flat and by-model views.
- Keep Gradio monolithic and thin: handlers call `ArenaService`, not provider SDKs or store internals.
- Keep sandbox provider choice behind `DEEPAGENT_SANDBOX_PROVIDER`.
- Default sandbox provider is Daytona; local backend must stay explicit.
- Keep `/context/` on a protected non-executable route and `/workspace` on the executable sandbox backend.
- Do not call provider SDKs from route handlers except through `arena.agent`.
- Treat prompts, file paths, and model output as untrusted input.
- Do not log secrets, prompt payloads containing secrets, or sandbox file contents by default.
- Avoid pass-through modules. New modules must increase depth: small interface, useful behavior hidden behind it.

## Quality Bar

- Run `make test` after edits.
- Run `make smoke` when touching `arena/agent.py`.
- Add tests for new route behavior or session lifecycle behavior.
- Prefer stdlib before new deps. New deps need clear leverage.
