import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createTaskRequest } from "../core/request-context.js";
import { planTask } from "../core/task-planner.js";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const databasePath = resolve(process.env.MATRIX_DB_PATH ?? resolve(projectRoot, "data/matrix.sqlite"));
mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(readFileSync(resolve(projectRoot, "database/schema.sql"), "utf8"));

const host = process.env.MATRIX_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const maxBodyBytes = 1024 * 1024;

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function recordEvent(taskId, eventType, payload = {}) {
  db.prepare("INSERT INTO task_events (task_id, event_type, payload_json) VALUES (?, ?, ?)")
    .run(taskId, eventType, JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
  if (request.method === "GET" && url.pathname === "/health") {
    return send(response, 200, { status: "ok", service: "ai-matrix-api", mode: "planning-only" });
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    try {
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return send(response, 400, { error: { code: "invalid_request", message: "A JSON object is required." } });
      }
      if (typeof body.message !== "string" || body.message.trim() === "") {
        return send(response, 400, { error: { code: "invalid_request", message: "A non-empty message is required." } });
      }
      if (body.message.length > 20000) {
        return send(response, 400, { error: { code: "invalid_request", message: "Message exceeds the 20,000 character limit." } });
      }
      if (typeof body.conversation_id === "string" && body.conversation_id.length > 200) {
        return send(response, 400, { error: { code: "invalid_request", message: "Conversation ID exceeds the 200 character limit." } });
      }
      if (Array.isArray(body.constraints) && body.constraints.length > 50) {
        return send(response, 400, { error: { code: "invalid_request", message: "A maximum of 50 constraints is allowed." } });
      }

      const task = createTaskRequest({
        text: body.message,
        conversationId: typeof body.conversation_id === "string" ? body.conversation_id : null,
        language: typeof body.language === "string" ? body.language : "en",
        constraints: Array.isArray(body.constraints) ? body.constraints : [],
      });
      const plan = planTask(task);
      const now = new Date().toISOString();
      db.exec("BEGIN IMMEDIATE");
      try {
        if (task.conversation_id) {
          db.prepare("INSERT OR IGNORE INTO conversations (conversation_id) VALUES (?)").run(task.conversation_id);
        }

        db.prepare(`INSERT INTO tasks
          (task_id, conversation_id, request_text, language, constraints_json, requested_output, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(task.task_id, task.conversation_id, task.message.text, task.message.language,
            JSON.stringify(task.constraints), typeof body.requested_output === "string" ? body.requested_output : null,
            plan.status, now, now);

        const steps = plan.steps.map(({ step_id, module, status }) => ({ step_id, module, status }));
        db.prepare(`INSERT INTO task_plans
          (plan_id, task_id, planner_version, modules_json, steps_json, status, clarification_question)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(crypto.randomUUID(), task.task_id, plan.planner_version, JSON.stringify(plan.modules),
            JSON.stringify(steps), plan.status, plan.clarification_question);
        recordEvent(task.task_id, "task_received", { language: task.message.language });
        recordEvent(task.task_id, plan.status === "planned" ? "task_planned" : "clarification_needed", {});
        if (task.conversation_id) {
          db.prepare("UPDATE conversations SET updated_at = ? WHERE conversation_id = ?")
            .run(now, task.conversation_id);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return send(response, 202, {
        task_id: task.task_id,
        conversation_id: task.conversation_id,
        status: plan.status,
        plan,
        created_at: now,
        execution: "not_started",
      });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      return send(response, status, { error: { code: status === 500 ? "internal_error" : "invalid_request", message: status === 500 ? "The task could not be saved." : error.message } });
    }
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]+)$/i);
  if (request.method === "GET" && taskMatch) {
    const taskId = taskMatch[1];
    const task = db.prepare("SELECT * FROM tasks WHERE task_id = ?").get(taskId);
    if (!task) return send(response, 404, { error: { code: "not_found", message: "Task not found." } });
    const plan = db.prepare("SELECT * FROM task_plans WHERE task_id = ? ORDER BY created_at DESC LIMIT 1").get(taskId);
    const events = db.prepare("SELECT event_type, payload_json, created_at FROM task_events WHERE task_id = ? ORDER BY event_id").all(taskId);
    return send(response, 200, {
      task: {
        task_id: task.task_id,
        conversation_id: task.conversation_id,
        message: task.request_text,
        language: task.language,
        constraints: JSON.parse(task.constraints_json),
        requested_output: task.requested_output,
        status: task.status,
        created_at: task.created_at,
        updated_at: task.updated_at,
      },
      plan: plan ? {
        planner_version: plan.planner_version,
        modules: JSON.parse(plan.modules_json),
        steps: JSON.parse(plan.steps_json),
        status: plan.status,
        clarification_question: plan.clarification_question,
      } : null,
      events: events.map((event) => ({ ...event, payload: JSON.parse(event.payload_json), payload_json: undefined })),
      execution: "not_started",
    });
  }

  return send(response, 404, { error: { code: "not_found", message: "Endpoint not found." } });
});

server.listen(port, host, () => {
  console.log(`Ai Matrix API listening on http://${host}:${port}`);
  console.log(`SQLite database: ${databasePath}`);
  console.log("Planning-only mode: module execution and AI providers are not configured.");
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
