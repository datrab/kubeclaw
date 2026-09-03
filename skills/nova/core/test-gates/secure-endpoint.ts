export function assertSecureRemoteEndpoint(value: string): URL {
  const endpoint = new URL(value);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error('NOVA_REMOTE_PLAN_ENDPOINT_INVALID');
  }
  const host = endpoint.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/u.test(host);
  if (endpoint.protocol === 'http:' && !loopback) throw new Error('NOVA_REMOTE_PLAN_PLAINTEXT_NON_LOOPBACK');
  return endpoint;
}
