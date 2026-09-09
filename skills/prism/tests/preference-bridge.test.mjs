import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {setTimeout as delay} from "node:timers/promises";

test("original bridge forwards persisted preference identities to the OpenClaw process boundary", async()=>{
 const temporary=await mkdtemp(join(tmpdir(),"prism-preference-bridge-"));
 const socket=createServer(); await new Promise(resolve=>socket.listen(0,"127.0.0.1",resolve));
 const port=socket.address().port; await new Promise(resolve=>socket.close(resolve));
 // Explicit process recorder: no model/provider behavior is simulated or claimed.
 await writeFile(join(temporary,"openclaw"),`#!/usr/bin/env node\nrequire('node:fs').appendFileSync(process.env.CAPTURE_PATH,JSON.stringify(process.argv.slice(2))+'\\n');\n`,{mode:0o755});
 const capture=join(temporary,"calls.jsonl");
 const child=spawn(process.execPath,["skills/prism/server/agent-bridge.mjs"],{env:{...process.env,PORT:String(port),PATH:`${temporary}:${process.env.PATH}`,CAPTURE_PATH:capture},stdio:"pipe"});
 try {
  const url=`http://127.0.0.1:${port}`;
  for(let attempt=0;attempt<100;attempt++) {try {if((await fetch(`${url}/ready`)).ok)break;}catch{} await delay(20);}
  const preferences={generationId:"generation-one",snapshotDigest:"sha256:exact-evidence",request:{architecture:"immutable-round-source"},snapshot:{subjectId:"user-one",projectId:"project-two",personalEnabled:true,effective:{dense:{score:1}},events:[{eventId:"personal-from-project-one",projectId:"project-one"}]}};
  const response=await fetch(`${url}/v1/design-set`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId:"project-two",request:{architecture:"untrusted-payload-source"},preferences})});
  assert.equal(response.status,202); assert.equal((await response.json()).generationId,preferences.generationId);
  let lines="";for(let attempt=0;attempt<100;attempt++){try{lines=await readFile(capture,"utf8");if(lines)break;}catch{}await delay(20);}
  const args=JSON.parse(lines.trim());const prompt=args[args.indexOf("--message")+1];
  assert.match(prompt,/immutable-round-source/);assert.doesNotMatch(prompt,/untrusted-payload-source/);
  assert.match(prompt,/personal-from-project-one/);assert.match(prompt,/generation-one/);assert.match(prompt,/sha256:exact-evidence/);
  const replay=await fetch(`${url}/v1/design-set`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId:"project-two",preferences:{...preferences,result:{status:"created",documentId:"persisted-document"}}})});
  assert.equal(replay.status,202);assert.equal((await replay.json()).result.documentId,"persisted-document");
  await delay(50);assert.equal((await readFile(capture,"utf8")).trim().split("\n").length,1,"committed start replay does not invoke the agent again");
  assert.equal((await fetch(`${url}/v1/design-set`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId:"project-two",request:{}})})).status,422);
 } finally {child.kill();await new Promise(resolve=>child.once("exit",resolve));await rm(temporary,{recursive:true,force:true});}
});
