import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

export interface PrismWorkerSettings {
  readonly maximumActiveRequests: number;
  readonly maximumProbeRequests: number;
  readonly maximumConnections: number;
  readonly requestTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
}
interface SwarmConfig {
  readonly operator: { readonly prism: { readonly worker: PrismWorkerSettings } };
}
interface Validator { (value: unknown): boolean; errors?: unknown[] | null }
const AjvConstructor = Ajv2020 as unknown as new (options: { allErrors: boolean; strict: boolean }) => { compile(schema: object): Validator };
const schema = JSON.parse(fs.readFileSync(new URL('./swarm.schema.json', import.meta.url), 'utf8')) as object;
const validate = new AjvConstructor({ allErrors: true, strict: true }).compile(schema);
const migratedEnvironmentKeys = [
  'PRISM_WORKER_MAXIMUM_ACTIVE_REQUESTS', 'PRISM_WORKER_MAXIMUM_PROBE_REQUESTS',
  'PRISM_WORKER_MAXIMUM_CONNECTIONS', 'PRISM_WORKER_REQUEST_BODY_TIMEOUT_MS',
  'PRISM_WORKER_SHUTDOWN_TIMEOUT_MS',
] as const;

/** Load the single authored snapshot. No legacy environment override or default. */
export function loadPrismWorkerSettings(environment: NodeJS.ProcessEnv): PrismWorkerSettings {
  for (const key of migratedEnvironmentKeys) {
    if (environment[key] !== undefined) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}:use operator.prism.worker`);
  }
  const file = environment.SWARM_CONFIG ?? '/home/node/.openclaw/swarm.config.json';
  const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!validate(value)) throw new Error(`SWARM_CONFIG_INVALID:${JSON.stringify(validate.errors ?? [])}`);
  const settings = (value as SwarmConfig).operator.prism.worker;
  if (settings.maximumActiveRequests + settings.maximumProbeRequests > settings.maximumConnections) {
    throw new Error('SWARM_CONFIG_WORKER_CONNECTION_BUDGET_INVALID');
  }
  return Object.freeze({ ...settings });
}
