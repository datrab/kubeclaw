// Generate an isolated test runner around original fixtures and production modules.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.cwd(), out=process.env.REVIEW_OUTPUT ?? path.join(root,'docs/review/evidence/report-adapter-deadline-independent-20260921');
const file=path.join(root,'tests/verification/contracts/check-pipeline-report-adapter-runtime.mts');
const source=fs.readFileSync(file,'utf8');
let head=source.slice(0,source.indexOf("const valid = registry.reportAdapters"))
 .replace(/from (['"])(\.[^'"]+)\1/g,(_,quote,target)=>`from ${quote}${pathToFileURL(path.resolve(path.dirname(file),target)).href}${quote}`);
if (process.env.REVIEW_RUNTIME) head=head.replace(pathToFileURL(path.join(root,'skills/buster/engine/src/index.ts')).href,pathToFileURL(process.env.REVIEW_RUNTIME).href);
const lifecycle=pathToFileURL(path.join(root,'skills/buster/engine/test-gates/process-input-lifecycle.ts')).href;
const processInput=pathToFileURL(path.join(root,'skills/buster/engine/test-gates/process-input.ts')).href;
const tail=`
const slow = registry.reportAdapters.get('example.slow-report:junit'); assert.ok(slow);
const originalCleanup = ProcessInputLifecycle.prototype.cleanup;
let cleanupCalls = 0;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
try {
  ProcessInputLifecycle.prototype.cleanup = async function() {
    cleanupCalls++; await originalCleanup.call(this); await pause(350);
  };
  const external = new AbortController(); const externalReason = new Error('REPORT_ADAPTER_TIMEOUT');
  const first = runtime.adapt(slow, artifact, { ...limits, timeoutMs: 300 }, external.signal);
  const firstTimer = setTimeout(() => external.abort(externalReason), 100);
  try { await assert.rejects(first, error => error instanceof Error && error.message === 'REPORT_ADAPTER_CANCELLED' && error.cause === externalReason); }
  finally { clearTimeout(firstTimer); }
  assert.equal(cleanupCalls, 1); assert.equal(fs.readdirSync(runtimeRoot).length, 0);
  console.log('PASS caller abort wins even after internal timer fires while real drained cleanup settlement is delayed');
  const laterExternal = new AbortController(); const laterReason = new Error('REPORT_ADAPTER_TIMEOUT');
  const second = runtime.adapt(slow, artifact, { ...limits, timeoutMs: 100 }, laterExternal.signal);
  const secondTimer = setTimeout(() => laterExternal.abort(laterReason), 200);
  try { await assert.rejects(second, error => error instanceof Error && error.message === 'REPORT_ADAPTER_TIMEOUT' && error !== laterReason); }
  finally { clearTimeout(secondTimer); }
  assert.equal(cleanupCalls, 2); assert.equal(fs.readdirSync(runtimeRoot).length, 0);
  console.log('PASS internal deadline wins despite a later caller abort during delayed real drained cleanup settlement');
  const injectedFailure = new Error('INDEPENDENT_INJECTED_CLEANUP_FAILURE_AFTER_REAL_DRAIN');
  ProcessInputLifecycle.prototype.cleanup = async function() {
    cleanupCalls++; await originalCleanup.call(this); throw injectedFailure;
  };
  await assert.rejects(runtime.adapt(slow, artifact, { ...limits, timeoutMs: 100 }), error =>
    error instanceof ProcessInputCleanupError && error.message === 'REPORT_ADAPTER_CLEANUP_FAILED'
    && error.errors.includes(injectedFailure) && error.cause instanceof Error && error.cause.message === 'REPORT_ADAPTER_CANCELLED');
  assert.equal(cleanupCalls, 3); assert.equal(fs.readdirSync(runtimeRoot).length, 1, 'unconfirmed cleanup retains exact snapshot');
  console.log('PASS injected cleanup failure stays distinct and retains snapshot; this is NOT an actual failed kernel drain');
} finally { ProcessInputLifecycle.prototype.cleanup = originalCleanup; fs.rmSync(workspace, { recursive: true, force: true }); }
`;
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'independent-adapter-deadline-'));
try {
 const runner=path.join(directory,'probe.mts');
 fs.writeFileSync(runner,`import { ProcessInputLifecycle } from ${JSON.stringify(lifecycle)};\nimport { ProcessInputCleanupError } from ${JSON.stringify(processInput)};\n`+head+tail);
 fs.writeFileSync(path.join(out,'executed-probe.mts.txt'),fs.readFileSync(runner));
 const result=spawnSync(process.execPath,[runner],{encoding:'utf8',timeout:15000});
 fs.writeFileSync(path.join(out,'probe.txt'),result.stdout+result.stderr);
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+result.stderr);
} finally { fs.rmSync(directory,{recursive:true,force:true}); }
