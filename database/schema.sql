-- Proposed SQLite schema for the Ai Matrix prototype.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id TEXT PRIMARY KEY,
  owner_id TEXT,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(conversation_id) ON DELETE SET NULL,
  request_text TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  intent TEXT,
  constraints_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(constraints_json)),
  requested_output TEXT,
  status TEXT NOT NULL CHECK (status IN ('received','planned','running','needs_clarification','completed','failed','cancelled')),
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS task_plans (
  plan_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  planner_version TEXT NOT NULL,
  modules_json TEXT NOT NULL CHECK (json_valid(modules_json)),
  steps_json TEXT NOT NULL CHECK (json_valid(steps_json)),
  status TEXT NOT NULL CHECK (status IN ('planned','needs_clarification','rejected')),
  clarification_question TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS module_runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES task_plans(plan_id) ON DELETE SET NULL,
  step_id TEXT NOT NULL,
  module TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','unavailable','cancelled')),
  input_json TEXT CHECK (input_json IS NULL OR json_valid(input_json)),
  output_json TEXT CHECK (output_json IS NULL OR json_valid(output_json)),
  error_code TEXT,
  started_at TEXT,
  finished_at TEXT,
  UNIQUE (task_id, step_id)
);

CREATE TABLE IF NOT EXISTS approvals (
  approval_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  run_id TEXT REFERENCES module_runs(run_id) ON DELETE SET NULL,
  action_category TEXT NOT NULL,
  action_description TEXT NOT NULL,
  action_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','denied','expired','used')),
  decided_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS task_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_conversation_created ON tasks(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_module_runs_task_status ON module_runs(task_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_task_status ON approvals(task_id, status);
CREATE INDEX IF NOT EXISTS idx_task_events_task_created ON task_events(task_id, created_at);
