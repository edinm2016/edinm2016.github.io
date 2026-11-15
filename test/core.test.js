import test from "node:test";
import assert from "node:assert/strict";
import { createTaskRequest } from "../core/request-context.js";
import { planTask } from "../core/task-planner.js";
import { routePlan } from "../core/module-router.js";
import { executePlan } from "../core/execution-coordinator.js";
import { validateResults } from "../core/result-validator.js";
import { buildResponse } from "../core/response-builder.js";
import { evaluateActionRisk, runGuardedAction } from "../core/safety-gate.js";
import { runMatrixTask } from "../core/index.js";

test("request intake validates text and normalizes the envelope", () => {
  assert.throws(() => createTaskRequest({ text: "  " }), /non-empty/);
  const task = createTaskRequest({ text: "  Objasni AI agente  ", language: "bs", conversationId: " c1 ", constraints: [" kratko ", 4, ""] });
  assert.equal(task.message.text, "Objasni AI agente");
  assert.equal(task.message.language, "bs");
  assert.equal(task.conversation_id, "c1");
  assert.deepEqual(task.constraints, ["kratko"]);
  assert.equal(task.status, "received");
});

test("planner routes known requests and asks about ambiguous ones", () => {
  const request = createTaskRequest({ text: "Objasni mi kvantnu fiziku", language: "bs" });
  const plan = planTask(request);
  assert.equal(plan.status, "planned");
  assert.deepEqual(plan.modules, ["knowledge-engine"]);
  assert.equal(plan.steps[0].status, "pending");

  const ambiguous = planTask(createTaskRequest({ text: "Zdravo", language: "bs" }));
  assert.equal(ambiguous.status, "needs_clarification");
  assert.ok(ambiguous.clarification_question);
});

test("router marks unregistered and unsupported steps without invoking them", () => {
  const plan = { steps: [
    { step_id: "a", module: "knowledge-engine" },
    { step_id: "b", module: "matrix-lab" },
    { step_id: "c", module: "unknown" },
  ] };
  const routes = routePlan(plan, { "knowledge-engine": async () => "ok" });
  assert.deepEqual(routes.map((route) => route.route_status), ["ready", "unavailable", "unsupported"]);
});

test("coordinator records successful and failed handlers in order", async () => {
  const task = createTaskRequest({ text: "test", language: "en" });
  const routes = [
    { step_id: "one", module: "knowledge-engine", route_status: "ready", handler: async () => "result" },
    { step_id: "two", module: "ai-research", route_status: "ready", handler: async () => { throw new Error("offline"); } },
  ];
  const results = await executePlan(task, routes);
  assert.deepEqual(results.map((result) => result.status), ["completed", "failed"]);
  assert.equal(results[0].value, "result");
  assert.equal(results[1].error, "offline");
  assert.deepEqual(validateResults({ steps: routes }, results), {
    valid: false,
    issues: [{ step_id: "two", reason: "failed" }],
  });
});

test("safety gate blocks sensitive actions until a verifier approves them", async () => {
  const action = { category: "publish_content", description: "Publish site" };
  assert.equal(evaluateActionRisk(action).requires_approval, true);
  let ran = false;
  const blocked = await runGuardedAction(action, {}, async () => { ran = true; });
  assert.equal(blocked.status, "approval_required");
  assert.equal(ran, false);

  const allowed = await runGuardedAction(action, {
    approval: { id: "approval-1" },
    verifyApproval: async (approval, requested) => approval.id === "approval-1" && requested === action,
  }, async () => { ran = true; return "published"; });
  assert.equal(allowed.status, "completed");
  assert.equal(ran, true);
  assert.equal(evaluateActionRisk({ category: "read_only" }).allowed, true);
});

test("response builder distinguishes clarification and completed results", () => {
  const task = createTaskRequest({ text: "Objasni Matrix", language: "bs" });
  const plan = planTask(task);
  const complete = buildResponse({ task, plan, results: [{ status: "completed", value: "Objašnjenje" }], validation: { valid: true } });
  assert.equal(complete.status, "completed");
  assert.deepEqual(complete.text, ["Objašnjenje"]);

  const clarificationPlan = planTask(createTaskRequest({ text: "Zdravo", language: "bs" }));
  const clarification = buildResponse({ task, plan: clarificationPlan });
  assert.equal(clarification.status, "needs_clarification");
});

test("orchestrator returns an incomplete result when a planned module is not connected", async () => {
  const result = await runMatrixTask({ text: "Objasni Matrix Core", language: "bs" });
  assert.equal(result.plan.status, "planned");
  assert.equal(result.validation.valid, false);
  assert.equal(result.response.status, "incomplete");
  assert.equal(result.routes[0].route_status, "unavailable");
});
