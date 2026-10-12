import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { recoverPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import type { PipelineDefinition } from '@kubeclaw/plugin-sdk';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';

for (const phase of ['before-receipt', 'after-receipt', 'lost-response'] as const) {
  test(`${phase} cannot silently repeat a real external mutation`, { timeout: 30000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'external-effect-kill-'));
    const marker = path.join(root, 'stage-received-response');
    const mutations = path.join(root, 'external-mutations.txt');
    let count = 0;
    let accepted!: () => void;
    const received = new Promise<void>(resolve => { accepted = resolve; });
    // This service performs an actual durable mutation. It does not synthesize
    // pipeline success or substitute an effect adapter.
    const server = http.createServer((request, response) => {
      request.resume();
      request.on('end', () => {
        const fd = fs.openSync(mutations, 'a');
        try { fs.writeSync(fd, 'mutation\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        count++;
        accepted();
        if (count > 1) { response.writeHead(500); response.end('duplicate mutation'); return; }
        if (phase === 'lost-response') { response.destroy(); return; }
        if (phase === 'after-receipt') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ mutationCount: count }));
        }
      });
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const install = path.join(root, 'plugins'); const plugin = path.join(install, 'external-effects');
    fs.mkdirSync(path.join(plugin, 'src'), { recursive: true });
    fs.mkdirSync(path.join(plugin, 'schemas'));
    fs.writeFileSync(path.join(plugin, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(plugin, 'plugin.json'), JSON.stringify({ id: 'test.external-effects', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0',
      stages: [{ id: 'mutate', type: 'test.external-effects', module: 'src/stage.ts', export: 'execute', requiredCapabilities: ['runtime.dispatch'], configSchema: 'schemas/config.json', inputSchema: 'schemas/input.json', resultSchema: 'schemas/result.json' }], observers: [], adapters: [] }));
    fs.writeFileSync(path.join(plugin, 'schemas/config.json'), JSON.stringify({ type: 'object', required: ['marker'], additionalProperties: false, properties: { marker: { type: 'string' } } }));
    fs.writeFileSync(path.join(plugin, 'schemas/input.json'), '{"type":"object","additionalProperties":false}');
    fs.writeFileSync(path.join(plugin, 'schemas/result.json'), JSON.stringify({ $ref: 'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult' }));
    fs.writeFileSync(path.join(plugin, 'src/stage.ts'), `import fs from 'node:fs';
      export async function execute(input, context) {
        const response = await context.invoke('runtime.dispatch', { operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: 'mutation-service' }, payload: { operation: 'append' } });
        if (response.mutationCount !== 1) throw new Error('EXTERNAL_MUTATION_RESULT_INVALID');
        fs.writeFileSync(context.contract.config.marker, 'response received');
        await new Promise(() => setInterval(() => {}, 1000));
      }`);
    const common = path.resolve('skills/common/plugins');
    const secretName = `KUBECLAW_EFFECT_TEST_${phase.replaceAll('-', '_').toUpperCase()}`;
    process.env[secretName] = 'ephemeral-effect-test-token';
    const platform: PlatformConfig = { schemaVersion: 'pipeline-platform.v2', installationRoots: [install, common], trustedBuiltinRoots: [install, common], externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
      providers: { 'runtime.dispatch': 'kubeclaw.runtime-dispatch:runtime', 'network.http': 'kubeclaw.network-http:http', 'secrets.read': 'kubeclaw.secret-resolver:secrets' },
      grants: { 'test.external-effects:mutate': { 'runtime.dispatch': { allowedAgents: ['mutation-service'] } },
        'kubeclaw.runtime-dispatch:runtime': { 'network.http': { allowedOrigins: [origin] }, 'secrets.read': { allowedNames: ['mutation-service.token'] } } },
      adapters: { 'kubeclaw.runtime-dispatch:runtime': { targets: { 'mutation-service': { endpoint: origin, tokenSecret: 'mutation-service.token' } } },
        'kubeclaw.network-http:http': { allowedOrigins: [origin], allowedMethods: ['POST'], allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'] },
        'kubeclaw.secret-resolver:secrets': { environment: { 'mutation-service.token': secretName } } },
      activeAdapters: [], observers: {}, storageRoot: path.join(root, 'state'), shutdownTimeoutMs: 1000, orchestratorIssuerId: 'nova', administrativeDecisionIssuers: [] };
    const definition: PipelineDefinition = { schemaVersion: 'pipeline-definition.v2', id: 'external-effects', maxConcurrency: 1,
      stages: [{ id: 'mutate', type: 'test.external-effects', dependsOn: [], config: { marker }, input: {}, execution: { maxAttempts: 3, maxRemediationCycles: 0, timeoutMs: 20000 } }] };
    const platformPath = path.join(root, 'platform.json'), pipelinePath = path.join(root, 'pipeline.json');
    fs.writeFileSync(platformPath, JSON.stringify(platform)); fs.writeFileSync(pipelinePath, JSON.stringify(definition));
    const runId = `run:${phase}`;
    const child = spawn(process.execPath, ['skills/nova/core/cli.ts', '--platform', platformPath, '--pipeline', pipelinePath, '--run-id', runId], { stdio: ['ignore', 'pipe', 'pipe'] });
    const childExited = once(child, 'exit');
    let stdout = ''; child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-16384); });
    let stderr = ''; child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16384); });
    try {
      await Promise.race([received, once(child, 'exit').then(() => { throw new Error(`CLI exited before mutation: ${stderr}`); }), new Promise((_, reject) => setTimeout(() => reject(new Error(`Mutation timeout: ${stderr}`)), 15000).unref())]);
      if (phase === 'after-receipt') {
        const deadline = Date.now() + 5000;
        while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
        assert.ok(fs.existsSync(marker), stderr);
      }
      if (phase === 'lost-response') {
        const [code] = await childExited; assert.equal(code, 1, stderr);
        const result = JSON.parse(stdout);
        assert.equal(result.status, 'blocked');
        assert.equal(result.stages.mutate.attemptsUsed, 1, 'three-attempt budget cannot repeat an uncertain mutation');
        await assert.rejects(recoverPipelineV2(platform, definition, runId), /RECOVERY_RUN_TERMINAL/);
      } else {
        child.kill('SIGKILL');
        const [, signal] = await childExited; assert.equal(signal, 'SIGKILL');
        await assert.rejects(recoverPipelineV2(platform, definition, runId), phase === 'before-receipt' ? /RECOVERY_EFFECT_OUTCOME_UNRESOLVED/ : /RECOVERY_EXTERNAL_CONTINUATION_REQUIRED/);
      }
      assert.equal(count, 1);
      assert.equal(fs.readFileSync(mutations, 'utf8'), 'mutation\n');
    } finally {
      if (child.exitCode === null && child.signalCode === null) { const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit; }
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
      delete process.env[secretName]; fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
