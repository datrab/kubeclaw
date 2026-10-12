import path from 'node:path';

class LintPolicyError extends Error {
  code = 'LINT_POLICY_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'LintPolicyError';
  }
}

function fail(field: string, message: string): never {
  throw new LintPolicyError(`${field}: ${message}`);
}

function record(value: unknown, field: string): Record<string, any> {
  if (!value || typeof value !== 'object') fail(field, 'required object');
  if (Array.isArray(value)) fail(field, 'required object');
  return value as Record<string, any>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(field, 'required non-empty string');
  return value.trim();
}

function stringList(value: unknown, field: string, { nonEmpty = false }: any = {}): string[] {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) fail(field, `required ${nonEmpty ? 'non-empty ' : ''}array`);
  const entries = value.map((entry: any, index: any) => text(entry, `${field}[${index}]`));
  if (new Set(entries).size !== entries.length) fail(field, 'duplicate values are not allowed');
  return entries;
}

function repoRelative(value: unknown, field: string): string {
  const normalized = path.posix.normalize(text(value, field).replace(/\\/g, '/'));
  if (path.posix.isAbsolute(normalized) || normalized === '..') fail(field, 'must be repository-relative');
  if (normalized.startsWith('../')) fail(field, 'must be repository-relative');
  return normalized;
}

function isoDate(value: unknown, field: string): string {
  const date = text(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) fail(field, 'required ISO date');
  return date;
}

export { LintPolicyError, fail, isoDate, record, repoRelative, stringList, text };
