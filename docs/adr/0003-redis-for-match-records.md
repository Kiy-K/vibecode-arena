# ADR 0003: Use Redis for Match Records

## Status

Accepted

## Context

Arena needs multiple concurrent Matches in a Hugging Face Space. Earlier direction considered local durable storage, but the hackathon deployment needs simple shared state that survives process restarts better than in-memory state.

## Decision

Use Upstash Redis REST as the source of truth for Match records in the hackathon MVP. Store Match metadata, Participants, Challenge attempts, Submission metadata, Scores, and event state in Redis. Keep active DeepAgent Threads and sandbox handles in process memory.

## Consequences

- Multiple Matches can coexist in one Space process.
- Hugging Face Spaces can access Redis over HTTPS without TCP Redis setup.
- Match metadata and results can survive process restarts.
- Active Threads and sandbox workspaces do not resume after restart; affected Challenge attempts become interrupted.
- Data model should include TTL cleanup for stale Matches.
