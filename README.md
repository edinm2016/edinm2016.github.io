# Ai Matrix

Ai Matrix is planned as a universal AI platform that brings research, knowledge, creative work, data analysis, and AI agents together behind one interface.

## Project map

- [`core/`](core/README.md) — Matrix Core orchestration MVP.
- [`index.html`](index.html) — AI Assistant chat interface.
- [`overview.html`](overview.html) — product vision and module architecture.
- [`docs/architecture.md`](docs/architecture.md) — system components and request flow.
- [`docs/api.md`](docs/api.md) — initial backend API contract.
- [`database/schema.sql`](database/schema.sql) — proposed SQLite data model.
- [`server/`](server/README.md) — local planning API and SQLite persistence prototype.
- [`agents/README.md`](agents/README.md) — Agent System design and safety boundaries.

## Current state

The repository includes a dark AI Assistant interface and a local backend with SQLite planning. Copy `.env.example` to `.env` and configure `MATRIX_CHAT_API_KEY` and `MATRIX_MODEL` to enable local chat. A Render Blueprint is provided in [`render.yaml`](render.yaml) for a small hosted API. It keeps the provider key in Render's private environment, restricts browser requests to the GitHub Pages origin, and rate-limits chat requests. The free service may sleep while idle and its SQLite storage is temporary; it is suitable for a personal preview, not production. Matrix module and agent handlers are not connected yet.

### Enable online AI chat

1. In Render, create a new Blueprint from this repository and select `render.yaml`.
2. Enter your provider API key and model in Render's private environment-variable form. Do not add the key to GitHub or `api-config.js`.
3. Wait for the service health check to pass at `https://ai-matrix-api.onrender.com/health`.

The public site at `https://edinm2016.github.io/` is already configured to use that API URL. The provider key remains server-side. The service allows requests only from the Matrix site and limits chat calls per client; the free hosting tier can sleep when unused and does not preserve local SQLite data across restarts. For sustained public usage, add account-based authentication, a persistent database, and provider spending limits.
