import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const moduleUrl = new URL('../../../../../skills/prism/engine/worker-envelope.ts', import.meta.url).href;
const code = `try {
  const m = await import(${JSON.stringify(moduleUrl)});
  console.log(JSON.stringify({engine:m.prismNativeWorkerProfile.engine,profileDigest:m.prismNativeWorkerProfile.profileDigest}));
} catch (error) { console.log(JSON.stringify({error:error.message})); }`;
const results = [];
const run = (mode, digest) => {
  const environment = {PATH:process.env.PATH, NODE_ENV:mode};
  if (digest !== undefined) environment.PRISM_ENGINE_CONTENT_DIGEST = digest;
  return JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{env:environment,encoding:'utf8'}));
};
for (const [name,digest] of [['absent',undefined],['malformed','not-a-digest']]) {
  const observed = run('production',digest);
  assert.equal(observed.error,'PRISM_NATIVE_ENGINE_CONTENT_IDENTITY_REQUIRED');
  results.push({id:`production-${name}-rejection`,observed,result:'passed'});
}
const a = run('production',`sha256:${'a'.repeat(64)}`);
const b = run('production',`sha256:${'b'.repeat(64)}`);
assert.equal(a.engine.contentDigest,`sha256:${'a'.repeat(64)}`);
assert.equal(b.engine.contentDigest,`sha256:${'b'.repeat(64)}`);
assert.notEqual(a.profileDigest,b.profileDigest);
results.push({id:'opaque-projected-digest-changes-profile',observed:{A:a,B:b},result:'passed'});
const dev = run('test',undefined);
assert.match(dev.engine.contentDigest,/^sha256:[a-f0-9]{64}$/u);
assert.notEqual(dev.engine.contentDigest,a.engine.contentDigest);
results.push({id:'development-synthetic-identity',observed:dev,result:'passed'});
const paths = [import.meta.filename,'skills/prism/engine/worker-envelope.ts','skills/prism/config/native-worker.ts','charts/prism/templates/workloads.yaml','package-lock.json'];
console.log(JSON.stringify({identity:{node:process.version,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),sources:paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))},results,limits:'Actual current module import/profile digest controls; A/B are synthetic format-valid inputs, NOT real OCI images or packaged code-tree hashes. Development synthetic fallback is not production content proof. No image/API/service/worker executed.'},null,2));
