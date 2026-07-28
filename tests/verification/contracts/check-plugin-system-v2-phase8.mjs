import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(
  path.resolve('skills/common/plugin-runtime/core/src/index.ts'),
).href);

const packageRoot = 'skills/nova/plugins/delivery-lint';
for (const relative of [
  'plugin.json',
  'package.json',
  'README.md',
  'src/stage.ts',
  'schemas/config.schema.json',
  'schemas/input.schema.json',
  'schemas/result.schema.json',
  'fixtures/passing.json',
  'fixtures/remediation.json',
  'tests/live-function.test.ts',
  'tests/package-boundary.test.mjs',
]) {
  assert.equal(fs.existsSync(path.join(packageRoot, relative)), true, `missing package surface: ${relative}`);
}

for (const legacy of [
  'skills/nova/pipeline/services/module-validators.ts',
  'skills/nova/pipeline/services/validation-delivery.ts',
]) {
  assert.equal(fs.existsSync(legacy), false, `legacy delivery-lint owner must be absent: ${legacy}`);
}
const builtins = fs.readFileSync('skills/nova/pipeline/core/registry/builtins.ts', 'utf8');
assert.doesNotMatch(builtins, /builtin\.validator\.delivery_lint|runDeliveryLintValidatorStage/);
const retainedLint = fs.readFileSync(
  'skills/nova/pipeline/services/module-lint-validators.ts',
  'utf8',
);
assert.doesNotMatch(
  retainedLint,
  /delivery[_-]lint|SERVE_DOCKERFILE|STATIC_PATH_MISMATCH/,
  'retained pre-check/full-lint facade cannot own delivery-lint behavior',
);

const packageSource = fs.readFileSync(path.join(packageRoot, 'src/stage.ts'), 'utf8');
for (const outcome of ["outcome: 'passed'", "outcome: 'request_fix'", "outcome: 'blocked'"]) {
  assert.match(packageSource, new RegExp(outcome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(packageSource, /git\.repository\.read/);
assert.match(packageSource, /artifacts\.write/);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-lint-phase8-'));
const installed = path.join(temporary, 'delivery-lint');
fs.cpSync(packageRoot, installed, { recursive: true });
const discover = () => core.discoverPackages({
  installationRoots: [temporary],
  trustPolicy: {
    trustedBuiltinRoots: [temporary],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'phase8:delivery-lint',
  },
});
const firstInstall = discover();
assert.equal(firstInstall.length, 1);
assert.equal(firstInstall[0].manifest.id, 'kubeclaw.delivery-lint');
const originalDigest = firstInstall[0].provenance.package.contentDigest;
fs.appendFileSync(path.join(installed, 'README.md'), '\nReplacement build.\n');
const replacement = discover();
assert.equal(replacement.length, 1);
assert.notEqual(replacement[0].provenance.package.contentDigest, originalDigest);
fs.rmSync(installed, { recursive: true });
assert.equal(discover().length, 0, 'removing the package removes its registration without core imports');
fs.rmSync(temporary, { recursive: true, force: true });

console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-phase8' }));
