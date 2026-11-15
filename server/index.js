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
const maxBodyBytes = 2 * 1024 * 1024;
const chatApiKey = process.env.MATRIX_CHAT_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
const chatModel = process.env.MATRIX_MODEL ?? "";
const chatEndpoint = process.env.MATRIX_CHAT_API_URL ?? "https://api.openai.com/v1/responses";
const allowedOrigin = process.env.MATRIX_ALLOWED_ORIGIN ?? "";
const rateWindows = new Map();
const chatRequestLimit = 12;
const chatWindowMs = 60_000;

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
  const origin = request.headers.origin;
  if (allowedOrigin && origin === allowedOrigin) response.setHeader("access-control-allow-origin", allowedOrigin);
  if (request.method === "OPTIONS" && ["/api/config", "/api/chat"].includes(url.pathname)) {
    if (!allowedOrigin || origin !== allowedOrigin) return send(response, 403, { error: { code: "origin_not_allowed", message: "Zahtjev nije dozvoljen." } });
    response.writeHead(204, { "access-control-allow-origin": allowedOrigin, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, accept", "access-control-max-age": "600", vary: "Origin" });
    return response.end();
  }
  if (request.method === "GET" && ["/", "/index.html", "/overview.html", "/app.js", "/api-config.js", "/styles.css"].includes(url.pathname)) {
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const contentTypes = { "index.html": "text/html; charset=utf-8", "overview.html": "text/html; charset=utf-8", "app.js": "text/javascript; charset=utf-8", "api-config.js": "text/javascript; charset=utf-8", "styles.css": "text/css; charset=utf-8" };
    response.writeHead(200, { "content-type": contentTypes[file], "cache-control": "no-cache" });
    return response.end(readFileSync(resolve(projectRoot, file)));
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return send(response, 200, { status: "ok", service: "ai-matrix-api", mode: "planning-and-chat", chat_ready: Boolean(chatApiKey && chatModel) });
  }

  if (request.method === "GET" && url.pathname === "/api/config") {
    if (allowedOrigin && origin !== allowedOrigin) return send(response, 403, { error: { code: "origin_not_allowed", message: "Zahtjev nije dozvoljen." } });
    return send(response, 200, {
      chat_ready: Boolean(chatApiKey && chatModel),
      model: chatApiKey && chatModel ? chatModel : null,
      provider: "OpenAI Responses-compatible API",
    });
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    if (allowedOrigin && origin !== allowedOrigin) return send(response, 403, { error: { code: "origin_not_allowed", message: "Zahtjev nije dozvoljen." } });
    const nowMs = Date.now();
    // Render appends the connecting client address to X-Forwarded-For.
    const forwardedFor = String(request.headers["x-forwarded-for"] ?? "").split(",").map((ip) => ip.trim()).filter(Boolean);
    const clientIp = forwardedFor.at(-1) ?? request.socket.remoteAddress ?? "unknown";
    const prior = rateWindows.get(clientIp);
    if (!prior || nowMs - prior.startedAt >= chatWindowMs) rateWindows.set(clientIp, { startedAt: nowMs, count: 1 });
    else if (prior.count >= chatRequestLimit) return send(response, 429, { error: { code: "rate_limited", message: "Dosegnut je privremeni limit zahtjeva. Pokušaj ponovo za minutu." } });
    else prior.count += 1;
    if (rateWindows.size > 5000) for (const [ip, window] of rateWindows) if (nowMs - window.startedAt >= chatWindowMs) rateWindows.delete(ip);
    if (!chatApiKey || !chatModel) {
      return send(response, 503, { error: { code: "provider_not_configured", message: "AI provajder još nije podešen na serveru." } });
    }
    try {
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 30) {
        return send(response, 400, { error: { code: "invalid_request", message: "Pošalji između 1 i 30 poruka." } });
      }
      const messages = [];
      let totalChars = 0;
      for (const message of body.messages) {
        if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") {
          return send(response, 400, { error: { code: "invalid_request", message: "Svaka poruka mora imati ulogu user ili assistant i tekstualni sadržaj." } });
        }
        totalChars += message.content.length;
        if (message.content.length > 20000) {
          return send(response, 400, { error: { code: "invalid_request", message: "Pojedinačna poruka premašuje 20.000 znakova." } });
        }
        if (totalChars > 250000) {
          return send(response, 400, { error: { code: "invalid_request", message: "Razgovor premašuje dozvoljenu dužinu." } });
        }
        messages.push({ role: message.role, content: message.content });
      }
      if (messages.at(-1).role !== "user") {
        return send(response, 400, { error: { code: "invalid_request", message: "Zadnja poruka mora biti korisnička poruka." } });
      }
      const style = ["concise", "balanced", "detailed"].includes(body.response_style) ? body.response_style : "balanced";
      const styleText = {
        concise: "Odgovaraj kratko, osim ako korisnik traži detalje.",
        balanced: "Odgovaraj jasno i odmjereno; prilagodi dužinu zahtjevu.",
        detailed: "Daj detaljne, strukturirane odgovore kada tema to opravdava.",
      }[style];

      let upstream;
      try {
        upstream = await fetch(chatEndpoint, {
          method: "POST",
          headers: { authorization: `Bearer ${chatApiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: chatModel,
            instructions: `Ti si AI Matrix Assistant. Odgovaraj na jeziku korisnika, budi koristan, iskren i jasno označi neizvjesnost. ${styleText}`,
            input: messages,
            max_output_tokens: 2048,
            store: false,
          }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (error) {
        const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
        return send(response, timedOut ? 504 : 502, { error: { code: timedOut ? "provider_timeout" : "provider_unavailable", message: timedOut ? "AI servis nije odgovorio na vrijeme." : "AI servis trenutno nije dostupan." } });
      }
      if (!upstream.ok) {
        const status = upstream.status === 429 ? 429 : upstream.status === 401 ? 503 : 502;
        const message = upstream.status === 429 ? "AI servis je privremeno ograničio broj zahtjeva." : upstream.status === 401 ? "API konfiguracija na serveru nije prihvaćena." : "AI servis nije mogao obraditi poruku.";
        return send(response, status, { error: { code: "provider_error", message } });
      }
      const result = await upstream.json();
      const reply = typeof result.output_text === "string"
        ? result.output_text
        : (result.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n");
      if (!reply.trim()) return send(response, 502, { error: { code: "empty_provider_response", message: "AI servis nije vratio tekstualni odgovor." } });
      return send(response, 200, { reply, model: chatModel });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      return send(response, status, { error: { code: status === 500 ? "internal_error" : "invalid_request", message: status === 500 ? "Poruka nije mogla biti obrađena." : error.message } });
    }
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
  console.log(`AI chat provider: ${chatApiKey && chatModel ? chatModel : "not configured"}; Matrix modules are not connected.`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
