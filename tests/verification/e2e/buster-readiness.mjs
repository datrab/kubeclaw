/** Functional readiness only; process liveness is deliberately insufficient. */
export async function probeBusterReadiness(endpoint, timeoutMs) {
  const response = await fetch(`${endpoint.replace(/\/+$/u, '')}/readyz`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json();
  return { ok: response.ok && body?.schemaVersion === 'buster-plan-readiness.v1' && body?.ready === true, body };
}
