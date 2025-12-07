# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vibecode Arena is a competitive multiplayer coding game where players pick an AI model and race to build UI components. Players prompt their AI, watch code render live in E2B sandboxes, and get scored by AI judges.

## Tech Stack

**Runtime & Package Manager**
- **Bun** - Used as package manager and runtime. Use `bun run` for all scripts, `bun install` for dependencies.

**Frontend**
- **SvelteKit 2** with **Svelte 5** - Uses runes mode (`$state`, `$derived`, `$effect`, `$props`) not legacy reactive statements
- **Tailwind CSS v4** - New CSS-first config, uses `@theme` in CSS not `tailwind.config.js`
- **Vite 7** - Build tool, configured in `vite.config.ts`

**Svelte 5 Patterns**
- Components use `let { prop } = $props()` not `export let prop`
- State: `let count = $state(0)` not `let count = 0` with `$:`
- Derived: `let double = $derived(count * 2)` not `$: double = count * 2`
- Effects: `$effect(() => { ... })` not `$: { ... }`
- Hooks are `.svelte.ts` files exporting functions that return reactive state

**Backend**
- **Cloudflare Pages** - Hosts SvelteKit app with edge functions
- **Cloudflare Durable Objects** - Stateful WebSocket server for game rooms
- **Wrangler** - CLI for Cloudflare development and deployment

**AI & Sandboxes**
- **Vercel AI SDK** (`ai` package) - Streaming chat with `streamText`, structured output with `generateObject`
- **OpenRouter** - Routes to multiple LLM providers (Claude, GPT, Gemini, Llama)
- **E2B** - Cloud sandboxes for running player code. Uses `Sandbox.create()`, file writes, and `getHost()` for preview URLs

**Validation & Testing**
- **Valibot** - Schema validation (lighter than Zod), used for AI structured outputs and form validation
- **Vitest** - Unit/integration tests with coverage
- **Playwright** - E2E tests, uses `@sandbox` tag for tests requiring E2B

## Before Committing

Always ensure these pass before considering code production-ready:
```bash
bun run check            # TypeScript + Svelte type checking
bun run lint             # ESLint
bun run test             # Unit/integration tests
```

## Commands

```bash
# Development
bun run dev:all          # Start both SvelteKit (5173) and Wrangler worker (8788)
bun run dev              # SvelteKit only
bun run dev:worker       # Wrangler only

# Testing
bun run test             # Unit/integration tests (Vitest)
bun run test:watch       # Watch mode
bun run test:e2e         # Full E2E (requires E2B API key)
bun run test:e2e:quick   # E2E without @sandbox tests

# Validation
bun run check            # TypeScript + Svelte checks
bun run lint             # ESLint
bun run format           # Prettier

# Deployment
bun run deploy:worker    # Deploy Durable Object worker
bun run deploy:app       # Build and deploy SvelteKit app
```

## Architecture

### Two-Process System
- **SvelteKit on Cloudflare Pages** (`src/`): UI, AI chat streaming, E2B sandbox management, server actions
- **Cloudflare Worker with Durable Objects** (`worker/`): Game state, WebSocket connections, round timers

Communication: Browser ↔ DO (WebSocket for real-time events), SvelteKit ↔ DO (HTTP RPC via `do-client.ts`)

### Key Architectural Patterns

**Durable Object (`worker/src/GameRoom.ts`)**
- Single source of truth for game state per room
- Uses `ctx.storage` for persistence, alarms for round timers
- Broadcasts events to all connected WebSocket clients

**Sandbox Management (`src/lib/server/e2b/SandboxManager.ts`)**
- One E2B sandbox per room (shared by all players)
- Player code written to `/home/user/solutions/{playerId}/index.html`
- Auto-cleanup of stale sandboxes

**AI Judging (`src/lib/server/ai/agents/`)**
- `JudgeOrchestrator` coordinates three agents: CodeAnalyzer (0.25), VisualMatcher (0.5), InteractionTester (0.25)
- Each agent is a single-shot LLM evaluator with structured output (Valibot schemas)

**Client Hooks (`src/lib/hooks/*.svelte.ts`)**
- Svelte 5 runes-based state management
- `useGame` composes: `useGameSocket`, `useChat`, `useTimer`, `useSubmission`, `useSandbox`, `useReview`

### Data Flow
1. Player joins room → SvelteKit calls DO via `do-client.ts` → DO broadcasts `player_joined`
2. Host starts round → DO sets alarm, broadcasts `challenge_started`
3. Player prompts AI → SvelteKit streams via Vercel AI SDK → code sent to E2B sandbox
4. Player submits → DO collects submissions → `JudgeOrchestrator` scores → DO broadcasts results

## Testing

- Unit tests: `tests/unit/` - Test individual functions
- Integration tests: `tests/integration/` - Test module interactions
- E2E tests: `tests/e2e/` - Playwright tests, `@sandbox` tag for tests needing E2B

Vitest aliases mock SvelteKit modules (`$app/environment`, etc.) in `tests/mocks/`.

## Conventions

**Imports**
- Use `$lib/` for all lib imports, never relative paths from routes
- Server-only code in `$lib/server/` - auto-excluded from client bundles
- Types in `$lib/types/`, config in `$lib/config/`

**SvelteKit Patterns**
- `+page.server.ts` - load functions and form actions
- `+page.svelte` - page components with `let { data } = $props()`
- `*.remote.ts` - server functions callable from client (uses SvelteKit's server function feature)
- Form validation uses Valibot schemas in `$lib/validation/`

**Naming**
- Hooks: `use{Name}.svelte.ts` returning object with reactive state
- Agents: `{Name}Agent.ts` with `analyze()` method
- Components: PascalCase, grouped by feature in `$lib/components/`

## Gotchas

- **DO vs SvelteKit state** - Game state lives in Durable Object, not SvelteKit. Don't cache room state server-side; always fetch from DO.
- **E2B sandbox limit** - Current plan allows 20 concurrent sandboxes. One sandbox per room.
- **WebSocket reconnection** - `useGameSocket` handles reconnection, but client state may be stale after reconnect.
- **Svelte 5 reactivity** - Don't destructure `$state` objects or you lose reactivity. Use `.property` access.
- **Tailwind v4** - No `tailwind.config.js`, theme defined in CSS with `@theme { }` blocks.

## Environment Variables

Required: `OPENROUTER_API_KEY`, `E2B_API_KEY`
Optional: `PUBLIC_DO_URL` (defaults to localhost:8788 in dev)
