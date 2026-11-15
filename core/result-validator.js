/** Check that all planned steps produced a successful result for this task. */
export function validateResults(plan, results) {
  if (!plan || !Array.isArray(plan.steps) || !Array.isArray(results)) {
    throw new TypeError("A plan and its execution results are required.");
  }

  const byStep = new Map(results.map((result) => [result.step_id, result]));
  const issues = [];
  for (const step of plan.steps) {
    const result = byStep.get(step.step_id);
    if (!result) issues.push({ step_id: step.step_id, reason: "missing_result" });
    else if (result.status !== "completed") issues.push({ step_id: step.step_id, reason: result.status });
  }
  return { valid: issues.length === 0, issues };
}
