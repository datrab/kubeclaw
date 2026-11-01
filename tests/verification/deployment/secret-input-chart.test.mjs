import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const helm=(...args)=>{if(args.includes('charts/ops-pod'))args.push('--set','codexImage=example.invalid/codex@sha256:'+'a'.repeat(64),'--set','mcpImage=example.invalid/ops@sha256:'+'b'.repeat(64),'--set','networkPolicy.apiServerCIDRs={10.0.0.1/32}');return execFileSync(process.env.HELM_BIN??'helm',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});};
test('receiver chart binds namespace, requires external master-key custody and never grants Kubernetes API access',()=>{
 const dir=mkdtempSync(join(tmpdir(),'secret-chart-'));try{
 const values={image:'example.invalid/ops@sha256:'+'a'.repeat(64),existingClaim:'encrypted-values',brokerNamespace:'kubeclaw-ops',brokerPodName:'codex-ops-mcp',tenant:'family',target:'hetzner-storage',names:['HETZNER_STORAGE_TOKEN'],publicKey:'PUBLIC-TEST-KEY',encryptedPrivateKey:'ENCRYPTED-TEST-KEY',keyProviderClass:'namespace-secret-master',tlsSecret:'receiver-mtls',brokerCertificateFingerprint:'b'.repeat(64)};
 writeFileSync(join(dir,'values.json'),JSON.stringify(values));const yaml=helm('template','family','charts/secret-receiver','--namespace','familyclaw','-f',join(dir,'values.json'));
 assert.match(yaml,/secrets-store\.csi\.k8s\.io/);assert.match(yaml,/secretProviderClass: "namespace-secret-master"/);assert.match(yaml,/automountServiceAccountToken: false/);assert.match(yaml,/secret-custody: "true"/);assert.match(yaml,/\\"namespace\\":\\"familyclaw\\"/);assert.doesNotMatch(yaml,/kind: (?:ClusterRole|Role|Secret)\b/);
 for(const key of ['image','keyProviderClass','brokerCertificateFingerprint']){writeFileSync(join(dir,'bad.json'),JSON.stringify({...values,[key]:''}));assert.throws(()=>helm('template','family','charts/secret-receiver','-f',join(dir,'bad.json')));}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('broker chart is off by default and requires explicit persistent state and mTLS when enabled',()=>{
 const normal=helm('template','ops','charts/ops-pod');assert.doesNotMatch(normal,/OPS_SECRET_INPUT_CONFIG/);
 assert.throws(()=>helm('template','ops','charts/ops-pod','--set','mcp.secretInput.enabled=true'));
 const rendered=helm('template','ops','charts/ops-pod','--set','mcp.secretInput.targets[0].namespace=familyclaw','--set','mcp.secretInput.enabled=true','--set','mcp.secretInput.publicOrigin=https://secrets.example.ts.net','--set','mcp.secretInput.existingClaim=secret-ciphertext','--set','mcp.secretInput.brokerTlsSecret=broker-mtls');assert.match(rendered,/OPS_SECRET_INPUT_CONFIG/);assert.match(rendered,/claimName: secret-ciphertext/);assert.match(rendered,/secretName: broker-mtls/);
});
