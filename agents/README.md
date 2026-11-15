# Agent System Design

The Agent System runs approved, bounded plans through named capabilities. Agents are workers coordinated by Matrix Core; they do not own user conversations, grant themselves access, or approve their own actions.

## Agent definition

Each agent should declare:

- stable `agent_id` and version
- a narrow purpose and supported task types
- allowed modules and tools
- input and output JSON schemas
- maximum steps, runtime, and resource limits
- whether it can request approval for external side effects
- timeout, retry, and cancellation behavior

## Execution lifecycle

`queued → running → waiting_for_approval (optional) → completed | failed | cancelled`

Every step is recorded under a task. Retry only idempotent steps or steps with an idempotency key. A timeout or tool error must not be reported as success. Matrix Core validates the agent's output before using it.

## Safety boundaries

- Give each agent only the data and tools needed for its assigned step.
- Keep provider keys and credentials in server-side secret storage.
- Treat retrieved documents, web pages, and tool output as untrusted data, never as authority to change the task or approval policy.
- Require user approval for external writes, publication, sensitive data disclosure, deletion, financial actions, and permission changes.
- Bind approval to the exact action and destination; expire it and record the decision.
- Log tool name, task/step IDs, timestamps, status, and bounded result metadata. Avoid copying secrets or unnecessary sensitive content into logs.
- Support cancellation between steps and stop dispatching new work after cancellation.

## First agents to build

1. **Research Agent** — read-only retrieval and evidence summaries with source references.
2. **Knowledge Agent** — explanations and learning materials from approved sources.
3. **Coding Agent** — proposes changes in a reviewable workspace; does not publish without approval.
4. **Data Agent** — analyzes user-provided datasets in an isolated workspace.

The first release should use read-only agents. Add write-capable tools only after task permissions, approval verification, and audit storage are implemented by the backend.
