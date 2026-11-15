const APPROVAL_CATEGORIES = new Set([
  "external_write",
  "sensitive_data",
  "delete_data",
  "financial_action",
  "publish_content",
  "permission_change",
]);

/** Decide whether a described action may proceed without human approval. */
export function evaluateActionRisk(action) {
  if (!action || typeof action.category !== "string") {
    return { allowed: false, requires_approval: true, reason: "Action category is missing." };
  }
  if (APPROVAL_CATEGORIES.has(action.category)) {
    return { allowed: false, requires_approval: true, reason: `Approval required for ${action.category}.` };
  }
  return { allowed: true, requires_approval: false, reason: null };
}

/** Guard a side effect. An approval must be explicit and tied to that action. */
export async function runGuardedAction(action, { approval = null, verifyApproval = async () => false } = {}, execute) {
  if (typeof execute !== "function") throw new TypeError("An action executor is required.");
  const risk = evaluateActionRisk(action);
  const verified = risk.requires_approval
    && approval != null
    && typeof verifyApproval === "function"
    && await verifyApproval(approval, action);
  if (!risk.allowed && !verified) {
    return { status: "approval_required", action, reason: risk.reason };
  }
  return { status: "completed", result: await execute() };
}
