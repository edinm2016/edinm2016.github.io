# Initial Backend API Contract

All endpoints use JSON. The API is a proposed contract; no server currently implements it.

## Create a task

`POST /api/tasks`

```json
{
  "message": "Explain solar energy in simple terms",
  "language": "en",
  "conversation_id": null,
  "constraints": [],
  "requested_output": "short explanation"
}
```

Returns `202 Accepted` with `task_id`, `status`, and `created_at`. Tasks move through `received`, `planned`, `running`, and one terminal state: `completed`, `needs_clarification`, `failed`, or `cancelled`.

## Read task state

`GET /api/tasks/{task_id}`

Returns the task envelope, current plan, module-run statuses, and response when available. It must only return data the authenticated caller is allowed to see.

## Request clarification

A task in `needs_clarification` returns a question and waits for a follow-up message. A follow-up creates a new task linked to the same conversation; it does not silently rewrite prior task history.

## Approval flow

`POST /api/tasks/{task_id}/approvals/{approval_id}` with `{"decision":"approve"}` or `{"decision":"deny"}`. Requires an authenticated user with authority over the task. Approval is bound to a specific action description and expires; approval for one action does not authorize a different action.

## Error shape

```json
{
  "error": {
    "code": "invalid_request",
    "message": "A non-empty message is required."
  }
}
```

Use `400` for invalid input, `401` for missing authentication, `403` for access denied, `404` for unknown tasks, `409` for invalid state transitions, and `429` for rate limits. Do not include secrets or sensitive provider errors in client-facing messages.
