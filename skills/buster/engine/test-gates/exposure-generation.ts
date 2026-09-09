import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

export const EXPOSURE_OWNER_ANNOTATION = 'kubeclaw.forgestack.ai/exposure-owner';
export const EXPOSURE_REQUEST_ANNOTATION = 'kubeclaw.forgestack.ai/exposure-request';
export const EXPOSURE_PREDECESSORS_ANNOTATION = 'kubeclaw.forgestack.ai/exposure-predecessors';
type JsonObject = Record<string, unknown>;

export function exposureIdentity(resource: string, payload: JsonObject): { owner: string; request: string } {
  const target = { resource, leaseName: payload.leaseName, namespace: payload.namespace };
  return { owner: sha256Text(canonicalJson(target)), request: sha256Text(canonicalJson({ ...target,
    serviceName: payload.serviceName, servicePort: payload.servicePort, expiresAt: payload.expiresAt,
    path: payload.path, hostname: payload.hostname ?? null,
    ...(payload.retentionMode === undefined ? {} : {retentionMode:payload.retentionMode}) })) };
}

export function generationObserved(lease: JsonObject, owner: string, phase: string): boolean {
  const metadata = lease.metadata as JsonObject; const status = lease.status as JsonObject;
  return Number.isSafeInteger(metadata.generation) && Number(metadata.generation) >= 1
    && status.exposureOwner === owner && status.exposureGeneration === metadata.generation && status.exposurePhase === phase;
}

/** Carry unfinished handoffs durably; a matching observed generation ends the old chain. */
export function exposurePredecessors(lease: JsonObject): string {
  const metadata = lease.metadata as JsonObject;
  const annotations = (metadata.annotations ?? {}) as JsonObject;
  const owner = annotations[EXPOSURE_OWNER_ANNOTATION] ?? '';
  const encoded = annotations[EXPOSURE_PREDECESSORS_ANNOTATION];
  const previous: unknown = encoded === undefined ? [] : JSON.parse(String(encoded));
  if (typeof owner !== 'string' || owner.length > 256 || !Array.isArray(previous) || previous.length > 64
    || previous.some(item => typeof item !== 'string' || item.length > 256 || item.includes('\0'))) {
    throw new Error('TAILSCALE_EXPOSURE_PREDECESSORS_INVALID');
  }
  const completed = generationObserved(lease, owner, 'Ready') || generationObserved(lease, owner, 'Off');
  const lineage = [...new Set([...(completed ? [] : previous as string[]), owner])];
  if (lineage.length > 64) throw new Error('TAILSCALE_EXPOSURE_PREDECESSORS_EXHAUSTED');
  return JSON.stringify(lineage);
}

export function assertExposureRequest(lease: JsonObject, identity: { owner: string; request: string }): void {
  const metadata = lease.metadata as JsonObject;
  const annotations = (metadata.annotations ?? {}) as JsonObject;
  if (annotations[EXPOSURE_OWNER_ANNOTATION] === identity.owner
    && annotations[EXPOSURE_REQUEST_ANNOTATION] !== identity.request) throw new Error('TAILSCALE_EXPOSURE_ATTEMPT_REQUEST_CHANGED');
}

export function assertRequestedExposure(lease: JsonObject, payload: JsonObject): void {
  const spec = lease.spec as JsonObject; const exposure = spec.exposure as JsonObject;
  if (!exposure || spec.purpose !== 'final-preview' || exposure.provider !== 'tailscale-ingress'
    || exposure.serviceName !== payload.serviceName || exposure.servicePort !== payload.servicePort
    || exposure.path !== payload.path || (exposure.hostname ?? null) !== (payload.hostname ?? null)) {
    throw new Error('TAILSCALE_EXPOSURE_SPEC_CHANGED');
  }
}

export function ownedReleaseAction(lease: string, namespace: string, owner: string): string {
  const patch = [
    { op: 'test', path: '/metadata/annotations/kubeclaw.forgestack.ai~1exposure-owner', value: owner },
    { op: 'add', path: '/spec/purpose', value: 'gate' },
    { op: 'add', path: '/spec/exposure', value: { provider: 'off' } },
  ];
  return `kubectl patch busternamespacelease ${lease} -n ${namespace} --type=json --patch '${JSON.stringify(patch)}'`;
}
