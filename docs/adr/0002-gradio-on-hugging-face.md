# ADR 0002: Use Gradio on Hugging Face for the Frontend

## Status

Accepted

## Context

The Arena is being built for a hackathon on Hugging Face. The previous browser frontend was removed during the Python DeepAgents rewrite. Options were API-only, FastAPI templates, or a Gradio frontend.

## Decision

Use Gradio as the frontend surface and target Hugging Face Spaces as the deployment environment.

## Consequences

- UI code stays in Python.
- FastAPI remains useful for internal/API seams, but Gradio is the user-facing surface.
- Real-time behaviour should fit Gradio's event model before adding separate web transports.
- Dependencies and sandbox/provider setup must work in Hugging Face Spaces.

