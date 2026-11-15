/**
 * Matrix Core request intake.
 * Converts a user message into the shared task envelope used by later modules.
 */

const SUPPORTED_LANGUAGES = new Set(["bs", "hr", "sr", "en"]);

/**
 * @typedef {Object} TaskRequest
 * @property {string} task_id Unique identifier for this task.
 * @property {string|null} conversation_id Conversation this task belongs to.
 * @property {{text: string, language: string}} message Original user request.
 * @property {null} intent Filled by the planner in a later step.
 * @property {string[]} constraints Explicit user constraints, if provided.
 * @property {null} requested_output Filled by the planner in a later step.
 * @property {"received"} status Initial task state.
 * @property {string} created_at ISO 8601 creation time.
 */

/**
 * Create the initial Matrix Core task envelope without inferring intent.
 * @param {{text: string, conversationId?: string|null, language?: string, constraints?: string[]}} input
 * @returns {TaskRequest}
 */
export function createTaskRequest(input) {
  if (!input || typeof input.text !== "string" || input.text.trim() === "") {
    throw new TypeError("A non-empty request text is required.");
  }

  const language = SUPPORTED_LANGUAGES.has(input.language) ? input.language : "en";
  const constraints = Array.isArray(input.constraints)
    ? input.constraints.filter((item) => typeof item === "string" && item.trim() !== "").map((item) => item.trim())
    : [];

  return {
    task_id: crypto.randomUUID(),
    conversation_id: typeof input.conversationId === "string" ? input.conversationId : null,
    message: {
      text: input.text.trim(),
      language,
    },
    intent: null,
    constraints,
    requested_output: null,
    status: "received",
    created_at: new Date().toISOString(),
  };
}
