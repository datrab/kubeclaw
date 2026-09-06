import type { ResolvedInputV1 } from '@kubeclaw/pipeline-test-gate-contract';

const FIXTURES = new Map([
  ['kubeclaw.public-endpoint-fixture@1', 'public-endpoint-fixture.v1'],
  ['kubeclaw.kubernetes-deployment-fixture@1', 'kubernetes-deployment-fixture.v1'],
]);

function fixtures(inputs: readonly ResolvedInputV1[]): Record<string, unknown>[] {
  return inputs.filter(input => input.kind === 'value' && FIXTURES.has(input.schemaId)).map(input => {
    if (input.kind !== 'value' || !input.value || typeof input.value !== 'object' || Array.isArray(input.value)) throw new Error('FIXTURE_AUTHORITY_INVALID');
    const value = input.value as Record<string, unknown>;
    if (value.schemaVersion !== FIXTURES.get(input.schemaId) || typeof value.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(value.expiresAt))) throw new Error('FIXTURE_AUTHORITY_INVALID');
    if (Date.parse(value.expiresAt) <= Date.now()) throw new Error('FIXTURE_AUTHORITY_EXPIRED');
    return value;
  });
}

/** Revalidate at each capability invocation; expiry also cancels in-flight use. */
export function fixtureAuthoritySignal(inputs: readonly ResolvedInputV1[], signal: AbortSignal): AbortSignal {
  if (signal.aborted) return signal;
  const values = fixtures(inputs);
  if (!values.length) return signal;
  const remaining = Math.min(...values.map(value => Date.parse(value.expiresAt as string))) - Date.now();
  if (remaining <= 0) throw new Error('FIXTURE_AUTHORITY_EXPIRED');
  return AbortSignal.any([signal, AbortSignal.timeout(Math.min(remaining, 2_147_483_647))]);
}

export function fixtureOrigins(inputs: readonly ResolvedInputV1[]): Set<string> {
  const origins = new Set<string>();
  for (const value of fixtures(inputs)) {
    const urls = value.schemaVersion === 'public-endpoint-fixture.v1' ? [value.url]
      : Array.isArray(value.endpoints) && value.endpoints.length > 0 && value.endpoints.length <= 64
        ? value.endpoints.map(endpoint => endpoint?.url) : [];
    if (!urls.length) throw new Error('FIXTURE_AUTHORITY_INVALID');
    for (const raw of urls) {
      if (typeof raw !== 'string') throw new Error('FIXTURE_AUTHORITY_INVALID');
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('FIXTURE_AUTHORITY_INVALID');
      origins.add(url.origin);
    }
  }
  return origins;
}
