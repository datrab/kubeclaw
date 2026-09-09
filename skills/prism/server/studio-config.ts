import { fileURLToPath } from 'node:url';
import type { StudioOptions } from './studio-request.ts';

/** Explicit standalone Studio defaults; deployment may override each value. */
const defaults = Object.freeze({ port: 8080, controlTimeoutMs: 30_000,
  root: fileURLToPath(new URL('../dist-studio', import.meta.url)), control: 'http://prism-control:8080', ingressSecret: '' });

export function loadStudioConfig(environment: NodeJS.ProcessEnv = process.env): StudioOptions & { port: number } {
  const port = Number(environment.PORT ?? defaults.port);
  const controlTimeoutMs = Number(environment.PRISM_CONTROL_TIMEOUT_MS ?? defaults.controlTimeoutMs);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PRISM_STUDIO_PORT_INVALID');
  if (!Number.isSafeInteger(controlTimeoutMs) || controlTimeoutMs < 1 || controlTimeoutMs > 2_147_483_647) {
    throw new Error('PRISM_STUDIO_CONTROL_TIMEOUT_INVALID');
  }
  return { port, controlTimeoutMs, root: environment.STUDIO_ROOT ?? defaults.root,
    control: new URL(environment.PRISM_CONTROL_URL ?? defaults.control),
    ingressSecret: environment.PRISM_INGRESS_SECRET ?? defaults.ingressSecret };
}
