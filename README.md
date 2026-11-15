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

The repository includes a dark AI Assistant interface and a local backend with SQLite planning. Copy `.env.example` to `.env` and configure `MATRIX_CHAT_API_KEY` and `MATRIX_MODEL` to enable local chat. No authentication, production deployment, or Matrix module/agent handlers are connected yet. A protected server environment is required; GitHub Pages alone only hosts static files.
