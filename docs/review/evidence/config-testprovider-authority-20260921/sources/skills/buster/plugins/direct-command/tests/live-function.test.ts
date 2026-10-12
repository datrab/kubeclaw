import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-command-provider-'));
try {
  fs.mkdirSync(path.join(root, 'repository', 'reports'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scratch')); fs.mkdirSync(path.join(root, 'evidence'));
  fs.writeFileSync(path.join(root, 'repository', 'reports', 'unit.xml'), '<testsuite><testcase name="ok"/></testsuite>');
  fs.writeFileSync(path.join(root, 'repository', 'reports', 'output.tar'), 'real build artifact');
  const logs: string[] = [];
  const invocation: any = {
    configuration: { values: { executable: 'node', args: ['test.js'], resultMode: 'junit-required',
      reports: [{ id: 'unit', format: 'junit', path: 'reports/unit.xml', mediaType: 'application/junit+xml' }],
      artifacts: [{ id: 'build-output', path: 'reports/output.tar', mediaType: 'application/x-tar' }] } },
    limits: { logBytes: 4096, processes: 4, memoryBytes: 64 * 1024 * 1024, cpuMillis: 1000,
      artifactFiles: 8, artifactBytes: 4096 },
    timeoutMs: 1000, workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' },
  };
  const result = await provider().execute(invocation, { workspaceRoot: root, signal: new AbortController().signal,
    log(stream: string, content: string) { logs.push(`${stream}:${content}`); },
    async invoke(capability: string, request: any) {
      assert.equal(capability, 'command.execute'); assert.equal(request.resource.canonicalId, 'catalog:node');
      return { exitCode: 0, signal: null, records: [{ stream: 'stdout', content: 'one\n' },
        { stream: 'stderr', content: 'two\n' }] };
    } });
  assert.equal(result.outcome, 'passed'); assert.deepEqual(logs, ['stdout:one\n', 'stderr:two\n']);
  assert.equal(result.reports[0]?.evidenceId, 'unit');
  assert.equal(result.outputs[0]?.name, 'artifact-1');
  assert.equal(result.evidenceFiles.find((item: any) => item.evidenceId === 'build-output')?.type, 'artifact');
  await assert.rejects(() => provider().execute({ ...invocation, limits: { ...invocation.limits, artifactBytes: 8 } },
    { workspaceRoot: root, signal: new AbortController().signal, log() {},
      async invoke() { return { exitCode: 0, signal: null, records: [] }; } }),
  /DIRECT_COMMAND_ARTIFACT_LIMIT_EXCEEDED/u);
  await assert.rejects(() => provider().execute({ ...invocation, configuration: { values: { executable: 'node', resultMode: 'exit-code',
    environment: { NODE_OPTIONS: '--inspect' } } } }, { workspaceRoot: root, signal: new AbortController().signal,
    log() {}, async invoke() { return {}; } }), /DIRECT_COMMAND_ENVIRONMENT_DENIED/u);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, provider: 'direct-command', shell: false, reports: 'exact' }));
