exec((__import__('pathlib').Path(__file__).parent/'edit.py').read_text().split("write(C+'buster-security-scan.ts'")[0])
write('tests/fixtures/test-gate/security-scan-policy.mjs', '''import fs from 'node:fs';

/** Explicit selected component policy for original direct-consumer tests; no missing-field repair. */
export const scannerTestPolicy = JSON.parse(fs.readFileSync(
  new URL('../../../charts/kubeclaw/files/config/buster-engine.config.json', import.meta.url), 'utf8')).settings.securityScan;
''')
for p in ['skills/buster/plugins/security-providers/tests/database-freshness.test.mts','skills/buster/plugins/security-providers/tests/live-function.test.ts','tests/verification/contracts/check-pipeline-security-remote-vertical.mts','tests/verification/deployment/registry-trivy-native.test.mts']:
 s=read(p);rel='../../../../../tests/fixtures/test-gate/security-scan-policy.mjs' if p.startswith('skills/') else '../../fixtures/test-gate/security-scan-policy.mjs'
 s=f"import {{ scannerTestPolicy }} from '{rel}';\n"+s
 s=s.replace('new SecurityScanCapabilityInvoker({','new SecurityScanCapabilityInvoker({ ...scannerTestPolicy,')
 s=s.replace('securityScan:{trivyExecutable:','securityScan:{...scannerTestPolicy,trivyExecutable:')
 s=s.replace('databasePolicy()','databasePolicy(scannerTestPolicy.databasePolicy)')
 write(p,s)
p='tests/verification/contracts/buster-cluster-production-route.test.mjs';s=read(p)
a=s.index('        containerBuild: {');b=s.index(' };',a)
s=s[:a]+'''        registryClient: {
          registryBaseUrl: `https://${profile.registry.split('/')[0]}`, registryReference: profile.registry.split('/')[0],
          registryUsernameEnvironmentVariable: 'CI2_REGISTRY_USER', registryPasswordEnvironmentVariable: 'CI2_REGISTRY_PASSWORD' }'''+s[b:];write(p,s)
p='tests/verification/contracts/check-pipeline-remote-runtime-config.mts';s=read(p);a=s.index('  const containerBuild =');b=s.index('  fs.writeFileSync(busterConfig',a)
s=s[:a]+'''  const registryClient = {
    registryBaseUrl: 'https://registry.example.test:5443', registryReference: 'registry.example.test:5443',
    registryUsernameEnvironmentVariable: 'REGISTRY_HEALTH_USER', registryPasswordEnvironmentVariable: 'REGISTRY_HEALTH_PASSWORD' };
'''+s[b:]
s=s.replace('healthConfiguration, containerBuild','healthConfiguration, registryClient').replace('...containerBuild, registryReference','...registryClient, registryReference').replace("['kubernetes.fixture'], containerBuild", "['kubernetes.fixture'], registryClient").replace('containerBuild.registryReference','registryClient.registryReference').replace('containerBuild: { ...registryClient','registryClient: { ...registryClient').replace('containerBuild: undefined','registryClient: undefined').replace('BUSTER_REGISTRY_HEALTH_CONFIG_INVALID','BUSTER_REGISTRY_CLIENT_REQUIRED').replace('BUSTER_REGISTRY_HEALTH_ENDPOINT_MISMATCH','BUSTER_REGISTRY_CLIENT_ENDPOINT_INVALID')
write(p,s)
