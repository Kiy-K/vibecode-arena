# vibecode arena

Python DeepAgents coding arena.

## Stack

- Python 3.11+
- FastAPI
- LangChain DeepAgents
- OpenRouter model gateway
- DeepAgents sandbox backend, default Daytona
- Gradio frontend planned for Hugging Face Spaces

## Run

```bash
cp .env.example .env
make dev
```

## Test

```bash
make test
make smoke
make judge-smoke
make daytona-judge-smoke
```

## Env

```bash
OPENROUTER_API_KEY=sk-or-...
DAYTONA_API_KEY=...
DEEPAGENT_MODEL=openrouter/free
DEEPAGENT_SANDBOX_PROVIDER=daytona
DEEPAGENT_REQUIRE_EXECUTE_APPROVAL=0
JUDGE_MODEL=openrouter/free
JUDGE_USE_LLM=0
JUDGE_SANDBOX_PROVIDER=local
```

`DEEPAGENT_SANDBOX_PROVIDER=local` exists for dev smoke tests only. It is not isolated.
Set `DEEPAGENT_REQUIRE_EXECUTE_APPROVAL=1` when a frontend can handle DeepAgents interrupt approval for sandbox commands.
Set `JUDGE_USE_LLM=1` or pass `use_llm_rubric=true` to `/judge` to use the OpenRouter prototype rubric judge.
Set `JUDGE_SANDBOX_PROVIDER=daytona` to run Acceptance checks in Daytona judge sandboxes.

## API

```bash
curl -X POST http://127.0.0.1:8790/threads
curl -X POST http://127.0.0.1:8790/threads/{thread_id}/messages \
  -H 'Content-Type: application/json' \
  -d '{"content":"Build a Svelte-style counter component and run checks"}'
curl http://127.0.0.1:8790/threads/{thread_id}/files
curl http://127.0.0.1:8790/threads/{thread_id}/files/content?path=/app.py
curl -X DELETE http://127.0.0.1:8790/threads/{thread_id}
```

Competition lifecycle routes now cover the skeleton flow:

```bash
curl -X POST http://127.0.0.1:8790/matches
curl -X POST http://127.0.0.1:8790/matches/{code}/join
curl -X POST http://127.0.0.1:8790/matches/{code}/start
curl http://127.0.0.1:8790/matches/{code}/flow
curl -X POST http://127.0.0.1:8790/attempts/{attempt_id}/instructions
curl -X POST http://127.0.0.1:8790/attempts/{attempt_id}/submit
curl -X POST http://127.0.0.1:8790/attempts/{attempt_id}/judge
```

## Architecture

- `arena/api.py`: HTTP API.
- `arena/service.py`: unified application API shared by FastAPI, future Gradio handlers, and tests.
- `arena/agent.py`: DeepAgent, subagents, sandbox backend, checkpointer, skills, permissions.
- `arena/match_flow.py`: competition lifecycle conductor for attempts, submissions, judging, scores, and flat/grouped Leaderboards.
- `arena/vibecoder.py`: competition attempt runner and streaming seam.
- `arena/judge_graph.py`: LangGraph judge workflow.
- `arena/judge_executor.py`: judge executor adapters and local submission snapshot helper.
- `skills/`: DeepAgents skills loaded at `/skills/`.
- `tests_python/`: tests.
