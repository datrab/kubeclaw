import { assertSafePathSegment } from './paths.ts';

export type AnyRecord = Record<string, any>;
export type NumberRule = { min?: number; allowZero?: boolean; max?: number | null };

export function isPlainObject(value: any): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function agentConfigEntries(config: AnyRecord): Array<[string, any]> {
  return isPlainObject(config.agents) ? Object.entries(config.agents) : [];
}

function numberOutsideRule(value: number, rule: Required<NumberRule>) {
  if (!Number.isFinite(value)) return true;
  if (rule.allowZero ? value < rule.min : value <= rule.min) return true;
  return rule.max !== null && value > rule.max;
}

export class ConfigValidation {
  readonly errors: string[] = [];

  field(obj: any, fieldPath: string, parentPath = 'config') {
    const keys = fieldPath.split('.');
    let current = obj;
    let currentPath = parentPath;
    for (const key of keys) {
      currentPath = `${currentPath}.${key}`;
      if (current === null || current === undefined || typeof current !== 'object') {
        this.errors.push(`${currentPath}: parent is ${current === null ? 'null' : typeof current}`);
        return;
      }
      current = current[key];
    }
    if (current === undefined || current === null) this.errors.push(`${currentPath}: required field is missing`);
  }

  string(value: any, label: string) {
    if (typeof value !== 'string' || !value.trim()) {
      this.errors.push(`${label}: required non-empty string in swarm.config.json`);
    }
  }

  boolean(value: any, label: string) {
    if (typeof value !== 'boolean') this.errors.push(`${label}: required boolean in swarm.config.json`);
  }

  safeIdentifier(value: any, label: string) {
    try {
      assertSafePathSegment(value, label);
    } catch (error: any) {
      this.errors.push(error.message);
    }
  }

  number(obj: any, field: string, label: string, rule: NumberRule = {}) {
    const { min = 0, allowZero = true, max = null } = rule;
    const raw = obj?.[field];
    const missing = raw === undefined || raw === null;
    if (missing || raw === '') {
      this.errors.push(`${label}: required in swarm.config.json`);
      return null;
    }
    if (typeof raw === 'number' && !numberOutsideRule(raw, { min, allowZero, max })) return raw;
    const lower = allowZero ? `>= ${min}` : `> ${min}`;
    const upper = max === null ? '' : ` and <= ${max}`;
    this.errors.push(`${label}: must be a number ${lower}${upper}`);
    return null;
  }

  object(owner: AnyRecord, field: string, label: string): AnyRecord {
    if (isPlainObject(owner[field])) return owner[field];
    this.errors.push(`${label}: required platform config object`);
    owner[field] = {};
    return owner[field];
  }

  append(messages: string[]) {
    this.errors.push(...messages);
  }
}
