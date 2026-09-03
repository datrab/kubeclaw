import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export interface PlatformConfig {
  readonly schemaVersion: 'pipeline-platform.v2';
  readonly installationRoots: readonly string[];
  readonly trustedBuiltinRoots: readonly string[];
  readonly externalTrust: Readonly<{
    readonly allowedSourceDigests: Readonly<Record<string, readonly string[]>>;
    readonly verifiedAttestations: Readonly<Record<string, string>>;
  }>;
  readonly providers: Readonly<Record<string, string>>;
  readonly grants: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>>;
  readonly adapters: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly activeAdapters: readonly string[];
  readonly observers: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly storageRoot: string;
  readonly shutdownTimeoutMs: number;
  readonly effectLockTtlMs?: number;
  readonly orchestratorIssuerId: string;
  readonly administrativeDecisionIssuers: readonly Readonly<{
    readonly type: 'operator' | 'administrator';
    readonly id: string;
  }>[];
}

const schema = JSON.parse(fs.readFileSync(new URL('./platform.schema.json', import.meta.url), 'utf8')) as object;
interface Validator {
  (value: unknown): boolean;
  errors?: unknown[] | null;
}
interface AjvInstance {
  compile(schema: object): Validator;
}
const AjvConstructor = Ajv2020 as unknown as new (options: {
  allErrors: boolean;
  strict: boolean;
}) => AjvInstance;
const installFormats = addFormats as unknown as (instance: AjvInstance) => AjvInstance;
const ajv = new AjvConstructor({ allErrors: true, strict: true });
installFormats(ajv);
const validate = ajv.compile(schema);

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function resolvePaths(config: PlatformConfig, directory: string): PlatformConfig {
  return deepFreeze({
    ...config,
    installationRoots: config.installationRoots.map((value) => path.resolve(directory, value)),
    trustedBuiltinRoots: config.trustedBuiltinRoots.map((value) => path.resolve(directory, value)),
    storageRoot: path.resolve(directory, config.storageRoot),
  });
}

export function loadPlatformConfig(file: string): PlatformConfig {
  const canonical = fs.realpathSync(file);
  const value = JSON.parse(fs.readFileSync(canonical, 'utf8')) as unknown;
  if (!validate(value)) {
    throw new Error(`PLATFORM_CONFIG_INVALID:${canonical}:${JSON.stringify(validate.errors ?? [])}`);
  }
  return resolvePaths(value as PlatformConfig, path.dirname(canonical));
}
