import { selectTruthyValue } from '../optional-absence.ts';
import { createBudgetFromMinutes } from '../timing.ts';

export function pollingPolicyNumber(config: any, field: any, options: any = {}) {
  const value = Number(config?.polling?.[field]);
  if (selectTruthyValue(() => !Number.isFinite(value), () => options.positive && value <= 0)) {
    throw new Error(`config.polling.${field}: required ${options.positive ? 'positive ' : ''}number in swarm.config.json`);
  }
  return value;
}

export function pollingBudget(opts: any, timeoutMinutes: any, label: any) {
  return opts.budget || createBudgetFromMinutes(timeoutMinutes, { label });
}
