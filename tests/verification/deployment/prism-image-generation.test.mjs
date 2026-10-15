import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { buildPrismImageBundle } from '../../../scripts/build-prism-image-bundle.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/u, '');
test('normal image producer installs a complete role and matching selected central generation', async t => {
  assert.equal(process.getuid?.(), 0, 'real root-owned image tree required');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-image-projection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = await buildPrismImageBundle({ repository, output: path.join(root, 'image'), callerId: 'prism-ingestion',
    revision: 'a'.repeat(40), builtAt: '2026-10-15T00:00:00Z' });
  const chart = yaml.loadAll(execFileSync('helm', ['template', 'prism', 'charts/prism', '--namespace', 'kubeclaw', '-f', 'charts/prism/ci-values.yaml'], { encoding: 'utf8' })).filter(Boolean);
  for (const document of chart.filter(item => ['Job', 'Deployment'].includes(item.kind))) {
    const spec = document.spec.template.spec;
    for (const container of [...(spec.initContainers ?? []), ...spec.containers]) {
      if (['control','worker','bootstrap-database-roles','migrate'].includes(container.name)) {
        for (const file of (container.command ?? []).filter(arg => arg.endsWith('.ts'))) assert(fs.existsSync(path.join(result.packageRoot,file)), `${container.name} command must exist in emitted image package: ${file}`);
      }
    }
  }
  const boot = await import(pathToFileURL(path.join(result.packageRoot, 'skills/packages/plugin-foundation/config/pipeline-boot.mjs')).href);
  const capture = boot.capturePipelineBootReceipts(result.deliveryRoot, result.systemRoot, 'prism-ingestion', result.packageRoot, '/app/prism/skills');
  const { loadIngestionConfig } = await import(pathToFileURL(path.join(result.packageRoot, 'skills/packages/prism-engine/server/ingestion-config.ts')).href);
  const actual = loadIngestionConfig(capture, { PRISM_INGESTION_SECRET: 'image-producer-test' });
  const authored = JSON.parse(fs.readFileSync(path.join(repository, 'config/components/prism-control.config.json'))).profiles.standard.settings.ingestionServer;
  for (const [key, expected] of Object.entries(authored)) assert.deepEqual(actual[key], expected);
  assert.equal(capture.selectionReceipt.generationDigest, result.generationDigest);
  assert.equal(capture.selectionReceipt.serviceInstanceId, result.serviceInstanceId);
  assert.throws(() => boot.capturePipelineBootReceipts(result.deliveryRoot, result.systemRoot, 'prism-control', result.packageRoot, '/app/prism/skills'), /EXPECTED_RECEIPT_INVALID/);
  await assert.rejects(buildPrismImageBundle({ repository, output: path.join(root, 'image'), callerId: 'prism-ingestion', revision: 'a'.repeat(40), builtAt: '2026-10-15T00:00:00Z' }), /OUTPUT_EXISTS/);
});

test('normal image producer does not invent missing build or caller identity', async () => {
  for (const changes of [{ callerId: 'unknown' }, { revision: undefined }, { builtAt: '' }]) {
    await assert.rejects(buildPrismImageBundle({ repository, output: '/not-created-prism-config', callerId: 'prism-ingestion', revision: 'a'.repeat(40), builtAt: '2026-10-15T00:00:00Z', ...changes }), /IDENTITY_REQUIRED/);
  }
  assert.equal(fs.existsSync('/not-created-prism-config'), false);
});

test('agent image producer publishes a distinct bridge selection and installed startup without partial main closure',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'prism-agent-image-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const result=await buildPrismImageBundle({repository,output:path.join(root,'image'),callerId:'prism-agent-bridge',revision:'a'.repeat(40),builtAt:'2026-10-15T00:00:00Z'});
 assert.equal(result.serviceInstanceId,'kubeclaw/agent-prism/prism-agent-bridge');
 const boot=await import(pathToFileURL(path.join(result.packageRoot,'skills/packages/plugin-foundation/config/pipeline-boot.mjs')).href);
 const capture=boot.capturePipelineBootReceipts(result.deliveryRoot,result.systemRoot,'prism-agent-bridge',result.packageRoot,'/app/prism/skills');
 const engine=path.join(result.packageRoot,'skills/packages/prism-engine/server');
 const {loadAgentBridgeConfig}=await import(pathToFileURL(path.join(engine,'agent-bridge-config.ts')).href);
 assert.equal(loadAgentBridgeConfig(capture,{}).controlUrl,'http://127.0.0.1:28080');
 assert(fs.existsSync(path.join(engine,'agent-bridge-entry.mjs')));
 assert.throws(()=>boot.capturePipelineBootReceipts(result.deliveryRoot,result.systemRoot,'prism-control',result.packageRoot,'/app/prism/skills'),/EXPECTED_RECEIPT_INVALID/);
 const image=JSON.parse(fs.readFileSync(path.join(result.systemRoot,'image-receipt.json'),'utf8'));
 assert.deepEqual(Object.keys(image.selectionDigests),['prism-agent-bridge']);
});
