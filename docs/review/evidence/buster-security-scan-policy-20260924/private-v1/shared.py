exec((__import__('pathlib').Path(__file__).parent/'edit.py').read_text().split("write(C+'buster-security-scan.ts'")[0])
write(T+'production-registry-client.ts', '''import path from 'node:path';
import { object, optionalEnvironmentSecret } from './production-config-values.ts';
import { validateRegistryHealth, type RegistryHealthOptions } from './registry-health-access.ts';

/** Captured delivery of the existing operator registry descriptor, never an admission grant. */
export interface RegistryClientBinding {
  readonly origin: string;
  readonly registryReference: string;
  readonly username?: string;
  readonly password?: string;
  readonly caFile?: string;
}

export function registryClientBinding(value: unknown, directory: string,
  environment: Readonly<Record<string, string | undefined>>): RegistryClientBinding | undefined {
  if (value === undefined) return undefined;
  const source = object(value, 'registryClient');
  const fields = ['registryBaseUrl', 'registryReference', 'registryCaFile',
    'registryUsernameEnvironmentVariable', 'registryPasswordEnvironmentVariable'];
  if (Object.keys(source).some(key => !fields.includes(key))
    || typeof source.registryBaseUrl !== 'string' || typeof source.registryReference !== 'string') {
    throw new Error('BUSTER_REGISTRY_CLIENT_CONFIG_INVALID');
  }
  const url = new URL(source.registryBaseUrl);
  if (url.origin !== source.registryBaseUrl || url.host !== source.registryReference
    || !['https:', 'http:'].includes(url.protocol)) throw new Error('BUSTER_REGISTRY_CLIENT_ENDPOINT_INVALID');
  const ca = source.registryCaFile;
  if (Object.hasOwn(source, 'registryCaFile') && (typeof ca !== 'string' || !ca || ca.includes('\\0') || url.protocol !== 'https:')) {
    throw new Error('BUSTER_REGISTRY_CLIENT_CA_INVALID');
  }
  const username = optionalEnvironmentSecret(source, 'registryUsernameEnvironmentVariable', environment);
  const password = optionalEnvironmentSecret(source, 'registryPasswordEnvironmentVariable', environment);
  const credentials = username === undefined && password === undefined ? {} : { username, password };
  const binding = { origin: url.origin, registryReference: url.host, ...credentials,
    ...(typeof ca === 'string' ? { caFile: path.resolve(directory, ca) } : {}) };
  validateRegistryHealth(binding);
  return Object.freeze(binding);
}

export function requiredRegistryClient(binding: RegistryClientBinding | undefined): RegistryClientBinding {
  if (!binding) throw new Error('BUSTER_REGISTRY_CLIENT_REQUIRED');
  return binding;
}

export function registryHealthConfiguration(enabled: unknown, binding: RegistryClientBinding | undefined): RegistryHealthOptions {
  if (enabled !== true) throw new Error('BUSTER_REGISTRY_HEALTH_CONFIG_INVALID');
  const selected = requiredRegistryClient(binding);
  return { origin: selected.origin,
    ...(selected.username === undefined ? {} : { username: selected.username, password: selected.password! }) };
}

export function scannerRegistry(binding: RegistryClientBinding | undefined) {
  if (!binding) return {};
  if (new URL(binding.origin).protocol === 'http:') return { unsupportedHttpRegistry: binding.registryReference };
  return { registryAccess: { registryReference: binding.registryReference,
    username: binding.username!, password: binding.password!,
    ...(binding.caFile === undefined ? {} : { caFile: binding.caFile }) } };
}
''')
p=T+'production-config-values.ts';s=read(p).replace("import { validateRegistryHealth } from './registry-health-access.ts';\n",'')
a=s.index('export function optionalDatabasePolicy');b=s.index('export function boolean',a);s=s[:a]+s[b:]
a=s.index('export function registryHealthConfiguration');b=s.index('export function validateRuntimeRoot',a);s=s[:a]+s[b:]
s=s.replace("['kubernetesFixture', 'tailscaleExposure', 'kubernetesRuntimeSecurity']","['kubernetesFixture', 'tailscaleExposure', 'kubernetesRuntimeSecurity', 'securityScan']")
pos=s.index("  if (Object.hasOwn(value, 'dependencyReadiness'))")
s=s[:pos]+'''  if (value.containerBuild !== undefined) {
    const build = object(value.containerBuild, 'containerBuild');
    for (const key of ['registryBaseUrl', 'registryReference', 'registryCaFile',
      'registryUsernameEnvironmentVariable', 'registryPasswordEnvironmentVariable']) {
      if (Object.hasOwn(build, key)) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:containerBuild.${key}`);
    }
  }
'''+s[pos:];write(p,s)
p=T+'production-capability-sources.ts';s=read(p).replace('object, optionalEnvironmentSecret','object').replace('allowedCapabilities: ReadonlySet<string>, environment: NodeJS.ProcessEnv','allowedCapabilities: ReadonlySet<string>')
a=s.index('  const registryUsername =');b=s.index('  return {',a);s=s[:a]+s[b:];s=s.replace('    registryUsername,\n    registryPassword,\n','')
s=s.replace('  environment: NodeJS.ProcessEnv,\n','').replace('commandSources(value, allowedCapabilities, environment)','commandSources(value, allowedCapabilities)').replace("['kubernetesFixture', 'tailscaleExposure', 'kubernetesRuntimeSecurity']","['kubernetesFixture', 'tailscaleExposure', 'kubernetesRuntimeSecurity', 'securityScan']")
a=s.index('  const securityScanSource =');b=s.index('  const kubernetesRuntimeSecurityEnabled',a);s=s[:a]+"  const securityScanEnabled = allowedCapabilities.has('security.scan');\n"+s[b:];s=s.replace('    securityScanSource,','    securityScanEnabled,');write(p,s)
p=T+'production-command-options.ts';s=read(p);s="import type { BusterSecurityScanSettings } from '../../../common/plugin-runtime/foundation/config/buster-security-scan.ts';\nimport { registryHealthConfiguration, requiredRegistryClient, scannerRegistry, type RegistryClientBinding } from './production-registry-client.ts';\n"+s
s=s.replace('  registryHealthConfiguration,\n  scannerRegistry,\n  optionalDatabasePolicy,\n','')
s=s.replace('  registryUsername: string | undefined,\n  registryPassword: string | undefined,','  binding: RegistryClientBinding | undefined,')
s=s.replace("): Pick<BusterCapabilityRuntimeOptions, 'containerBuild'> {\n  return", "): Pick<BusterCapabilityRuntimeOptions, 'containerBuild'> {\n  const registry = containerBuildSource ? requiredRegistryClient(binding) : undefined;\n  return")
s=s.replace('String(containerBuildSource.registryBaseUrl)','registry!.origin').replace('String(containerBuildSource.registryReference)','registry!.registryReference')
s=s.replace('...(registryUsername !== undefined ? { registryUsername, registryPassword: registryPassword! } : {})','...(registry!.username !== undefined ? { registryUsername: registry!.username, registryPassword: registry!.password! } : {})')
s=s.replace('  networkHttpSource: Source,\n  containerBuildSource: Source,','  networkHttpSource: Source,')
s=s.replace('                  containerBuildSource,\n                  registryUsername,\n                  registryPassword,','                  binding,')
a=s.index('export function securityScanOptions(');s=s[:a]+'''export function securityScanOptions(
  enabled: boolean,
  policy: BusterSecurityScanSettings,
  binding: RegistryClientBinding | undefined,
): Pick<BusterCapabilityRuntimeOptions, 'securityScan'> {
  return enabled ? { securityScan: { ...policy, ...scannerRegistry(binding) } } : {};
}
''';write(p,s)
p=T+'production.ts';s=read(p);s="import { validateBusterSecurityScanSettings } from '../../../common/plugin-runtime/foundation/config/buster-security-scan.ts';\nimport { registryClientBinding, requiredRegistryClient, type RegistryClientBinding } from './production-registry-client.ts';\n"+s
s=s.replace('object, integer, registryHealthConfiguration, validateRuntimeRoot','object, integer, validateRuntimeRoot')
s=s.replace('  const canonical = fs.realpathSync(file);','  const securityScan = validateBusterSecurityScanSettings(settings.securityScan);\n  const canonical = fs.realpathSync(file);')
s=s.replace('  const authority = runtimeAuthority(value, environment);','  const registryClient = registryClientBinding(value.registryClient, directory, environment);\n  const authority = runtimeAuthority(value, environment);')
s=s.replace('execution: executionPolicy, clusterInvokers }','execution: executionPolicy, clusterInvokers, securityScan }').replace('workerRevision, authority.sourceAttestationPublicKey);','workerRevision, authority.sourceAttestationPublicKey, registryClient);')
s=s.replace('workerRevision: string, sourceAttestationPublicKey: string) {','workerRevision: string, sourceAttestationPublicKey: string, registryClient: RegistryClientBinding | undefined) {')
s=s.replace('capabilitySources(value, allowedCapabilities, environment)','capabilitySources(value, allowedCapabilities)')
s=s.replace('configuredCapabilities(sources, directory, environment, settings.buster.clusterInvokers, value.clusterBindings)','configuredCapabilities(sources, directory, settings.buster, value.clusterBindings, registryClient)')
s=s.replace('function configuredCapabilities(sources: ReturnType<typeof capabilitySources>, directory: string, environment: NodeJS.ProcessEnv,\n  policy: BusterClusterInvokerSettings, bindingSource: unknown)', 'function configuredCapabilities(sources: ReturnType<typeof capabilitySources>, directory: string,\n  settings: BusterSettings, bindingSource: unknown, registryClient: RegistryClientBinding | undefined)')
s=s.replace('browserPlaywrightSource, securityScanSource,','browserPlaywrightSource, securityScanEnabled,').replace('allowSampledProcessLimit, registryUsername, registryPassword, browserPlaywrightCgroup','allowSampledProcessLimit, browserPlaywrightCgroup')
s=s.replace('containerBuildOptions(containerBuildSource, directory, registryUsername, registryPassword)','containerBuildOptions(containerBuildSource, directory, registryClient)').replace('configuredClusterCapabilities(sources, policy, bindingSource)','configuredClusterCapabilities(sources, settings.clusterInvokers, bindingSource, registryClient)').replace('networkHttpOptions(networkHttpSource, containerBuildSource, registryUsername, registryPassword)','networkHttpOptions(networkHttpSource, registryClient)').replace('securityScanOptions(securityScanSource, directory, environment)','securityScanOptions(securityScanEnabled, settings.securityScan, registryClient)')
s=s.replace('policy: BusterClusterInvokerSettings, bindingSource: unknown) {','policy: BusterClusterInvokerSettings, bindingSource: unknown, registryClient: RegistryClientBinding | undefined) {')
s=s.replace('const { kubernetesFixtureEnabled, tailscaleExposureEnabled, kubernetesRuntimeSecurityEnabled,\n    containerBuildSource, registryUsername, registryPassword } = sources;','const { kubernetesFixtureEnabled, tailscaleExposureEnabled, kubernetesRuntimeSecurityEnabled } = sources;')
s=s.replace('registryHealthConfiguration(true, containerBuildSource, registryUsername, registryPassword).origin','requiredRegistryClient(registryClient).origin')
# Environment is consumed only by root authority/shared binding capture.
s=s.replace('configuredService(value, directory, environment, preparation','configuredService(value, directory, preparation').replace('function configuredService(value: Record<string, unknown>, directory: string, environment: NodeJS.ProcessEnv,','function configuredService(value: Record<string, unknown>, directory: string,')
write(p,s)
p='docker/buster-runtime-entrypoint.sh';s=read(p);s=s.replace('registry="$(node -e \'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).registryReference)\' "$registry_client_dir/runtime.json")"\n','')
s=s.replace(' REGISTRY_REFERENCE="$registry"','').replace('const registry = process.env.REGISTRY_REFERENCE;\n','')
s=s.replace("  schemaVersion: 'buster-remote-plan-runtime.v1', platformConfig: './platform.json',","  schemaVersion: 'buster-remote-plan-runtime.v1', platformConfig: './platform.json',\n  registryClient: JSON.parse(fs.readFileSync(process.env.REGISTRY_CLIENT_RUNTIME, 'utf8')),")
s=s.replace("    ...JSON.parse(fs.readFileSync(process.env.REGISTRY_CLIENT_RUNTIME, 'utf8')),\n",'')
a=s.index('  securityScan: {');b=s.index("}, null, 2)",a);s=s[:a]+s[b:];write(p,s)
