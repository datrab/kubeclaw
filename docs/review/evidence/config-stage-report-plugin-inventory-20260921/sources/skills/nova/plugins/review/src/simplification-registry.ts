import type { SimplificationCategory } from './echo-review-contract.ts';
import {
  SIMPLIFICATION_REGISTRY_VERSION,
  type SimplificationRuleId,
} from './review-policy-contract.ts';

export interface SimplificationRuleDefinition {
  readonly id: SimplificationRuleId;
  readonly category: SimplificationCategory;
  readonly name: string;
}

export const SIMPLIFICATION_RULE_REGISTRY = Object.freeze({
  SIM001: { id: 'SIM001', category: 'delete', name: 'unused or removable code' },
  SIM002: { id: 'SIM002', category: 'shrink', name: 'forwarding-only wrapper' },
  SIM003: { id: 'SIM003', category: 'yagni', name: 'single-use or single-implementation abstraction' },
  SIM004: { id: 'SIM004', category: 'delete', name: 'unused configuration variation' },
  SIM005: { id: 'SIM005', category: 'shrink', name: 'duplicate existing helper' },
  SIM006: { id: 'SIM006', category: 'shrink', name: 'trivial external dependency' },
  SIM007: { id: 'SIM007', category: 'stdlib', name: 'standard-library replacement' },
  SIM008: { id: 'SIM008', category: 'native', name: 'native platform replacement' },
} satisfies Readonly<Record<SimplificationRuleId, SimplificationRuleDefinition>>);

export const SIMPLIFICATION_RULE_REGISTRY_ID = SIMPLIFICATION_REGISTRY_VERSION;
