# ADR 0001: Rewrite Around Python DeepAgents

## Status

Accepted

## Context

Previous app mixed SvelteKit, Cloudflare Durable Objects, E2B sandboxes, Vercel AI SDK, OpenRouter, and a browser game UI. New direction is ground-up Python using LangChain DeepAgents and their sandbox backend interface.

## Decision

Use Python FastAPI for HTTP, LangChain DeepAgents for contestant-side autonomous building, LangGraph for judging workflows, OpenRouter for model access, and Daytona as default DeepAgents sandbox provider.

Keep sandbox provider behind `DEEPAGENT_SANDBOX_PROVIDER` so local smoke tests can use `LocalShellBackend` explicitly.

## Consequences

- Legacy TS/Svelte/Worker/E2B modules are removed.
- Main contestant-side seam is `arena.agent.create_session()`.
- Judging should live behind a separate LangGraph seam.
- Route handlers do not know provider details.
- Local backend is allowed only for smoke tests because it is not isolated.
