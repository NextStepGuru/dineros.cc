/**
 * App-wide workflow: forecasting (future/plan) vs reconciliation (past/actuals).
 * Storage is read/written by useWorkflowMode; auth redirect uses the reader only.
 */
export type WorkflowMode = "forecasting" | "reconciliation";

export const WORKFLOW_MODE_STORAGE_KEY = "dineros_workflow_mode";

export function readWorkflowModeFromStorage(): WorkflowMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(WORKFLOW_MODE_STORAGE_KEY);
    if (v === "reconciliation" || v === "forecasting") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeWorkflowModeToStorage(mode: WorkflowMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WORKFLOW_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Register API/query direction aligned with workflow. */
export function defaultRegisterDirectionForWorkflow(
  workflow: WorkflowMode,
): "future" | "past" {
  return workflow === "reconciliation" ? "past" : "future";
}

/** Category reports mode aligned with workflow. */
export function defaultReportModeForWorkflow(
  workflow: WorkflowMode,
): "past" | "future" {
  return workflow === "reconciliation" ? "past" : "future";
}
