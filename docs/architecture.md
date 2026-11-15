# Ai Matrix Technical Architecture

## Product direction

Ai Matrix is a universal AI platform combining useful knowledge work, research, software development, creative work, data analysis, and delegated agent tasks. Erebus is outside the core product.

## System layers

1. **Matrix Interface** — web client for conversations, task status, results, and approval requests.
2. **API / application backend** — authenticates requests, applies limits, persists state, and calls Matrix Core.
3. **Matrix Core** — validates task envelopes, plans work, selects modules, coordinates execution, checks results, and composes responses.
4. **Capability modules** — Knowledge Engine, AI Research, Agent System, Matrix Lab, Creative Engine, and Data Intelligence. Each exposes a bounded handler contract to the Core.
5. **Provider adapters** — isolated connectors for language models, search, storage, and media services. Secrets stay on the server.
6. **Persistence and audit** — relational task state plus an append-only event trail; retention is configurable.

## Request lifecycle

`client → API validation → request envelope → plan → module routing → approval gate (when needed) → execution → result validation → response → client`

The Core is the only component that owns task state transitions. Modules return results and cannot mark a task complete by themselves. Each module run records its status, timing, and a bounded output reference. Failures are isolated so one module error does not erase completed work from other modules.

## Module boundaries

| Module | Responsibility | Example output |
| --- | --- | --- |
| Knowledge Engine | Explain concepts and organize learning | Structured explanation |
| AI Research | Gather and compare evidence | Findings with source references |
| Agent System | Execute multi-step delegated workflows | Step log and completion status |
| Matrix Lab | Help build and inspect software | Code changes or technical findings |
| Creative Engine | Produce or refine creative material | Text or media artifact reference |
| Data Intelligence | Analyze datasets and patterns | Findings, metrics, or chart specification |

Modules receive only the task fields they need. External writes, publication, sensitive data handling, deletion, financial actions, and permission changes must pass a verified approval gate. The MVP gate in `core/safety-gate.js` is a contract; a production backend must supply a trusted approval verifier.

## Data and deployment choices

The initial relational schema is in `database/schema.sql`. SQLite is suitable for a single-process prototype; a hosted multi-user service should use a managed relational database with backups and migrations. GitHub Pages hosts the static interface only. The API, database, provider credentials, and workers need a separate server deployment before real AI execution is possible.

## Proposed delivery phases

1. Freeze request, plan, module, and result contracts.
2. Add backend API and persistent task storage.
3. Connect Matrix Interface to the API and show task progress.
4. Implement one read-only module with a server-side provider adapter.
5. Add approval records and an auditable Agent System.
6. Add remaining modules one at a time with access limits and result validation.

The repository contains the Assistant interface, Core prototype, local planning/chat backend, and design contracts. Real chat requires a server-side API key and model setting. Specialized modules, agents, authentication, and public backend hosting are not operational yet. GitHub Pages serves only the static interface.
