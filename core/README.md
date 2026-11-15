# Matrix Core MVP

Matrix Core coordinates a request from intake through planning and module execution to validation and response assembly. It is a small, dependency-free JavaScript prototype; it does not include AI model connections, persistent storage, authentication, or production services.

## Flow

1. `createTaskRequest` validates the message and creates the shared task envelope.
2. `planTask` applies simple keyword rules to select candidate modules. Unclear requests return a clarification question.
3. `routePlan` connects planned steps to caller-provided module handlers.
4. `executePlan` runs handlers in sequence and records failures without losing earlier results.
5. `validateResults` checks that each planned step completed.
6. `buildResponse` returns a clarification, an incomplete status, or the collected outputs.

`runMatrixTask(input, handlers)` in `index.js` connects these pieces. Each handler receives `{ task, step, prior_results }` and returns its result.

## Safety boundary

`runGuardedAction` provides a human-approval gate for external writes, sensitive data, deletion, financial actions, publishing, and permission changes. Sensitive actions stay blocked unless the application supplies an approval token and a trusted `verifyApproval` callback confirms that it matches the specific action. Module handlers should not supply their own approval verifier. Read-only or local computation can use a category such as `read_only`.

## Current limits

- Routing is keyword-based and should be replaced by a stronger planner as modules are built.
- Module handlers are injected by the application; none are connected yet.
- The approval gate depends on a trusted verifier supplied by the application; this MVP does not provide an account, identity, or authorization service.
- Results are held in memory and are not persisted.
