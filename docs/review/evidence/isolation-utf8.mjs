import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {runIsolationSession} from '../../../skills/common/plugin-runtime/foundation/isolation/session.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-wire-'));
const modulePath=path.join(root,'plugin.mjs');
// Original child and host protocol, deliberately split valid UTF-8 at a byte boundary.
// No sandbox claim: this test isolates transport correctness only.
fs.writeFileSync(modulePath, `export async function execute(){
 const bytes=Buffer.from(JSON.stringify({kind:'result',value:'😀'})+'\\n');
 const split=bytes.indexOf(Buffer.from('😀'))+1;
 process.stdout.write(bytes.subarray(0,split));
 await new Promise(r=>setTimeout(r,30));
 process.stdout.write(bytes.subarray(split));
 await new Promise(()=>{});
}`);
const child=spawn(process.execPath,['skills/common/plugin-runtime/foundation/isolation/child.mjs'],{stdio:['pipe','pipe','pipe']});
try{
 const value=await runIsolationSession({child,wallTimeMs:2000,context:{invoke:async()=>{throw Error('unused')},emit:async()=>{throw Error('unused')}},invocationMessage:{kind:'invoke',surface:'stage',modulePath,exportName:'execute',argument:{},context:{artifacts:[]}}});
 assert.notEqual(value,'😀');console.log(JSON.stringify({expected:'😀',observed:value,actualCodepoints:[...value].map(v=>v.codePointAt(0))}));
}finally{child.kill('SIGKILL');fs.rmSync(root,{recursive:true,force:true});}
