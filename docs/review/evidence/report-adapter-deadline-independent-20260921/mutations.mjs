import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(), out=path.join(root,'docs/review/evidence/report-adapter-deadline-independent-20260921');
const file=path.join(root,'skills/buster/engine/test-gates/report-adapter-runtime.ts');
const source=fs.readFileSync(file,'utf8');
const old="if (deadline.signal.aborted && boundedSignal.reason === deadline.signal.reason\n        && error instanceof Error && error.message === 'REPORT_ADAPTER_CANCELLED'\n        && error.cause === deadline.signal.reason) throw deadline.signal.reason;";
assert.ok(source.includes(old));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'adapter-review-mutants-')); fs.symlinkSync(path.join(root,'node_modules'),path.join(directory,'node_modules'));
try {
 for(const [name,changed] of [
  ['broad-deadline',source.replace(old,'if (deadline.signal.aborted) throw deadline.signal.reason;')],
  ['mask-cleanup',source.replace(old,"if (error instanceof ProcessInputCleanupError && deadline.signal.aborted) throw deadline.signal.reason;\n      "+old)],
 ]) {
  const target=path.join(directory,name+'.ts'), evidence=path.join(out,'mutant-'+name);fs.mkdirSync(evidence,{recursive:true});
  const resolved=changed.replace(/from (['"])(\.[^'"]+)\1/g,(_,q,specifier)=>`from ${q}${pathToFileURL(path.resolve(path.dirname(file),specifier)).href}${q}`)
   .replace("path.join(path.dirname(fileURLToPath(import.meta.url)), 'report-adapter-child.mjs')",JSON.stringify(path.join(path.dirname(file),'report-adapter-child.mjs')));
  fs.writeFileSync(target,resolved);
  const result=spawnSync(process.execPath,[path.join(out,'probe.mjs')],{encoding:'utf8',timeout:20000,env:{...process.env,REVIEW_RUNTIME:target,REVIEW_OUTPUT:evidence}});
  fs.writeFileSync(path.join(evidence,'runner.txt'),result.stdout+result.stderr);
  const detail=fs.readFileSync(path.join(evidence,'probe.txt'),'utf8');
  assert.equal(result.error,undefined);assert.equal(result.status,1);assert.match(detail,/validation function is expected to return/);assert.doesNotMatch(detail,/ERR_MODULE_NOT_FOUND/);
  console.log(JSON.stringify({name,sha256:createHash('sha256').update(resolved).digest('hex'),caught:true,reason:'Original independent classification/cleanup oracle rejects mutated behavior'}));
 }
} finally {fs.rmSync(directory,{recursive:true,force:true});}
