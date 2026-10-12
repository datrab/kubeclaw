import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const repo = process.cwd();
const snapshot = process.env.VM_DIAGNOSTIC_SNAPSHOT ?? path.join(repo, 'node_modules/.cache/native-test-vm-run3-20260921/repo-snapshot');
const evidence = path.join(repo, 'docs/review/evidence/native-vm-timeout-diagnosis-20260921');
const { prismNativeAttempt } = await import(pathToFileURL(path.join(snapshot, 'skills/prism/engine/worker-envelope.ts')));
const { nativeResourcePolicy } = await import(pathToFileURL(path.join(snapshot, 'skills/prism/tests/native/resource-policy.mts')));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'native-readiness-diagnostic-'));
const results = [];
try {
  for (const mode of ['accepted', 'sealed', 'supervisor']) for (const context of ['child-v8', null]) {
    const root = path.join(temporary, `${mode}-${context}`); await fs.mkdir(root);
    const envelope = prismNativeAttempt('render', { artifactId: 'input:diagnostic', type: 'prism-engine-input', mediaType: 'application/json', contentDigest: `sha256:${'1'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' }, 'journal-diagnostic', nativeResourcePolicy);
    const envelopeFile = path.join(root, 'envelope.json'); await fs.writeFile(envelopeFile, JSON.stringify(envelope));
    const fixture = path.join(snapshot, 'tests/fixtures', mode === 'supervisor' ? 'worker-ownership-supervisor.mjs' : 'worker-journal-writer.mjs');
    const env = { ...process.env }; if (context) env.NODE_TEST_CONTEXT = context; else delete env.NODE_TEST_CONTEXT;
    const start = performance.now();
    const child = spawn(process.execPath, ['--import', path.join(evidence, 'child-preload.mjs'), fixture, path.join(root, 'store'), ...(mode === 'supervisor' ? [] : [envelopeFile, mode])], { env, stdio: 'pipe' });
    let stderr = ''; child.stderr.on('data', bytes => { stderr += String(bytes); });
    const exit = once(child, 'exit'); let timer;
    try {
      const ready = await Promise.race([once(child.stdout, 'data').then(([bytes]) => ({ stdout: String(bytes), firstByteMs: performance.now() - start })), exit.then(([code, signal]) => ({ earlyExit: { code, signal } })), new Promise(resolve => { timer = setTimeout(() => resolve({ deadline: true }), mode === 'supervisor' ? 15000 : 20000); })]);
      results.push({ mode, context, ...ready, stderr });
    } finally { clearTimeout(timer); child.kill('SIGKILL'); await exit; }
  }
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
await fs.writeFile(path.join(evidence, 'host-readiness-result.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
