exec((__import__('pathlib').Path(__file__).parent/'edit.py').read_text().split("write(C+'buster-security-scan.ts'")[0])
R=Path('docs/review/evidence/buster-security-scan-policy-20260924')
proposal=json.loads((R/'ownership-resolved-v2.json').read_text());proposal['status']='Resolved fourteen-field design after registry-admission-v2-decision; private implementation only';proposal['fields'].insert(3,dict(field='registryClientRepositoryPrefixes',initialValue=['kubeclaw'],currentAuthority='explicit logical-registry grant preserving generated deployment scope',consumer='resolve once against captured shared registry host for enabled scanning'))
proposal['fields'][2]['initialValue']=[];proposal['review']='../independent-security-scan-policy-20260924/registry-admission-v2-decision.json';(R/'ownership-resolved-v3.json').write_text(json.dumps(proposal,indent=2)+'\n')
(R/'design-resolved-v3.md').write_text('''# Fourteen-field scanner design, final admission decision

This supersedes the thirteen-field and blanket transport/admission rule in resolved-v2; historical proposals remain unchanged. The independent registry-admission-v2-decision permits two required explicit arrays. Canonical `allowedRegistryPrefixes: []` and `registryClientRepositoryPrefixes: ["kubeclaw"]` preserve the former generated deployment scope without inventing a host. The relative array authorizes a logical registry: its grant deliberately moves when that binding moves, while full literal grants remain stable. Each relative prefix follows the existing image repository grammar. No host template, magic hostname, wildcard, inferred permission or fallback is added.

An enabled scanner resolves the explicit union once, requires a binding only for nonempty relative grants, and retains the original nonempty effective direct-invoker policy. Disabled scanners still require a valid complete component but do not require an absent binding. Present malformed descriptors always reject. Binding-free public/multiple-host/dependency/config profiles explicitly supply full grants and an empty relative array. A descriptor alone grants nothing. The remaining shared binding, original test, documentation, causal-fix and open-resource boundaries from resolved-v2 and the independent review still apply.
''')
p=C+'buster-security-scan.ts';s=read(p).replace('export interface BusterSecurityScanSettings {','export interface BusterSecurityScanInvokerSettings {')
a=s.index('export function validateBusterSecurityScanSettings');s=s[:a]+'''export interface BusterSecurityScanSettings extends BusterSecurityScanInvokerSettings {
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
''';write(p,s)
p=C+'swarm-components.schema.json';schema=json.loads(read(p));direct=json.loads(json.dumps(schema['$defs']['buster-security-scan']));schema['$defs']['buster-security-scan-invoker']=direct
component=schema['$defs']['buster-security-scan'];component['properties']['allowedRegistryPrefixes']['minItems']=0
component['required'].append('registryClientRepositoryPrefixes');component['properties']['registryClientRepositoryPrefixes']=dict(type='array',minItems=0,items=dict(type='string',minLength=1,pattern='^[a-z0-9]+(?:[._/-][a-z0-9]+)*$'))
write(p,json.dumps(schema,indent=2)+'\n')
replace(C+'swarm-bundle.ts',"'buster-security-scan',","'buster-security-scan', 'buster-security-scan-invoker',")
p=T+'security-scan-runtime.ts';s=read(p).replace('validateBusterSecurityScanSettings','validateBusterSecurityScanInvokerSettings').replace('BusterSecurityScanSettings','BusterSecurityScanInvokerSettings');write(p,s)
p=T+'production-command-options.ts';s=read(p).replace("  return enabled ? { securityScan: { ...policy, ...scannerRegistry(binding) } } : {};",'''  if (!enabled) return {};
  const { registryClientRepositoryPrefixes, ...scanner } = policy;
  const registry = registryClientRepositoryPrefixes.length ? requiredRegistryClient(binding) : undefined;
  const allowedRegistryPrefixes = Object.freeze([...scanner.allowedRegistryPrefixes,
    ...registryClientRepositoryPrefixes.map(prefix => `${registry!.registryReference}/${prefix}`)]);
  if (!allowedRegistryPrefixes.length) throw new Error('SECURITY_SCAN_REGISTRY_POLICY_INVALID');
  return { securityScan: { ...scanner, allowedRegistryPrefixes, ...scannerRegistry(binding) } };''');write(p,s)
values=dict(trivyExecutable='/usr/local/bin/trivy',cacheDirectory='/home/builder/.cache/trivy',allowedRegistryPrefixes=[],registryClientRepositoryPrefixes=['kubeclaw'],maximumExecutionMs=900000,maximumOutputBytes=67108864,executableSearchPath=['/usr/local/bin','/usr/bin','/bin'],databasePolicy=dict(maximumVulnerabilityAgeMs=172800000,maximumJavaAgeMs=604800000,maximumDatabaseBytes=8589934592,maximumMetadataBytes=16384),findings=dict(maximumTitleCodeUnits=2048,maximumMessageCodeUnits=4096,maximumResolutionCodeUnits=4096))
for p in ['charts/kubeclaw/files/config/buster-engine.config.json','charts/kubeclaw/files/config/profiles/buster-engine.runtime.config.json']:
 document=json.loads(read(p));document['settings']['securityScan']=values;write(p,json.dumps(document,indent=2)+'\n')
