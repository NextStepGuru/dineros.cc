---
type: Entity
title: workflowMode
description: App-wide workflow: forecasting (future/plan) vs reconciliation (past/actuals).
generated: { by: agent/okf-generator, at: 2026-09-14T06:50:14Z }
---

# workflowMode

App-wide workflow: forecasting (future/plan) vs reconciliation (past/actuals).

## Docstring

App-wide workflow: forecasting (future/plan) vs reconciliation (past/actuals).
Storage is read/written by useWorkflowMode; auth redirect uses the reader only.

## Relationships

| Type | Target |
|------|--------|
| related | WorkflowMode |
| related | readWorkflowModeFromStorage |
| related | writeWorkflowModeToStorage |
| related | defaultRegisterDirectionForWorkflow |
| related | defaultReportModeForWorkflow |
