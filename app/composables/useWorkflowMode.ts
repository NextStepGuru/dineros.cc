import type { WorkflowMode } from "~/lib/workflowMode";
import {
  defaultRegisterDirectionForWorkflow,
  defaultReportModeForWorkflow,
  readWorkflowModeFromStorage,
  writeWorkflowModeToStorage,
} from "~/lib/workflowMode";

const WORKFLOW_STATE_KEY = "dineros-workflow-mode";

export function useWorkflowMode() {
  const workflowMode = useState<WorkflowMode>(WORKFLOW_STATE_KEY, () => "forecasting");

  if (import.meta.client) {
    onMounted(() => {
      const stored = readWorkflowModeFromStorage();
      if (stored) workflowMode.value = stored;
    });
  }

  watch(workflowMode, (m) => {
    if (import.meta.client) writeWorkflowModeToStorage(m);
  });

  const defaultRegisterTab = computed(() =>
    defaultRegisterDirectionForWorkflow(workflowMode.value),
  );

  const defaultReportMode = computed(() =>
    defaultReportModeForWorkflow(workflowMode.value),
  );

  function setWorkflowMode(mode: WorkflowMode) {
    workflowMode.value = mode;
  }

  return {
    workflowMode,
    setWorkflowMode,
    defaultRegisterTab,
    defaultReportMode,
  };
}
