import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';

const storageRoot=fs.mkdtempSync(path.join(os.tmpdir(),'nova-run-root-test-'));
assert.notEqual(runRoot(storageRoot,'run:valid-1'),runRoot(storageRoot,'run_valid-1'));
assert.ok(path.basename(runRoot(storageRoot,`r${'a'.repeat(255)}`)).length<255);
for(const invalid of ['../escape','/absolute','run/child','run\\child','.','']){
  assert.throws(()=>runRoot(storageRoot,invalid),/PIPELINE_RUN_ID_INVALID/u);
}
const legacy=path.join(storageRoot,'runs','legacy_run');
fs.mkdirSync(legacy,{recursive:true});
fs.writeFileSync(path.join(legacy,'events.jsonl'),`${JSON.stringify({entry:{identity:{runId:'legacy:run'}}})}\n`);
assert.equal(runRoot(storageRoot,'legacy:run'),legacy);
assert.notEqual(runRoot(storageRoot,'legacy_run'),legacy);
fs.rmSync(storageRoot,{recursive:true,force:true});
console.log('nova run-root validation passed');
