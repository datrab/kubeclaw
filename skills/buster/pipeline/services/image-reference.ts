import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

export type ImageReferenceValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

const IMAGE_REF_RE = /^[a-z0-9]+(?:(?:[._-][a-z0-9]+)+|[a-z0-9]*)(?::[0-9]+)?(?:\/[a-z0-9]+(?:(?:[._-][a-z0-9]+)+|[a-z0-9]*))*?(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/;

function hasExplicitRegistryComponent(imageRef: string): boolean {
  const registry = selectDefinedValue(() => imageRef.split('/')[0], () => '');
  return selectTruthyValue(() => registry === 'localhost', () => registry.includes('.')) || registry.includes(':');
}

export function validateImageReference(imageRef: unknown): ImageReferenceValidationResult {
  if (typeof imageRef !== 'string') return { ok: false, reason: 'not_string' };
  const value = imageRef.trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (value !== imageRef) return { ok: false, reason: 'surrounding_whitespace' };
  if (value.length > 255) return { ok: false, reason: 'too_long' };
  if (!IMAGE_REF_RE.test(value)) return { ok: false, reason: 'invalid_image_reference' };
  if (!value.includes('/') || !hasExplicitRegistryComponent(value)) return { ok: false, reason: 'not_fully_qualified' };
  return { ok: true, value };
}
