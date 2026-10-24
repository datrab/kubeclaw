const names = new Set(['familyclaw-database-bootstrap', 'familyclaw-database-owner', 'familyclaw-database-tls',
  'familyclaw-runtime', 'familyclaw-openclaw', 'familyclaw-firefly']);

function bootstrapValue(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('KUBERNETES_FIXTURE_BOOTSTRAP_INVALID');
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'profile,release' || value.profile !== 'familyclaw.v1'
    || typeof value.release !== 'string' || !/^[a-z][a-z0-9-]{0,34}$/u.test(value.release)) {
    throw new Error('KUBERNETES_FIXTURE_BOOTSTRAP_INVALID');
  }
  return { profile: 'familyclaw.v1', release: value.release };
}
function bootstrapBounds(payload: Record<string, unknown>) {
  const seconds = payload.retentionSeconds;
  if (!Number.isSafeInteger(seconds) || Number(seconds) < 60 || Number(seconds) > 3600) {
    throw new Error('KUBERNETES_FIXTURE_BOOTSTRAP_BINDING_INVALID');
  }
  if (payload.secretReferences !== undefined && (!Array.isArray(payload.secretReferences) || payload.secretReferences.length !== 0)) {
    throw new Error('KUBERNETES_FIXTURE_BOOTSTRAP_BINDING_INVALID');
  }
}
export function fixtureBootstrapProfile(payload: Record<string, unknown>, enabled: boolean) {
  if (payload.familyclawBootstrap === undefined) return undefined;
  if (!enabled) throw new Error('KUBERNETES_FIXTURE_BOOTSTRAP_DISABLED');
  const value = bootstrapValue(payload.familyclawBootstrap);
  bootstrapBounds(payload);
  if (payload.fullStack !== true || payload.namespacePrefix !== 'test' || payload.testCredentials !== undefined
    || payload.serviceName !== value.release + '-core' || payload.servicePort !== 8080) {
    throw new Error('KUBERNETES_FIXTURE_BOOTSTRAP_BINDING_INVALID');
  }
  return value;
}

function inspectBootstrapObject(object: Record<string, unknown>, add: (value: unknown) => void) {
  if (object.csi || object.flexVolume) throw new Error('KUBERNETES_FIXTURE_BOOTSTRAP_SECRET_DENIED');
  for (const field of ['secretKeyRef', 'secretRef']) if (object[field]) add((object[field] as Record<string, unknown>).name);
  if (object.secret) {
    const secret = object.secret as Record<string, unknown>;
    add(secret.secretName ?? secret.name);
  }
  if (Array.isArray(object.imagePullSecrets) && object.imagePullSecrets.length) throw new Error('KUBERNETES_FIXTURE_BOOTSTRAP_SECRET_DENIED');
}

/** Only exact per-role Secret references. The private journal can never be mounted. */
export function validateBootstrapManifest(documents: readonly Record<string, unknown>[]) {
  const references = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string' || !names.has(value)) throw new Error('KUBERNETES_FIXTURE_BOOTSTRAP_SECRET_DENIED');
    references.add(value);
  };
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const object = value as Record<string, unknown>;
    inspectBootstrapObject(object, add);
    Object.values(object).forEach(visit);
  };
  documents.forEach(visit);
  if (references.size !== names.size) throw new Error('KUBERNETES_FIXTURE_BOOTSTRAP_SECRET_BINDINGS_MISSING');
}
