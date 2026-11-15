import { createTaskRequest } from "./request-context.js";
import { planTask } from "./task-planner.js";
import { routePlan } from "./module-router.js";
import { executePlan } from "./execution-coordinator.js";
import { validateResults } from "./result-validator.js";
import { buildResponse } from "./response-builder.js";

/** Run the Matrix Core MVP with caller-provided module handlers. */
export async function runMatrixTask(input, handlers = {}) {
  const task = createTaskRequest(input);
  const plan = planTask(task);
  if (plan.status === "needs_clarification") {
    return { task, plan, routes: [], results: [], validation: null, response: buildResponse({ task, plan }) };
  }

  const routes = routePlan(plan, handlers);
  const results = await executePlan(task, routes);
  const validation = validateResults(plan, results);
  const response = buildResponse({ task, plan, results, validation });
  return { task, plan, routes: routes.map(({ handler, ...route }) => route), results, validation, response };
}

export { createTaskRequest } from "./request-context.js";
export { planTask } from "./task-planner.js";
export { routePlan } from "./module-router.js";
export { executePlan } from "./execution-coordinator.js";
export { validateResults } from "./result-validator.js";
export { buildResponse } from "./response-builder.js";
export { evaluateActionRisk, runGuardedAction } from "./safety-gate.js";
