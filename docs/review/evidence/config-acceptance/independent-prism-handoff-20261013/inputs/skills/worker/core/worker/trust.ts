const SPIFFE_ID = /^spiffe:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/u;

export interface WorkerPrincipal {
  readonly authentication: 'spiffe-x509-svid';
  readonly spiffeId: string;
}

function headerValue(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.join(',');
  return value ?? '';
}

export function spiffePeerFromForwardedClientCertificate(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): WorkerPrincipal {
  const forwarded = headerValue(headers, 'x-forwarded-client-cert');
  if (!forwarded || forwarded.includes(',')) throw new Error('WORKER_TRUST_PEER_MISSING');
  const uriFields = forwarded.split(';').map((field) => field.trim())
    .filter((field) => field.startsWith('URI='));
  if (uriFields.length !== 1) throw new Error('WORKER_TRUST_PEER_INVALID');
  const match = /^URI=(?:"([^"]+)"|([^";]+))$/u.exec(uriFields[0]!);
  const spiffeId = (match?.[1] ?? match?.[2] ?? '').trim();
  if (!SPIFFE_ID.test(spiffeId)) throw new Error('WORKER_TRUST_PEER_INVALID');
  return Object.freeze({ authentication: 'spiffe-x509-svid', spiffeId });
}

export function authorizeSpiffePeer(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  allowedSpiffeIds: ReadonlySet<string>,
): WorkerPrincipal {
  if (allowedSpiffeIds.size === 0 || [...allowedSpiffeIds].some((id) => !SPIFFE_ID.test(id))) {
    throw new Error('WORKER_TRUST_POLICY_INVALID');
  }
  const principal = spiffePeerFromForwardedClientCertificate(headers);
  if (!allowedSpiffeIds.has(principal.spiffeId)) throw new Error('WORKER_TRUST_PEER_FORBIDDEN');
  return principal;
}

export function authorizeProxiedSpiffePeer(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  remoteAddress: string | undefined,
  allowedSpiffeIds: ReadonlySet<string>,
): WorkerPrincipal {
  if (!remoteAddress || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)) {
    throw new Error('WORKER_TRUST_PROXY_REQUIRED');
  }
  return authorizeSpiffePeer(headers, allowedSpiffeIds);
}
