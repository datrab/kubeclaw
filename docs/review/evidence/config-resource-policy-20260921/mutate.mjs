import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = process.cwd(), output = path.join(root, 'docs/review/evidence/config-resource-policy-20260921');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-resource-mutant-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'));
function absolute(source, file) {
  return source.replace(/from (['"])(\.[^'"]+)\1/g, (_, quote, target) => `from ${quote}${pathToFileURL(path.resolve(path.dirname(file), target)).href}${quote}`)
    .replace("new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url)", `new URL(${JSON.stringify(pathToFileURL(path.join(root, 'charts/kubeclaw/files/config/swarm.config.json')).href)})`);
}
try {
  const producer = path.join(root, 'skills/prism/engine/worker-envelope.ts');
  const operation = path.join(root, 'skills/prism/control/native-operation.ts');
  const admission = path.join(root, 'skills/prism/config/resource-policy.ts');
  for (const [name, module, old, replacement, originalTest, pattern] of [
    ['producer-default', producer, 'limit: policy.cpuTimeMs', 'limit: 60000', 'skills/prism/tests/swarm-resource-operation.test.mts', 'CP03'],
    ['pool-bypass', admission, 'policy[metric] > pool[metric]', 'false', 'skills/prism/tests/swarm-resource-policy.test.mts', 'CP04'],
    ['admission-bypass', admission, '!recovered && budget.limit > maximum', 'false', 'skills/prism/tests/swarm-resource-policy.test.mts', 'CP04'],
  ]) {
    const source = fs.readFileSync(module, 'utf8'); assert.ok(source.includes(old));
    const target = path.join(directory, `${name}.ts`); fs.writeFileSync(target, absolute(source.replace(old, replacement), module));
    let importBefore = pathToFileURL(module).href, importAfter = pathToFileURL(target).href;
    if (module === producer) {
      const changed = path.join(directory, 'operation.ts');
      fs.writeFileSync(changed, absolute(fs.readFileSync(operation, 'utf8'), operation).replace(importBefore, importAfter));
      importBefore = pathToFileURL(operation).href; importAfter = pathToFileURL(changed).href;
    }
    const file = path.join(root, originalTest), runner = path.join(directory, `${name}.mts`);
    fs.writeFileSync(runner, absolute(fs.readFileSync(file, 'utf8'), file).replace(importBefore, importAfter));
    const result = spawnSync(process.execPath, ['--test', `--test-name-pattern=${pattern}`, runner], { encoding: 'utf8', timeout: 40000 });
    fs.writeFileSync(path.join(output, `mutant-${name}.txt`), result.stdout + result.stderr);
    assert.equal(result.error, undefined); assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /AssertionError|Missing expected exception/);
    assert.doesNotMatch(result.stdout + result.stderr, /ERR_MODULE_NOT_FOUND/);
    console.log(JSON.stringify({ name, old, replacement, status: result.status, semanticAssertionDetected: true }));
  }
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
