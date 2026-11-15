# Ai Matrix

Ai Matrix is planned as a universal AI platform that brings research, knowledge, creative work, data analysis, and AI agents together behind one interface.

## Project map

- [`core/`](core/README.md) — Matrix Core orchestration MVP.
- [`docs/architecture.md`](docs/architecture.md) — system components and request flow.
- [`docs/api.md`](docs/api.md) — initial backend API contract.
- [`database/schema.sql`](database/schema.sql) — proposed SQLite data model.
- [`server/`](server/README.md) — local planning API and SQLite persistence prototype.
- [`agents/README.md`](agents/README.md) — Agent System design and safety boundaries.

## Current state

The public GitHub Pages site is a static project overview. The local backend accepts and stores task plans in SQLite, but does not execute modules. No AI provider, authentication, or production agent tools are connected yet. A protected server environment is required for public API deployment; GitHub Pages alone only hosts static files.
