const KNOWN_MODULES = new Set([
  "knowledge-engine",
  "ai-research",
  "agent-system",
  "matrix-lab",
  "creative-engine",
  "data-intelligence",
]);

/** Match planned steps to explicitly registered module handlers. */
export function routePlan(plan, handlers = {}) {
  if (!plan || !Array.isArray(plan.steps)) {
    throw new TypeError("A valid execution plan is required.");
  }

  return plan.steps.map((step) => {
    if (!KNOWN_MODULES.has(step.module)) {
      return { ...step, route_status: "unsupported", handler: null };
    }
    const handler = handlers[step.module];
    return {
      ...step,
      route_status: typeof handler === "function" ? "ready" : "unavailable",
      handler: typeof handler === "function" ? handler : null,
    };
  });
}
