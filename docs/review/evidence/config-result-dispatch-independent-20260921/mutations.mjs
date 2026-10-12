// Fresh transport-level negative controls; original real HTTP tests, isolated source copies.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), out = path.join(root, 'docs/review/evidence/config-result-dispatch-independent-20260921');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'independent-prism-transport-'));
const module = path.join(root, 'skills/prism/control/worker-operation-transport.ts');
const test = path.join(root, 'skills/prism/tests/swarm-native-settings.test.mts');
const absolutize = (source, file) => source.replace(/from (['"])(\.[^'"]+)\1/g, (_, quote, target) => `from ${quote}${pathToFileURL(path.resolve(path.dirname(file), target)).href}${quote}`);
try {
  for (const [name, before, after, pattern] of [
    ['character-count', 'size += chunk.value.byteLength;', 'size += new TextDecoder().decode(chunk.value).length;', 'CR03'],
    ['remove-abort', 'signal: AbortSignal.timeout(config.nativeWorkerDispatchTimeoutMs),', '', 'CR04'],
  ]) {
    const source = fs.readFileSync(module, 'utf8');
    assert.equal(source.split(before).length, 2);
    const mutant = absolutize(source.replace(before, after), module);
    const file = path.join(temporary, `${name}.ts`); fs.writeFileSync(file, mutant);
    const runner = path.join(temporary, `${name}.mts`);
    const code = absolutize(fs.readFileSync(test, 'utf8'), test)
      .replace(pathToFileURL(module).href, pathToFileURL(file).href)
      .replace("new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url)", `new URL(${JSON.stringify(pathToFileURL(path.join(root, 'charts/kubeclaw/files/config/swarm.config.json')).href)})`);
    fs.writeFileSync(runner, code);
    const result = spawnSync(process.execPath, ['--test', `--test-name-pattern=${pattern}`, runner], { encoding: 'utf8', timeout: 20000 });
    fs.writeFileSync(path.join(out, `mutant-${name}.txt`), result.stdout + result.stderr);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /Missing expected rejection/);
    assert.doesNotMatch(result.stdout + result.stderr, /ERR_MODULE_NOT_FOUND/);
    console.log(JSON.stringify({ name, before, after, sha256: createHash('sha256').update(mutant).digest('hex'), exit: result.status, caught: 'Missing expected rejection in original HTTP behavior case' }));
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
