/**
 * Matrix Core rule-based planner (MVP).
 * Routes clear requests to one or more modules; ambiguous requests need clarification.
 */

const MODULE_RULES = [
  {
    module: "knowledge-engine",
    pattern: /\b(explain|definition|learn|teach|study|science|history|znanje|objasni|objasnite|nauci|nauči|ucenje|učenje|historija|istorija|nauka)\b/i,
  },
  {
    module: "ai-research",
    pattern: /\b(research|investigate|compare sources|evidence|analyze|analysis|istrazi|istraži|istrazi|analiziraj|analiza|dokazi|izvori)\b/i,
  },
  {
    module: "agent-system",
    pattern: /\b(agent|automate|automation|schedule|workflow|autonom|automatiziraj|automatizacija|zadatak za agenta)\b/i,
  },
  {
    module: "matrix-lab",
    pattern: /\b(code|program|programming|debug|website|app|software|kod|programiraj|programiranje|debugiraj|web stranica|aplikacija|softver)\b/i,
  },
  {
    module: "creative-engine",
    pattern: /\b(write|story|poem|design|image|video|music|create a logo|napisi|napiši|prica|priča|pjesma|dizajn|slika|video|muzika|logo)\b/i,
  },
  {
    module: "data-intelligence",
    pattern: /\b(data|dataset|spreadsheet|statistics|forecast|chart|podaci|tabela|tablica|statistika|prognoza|grafikon|predvidi|predviđanje)\b/i,
  },
];

/**
 * @param {{task_id: string, message: {text: string}, constraints?: string[]}} task
 * @returns {{task_id: string, planner_version: string, modules: string[], steps: Array<{step_id: string, module: string, status: string}>, status: string, clarification_question: string|null}}
 */
export function planTask(task) {
  if (!task || typeof task.task_id !== "string" || typeof task.message?.text !== "string") {
    throw new TypeError("A valid Matrix Core task request is required.");
  }

  const modules = MODULE_RULES
    .filter(({ pattern }) => pattern.test(task.message.text))
    .map(({ module }) => module);

  const steps = modules.map((module, index) => ({
    step_id: `${task.task_id}:${index + 1}`,
    module,
    status: "pending",
  }));

  return {
    task_id: task.task_id,
    planner_version: "0.1.0",
    modules,
    steps,
    status: modules.length > 0 ? "planned" : "needs_clarification",
    clarification_question: modules.length > 0
      ? null
      : "Šta želiš da postignemo ovim zahtjevom? Mogu pomoći s učenjem, istraživanjem, programiranjem, kreativnim radom, podacima ili AI agentima.",
  };
}
