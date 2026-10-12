import { validateComponentSettings } from './swarm-bundle.ts';

export interface BusterSecurityScanInvokerSettings {
  readonly trivyExecutable: string;
  readonly cacheDirectory: string;
  readonly allowedRegistryPrefixes: readonly string[];
  readonly maximumExecutionMs: number;
  readonly maximumOutputBytes: number;
  readonly executableSearchPath: readonly string[];
  readonly databasePolicy: {
    readonly maximumVulnerabilityAgeMs: number;
    readonly maximumJavaAgeMs: number;
    readonly maximumDatabaseBytes: number;
    readonly maximumMetadataBytes: number;
  };
  readonly findings: {
    readonly maximumTitleCodeUnits: number;
    readonly maximumMessageCodeUnits: number;
    readonly maximumResolutionCodeUnits: number;
  };
}

export interface BusterSecurityScanSettings extends BusterSecurityScanInvokerSettings {
  readonly registryClientRepositoryPrefixes: readonly string[];
}

function capture(input: BusterSecurityScanInvokerSettings): BusterSecurityScanInvokerSettings {
  return Object.freeze({ ...input,
    allowedRegistryPrefixes: Object.freeze([...input.allowedRegistryPrefixes]),
    executableSearchPath: Object.freeze([...input.executableSearchPath]),
    databasePolicy: Object.freeze({ ...input.databasePolicy }),
    findings: Object.freeze({ ...input.findings }) });
}

export function validateBusterSecurityScanSettings(value: unknown): BusterSecurityScanSettings {
  validateComponentSettings('buster-security-scan', value, 'SECURITY_SCAN_POLICY_INVALID');
  const input = value as BusterSecurityScanSettings;
  return Object.freeze({ ...capture(input),
    registryClientRepositoryPrefixes: Object.freeze([...input.registryClientRepositoryPrefixes]) });
}

export function validateBusterSecurityScanInvokerSettings(value: unknown): BusterSecurityScanInvokerSettings {
  validateComponentSettings('buster-security-scan-invoker', value, 'SECURITY_SCAN_POLICY_INVALID');
  return capture(value as BusterSecurityScanInvokerSettings);
}
