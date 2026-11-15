/** Execute registered module handlers in plan order and retain each outcome. */
export async function executePlan(task, routes) {
  if (!task || !Array.isArray(routes)) throw new TypeError("A task and routed plan are required.");

  const results = [];
  for (const route of routes) {
    if (route.route_status !== "ready" || typeof route.handler !== "function") {
      results.push({ step_id: route.step_id, module: route.module, status: "unavailable" });
      continue;
    }

    try {
      const value = await route.handler({
        task,
        step: { step_id: route.step_id, module: route.module },
        prior_results: results,
      });
      results.push({ step_id: route.step_id, module: route.module, status: "completed", value });
    } catch (error) {
      results.push({
        step_id: route.step_id,
        module: route.module,
        status: "failed",
        error: error instanceof Error ? error.message : "Module execution failed.",
      });
    }
  }
  return results;
}
