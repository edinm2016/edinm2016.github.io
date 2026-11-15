/** Assemble a transparent user-facing response from Matrix Core outcomes. */
export function buildResponse({ task, plan, results = [], validation }) {
  if (plan?.status === "needs_clarification") {
    return { status: "needs_clarification", text: plan.clarification_question };
  }

  if (!validation?.valid) {
    const failed = results.filter((result) => result.status !== "completed");
    const names = failed.map((result) => result.module).filter(Boolean);
    return {
      status: "incomplete",
      text: names.length
        ? `Nisam mogao završiti sve dijelove zadatka. Nedostupni ili neuspješni moduli: ${[...new Set(names)].join(", ")}.`
        : "Nisam mogao potvrditi da su svi dijelovi zadatka završeni.",
      details: results,
    };
  }

  return {
    status: "completed",
    language: task.message.language,
    text: results.map((result) => result.value).filter((value) => value != null),
  };
}
