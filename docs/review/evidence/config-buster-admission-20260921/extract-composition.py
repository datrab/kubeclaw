from pathlib import Path
b=Path('skills/buster/engine/test-gates');p=b/'production.ts';s=p.read_text()
a=s.index("  if (value.schemaVersion");z=s.index('  const trustedPeerSpiffeIds',a);root=s[a:z]
a=z;z=s.index('  const platform',a);auth=s[a:z]
a=z;z=s.index('  const records',a);registry=s[a:z]
q=b/'production-config-values.ts';helpers=q.read_text();helpers="import { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';\nimport { buildRegistry } from '@kubeclaw/plugin-foundation/registry/build';\nimport { discoverPackages } from '@kubeclaw/plugin-foundation/registry/discovery';\n"+helpers
helpers+='\nexport function validateRuntimeRoot(value: Record<string, unknown>): void {\n'+root+'}\n'
helpers+='\nexport function runtimeAuthority(value: Record<string, unknown>, environment: NodeJS.ProcessEnv) {\n'+auth+'  return { trustedPeerSpiffeIds, token, sourceAttestationPublicKey };\n}\n'
helpers+='\nexport function runtimeRegistry(value: Record<string, unknown>, directory: string) {\n'+registry+'  return registry;\n}\n';q.write_text(helpers)
# service constructor helper consumes explicit authority. Registry validation precedes store limits.
a=s.index('  const records');z=s.index('  const tlsSource',a);service=s[a:z];service=service.replace('  const service = new BusterRemotePlanService({','  return new BusterRemotePlanService({')
# keep helper under line ceiling by extract capability assembly as a specific function
ca=service.index('  const { directCommandSource');cz=service.index('  const stateRoot',ca);source=service[ca:cz]
fa=service.index('    ...directCommandOptions');fz=service.index('\n  });',fa);fields=service[fa:fz]
service=service[:fa]+'    ...capabilities(),'+service[fz:]
service=service[:ca]+'''  const sources = capabilitySources(value, allowedCapabilities, environment);
  const capabilities = () => configuredCapabilities(sources, directory, environment);
'''+service[cz:]
# eliminate callback, preserve validation before store creation and option decoding after store creation
service=service.replace('  const capabilities = () => configuredCapabilities(sources, directory, environment);\n','').replace('...capabilities()','...configuredCapabilities(sources, directory, environment)')
source=source.replace(' = capabilitySources(value, allowedCapabilities, environment);',' = sources;')
ca=s.index('  const tlsSource');tls=s[ca:];tls=tls.replace('  return new BusterRemotePlanRuntime({','  return new BusterRemotePlanRuntime({')
imports=s[:s.index('export function loadProduction')]
for line in ["import { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';\n","import { buildRegistry } from '@kubeclaw/plugin-foundation/registry/build';\n","import { discoverPackages } from '@kubeclaw/plugin-foundation/registry/discovery';\n"]:imports=imports.replace(line,'')
imports=imports.replace('object, integer, stringArray','object, integer, validateRuntimeRoot, runtimeAuthority, runtimeRegistry')
main='''export function loadProductionBusterRemotePlanRuntime(
  file: string,
  preparation: BusterPreparation,
  settings: BusterSettings,
  environment: Readonly<Record<string, string | undefined>>,
): BusterRemotePlanRuntime {
  const canonical = fs.realpathSync(file);
  const workerRevision = environment.KUBECLAW_BUILD_REVISION;
  if (!workerRevision || !/^[a-f0-9]{40,64}$/u.test(workerRevision)) {
    throw new Error('BUSTER_REMOTE_WORKER_REVISION_INVALID');
  }
  const directory = path.dirname(canonical);
  const value = object(JSON.parse(fs.readFileSync(canonical, 'utf8')), 'root');
  validateRuntimeRoot(value);
  const authority = runtimeAuthority(value, environment);
  const service = configuredService(value, directory, environment, preparation, settings, workerRevision, authority.sourceAttestationPublicKey);
  return configuredRuntime(value, directory, service, settings, authority);
}

function configuredService(value: Record<string, unknown>, directory: string, environment: NodeJS.ProcessEnv,
  preparation: BusterPreparation, settings: BusterSettings, workerRevision: string, sourceAttestationPublicKey: string) {
  const registry = runtimeRegistry(value, directory);
'''+service+'}\n\nfunction configuredCapabilities(sources: ReturnType<typeof capabilitySources>, directory: string, environment: NodeJS.ProcessEnv) {\n'+source+'  return {\n'+fields+'\n  };\n}\n\nfunction configuredRuntime(value: Record<string, unknown>, directory: string, service: BusterRemotePlanService,\n  settings: BusterSettings, { trustedPeerSpiffeIds, token }: ReturnType<typeof runtimeAuthority>) {\n'+tls
p.write_text(imports+main)
# explicit environment already captured at CLI startup
p=Path('skills/buster/engine/remote-plan-cli.ts');s=p.read_text().replace('client, settings);','client, settings, process.env);');p.write_text(s)
