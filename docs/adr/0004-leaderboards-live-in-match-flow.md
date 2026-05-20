# ADR 0004: Derive Leaderboards in MatchFlow

## Status

Accepted

## Context

The Gradio surface needs to display Match results after Judging. Vibecode Arena compares Participants by Score, but the domain also requires grouped Leaderboards by Model choice so different models can be compared fairly.

If every UI or route rebuilt rankings from attempts, Score ordering and model grouping rules would spread across callers.

## Decision

Derive Leaderboards inside `arena.match_flow.MatchFlow`.

`MatchFlowView` exposes:

- `leaderboard`: flat Score-ordered entries.
- `leaderboards_by_model`: Score-ordered entries grouped by Model choice.

FastAPI and Gradio should render these views instead of recalculating rankings.

## Consequences

- Leaderboard rules have better locality.
- Gradio can remain a thin adapter over `ArenaService`.
- Redis persistence can later store attempts and Scores while keeping Leaderboard derivation behind the same Match flow seam.
