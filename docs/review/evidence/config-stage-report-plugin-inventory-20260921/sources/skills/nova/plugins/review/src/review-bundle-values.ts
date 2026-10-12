import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';

export function bundleRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function bundleExact(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const allowed = [...required, ...optional];
  const actual = Object.keys(value);
  const missing = required.filter((field) => !Object.hasOwn(value, field));
  const unknown = actual.filter((field) => !allowed.includes(field));
  if (missing.length > 0) throw new Error(`${label} is missing field(s): ${missing.join(', ')}`);
  if (unknown.length > 0) throw new Error(`${label} has unknown field(s): ${unknown.join(', ')}`);
}

export function bundleText(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== 'string' || !value.trim() || value !== value.trim()
    || Array.from(value).length > maximum
  ) throw new Error(`${label} must be non-empty bounded text`);
  return value;
}

export function bundleIdentifier(value: unknown, label: string): string {
  const parsed = bundleText(value, label, REVIEW_HARD_LIMITS.identifierCharacters);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

export function bundleDigest(value: unknown, label: string): `sha256:${string}` {
  const parsed = bundleText(value, label, REVIEW_HARD_LIMITS.digestCharacters);
  if (!/^sha256:[0-9a-f]{64}$/u.test(parsed)) throw new Error(`${label} is invalid`);
  return parsed as `sha256:${string}`;
}

export function bundleGitObject(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
    throw new Error(`${label} must be a full Git object ID`);
  }
  return value;
}

export function bundlePath(value: unknown, label: string): string {
  const parsed = bundleText(value, label, REVIEW_HARD_LIMITS.pathCharacters);
  const parts = parsed.split('/');
  if (
    parsed.startsWith('/') || parsed.includes(':') || parsed.includes('\\')
    || /[\u0000-\u001F\u007F]/u.test(parsed)
    || parts.some((part) => !part || part === '.' || part === '..')
  ) throw new Error(`${label} must be a normalized repository-relative path`);
  return parsed;
}

export function bundleScopePrefix(value: unknown, label: string): string {
  return value === '.' ? '.' : bundlePath(value, label);
}

export function bundleArray(
  value: unknown, label: string, minimum: number, maximum: number,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} items`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new Error(`${label} must not be sparse`);
  }
  return value;
}

export function bundleSelection<T extends string>(
  value: unknown, allowed: readonly T[], label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

export function bundleUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
}

export function bundleCompare(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

export function bundleDeepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) {
      bundleDeepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
