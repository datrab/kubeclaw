// Exact live Prism request CAPABILITY inventory. Never a documentary/non-API waiver.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import ts from 'typescript';
import {shellNativeNodeEntries} from './docs-shell-source-custody.mjs';
const profile={"source": "tests/verification/live/prism-production-failures.mjs", "sourceSha256": "5432b11d7888b1a9386ebbea0f3bc84379d64ac275ac995d1dc6de1d72665ab3", "statements": ["import assert from \"node:assert/strict\";", "import { execFileSync } from \"node:child_process\";", "import { readFileSync } from \"node:fs\";", "const namespace=process.env.PRISM_NAMESPACE;", "if(!namespace)throw new Error(\"PRISM_NAMESPACE is required\");", "const kubectl=(args,options={})=>execFileSync(\"kubectl\",[...args,\"-n\",namespace],{encoding:\"utf8\",stdio:options.stdio??\"pipe\"}).trim();"], "calls": ["kubectl([\"get\",\"pod\",\"-l\",\"app=prism-worker\",\"-o\",\"jsonpath={.items[0].metadata.name}\"])", "kubectl([\"delete\",\"pod\",workerPod,\"--wait=false\"])", "kubectl([\"rollout\",\"status\",\"deployment/prism-worker\",\"--timeout=10m\"])", "kubectl([\"get\",\"pod\",\"-l\",\"app=prism-postgresql\",\"-o\",\"jsonpath={.items[0].metadata.name}\"])", "kubectl([\"delete\",\"pod\",postgresPod,\"--wait=false\"])", "kubectl([\"rollout\",\"status\",\"statefulset/prism-postgresql\",\"--timeout=10m\"])", "kubectl([\"create\",\"job\",`--from=cronjob/prism-backup`,backup])", "kubectl([\"wait\",\"--for=condition=complete\",`job/${backup}`,\"--timeout=15m\"])", "kubectl([\"create\",\"job\",`--from=cronjob/prism-restore-proof`,restore])", "kubectl([\"wait\",\"--for=condition=complete\",`job/${restore}`,\"--timeout=15m\"])"], "entries": [{"name": "e2e:real:prism:failures", "command": "node tests/verification/live/prism-production-failures.mjs", "source": "tests/verification/live/prism-production-failures.mjs"}, {"name": "verify:prism:buster-fidelity:live", "command": "node tests/verification/live/prism-production-failures.mjs", "source": "tests/verification/live/prism-production-failures.mjs"}, {"name": "verify:prism:recovery:live", "command": "node tests/verification/live/prism-production-failures.mjs", "source": "tests/verification/live/prism-production-failures.mjs"}], "raw": [{"line": 6, "sink": "kubectl-request", "role": "unknown", "expression": "execFileSync(\"kubectl\",[...args,\"-n\",namespace],{encoding:\"utf8\",stdio:options.stdio??\"pipe\"})"}, {"line": 19, "sink": "console.log", "role": "non-api", "keys": ["checks", "finishedAt", "namespace", "skippedChecks", "startedAt", "status", "testVersion"], "basis": "fixed-source-root-properties"}], "publicEntries": [{"path": "tests/verification/live/prism-production-failures.mjs", "canonicalSource": "tests/verification/live/prism-production-failures.mjs"}]};
const adapterSource='scripts/docs-api-prism-native-request-capability.mjs';
const acquired=new WeakMap(),rawReceipts=new WeakMap();
const hash=x=>createHash('sha256').update(x).digest('hex'),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function read(root,source){const file=path.join(root,source);assert(fs.realpathSync(file)===file&&fs.lstatSync(file).isFile(),'PRISM_REQUEST_CAPABILITY_PHYSICAL');return fs.readFileSync(file);}
export function checkedPrismNativeRequestCapability(root,graph,sources,nativeEntries){
 if(!sources.includes(profile.source))return null;
 assert(path.isAbsolute(root)&&fs.realpathSync(root)===root,'PRISM_REQUEST_CAPABILITY_ROOT');
 const bytes=read(root,profile.source);assert.equal(hash(bytes),profile.sourceSha256,'PRISM_REQUEST_CAPABILITY_SOURCE');
 const tree=ts.createSourceFile(profile.source,bytes.toString(),ts.ScriptTarget.Latest,true);assert.equal(tree.parseDiagnostics.length,0);
 const statements=tree.statements.filter(n=>ts.isImportDeclaration(n)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['namespace','kubectl'].includes(d.name.getText(tree)))||ts.isIfStatement(n)&&n.expression.getText(tree)==='!namespace').map(n=>n.getText(tree));
 const calls=[];function visit(node){if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='kubectl')calls.push(node.getText(tree));ts.forEachChild(node,visit);}visit(tree);
 assert(equal(statements,profile.statements)&&calls.length===10&&equal(calls,profile.calls),'PRISM_REQUEST_CAPABILITY_EXACT_NATIVE_WRAPPER_CALLS');
 assert(graph&&equal(graph.edges.filter(e=>e.source===profile.source||e.target===profile.source),[])&&equal(graph.publicEntries.filter(e=>e.canonicalSource===profile.source||e.source===profile.source),profile.publicEntries)
  &&!graph.aliases.some(a=>JSON.stringify(a).includes(profile.source))&&!graph.dynamicOperations.some(a=>a.source===profile.source),'PRISM_REQUEST_CAPABILITY_CALLER_PUBLIC_DYNAMIC');
 assert(Array.isArray(nativeEntries),'PRISM_REQUEST_CAPABILITY_NATIVE_ENTRIES');
 const entries=nativeEntries.filter(e=>e.source===profile.source).map(({name,command,source})=>({name,command,source}));assert(equal(entries,profile.entries),'PRISM_REQUEST_CAPABILITY_ENTRY_ROSTER');
 const pkg=JSON.parse(read(root,'package.json'));assert(equal([pkg.bin??null,pkg.main??null,pkg.exports??null],[null,null,null]),'PRISM_REQUEST_CAPABILITY_PACKAGE_TARGET');
 for(const entry of entries){assert.equal(pkg.scripts?.[entry.name],entry.command,'PRISM_REQUEST_CAPABILITY_MAINTAINED_COMMAND');const parsed=shellNativeNodeEntries('package.json scripts.'+entry.name,entry.command);assert(parsed.length===1&&!parsed[0].nativeTest&&parsed[0].words.length===2&&parsed[0].words.every(w=>!w.expanded)&&parsed[0].words[0].value==='node'&&parsed[0].words[1].value===profile.source,'PRISM_REQUEST_CAPABILITY_DIRECT_NATIVE_NODE');}
 const dependencies=Object.freeze([profile.source,'package.json',adapterSource,'scripts/docs-shell-source-custody.mjs']);
 const pins=dependencies.map(source=>[source,hash(read(root,source))]);const recheck=()=>{for(const [source,sha]of pins)assert.equal(hash(read(root,source)),sha,'PRISM_REQUEST_CAPABILITY_CHANGED_INPUT');};
 const requests=Object.freeze(profile.calls.map((sourceCall,index)=>Object.freeze({index,sourceCall,remoteEffectsUnobserved:true,requestBodyUnobserved:true})));
 const receipt=Object.freeze({adapter:'exact-prism-live-native-kubectl-request-capability',rawRole:'unknown',apiCapability:true,remoteMutationsAndJobCreation:true,remoteEffectsUnobserved:true,requestBodiesLocallyConstructed:false,requests,dependencies,inputDigest:hash(JSON.stringify(pins)),witnessDigest:profile.sourceSha256,runtimeExecutionAuthorized:false,apiApplyAuthorized:false});
 acquired.set(receipt,{root,recheck});return receipt;
}
// Called only on the existing native classifier's original array, before all
// pass-through adapters/context clones. No runtime Source module is imported.
export function classifyPrismNativeRequestRoles(source,classify,receipt){
 const roles=classify(source);if(!receipt||source!==profile.source)return roles;
 const record=acquired.get(receipt);assert(record,'PRISM_REQUEST_CAPABILITY_UNACQUIRED');record.recheck();
 const raw=roles.map(({dependencies,...role})=>role);assert(equal(raw,profile.raw),'PRISM_REQUEST_CAPABILITY_CANONICAL_RAW_ROSTER');
 const role=roles.find(role=>role.line===6&&role.sink==='kubectl-request');assert(role&&role.role==='unknown');rawReceipts.set(role,{receipt,raw:JSON.stringify(role)});return roles;
}
export function selectedPrismNativeRequestCapability(source,role,receipt){
 if(!receipt||source!==profile.source||role.role!=='unknown')return null;
 const record=acquired.get(receipt);assert(record,'PRISM_REQUEST_CAPABILITY_UNACQUIRED');record.recheck();
 const proof=rawReceipts.get(role);
 if(proof?.receipt!==receipt||proof.raw!==JSON.stringify(role))return null;
 return receipt;
}
