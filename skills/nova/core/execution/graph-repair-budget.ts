import type { StageDefinition } from '@kubeclaw/plugin-sdk';

function technicalLimit(stage: StageDefinition): number {
  const limit = stage.execution.maxTechnicalRetries;
  if (!Number.isSafeInteger(limit) || limit! < 0 || limit! > 100) throw new Error(`GRAPH_TECHNICAL_RETRY_BUDGET_INVALID:${stage.id}`);
  return limit!;
}

/** Categories are generic metadata; product compilers own their meaning. */
export function validateRepairBudgets(stages: ReadonlyMap<string, StageDefinition>): void {
  for (const stage of stages.values()) {
    if (stage.execution.maxTechnicalRetries !== undefined) technicalLimit(stage);
    const category = stage.execution.repairCategory;
    const owner = category ? repairOwner(stages, stage) : stage;
    const budget = owner?.execution.repairBudget;
    if (category && (!budget || !Object.hasOwn(budget.categories, category))) throw new Error(`GRAPH_REPAIR_CATEGORY_UNDECLARED:${stage.id}`);
    if (!budget) continue;
    const maximumOrders = maximumRepairOrders(stage.id, budget);
    if (stage.execution.maxAttempts < 1 + maximumOrders + technicalLimit(stage)) throw new Error(`GRAPH_REPAIR_ATTEMPT_CEILING_INVALID:${stage.id}`);
    for (const requester of stages.values()) {
      if (requester.on?.request_fix === owner!.id && !requester.execution.repairCategory) throw new Error(`GRAPH_REPAIR_CATEGORY_REQUIRED:${requester.id}`);
    }
  }
}

function maximumRepairOrders(id: string, budget: NonNullable<StageDefinition['execution']['repairBudget']>): number {
  const limits = Object.values(budget.categories);
  if (!limits.length || limits.length > 32 || limits.some(limit => !Number.isSafeInteger(limit) || limit < 0 || limit > 100)
    || !Number.isSafeInteger(budget.maximumOrchestratorOrders) || budget.maximumOrchestratorOrders < 0 || budget.maximumOrchestratorOrders > 1) throw new Error(`GRAPH_REPAIR_BUDGET_INVALID:${id}`);
  return limits.reduce((sum, limit) => sum + limit, 0) + budget.maximumOrchestratorOrders;
}

function repairOwner(stages: ReadonlyMap<string, StageDefinition>, stage: StageDefinition): StageDefinition | undefined {
  return stages.get(stage.on?.request_fix ?? '');
}
