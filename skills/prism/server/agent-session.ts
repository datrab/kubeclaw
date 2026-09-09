import { createHash } from 'node:crypto';

/** Deliberately does not resolve, reuse or migrate the lossy pre-v2 session name. */
export function agentSessionKey(namespace:string, projectId:string) {
  if (typeof namespace !== 'string' || !namespace || typeof projectId !== 'string' || !projectId) {
    throw new Error('Prism agent session namespace and full project identity are required');
  }
  const identity = createHash('sha256').update(JSON.stringify([namespace, projectId])).digest('hex');
  return `prism-v2-${identity}`;
}
