import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import {runDocumentationInputs} from '../docs-memory-inputs.mjs';
import {reviewedImporterResolutionOperation,assertDocumentationExecutableRole} from '../docs-api-documentation-role-custody.mjs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {shellSelectedFiniteReceiverProof,shellSelectedDeploymentConfigurationReceiverProof,shellSelectedAliasedApiRequestProof,discoverShellOutputRoleClassifications,shellSelectedDeploymentReceiptReceiverProof,shellSelectedHostReceiverProof,shellSelectedDatabaseReceiverProof,shellSelectedSecretReceiverProof,shellExternalOutputBoundary,discoverShellExternalOutputBoundaries,shellNativePolicyValidationProof,shellDeploymentConfigurationOccurrenceProof,shellImmediatePathReceiverQualified,runtimeAdoptionManifestInputAuthority,nativeOutputConsumerMatches,documentationModuleInputAuthority,discoverScriptApiOutputs,discoverScriptOutputRoleClassifications,discoverTransformedApiOutputs,discoverShellApiOutputs,producerAdapterOperationRecipe,shellRawOutputSinks,shellRawOutputOperationRecipe} from '../docs-api-output-discovery.mjs';
import {classifySerializedOutputRoles,serializedOutputSinkSites,deriveNativeOperationFacts,nativeOperationFactDigest} from '../docs-api-output-role-classification.mjs';
import {shellHeredocCustody,shellCommandAcquisitions} from '../docs-shell-source-custody.mjs';
import {renderShellExternalOutputBoundaries} from '../docs-api-reference.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const secret="const body={apiVersion:'v1',kind:'Secret',metadata:{name:'custody'}};console.log(JSON.stringify(body));\n";
function fixture(run){const root=fs.mkdtempSync(path.join(os.tmpdir(),'docs-output-custody-'));const write=(file,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);};write('package.json','{"scripts":{}}');try{run({root,write,discover:()=>discoverScriptApiOutputs(root)});}finally{fs.rmSync(root,{recursive:true,force:true});}}

test('sink location discovery conservatively retains classified writers without assigning roles',()=>fixture(({root,write})=>{
 const source='tools/p.mjs';
 for(const bytes of [secret,"import {writeFileSync as save} from 'node:fs';save('out',process.argv[2]);",'const emit=process.stdout.write;emit(process.env.PAYLOAD);',"export function serialize(value){return JSON.stringify(value);}","import fs from 'node:fs';const stream=fs.createWriteStream('out');stream.end(process.env.PAYLOAD);"]){
  write(source,bytes);const sites=serializedOutputSinkSites(root,source),roles=classifySerializedOutputRoles(root,source);
  assert(sites.length>0);assert(sites.every(site=>!('role'in site)&&Object.keys(site).sort().join(',')==='line,sink'));
  for(const role of roles)assert(sites.some(site=>site.line===role.line&&site.sink===role.sink),'classified writer lost from conservative selection');
 }
 write(source,secret);assert.equal(classifySerializedOutputRoles(root,source)[0].role,'api');
 write(source,'process.stdout.write(process.env.PAYLOAD);');assert.equal(classifySerializedOutputRoles(root,source)[0].role,'unknown');
}));

test('closed bundle writer retains its API capability and projects every payload caller',()=>fixture(({root,write})=>{
 const source='scripts/build-runtime-role-bundle.mjs';
 write(source,fs.readFileSync(new URL('../build-runtime-role-bundle.mjs',import.meta.url),'utf8'));
 const roles=classifySerializedOutputRoles(root,source),utility=roles.find(role=>role.role==='api-capable-utility');
 assert(utility,'private declaration must not be labelled non-API');
 assert.equal(utility.closedWriterDeclaration.projectedCallers.length,3);
 const calls=roles.filter(role=>role.sink==='native-file-writer-call');
 assert.equal(calls.length,3);
 assert(calls.some(role=>role.role==='unknown'&&role.expression==='fs.readFileSync(source)'), 'opaque copied bytes must remain unknown');
 assert(calls.some(role=>role.role==='unknown'&&role.line===246&&role.expression==='facade'), 'missing facade input bindings must remain unknown');
 assert.equal(calls.find(role=>role.line===267).role,'non-api','fixed manifest constructor has no API root identity');
 const sites=serializedOutputSinkSites(root,source);
 for(const role of roles)assert(sites.some(site=>site.line===role.line&&site.sink===role.sink));
}));

test('changed or escaping bundle writers cannot refresh a private projection into authority',()=>fixture(({root,write})=>{
 const source='scripts/build-runtime-role-bundle.mjs',original=fs.readFileSync(new URL('../build-runtime-role-bundle.mjs',import.meta.url),'utf8');
 for(const changed of [original.replace('function writeFile(', 'export function writeFile('),original+'\nconst escapedWriter=writeFile;\n',original+"\nwriteFile('extra.json',JSON.stringify({apiVersion:'v1',kind:'Secret'}));\n",original.replace('fs.writeFileSync(target, content, { mode });',"fs.writeFileSync(target,JSON.stringify({apiVersion:'v1',kind:'Secret'}),{mode});")]){
  write(source,changed);
  const roles=classifySerializedOutputRoles(root,source);
  assert(!roles.some(role=>role.role==='api-capable-utility'),'changed source retained a reviewed private projection');
  assert(roles.some(role=>role.role==='unknown'||role.role==='api'),'API-bearing or unresolved writer disappeared');
 }
}));

test('an operation receipt cannot forge a projected API-capable utility',()=>fixture(({root,write})=>{
 const source='tools/projection.mjs',expression="'complete'";
 write(source,"console.log('complete');\n");
 const selectors=[{expression}],facts=deriveNativeOperationFacts(root,source,selectors);
 assert(facts);
 write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({nonApiOutputContracts:[{source,sink:'console.log',expression,role:'api-capable-utility',basis:'forged-private-projection',operations:[{source,selectors,factsDigest:nativeOperationFactDigest(facts)}]}]}));
 assert.throws(()=>classifySerializedOutputRoles(root,source),/OUTPUT_ROLE_CLOSED_WRITER_PROJECTION_UNQUALIFIED/);
}));

test('bundle facade construction binds all three role values without qualifying source copies or imports',()=>fixture(({root,write})=>{
 const source='scripts/build-runtime-role-bundle.mjs';
 write(source,fs.readFileSync(new URL('../build-runtime-role-bundle.mjs',import.meta.url),'utf8'));
 for(const role of ['nova','buster','prism'])write(`packaging/runtime/roles/${role}.json`,fs.readFileSync(new URL(`../../packaging/runtime/roles/${role}.json`,import.meta.url),'utf8'));
 const classify=()=>classifySerializedOutputRoles(root,source),facade=classify().find(role=>role.constructor==='facadeLines');
 assert(facade);assert.equal(facade.role,'non-api');assert.equal(facade.inputs.length,3);
 assert.equal(facade.runtimeImportsAuthorized,false);assert.equal(facade.runtimeExecutionAuthorized,false);
 assert(classify().some(role=>role.role==='unknown'&&role.expression==='fs.readFileSync(source)'));
 const file='packaging/runtime/roles/nova.json',original=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 for(const value of ['@unreviewed/runtime',"x\n---\napiVersion: v1\nkind: Secret"]){
  write(file,JSON.stringify({...original,entrypoint:{...original.entrypoint,import:value}}));
  const roles=classify();
  assert(!roles.some(role=>role.constructor==='facadeLines'),'changed entrypoint retained facade construction authority');
  assert(roles.some(role=>role.role==='unknown'&&role.line===246&&role.expression==='facade'));
 }
 const selectors=[{expression:'facade'}],facts=deriveNativeOperationFacts(root,source,selectors);assert(facts);
 write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({nonApiOutputContracts:[{source,sink:'native-file-writer-call',expression:'facade',role:'non-api',basis:'refreshed-but-unreviewed-role-input',operations:[{source,selectors,factsDigest:nativeOperationFactDigest(facts)}]}]}));
 assert(classify().some(role=>role.role==='unknown'&&role.line===246&&role.expression==='facade'),'refreshed operation metadata laundered changed role values');
}));

test('Ops Helm source checksum stays a hash-check input, not a generic Docker writer exemption',()=>fixture(({write,discover})=>{
 const checksum='RUN printf \'%s  source.tar.gz\\n\' "$OPS_HELM_SOURCE_SHA256" | sha256sum -c -\n';
 write('ops/pod/Dockerfile',checksum);assert.deepEqual(discover(),[]);
 for(const changed of [checksum.replace('OPS_HELM_SOURCE_SHA256','UNREVIEWED'),checksum.replace('sha256sum -c -','kubectl apply -f -'),checksum+"RUN echo '{\"apiVersion\":\"v1\",\"kind\":\"Secret\"}'\n"]){write('ops/pod/Dockerfile',changed);assert.throws(discover,/API_PRODUCT_PRODUCER_LANGUAGE_UNQUALIFIED.*ops\/pod\/Dockerfile/);}
}));

test('live-check diagnostic roles bind complete readonly source and cannot be refreshed into API output',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),source='scripts/check-runtime-adoption-live.py';
 const bytes=fs.readFileSync(path.join(repository,source),'utf8');write(source,bytes);
 const parse=()=>{const r=spawnSync('python3',[path.join(repository,'scripts/docs-api-python-output-adapter.py'),path.join(root,source),'--classify'],{encoding:'utf8',maxBuffer:1024*1024});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 const outputs=parse(),contracts=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json'))).nativeLanguageSerializationContracts.find(r=>r.source===source).outputs;
 assert.equal(outputs.filter(x=>x.role==='unknown').length,10);
 const metadata=runtimeAdoptionManifestInputAuthority(root,source,bytes);
 assert.equal(metadata.metadataOnly,true);assert.equal(metadata.runtimeExecutionAuthorized,false);assert.equal(metadata.runtimeInputBytesQualified,false);assert.equal(metadata.selectedManifestIsRepositorySource,false);assert(Object.isFrozen(metadata));
 for(const output of outputs.filter(x=>x.role==='unknown'))assert(nativeOutputConsumerMatches(output,contracts,root));
 assert(!nativeOutputConsumerMatches({...outputs.find(x=>x.role==='unknown'),role:'api'},contracts,root));
 for(const changed of [bytes.replace("'--dry-run=server', ",''),bytes.replace("'volumeClaimTemplates'","'apiVersion', 'kind'"),bytes+"\nprint(json.dumps({'apiVersion':'v1','kind':'Secret'}))\n"]){
  assert.notEqual(changed,bytes);write(source,changed);const actual=parse();
  assert.equal(runtimeAdoptionManifestInputAuthority(root,source,changed),null);
  const refreshed=actual.map(output=>({expression:output.expression,function:output.function,operationDigest:sha(output.operation),consumer:contracts[0].consumer}));
  assert(actual.some(output=>output.role==='unknown'&&!nativeOutputConsumerMatches(output,refreshed,root)));
  for(const output of actual.filter(x=>x.role==='api'))assert(!nativeOutputConsumerMatches(output,refreshed,root));
 }
 write(source,bytes);
 write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({nativeLanguageSerializationContracts:[{source,language:'Python',outputs:contracts}]}));
 assert.deepEqual(discoverScriptApiOutputs(root),[],'consumer metadata must not execute the live helper or invent exported-manifest resource bytes');
 write('tools/unreviewed.py',"import json\nprint(json.dumps({'apiVersion':'v1','kind':'Secret'}))\n");
 assert.throws(()=>discoverScriptApiOutputs(root),/PYTHON_SERIALIZED_OUTPUT_ROLE_UNQUALIFIED.*tools\/unreviewed.py/);
}));

test('auxiliary Python receipts distinguish AST, policy-probe and JSON-RPC metadata from API writers',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname);
 const registry=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json')));
 for(const source of ['scripts/docs-api-python-ast-v1.py','scripts/verify-cilium-policies.py','ops/pod/verify.py']){
  const bytes=fs.readFileSync(path.join(repository,source),'utf8');write(source,bytes);
  const parsed=spawnSync('python3',[path.join(repository,'scripts/docs-api-python-output-adapter.py'),path.join(root,source),'--classify'],{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(parsed.status,0,parsed.stderr);
  const outputs=JSON.parse(parsed.stdout).filter(x=>x.role==='unknown'),contracts=registry.nativeLanguageSerializationContracts.find(r=>r.source===source).outputs;
  assert(outputs.length>0);for(const output of outputs){assert(nativeOutputConsumerMatches(output,contracts,root));assert(!nativeOutputConsumerMatches({...output,role:'api'},contracts,root));}
  write(source,bytes+"\nprint(json.dumps({'apiVersion':'v1','kind':'Secret'}))\n");
  for(const output of outputs)assert(!nativeOutputConsumerMatches(output,contracts,root),'complete source changed without Source approval');
  write(source,bytes);const arbitrary={...outputs[0],expression:"print(json.dumps({'apiVersion':'v1','kind':'Secret'}))"};
  const refreshed=[{...contracts[0],expression:arbitrary.expression,operationDigest:sha(arbitrary.operation)}];assert(!nativeOutputConsumerMatches(arbitrary,refreshed,root));
 }
}));

test('node module builtin-name projections preserve API discovery and reject loader escapes',()=>fixture(({write,discover})=>{
 for(const binding of ["import module from 'node:module';", "import * as module from 'node:module';"]){
  for(const projection of ['module.builtinModules', "module['builtinModules']"]){
   write('tools/p.mjs',binding+`const names=new Set([...${projection},...${projection}.map(name=>'node:'+name)]);`+secret);
   assert.equal(discover()[0].value.kind,'Secret');
  }
  for(const operation of ['module[process.argv[2]]','module.unknown','consume(module)','const load=module.createRequire(import.meta.url);load(process.argv[2])',"import(process.argv[2])"]){
   write('tools/p.mjs',binding+operation+';'+secret);
   assert.throws(discover,/DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED/);
  }
 }
}));

test('current documentation checker role binds exported link parser, helper and guarded invocation',()=>fixture(({root,write})=>{
 const source='scripts/docs-check.mjs',helper='scripts/lib/docs-markdown-anchors.mjs';
 const original=fs.readFileSync(new URL('../docs-check.mjs',import.meta.url),'utf8');
 const helperBytes=fs.readFileSync(new URL('../lib/docs-markdown-anchors.mjs',import.meta.url),'utf8');
 write(source,original);write(helper,helperBytes);
 assert.doesNotThrow(()=>assertDocumentationExecutableRole(root,source));
 for(const [before,after]of [
  ["stripFencedCodeAndComments(text)","text"],
  ["path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)","true"],
  ["console.log(`docs check passed (${files.length} active markdown files)`)","console.log(JSON.stringify({apiVersion:'v1',kind:'Secret'}))"],
 ]){
  assert(original.includes(before),before);write(source,original.replace(before,after));
  assert.throws(()=>assertDocumentationExecutableRole(root,source),/DOCUMENTATION_TOOL_OUTPUT_ROLE_UNQUALIFIED/);
  write(source,original);assertDocumentationExecutableRole(root,source);
 }
 write(helper,helperBytes.replace('return stripBlockCodeAndComments(value);',"return process.env.UNREVIEWED_TEXT;"));
 assert.notEqual(fs.readFileSync(path.join(root,helper),'utf8'),helperBytes);
 assert.throws(()=>assertDocumentationExecutableRole(root,source),/DOCUMENTATION_TOOL_OUTPUT_ROLE_UNQUALIFIED/);
}));

test('native ESM keeps actual .js authority, explicit .ts neighbors, creation and removal custody',()=>fixture(({root,write,discover})=>{
 write('tools/gateway.mjs',"import '../examples/p.js';");write('examples/p.ts',secret);
 const native=spawnSync(process.execPath,[path.join(root,'tools/gateway.mjs')],{encoding:'utf8'});assert.equal(native.status,1);assert.match(native.stderr,/ERR_MODULE_NOT_FOUND/);assert.throws(discover,/GRAPH_UNQUALIFIED.*tools\/gateway\.mjs/);
 write('examples/p.js',secret);assert.equal(discover()[0].context.path,'examples/p.js');fs.rmSync(path.join(root,'examples/p.js'));assert.throws(discover,/GRAPH_UNQUALIFIED.*tools\/gateway\.mjs/);
 write('tools/gateway.mjs',"import '../examples/p.ts';");assert.equal(discover()[0].context.path,'examples/p.ts');
}));

test('scalar and guard exemptions revoke direct and captured caller-time binding writes',()=>{
 for(const body of ["let out='safe';out=process.argv[2];console.log(out);","let out='safe';if(typeof out !== 'string')throw Error('bad');out=process.argv[2];console.log(out);","let out='safe';function produce(){console.log(out);}out=process.argv[2];produce();","let out='safe';function produce(){if(typeof out!=='string')throw Error('bad');console.log(out);}out=process.argv[2];produce();"]){fixture(({root,write,discover})=>{write('tools/p.mjs',body);const native=spawnSync(process.execPath,[path.join(root,'tools/p.mjs'),'{"apiVersion":"v1","kind":"Secret"}'],{encoding:'utf8'});assert.equal(native.status,0,native.stderr);assert.equal(JSON.parse(native.stdout).kind,'Secret');assert.equal(classifySerializedOutputRoles(root,'tools/p.mjs')[0].role,'unknown');assert.throws(discover,/OUTPUT_ROLE_UNQUALIFIED.*tools\/p\.mjs/);});}
 fixture(({root,write,discover})=>{write('tools/p.mjs',"let out='safe';function produce(){console.log(out);}produce();");assert.equal(classifySerializedOutputRoles(root,'tools/p.mjs')[0].role,'non-api');assert.deepEqual(discover(),[]);});
});

test('reached initialization effects and caller writes bind facts, unused siblings remain passive',()=>fixture(({root,write})=>{
 const file='tools/state.mjs',selectors=[{expression:'console.log(JSON.stringify(out))'}];
 const baseline="let out={diagnostic:true};function produce(){console.log(JSON.stringify(out));}produce();";write(file,baseline);const before=deriveNativeOperationFacts(root,file,selectors);
 write(file,baseline.replace('produce();','out=process.argv[2];produce();'));const after=deriveNativeOperationFacts(root,file,selectors);assert.notEqual(nativeOperationFactDigest(before),nativeOperationFactDigest(after));assert(after.some(fact=>fact.kind==='ExpressionStatement'));
 write(file,baseline+'function unused(){return 1;}');assert.equal(nativeOperationFactDigest(before),nativeOperationFactDigest(deriveNativeOperationFacts(root,file,selectors)));
 write(file,"const ajv=new Validator();addFormats(ajv);const schema={id:'v2'};ajv.addSchema(schema);export function validate(value){return ajv.compile(schema.id)(value);}");const initial=deriveNativeOperationFacts(root,file,[{symbol:'validate'}]);write(file,fs.readFileSync(path.join(root,file),'utf8').replace('addFormats(ajv);',''));assert.notEqual(nativeOperationFactDigest(initial),nativeOperationFactDigest(deriveNativeOperationFacts(root,file,[{symbol:'validate'}])));
}));

test('heredoc closure uses exact << and tab-only <<- native boundaries',()=>{
 for(const operator of ['<<','<<-'])for(const prefix of ['',' ','\t']){const bytes=`cat ${operator}'END'\ntext\n${prefix}END\n`;const native=spawnSync('bash',['-c',bytes],{encoding:'utf8'});assert.equal(native.status,0);const valid=prefix===''||operator==='<<-'&&prefix==='\t';if(valid){assert.equal(native.stdout,'text\n');assert.equal(shellHeredocCustody('tools/p.sh',bytes).heredocs[0].body,'text');assert.deepEqual(shellRawOutputSinks('tools/p.sh',bytes),[]);}else{assert.match(native.stderr,/here-document/);assert.throws(()=>shellHeredocCustody('tools/p.sh',bytes),/SHELL_HEREDOC_CUSTODY_UNQUALIFIED: tools\/p.sh:1/);assert.throws(()=>shellRawOutputOperationRecipe('tools/p.sh',bytes),/SHELL_HEREDOC_CUSTODY_UNQUALIFIED/);}}
 for(const closing of ['END ','END\t'])assert.throws(()=>shellHeredocCustody('trailing.sh',`cat <<END\nx\n${closing}\n`),/unterminated/);
 const tabs=shellHeredocCustody('tabs.sh','cat <<-END\n\tx\n\tEND\n');assert.equal(tabs.heredocs[0].body,'x');assert.throws(()=>shellHeredocCustody('unsupported.sh','node <<"D-X"\nx\nD-X\n'),/unsupported literal delimiter/);
});

test('raw substitution custody preserves original heredoc bytes and rejects malformed closure',()=>{
 const bytes=`patch=$(python3 - "$claim" <<'PY'\nprint("fake ) $(hidden-emitter) apiVersion: v1")\nPY\n)\nunknown-emitter "$patch"\n`;
 const sinks=shellRawOutputSinks('nested.sh',bytes);
 assert.deepEqual(sinks,[{line:1,command:'python3',args:['-','$claim','<<','PY'],channel:'command-substitution'},{line:5,command:'unknown-emitter',args:['$patch']}]);
 const unicode=bytes.replace('fake )','🔭🔭 fake )');
 assert.equal(shellHeredocCustody('unicode.sh',unicode).shell.length,unicode.length);
 assert.deepEqual(shellRawOutputSinks('unicode.sh',unicode),sinks);
 assert.throws(()=>shellRawOutputSinks('nested.sh',bytes.replace('\nPY\n','\n PY\n')),/SHELL_HEREDOC_CUSTODY_UNQUALIFIED/);
 assert.throws(()=>shellRawOutputSinks('nested.sh',bytes.replace('\n)\n','\n')),/unterminated substitution/);
 const actual=fs.readFileSync(new URL('../remove-qdrant.sh',import.meta.url),'utf8');
 assert(shellRawOutputSinks('scripts/remove-qdrant.sh',actual).some(sink=>sink.command==='python3'&&sink.channel==='command-substitution'&&sink.args.includes('$uid')));
});

test('finite command custody selects actual argv and final fd0, not quoted or commented neighbors',()=>{
 const bytes=`# node -e 'process.env.PASSIVE'\necho "node -e process.env.PASSIVE"\nvalue=$(node -e 'process.env.ACTIVE')\nnode - 3<<A <<B <input\nunused\nA\nselected\nB\n`;
 const custody=shellCommandAcquisitions('tools/p.sh',bytes);assert.equal(custody.commands.filter(command=>command.words[0]?.value==='node').length,2);assert(custody.commands.some(command=>command.channel==='command-substitution'&&command.words[0]?.value==='node'));assert.deepEqual(custody.heredocs.map(body=>body.selectedStdin),[false,false]);assert.deepEqual(custody.heredocs.map(body=>body.fd),[3,0]);assert.doesNotThrow(()=>shellHeredocCustody('here-string.sh','read -r value <<<"$input"\n'));
});

test('outside-root public main, exports, bin and actual Node commands independently publish finite closure',()=>{
 for(const surface of ['main','exports','bin','script'])fixture(({root,write,discover})=>{write('examples/p.mjs',secret);write('examples/entry.mjs',"import './p.mjs';");const pkg=surface==='script'?{scripts:{'run:product':'node examples/entry.mjs'}}:{scripts:{},[surface]:surface==='bin'?{cli:'./examples/entry.mjs'}:'./examples/entry.mjs'};write('package.json',JSON.stringify(pkg));const native=spawnSync(process.execPath,[path.join(root,'examples/entry.mjs')],{encoding:'utf8'});assert.equal(native.status,0,native.stderr);assert.equal(JSON.parse(native.stdout).kind,'Secret');assert.equal(discover()[0].context.path,'examples/p.mjs');assert.equal(discoverScriptOutputRoleClassifications(root).find(role=>role.role==='api').path,'examples/p.mjs');write('examples/p.mjs','process.stdout.write(process.argv[2]);');assert.throws(discover,/OUTPUT_ROLE_UNQUALIFIED.*examples\/p.mjs/);write('examples/p.mjs',secret);write('package.json','{"scripts":{}}');assert.deepEqual(discover(),[]);});
 fixture(({write,discover})=>{write('examples/passive.mjs',secret);assert.deepEqual(discover(),[]);});
});

test('caller-only change, deletion and re-creation cannot reuse transformed custody',()=>fixture(({root,write})=>{
 const source='scripts/render-litellm-deployment.mjs';write(source,secret);write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({version:1,sources:{[source]:{sha256:sha(secret),operation:'controlled offline renderer',operationDigest:sha(secret),operationRecipe:producerAdapterOperationRecipe(source,secret),invocations:[]}}}));
 const caller=`a="$(node "$REPO_DIR/scripts/render-litellm-deployment.mjs" "$INFRA_DIR/litellm-config.yaml" "$INFRA_DIR/litellm-deployment.yaml")"\nb="$(node "$REPO_DIR/scripts/render-postgresql-recovery.mjs" --preflight "$NAMESPACE" "$INFRA_DIR/postgresql-recovery.yaml" "$POSTGRESQL_VALUES_FILE" "$INFRA_DIR/litellm-deployment.yaml" "$POSTGRESQL_RELEASE")"\nc="$(node "$REPO_DIR/scripts/render-stateful-network-policies.mjs" "$INFRA_DIR/network-policies.yaml" "$NAMESPACE" "$REDIS_RELEASE" "$REDIS_VALUES_FILE" "$POSTGRESQL_RELEASE" "$POSTGRESQL_VALUES_FILE")"\nd="$(node "$REPO_DIR/scripts/render-registry-local.mjs" "$KUBECLAW_LAB_REGISTRY_STORAGE_CONFIG" serve "$registry_existing" "$registry_pvc")"\n`;
 write('scripts/deploy.sh',caller);const first=discoverTransformedApiOutputs(root);assert.equal(first.length,1);assert.deepEqual(discoverTransformedApiOutputs(root),first);write('scripts/deploy.sh',caller.replace('$INFRA_DIR/litellm-config.yaml','$INFRA_DIR/other.yaml'));assert.throws(()=>discoverTransformedApiOutputs(root),/INVOCATION_DRIFT/);fs.rmSync(path.join(root,'scripts/deploy.sh'));assert.throws(()=>discoverTransformedApiOutputs(root),/caller missing/);write('scripts/deploy.sh',caller);assert.deepEqual(discoverTransformedApiOutputs(root),first);
}));

test('same-line API to native transition revokes transaction shell facts',()=>fixture(({root,write})=>{
 const source='tools/p.sh';const install=bytes=>{write(source,bytes);const sinks=shellRawOutputSinks(source,bytes);write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({shellRawOutputContracts:[{source,sinks,operationRecipe:shellRawOutputOperationRecipe(source,bytes),role:'non-api',basis:'controlled fixture',sinkConsumers:sinks.map(sink=>({source,line:sink.line,command:sink.command,argumentsDigest:sha(JSON.stringify(sink.args)),sourceEvidence:bytes,purpose:'controlled fixture scalar',kind:'framed-or-native-scalar-output'}))}]}));};
 install('kube=(kubectl --context "$KUBE_CONTEXT")\nnamespace=${OPS_NAMESPACE:-witness}\n"${kube[@]}" create namespace "$namespace" --dry-run=client -o yaml | "${kube[@]}" apply -f -\n');assert.equal(discoverShellApiOutputs(root)[0].value.kind,'Namespace');install('kube=(kubectl --context "$KUBE_CONTEXT")\nnamespace=${OPS_NAMESPACE:-witness}\necho "$namespace"\n');assert.deepEqual(discoverShellApiOutputs(root),[]);assert.deepEqual(discoverShellApiOutputs(root),[]);fs.rmSync(path.join(root,source));assert.deepEqual(discoverShellApiOutputs(root),[]);
}));

test('actual reached validator format and schema installation authority is present in finite facts',()=>{
 const root=path.resolve(new URL('../..',import.meta.url).pathname);
 for(const [source,symbol,operations]of [
  ['contracts/pipeline-observability/v1/src/validation.ts','checkPipelineObservabilityContract',['installFormats(ajv);','ajv.addSchema(schema);']],
  ['contracts/pipeline-worker-core/v1/src/validation.ts','checkPipelineWorkerCoreContract',['installFormats(ajv);','ajv.addSchema(schema);']],
  ['contracts/pipeline-test-gate/v1/src/validation.ts','checkPipelineTestGateContract',['installFormats(ajv);','ajv.addSchema(schema);','ajv.addSchema(e2eResultSchema);']],
  ['contracts/pipeline-worker-core/v1/src/resource-validation-v2.ts','checkWorkerResourceContractV2',['(addFormats as unknown as (value:unknown)=>void)(ajv);','ajv.addSchema(schema);']],
  ['contracts/pipeline-worker-core/v1/src/resource-validation-v3.ts','checkWorkerResourceContractV3',['(addFormats as unknown as (value: unknown) => void)(ajv);','ajv.addSchema(schema);']],
  ['skills/common/plugin-runtime/foundation/registry/schema.ts','validateReferencedSchema',['installFormats(ajv);','ajv.addSchema(contract);','installFormats(schemaMetaValidator);','schemaMetaValidator.addSchema(contract);']],
 ]){const facts=deriveNativeOperationFacts(root,source,[{symbol}]);assert(facts);for(const operation of operations)assert(facts.some(fact=>fact.source===source&&fact.kind==='ExpressionStatement'&&fact.sha256===sha(operation)),`${source} ${symbol}: missing ${operation}`);}
});


test('finite heredoc fd duplication and legacy substitutions agree with actual native consumption',()=>{
 const bytes="node - 3<<A <<B 0<&3\nconsole.log('selected-A');\nA\nconsole.log('unselected-B');\nB\n";
 const native=spawnSync('bash',['-c',bytes],{encoding:'utf8'});assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'selected-A\n');assert.deepEqual(shellCommandAcquisitions('fd.sh',bytes).heredocs.map(body=>body.selectedStdin),[true,false]);assert.throws(()=>shellCommandAcquisitions('dynamic.sh','node - 0<&${fd}\n'),/dynamic input descriptor/);
 const legacy="value=`node -e 'console.log(process.env.ACTIVE)'`\necho 'x=`node -e process.env.PASSIVE`'\n";const commands=shellCommandAcquisitions('legacy.sh',legacy).commands.filter(command=>command.channel==='legacy-command-substitution');assert.equal(commands.length,1);assert.equal(commands[0].words[0].value,'node');assert.equal(commands[0].words[2].value,'console.log(process.env.ACTIVE)');assert.equal(commands[0].words[2].positions[commands[0].words[2].value.indexOf('process.env')],legacy.indexOf('process.env'));
 const nested='x="$(node - <<\'END\'\nconsole.log(process.env.ACTIVE);\nEND\n)"\n';const custody=shellCommandAcquisitions('nested.sh',nested);assert.equal(custody.heredocs[0].selectedStdin,true);assert.equal(custody.heredocs[0].command.words[0].value,'node');assert.equal(shellHeredocCustody('passive.sh',"echo '\nnode <<END\nprocess.env.PASSIVE\nEND\n'\n").heredocs.length,0);
});


test('guarded array aliases and unsupported post-proof calls cannot retain a stale scalar-array exemption',()=>fixture(({root,write,discover})=>{
 const prefix="const out=['safe'];if(!Array.isArray(out)||out.some(item=>typeof item!=='string'))throw Error('bad');";
 write('tools/p.mjs',prefix+"const alias=out;alias.push(JSON.parse(process.argv[2]));console.log(JSON.stringify(out));");const native=spawnSync(process.execPath,[path.join(root,'tools/p.mjs'),'{"apiVersion":"v1","kind":"Secret"}'],{encoding:'utf8'});assert.equal(native.status,0,native.stderr);assert.equal(JSON.parse(native.stdout)[1].kind,'Secret');assert.equal(classifySerializedOutputRoles(root,'tools/p.mjs')[0].role,'unknown');assert.throws(discover,/OUTPUT_ROLE_UNQUALIFIED/);
 write('tools/p.mjs',prefix+"console.log(JSON.stringify(out));");assert.equal(classifySerializedOutputRoles(root,'tools/p.mjs')[0].role,'non-api');assert.deepEqual(discover(),[]);
 write('tools/p.mjs',secret);assert.equal(discover()[0].value.kind,'Secret');
}));

test('package argv distinguishes passive quoted mentions from actual inline Node programs',()=>fixture(({root,write,discover})=>{
 write('examples/p.mjs',secret);
 write('package.json',JSON.stringify({scripts:{'run:passive':"printf '%s\\n' 'node examples/p.mjs'"}}));
 assert.deepEqual(discover(),[]);
 const command="node -e 'console.log(JSON.stringify({apiVersion:\"v1\",kind:\"Secret\"}))'";
 const native=spawnSync('bash',['-c',command],{cwd:root,encoding:'utf8'});assert.equal(native.status,0,native.stderr);assert.equal(JSON.parse(native.stdout).kind,'Secret');
 write('package.json',JSON.stringify({scripts:{'run:inline':command}}));
 assert.throws(discover,/GRAPH_UNQUALIFIED.*package.json.*run:inline.*inline or loader/);
 write('package.json',JSON.stringify({scripts:{'run:actual':"env MODE=fixture node 'examples/p.mjs'"}}));
 assert.equal(discover()[0].context.path,'examples/p.mjs');
}));


test('two source-bound resolver terminals classify only source-location metadata',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname);
 const source='tests/verification/contracts/check-plugin-system-v2-boundaries.mjs';
 const dependencies=[source,'tests/verification/lib/module-graph.mjs','package.json'];
 for(const file of dependencies)write(file,fs.readFileSync(path.join(repository,file),'utf8'));
 const bytes=fs.readFileSync(path.join(root,source),'utf8');
 const qualify=(input=bytes)=>{
  const tree=ts.createSourceFile(source,input,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),factories=[];
  const visit=node=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='createRequire')factories.push(node);ts.forEachChild(node,visit);};visit(tree);
  const recorded=new Set();
  const result=factories.map(factory=>reviewedImporterResolutionOperation(root,source,input,tree,factory,file=>recorded.add(file)));
  assert.deepEqual([...recorded].sort(),[...dependencies].sort());return result;
 };
 const result=qualify();assert.deepEqual(result.map(x=>x.owner),['resolveRuntimeHelper','resolveSafeContract']);
 for(const item of result){assert.equal(item.operationQualification.role,'resolution-only-source-location');assert.equal(item.runtimeAcquisitionAuthorized,false);assert.equal(item.scannerAdmissionAuthorized,false);assert.equal(item.operationQualification.remainingEffectsQualified,false);assert.equal(Object.isFrozen(item),true);}
 // Any changed producer, map, caller, consumer or loader flow needs a fresh
 // source decision; refreshing a mutable boundary inventory cannot grant it.
 for(const [before,after]of [
  ['createRequire(pathToFileURL(importer)).resolve(specifier)','createRequire(pathToFileURL(importer))(specifier)'],
  ['.resolve(specifier)','.resolve(specifier, {})'],
  ['.resolve(specifier)',"['resolve'](specifier)"],
  ['const expected = helperEntries.get(specifier);','const expected = helperEntries.get(specifier) || importer;'],
  ['return { file, root: path.dirname(file), contract: true, helpers: true, helper: true };','return import(file);'],
  ["from 'node:module'","from './foreign-module.mjs'"],
  ['function resolveRuntimeHelper(specifier, importer, helperEntries) {','function resolveRuntimeHelper(specifier, importer, helperEntries, createRequire) {'],
  ['const core = await import','const extra = createRequire(import.meta.url);\nconst core = await import'],
 ]){assert(bytes.includes(before),before);assert.throws(()=>qualify(bytes.replace(before,after)),/RESOLUTION_METADATA_UNQUALIFIED|DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED/);}
 const helper='tests/verification/lib/module-graph.mjs',original=fs.readFileSync(path.join(root,helper),'utf8');write(helper,original+'\nexport const addedLoader = true;\n');assert.throws(()=>qualify(),/bound bytes/);write(helper,original);
 const packageBytes=fs.readFileSync(path.join(root,'package.json'),'utf8');
 for(const name of ['docs:check','docs:publish-check','verify:contracts','verify:migration:package-boundaries','verify:migration:workflow','verify:pipeline','verify:plugin-system-v2','verify:product'])for(const mode of ['change','remove']){
  const manifest=JSON.parse(packageBytes);assert.equal(typeof manifest.scripts[name],'string');if(mode==='change')manifest.scripts[name]+=' --import ./foreign-loader.mjs';else delete manifest.scripts[name];write('package.json',JSON.stringify(manifest));assert.throws(()=>qualify(),/bound bytes/);write('package.json',packageBytes);
 }
 const manifest=JSON.parse(packageBytes);manifest.scripts['new:unreviewed']='node other.mjs';write('package.json',JSON.stringify(manifest));assert.throws(()=>qualify(),/bound bytes/);

}));

test('source/archive compiler metadata binds both callers, extraction branch, package mapping and helper transfer',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname);
 const boundary=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json'))).documentationToolBoundary;
 const selected=boundary.unresolvedModuleInputAuthorities.filter(r=>r.semanticClass==='caller-bound-project-compiler-source-or-archive-metadata');
 assert.equal(selected.length,2);
 const inputs=new Set(selected.flatMap(r=>[r.source,...r.authorityInputs.map(x=>x.path),...r.inputConstraints.modulePaths]));
 for(const source of inputs)write(source,fs.readFileSync(path.join(repository,source),'utf8'));
 const graph={dynamicOperations:[],resolutionOnlyOperations:[]};
 for(const recipe of selected){
  const bytes=fs.readFileSync(path.join(root,recipe.source),'utf8'),tree=ts.createSourceFile(recipe.source,bytes,ts.ScriptTarget.Latest,true);
  const visit=node=>{if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){let owner=node;for(let parent=node.parent;parent;parent=parent.parent)if(ts.isFunctionDeclaration(parent))owner=parent;graph.dynamicOperations.push({source:recipe.source,expression:node.getText(tree),operation:owner.getText(tree)});}ts.forEachChild(node,visit);};visit(tree);
  assert.equal(recipe.inputConstraints.runtimeAcquisitionAuthorized,false);
  assert.equal(recipe.inputConstraints.archiveSourceMapping.enforcedRuntimeArchiveIdentity,false);
 }
 assert.equal(graph.dynamicOperations.length,3);
 const check=(input=boundary,operations=graph)=>documentationModuleInputAuthority(root,input,operations);
 const baseline=check();assert.match(baseline,/^[a-f0-9]{64}$/u);
 for(const [source,before,after]of [
  ['tests/verification/contracts/check-project-compiler.mts','const archive = process.argv[2]','const archive = process.argv[3]'],
  ['tests/verification/contracts/check-project-compiler.mts','temporary, runtime, compilerFile','temporary, runtime, compilerFile: process.argv[4]'],
  ['tests/verification/contracts/project-legacy-import-cases.mts',"'legacy-import.ts'","'foreign.ts'"],
  ['scripts/build-runtime-role-bundle.mjs',"'skills/packages'","'skills/foreign'"],
  ['packaging/runtime/package-ownership.json','"source": "skills/nova/project"','"source": "skills/foreign/project"'],
  ['.github/workflows/pipeline-reliability.yaml','dist/nova-${GITHUB_SHA}.tgz','dist/foreign-${GITHUB_SHA}.tgz'],
  ['package.json','node tests/verification/contracts/check-project-compiler.mts','node tests/verification/contracts/check-project-compiler.mts external.tgz'],
 ]){
  const original=fs.readFileSync(path.join(root,source),'utf8');assert(original.includes(before),source);write(source,original.replace(before,after));
  assert.throws(()=>check(),/input\/caller authority changed/);write(source,original);assert.equal(check(),baseline);
 }
 // Mutable inventory refresh cannot bless an unknown archive operand, new
 // loader expression or new claim that extracted bytes are trusted modules.
 const forged=structuredClone(boundary),record=forged.unresolvedModuleInputAuthorities.find(r=>r.source===selected[0].source);
 record.inputConstraints.archiveSourceMapping.enforcedRuntimeArchiveIdentity=true;
 assert.throws(()=>check(forged),/no reviewed semantic input authority/);
 const extra=structuredClone(graph);extra.dynamicOperations.push({source:selected[0].source,expression:'import(process.argv[4])',operation:'import(process.argv[4])'});
 assert.throws(()=>check(boundary,extra),/outside its semantic input recipe/);
 const changed=structuredClone(graph);changed.dynamicOperations[1].operation+='\nimport(process.argv[4]);';
 assert.throws(()=>check(boundary,changed),/outside its semantic input recipe/);
 // Real source bytes are dependency facts, not pinned inert fixtures. Their
 // mutations invalidate facts instead of retaining a cached metadata result.
 const compiler='skills/nova/project/compiler.ts';write(compiler,fs.readFileSync(path.join(root,compiler),'utf8')+secret);
 assert.notEqual(check(),baseline);
}));

test('historical environment roots classify only bound operations and retain current executable source facts',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname);
 const boundary=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json'))).documentationToolBoundary;
 const recipes=boundary.unresolvedModuleInputAuthorities.filter(r=>r.semanticClass==='historical-environment-root-module-input-metadata');assert.equal(recipes.length,4);
 for(const source of new Set(recipes.flatMap(r=>[r.source,...r.authorityInputs.map(x=>x.path),...r.inputConstraints.modulePaths])))write(source,fs.readFileSync(path.join(repository,source),'utf8'));
 const graph={dynamicOperations:[],resolutionOnlyOperations:[]};
 for(const recipe of recipes){
  const bytes=fs.readFileSync(path.join(root,recipe.source),'utf8'),tree=ts.createSourceFile(recipe.source,bytes,ts.ScriptTarget.Latest,true);
  const visit=node=>{if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&!ts.isStringLiteralLike(node.arguments[0]))graph.dynamicOperations.push({source:recipe.source,expression:node.getText(tree),operation:node.getText(tree)});ts.forEachChild(node,visit);};visit(tree);
  assert.equal(recipe.inputConstraints.runtimeAcquisitionAuthorized,false);assert.match(recipe.inputConstraints.selectedCheckoutBinding,/NOT authenticated/);
 }
 assert.equal(graph.dynamicOperations.length,5);
 const check=(input=boundary,operations=graph)=>documentationModuleInputAuthority(root,input,operations),baseline=check();
 for(const recipe of recipes){const original=fs.readFileSync(path.join(root,recipe.source),'utf8');write(recipe.source,original.replace('process.env.KUBECLAW_REVIEW_SOURCE_ROOT','process.env.FOREIGN_SOURCE_ROOT'));assert.throws(()=>check(),/input\/caller authority changed/);write(recipe.source,original);}
 const parent='tests/verification/historical-branch-acceptance/delivery-manifest-v2-reader-corpus-independent.test.mjs',original=fs.readFileSync(path.join(root,parent),'utf8');write(parent,original.replace('child.pathname, encoding','child.pathname, process.argv[2]'));assert.throws(()=>check(),/input\/caller authority changed/);write(parent,original);
 const forged=structuredClone(boundary),record=forged.unresolvedModuleInputAuthorities.find(r=>r.source===recipes[0].source);record.inputConstraints.modulePaths=['external/compiler.ts'];assert.throws(()=>check(forged),/no reviewed semantic input authority/);
 const extra=structuredClone(graph);extra.dynamicOperations.push({source:recipes[0].source,expression:'import(process.env.UNKNOWN_MODULE)',operation:'import(process.env.UNKNOWN_MODULE)'});assert.throws(()=>check(boundary,extra),/outside its semantic input recipe/);
 const compiler='skills/nova/project/compiler.ts',before=fs.readFileSync(path.join(root,compiler),'utf8');write(compiler,before+secret);assert.notEqual(check(),baseline);write(compiler,before);assert.equal(check(),baseline);
 fs.rmSync(path.join(root,compiler));assert.throws(()=>check(),/finite selected module missing/);
}));

test('native historical from selector really follows external root, not scanner checkout identity',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),source='tests/verification/historical-branch-acceptance/delivery-manifest-v3-compiler-recovery-independent.test.mjs';
 const bytes=fs.readFileSync(path.join(repository,source),'utf8'),tree=ts.createSourceFile(source,bytes,ts.ScriptTarget.Latest,true);
 const declaration=tree.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>item.name.getText(tree)==='from'));assert(declaration);
 write('candidate/skills/nova/project/compiler.ts',"export const identity='candidate';");write('baseline/skills/nova/project/compiler.ts',"export const identity='external-baseline';");
 const program="import path from 'node:path';import {pathToFileURL} from 'node:url';"+declaration.getText(tree)+"console.log((await from(process.argv[1], 'skills/nova/project/compiler.ts')).identity);";
 for(const [directory,expected]of [['candidate','candidate'],['baseline','external-baseline']]){const native=spawnSync(process.execPath,['--input-type=module','-e',program,path.join(root,directory)],{encoding:'utf8'});assert.equal(native.status,0,native.stderr);assert.equal(native.stdout.trim(),expected);}
}));

test('six native replay recipes bind archive, overlay, caller and exact loader branches without fixture exclusion',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),boundary=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json'))).documentationToolBoundary;
 const recipes=boundary.unresolvedModuleInputAuthorities.filter(r=>r.semanticClass==='native-reliability-replay-selected-module-metadata');assert.equal(recipes.length,6);
 for(const source of new Set(recipes.flatMap(r=>[r.source,...r.authorityInputs.map(x=>x.path),...r.inputConstraints.modulePaths])))write(source,fs.readFileSync(path.join(repository,source),'utf8'));
 const graph={dynamicOperations:[],resolutionOnlyOperations:[]};
 for(const recipe of recipes){const bytes=fs.readFileSync(path.join(root,recipe.source),'utf8'),tree=ts.createSourceFile(recipe.source,bytes,ts.ScriptTarget.Latest,true);const visit=node=>{if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&!ts.isStringLiteralLike(node.arguments[0])){let owner=node;for(let parent=node.parent;parent;parent=parent.parent)if(ts.isFunctionDeclaration(parent))owner=parent;graph.dynamicOperations.push({source:recipe.source,expression:node.getText(tree),operation:owner.getText(tree)});}ts.forEachChild(node,visit);};visit(tree);assert.equal(recipe.inputConstraints.runtimeAcquisitionAuthorized,false);assert.match(recipe.inputConstraints.selectedCheckoutBinding,/NOT proof/);}
 assert.equal(graph.dynamicOperations.length,21);
 const check=(b=boundary,g=graph)=>documentationModuleInputAuthority(root,b,g),baseline=check();
 for(const [source,before,after]of [
  ['tests/verification/reliability/observability-replay.test.mjs','?? process.cwd()','|| process.cwd()'],
  ['tests/verification/reliability/review-cache-legacy-prefix.test.mjs',"old&&version!=='v4'","old||version!=='v4'"],
  ['tests/verification/reliability/runtime-dispatch-native-profile.test.mjs',"mode==='pipeline'?archivedCore(root,version)","mode==='pipeline'?archivedCore(root,process.argv[12])"],
  ['tests/verification/reliability/repair-identity-historical.mjs','if (!historical && file.path !== producerPath) continue;','if (historical && file.path !== producerPath) continue;'],
  ['scripts/reliability-tests.mjs',"group === 'native'", "group === 'foreign'"],
  ['tests/verification/reliability/review-report-locales.test.mjs','child,root,mode,phase','child,root,process.argv[2],phase'],
 ]){const original=fs.readFileSync(path.join(root,source),'utf8');const changed=original.replace(before,after);assert.notEqual(changed,original,source);write(source,changed);assert.throws(()=>check(),/input\/caller authority changed/);write(source,original);assert.equal(check(),baseline);}
 for(const source of ['tests/fixtures/repair-budget/legacy-review-compiler.json','tests/verification/reliability/fixtures/legacy-review-cache/engine-snapshots.ts.txt','tests/verification/reliability/fixtures/review-report-storage-original.json']){const original=fs.readFileSync(path.join(root,source),'utf8');write(source,original+'\n');assert.throws(()=>check(),/input\/caller authority changed/);write(source,original);}
 const forged=structuredClone(boundary),record=forged.unresolvedModuleInputAuthorities.find(r=>r.source===recipes[0].source);record.sourceSha256=sha('replacement');assert.throws(()=>check(forged),/no reviewed semantic input authority/);
 const extra=structuredClone(graph);extra.dynamicOperations.push({source:recipes[0].source,expression:'import(process.argv[9])',operation:'import(process.argv[9])'});assert.throws(()=>check(boundary,extra),/outside its semantic input recipe/);
 const source='skills/common/plugin-runtime/foundation/observability/durable-attempts.ts',original=fs.readFileSync(path.join(root,source),'utf8');write(source,original+secret);assert.notEqual(check(),baseline);
}));

test('native replay root selector preserves explicit external and empty-string nullish cases',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),source='tests/verification/reliability/observability-replay.test.mjs',bytes=fs.readFileSync(path.join(repository,source),'utf8'),tree=ts.createSourceFile(source,bytes,ts.ScriptTarget.Latest,true);
 const statements=tree.statements.filter(node=>ts.isVariableStatement(node));
 const selector=statements.find(node=>node.declarationList.declarations.some(item=>item.name.getText(tree)==='sourceRoot'));
 const loader=statements.find(node=>node.getText(tree).includes('await import'));assert(selector&&loader);
 for(const [directory,identity]of [['candidate','candidate'],['external','external']])write(directory+'/skills/common/plugin-runtime/foundation/observability/durable-delivery.ts',`export const FileObservabilityAdmissionStore='${identity}';`);
 const program="import path from 'node:path';import {pathToFileURL} from 'node:url';"+selector.getText(tree)+loader.getText(tree)+"console.log(JSON.stringify({sourceRoot,identity:FileObservabilityAdmissionStore}));";
 for(const [selected,identity]of [[undefined,'candidate'],[path.join(root,'external'),'external'],['','candidate']]){const env={...process.env};if(selected===undefined)delete env.OBSERVABILITY_REPLAY_SOURCE_ROOT;else env.OBSERVABILITY_REPLAY_SOURCE_ROOT=selected;const native=spawnSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',cwd:path.join(root,'candidate'),env});assert.equal(native.status,0,native.stderr);assert.deepEqual(JSON.parse(native.stdout),{sourceRoot:selected===undefined?path.join(root,'candidate'):selected,identity});}
}));


test('Worker resource schema generator receipts retain schema inputs and reject refreshed API output',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),registry=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json')));
 for(const version of [1,2,3]){const source=`contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v${version}.schema.json`;write(source,fs.readFileSync(path.join(repository,source),'utf8'));}
 for(const version of [2,3]){
  const source=`contracts/pipeline-worker-core/v1/scripts/generate-resource-schema-v${version}.mjs`,bytes=fs.readFileSync(path.join(repository,source),'utf8'),contract=structuredClone(registry.nonApiOutputContracts.find(r=>r.source===source));
  const refresh=()=>{for(const op of contract.operations)op.factsDigest=nativeOperationFactDigest(deriveNativeOperationFacts(root,op.source,op.selectors));write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({nonApiOutputContracts:[contract]}));};
  write(source,bytes);refresh();assert.deepEqual(classifySerializedOutputRoles(root,source).map(x=>x.role),['non-api']);
  write(source,bytes.replace(/JSON\.stringify\(schema,\s*null,\s*2\)/u,"JSON.stringify({apiVersion:'v1',kind:'Secret'},null,2)"));refresh();assert(classifySerializedOutputRoles(root,source).some(x=>x.role==='api'));
  write(source,bytes.replace(/JSON\.stringify\(schema,\s*null,\s*2\)/u,'process.argv[2]'));refresh();assert(classifySerializedOutputRoles(root,source).some(x=>x.role==='unknown'));
 }
}));


test('zero-argument scalar method calls remain conservative without crashing classification',()=>fixture(({root,write})=>{
 for(const value of ["createHash('sha256').digest()", "Buffer.from('x').toString()", "[].join()"]){write('tools/zero.mjs',`import {createHash} from 'node:crypto';process.stdout.write(${value});`);assert.doesNotThrow(()=>classifySerializedOutputRoles(root,'tools/zero.mjs'));}
}));


test('quoted immediate dirname results bind only fixed filesystem receivers',()=>{
 const qualifies=(bytes,args=['$target'],extra={})=>shellImmediatePathReceiverQualified(bytes,{line:1,command:'dirname',channel:'command-substitution',args,...extra});
 assert(qualifies('mkdir -p "$(dirname "$target")"'));
 assert(qualifies('mkdir -p "$(dirname "$target")" "$(dirname "$socket")"',['$socket']));
 assert(qualifies('cd "$(dirname "$0")/.."',['$0']));
 for(const text of ['printf "%s\\n" "$(dirname "$target")"','echo "$(dirname "$target")"','kubectl apply -f "$(dirname "$target")"','"$receiver" "$(dirname "$target")"','mkdir -p $(dirname "$target")','mkdir -p "$(dirname "$target")"; cat "$payload"','root="$(dirname "$target")"','mkdir -p "$(dirname "$target")$payload"','mkdir -p "$(dirname "$target")" | kubectl apply -f -'])assert(!qualifies(text),text);
 assert(!qualifies('mkdir -p "$(dirname "$target")"',['$different']));
 assert(!qualifies('mkdir -p "$(dirname "$target")"',['$target'],{channel:'command-output'}));
 assert(!qualifies('mkdir -p "$(dirname "$target")"',['$target'],{line:2}));
});


test('original deployment shell occurrences reuse physical helper and typed receiver custody without a global stdout grant',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname);
 const inputs=['scripts/deploy.sh','scripts/bundle-values-field.mjs','scripts/buster-resource-overlay.mjs','scripts/bundle-override-values.mjs','package.json','node_modules/js-yaml/package.json','node_modules/js-yaml/dist/js-yaml.mjs'];
 for(const file of inputs)write(file,fs.readFileSync(path.join(repository,file)));
 const source='scripts/deploy.sh',bytes=fs.readFileSync(path.join(root,source),'utf8'),sinks=shellRawOutputSinks(source,bytes);
 const selected=sinks.filter(s=>s.command==='bundle_values_field'||s.command==='node'&&[365,538,1390].includes(s.line));
 const children=['scripts/bundle-values-field.mjs','scripts/buster-resource-overlay.mjs','scripts/bundle-override-values.mjs'];
 const rawRoles=children.map(child=>classifySerializedOutputRoles(root,child));
 assert(rawRoles.every(roles=>roles.some(role=>role.role==='unknown')));
 assert.equal(selected.length,9);
 for(const sink of selected){
  const fact=shellDeploymentConfigurationOccurrenceProof(root,source,bytes,sink);assert(fact,JSON.stringify(sink));
  assert.equal(fact.runtimeExecutionAuthorized,false);assert.equal(fact.apiApplyAuthorized,false);assert.equal(fact.canonicalStandaloneRole,'unknown');
  assert(!shellDeploymentConfigurationOccurrenceProof(root,'scripts/foreign.sh',bytes,sink));
  assert(!shellDeploymentConfigurationOccurrenceProof(root,source,bytes,{...sink,args:[...sink.args,'$payload']}));
  assert(!shellDeploymentConfigurationOccurrenceProof(root,source,bytes,{...sink,channel:sink.channel==='command-substitution'?'command-output':'command-substitution'}));
 }
 assert.deepEqual(children.map(child=>classifySerializedOutputRoles(root,child)),rawRoles);
 const sink=selected.find(s=>s.line===1390);
 for(const file of inputs){
  const original=fs.readFileSync(path.join(root,file));
  write(file,Buffer.concat([original,Buffer.from('\n# changed selected child/caller/package/receiver authority\n')]));
  assert(!shellDeploymentConfigurationOccurrenceProof(root,source,bytes,sink),file);write(file,original);
 }
 write('scripts/package.json','{}');assert(!shellDeploymentConfigurationOccurrenceProof(root,source,bytes,sink));
}));


test('policy validation binds current quoted Go diagnostics and same-caller fresh build, never a supplied bundle',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),source='scripts/repair-native-nri-launch.sh';
 const inputs=[source,'tools/native-worker-nri/main.go','tools/native-worker-nri/go.mod','tools/native-worker-nri/go.sum','scripts/build-native-worker-nri.mjs','versions.json'];
 for(const file of inputs)write(file,fs.readFileSync(path.join(repository,file)));
 const bytes=fs.readFileSync(path.join(root,source),'utf8'),sink=shellRawOutputSinks(source,bytes).find(s=>s.command==='$backup/10-kubeclaw-native');assert(sink);
 const fact=shellNativePolicyValidationProof(root,source,bytes,sink);assert(fact);assert.equal(fact.role,'non-api');assert.equal(fact.selectedOperation.runtimeOutcome,'unexecuted');
 assert(!shellNativePolicyValidationProof(root,source,bytes,{...sink,line:-1}));
 assert(!shellNativePolicyValidationProof(root,'scripts/foreign.sh',bytes,sink));
 assert(!shellNativePolicyValidationProof(root,'scripts/install-native-worker-pools-stage.sh',bytes,{...sink,command:'$bundle/10-kubeclaw-native',args:['--check-policy','$generated/native-nri.json']}));
 for(const file of inputs.filter(file=>file!=='versions.json')){
  const original=fs.readFileSync(path.join(root,file));write(file,Buffer.concat([original,Buffer.from("\nprocess.stdout.write('apiVersion: v1\\nkind: Secret');\n")]));
  assert(!shellNativePolicyValidationProof(root,source,bytes,sink),file);write(file,original);
 }
 write('tools/native-worker-nri/extra.go','package main\nfunc init() { println("apiVersion: v1\\nkind: Secret") }\n');
 assert(!shellNativePolicyValidationProof(root,source,bytes,sink));
}));


test('enumerated installed/supplied executable boundaries remain UNKNOWN and visible, never ordinary native roles',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),sources=['scripts/activate-native-worker-ax41.sh','scripts/install-native-worker-pools-stage.sh'];
 for(const source of sources)write(source,fs.readFileSync(path.join(repository,source)));
 const boundaries=discoverShellExternalOutputBoundaries(root);assert.equal(boundaries.length,2);
 for(const boundary of boundaries){
  const source=boundary.source,bytes=fs.readFileSync(path.join(root,source),'utf8'),sink=shellRawOutputSinks(source,bytes).find(s=>s.line===boundary.sink.line&&s.command===boundary.sink.command);
  const consumer={source,line:sink.line,command:sink.command,argumentsDigest:sha(JSON.stringify(sink.args)),kind:'native-tool-or-selected-stream',purpose:'actual external artifact boundary',sourceEvidence:bytes.split('\n')[sink.line-1]};
  const actual=shellExternalOutputBoundary(root,source,bytes,sink,consumer);assert.deepEqual(actual,boundary);assert.equal(actual.role,'unknown');assert.equal(actual.runtimeExecutionAuthorized,false);assert.equal(actual.apiApplyAuthorized,false);
  assert(!shellExternalOutputBoundary(root,source,bytes,{...sink,command:'unlisted-emitter'},consumer));
  assert(!shellExternalOutputBoundary(root,source,bytes,{...sink,args:['--execute-api']},consumer));
  assert(!shellExternalOutputBoundary(root,source,bytes,{...sink,channel:'command-substitution'},consumer));
  assert(!shellExternalOutputBoundary(root,source,bytes,sink,{...consumer,argumentsDigest:'0'.repeat(64)}));
  assert(!shellExternalOutputBoundary(root,source,bytes,sink,{...consumer,channel:'command-substitution'}));
  const changed=bytes+'\nnew-api-emitter | kubectl apply -f -\n';write(source,changed);
  assert(!shellExternalOutputBoundary(root,source,changed,sink,consumer));
  assert.throws(()=>discoverShellExternalOutputBoundaries(root),/API_EXTERNAL_OUTPUT_BOUNDARY_SOURCE_DRIFT/);write(source,bytes);
 }
 const render=()=>renderShellExternalOutputBoundaries(boundaries,(source,line)=>`[${source}](source/${source}#L${line})`,root),output=render();
 assert(output.includes('UNKNOWN'));assert(output.includes('not a non-API classification'));assert(output.includes('Required check'));assert(output.includes('Selected host or installation-bundle operator'));
 for(const boundary of boundaries)assert(output.includes(boundary.sink.command));
 assert.throws(()=>renderShellExternalOutputBoundaries(boundaries.slice(1),(s)=>s,root),/API_REFERENCE_EXTERNAL_BOUNDARY_DRIFT/);
 const forged=structuredClone(boundaries);forged[0].role='non-api';assert.throws(()=>renderShellExternalOutputBoundaries(forged,(s)=>s,root),/API_REFERENCE_EXTERNAL_BOUNDARY_DRIFT/);
 const source=boundaries[0].source,original=fs.readFileSync(path.join(root,source));fs.rmSync(path.join(root,source));fs.symlinkSync('missing-target.sh',path.join(root,source));
 assert.throws(()=>discoverShellExternalOutputBoundaries(root),/API_EXTERNAL_OUTPUT_BOUNDARY_PHYSICAL_DRIFT/);fs.rmSync(path.join(root,source));write(source,original);
}));


test('complete selected Secret setup binds credential inputs and permissive helpers to actual finite receivers',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),source='my-values/setup-secrets.sh',bytes=fs.readFileSync(path.join(repository,source),'utf8');write(source,bytes);
 const sinks=shellRawOutputSinks(source,bytes),selected=sinks.map(sink=>({sink,fact:shellSelectedSecretReceiverProof(root,source,bytes,sink)})).filter(row=>row.fact);
 assert.equal(selected.length,60);assert.equal(selected.filter(row=>row.fact.role==='api').length,22);
 assert.deepEqual(Object.fromEntries([...new Set(selected.map(row=>row.sink.command))].sort().map(command=>[command,selected.filter(row=>row.sink.command===command).length])),{generate_secret_value:3,grep:1,join_by_comma:19,mktemp:4,normalize_boolish:14,openssl:4,sops:2,sops_get:12,sops_get_first:1});
 for(const {sink,fact}of selected){
  assert.equal(fact.selectedOperation.canonicalStandaloneRole,'unknown');assert.equal(fact.selectedOperation.runtimeExecutionAuthorized,false);assert.equal(fact.selectedOperation.apiApplyAuthorized,false);assert.deepEqual(fact.outputs,[]);
  assert(!shellSelectedSecretReceiverProof(root,source,bytes,{...sink,line:-1}));
  assert(!shellSelectedSecretReceiverProof(root,source,bytes,{...sink,args:[...sink.args,'$unreviewed']}));
  assert(!shellSelectedSecretReceiverProof(root,source,bytes,{...sink,channel:sink.channel==='command-substitution'?'command-output':'command-substitution'}));
  assert(!shellSelectedSecretReceiverProof(root,'scripts/unowned.sh',bytes,sink));
 }
 const sink=selected.find(row=>row.sink.command==='normalize_boolish').sink;
 for(const [before,after]of [
  ['[[ $value == "true" ]]','printf "%s" "$value" | kubectl apply -f -'],
  ['warn "Secret ${namespace}/${name} exists but is missing keys:', 'kubectl apply -f - #'],
  ['privateKey=$private_file','unreviewedKey=$private_file'],
  ['--type merge -p','--type json -p'],
  ['kubectl "${kubectl_args[@]}"','printf "%s" "${kubectl_args[@]}"'],
  ['--extract "[\\\"$key\\\"]"','--output json'],
  ['credentials.json=$credentials_file','foreign=$credentials_file'],
  ['sed "s/namespace: ${SRC_NS}/namespace: ${target_namespace}/"','sed "s/kind: Secret/kind: ConfigMap/"'],
  ['trap cleanup_tmp_files EXIT','trap : EXIT'],
 ]){
  const changed=bytes.replace(before,after);assert.notEqual(changed,bytes,before);write(source,changed);assert(!shellSelectedSecretReceiverProof(root,source,changed,sink),before);write(source,bytes);
 }
 write(source,bytes+'\nnormalize_boolish "$PAYLOAD" | kubectl apply -f -\n');assert(!shellSelectedSecretReceiverProof(root,source,bytes,sink));write(source,bytes);
 const helper=bytes.match(/^normalize_boolish\(\) \{[\s\S]*?^\}/mu)?.[0],comparison=bytes.match(/^component_enabled\(\) \{[\s\S]*?^\}/mu)?.[0];assert(helper&&comparison);
 const payload='apiversion: v1\nkind: secret',native=spawnSync('bash',['-c',helper+'\n'+comparison+'\nnormalize_boolish "$1"; component_enabled "$1"','selected-helper',payload],{encoding:'utf8'});
 assert.equal(native.status,1);assert.equal(native.stdout,payload+'\n'); // fallback is NOT a safe scalar
 fs.rmSync(path.join(root,source));fs.symlinkSync('missing-source.sh',path.join(root,source));assert(!shellSelectedSecretReceiverProof(root,source,bytes,sink));
}));


test('selected Secret family still discovers all authored constructors and rejects forged refreshed receipts',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),source='my-values/setup-secrets.sh',bytes=fs.readFileSync(path.join(repository,source),'utf8');
 const registry=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json'))),original=registry.shellRawOutputContracts.find(row=>row.source===source);assert(original);
 const refresh=changed=>{
  write(source,changed);const contract=structuredClone(original);contract.sinks=shellRawOutputSinks(source,changed);contract.operationRecipe=shellRawOutputOperationRecipe(source,changed);
  contract.sinkConsumers=contract.sinks.map((sink,index)=>({...original.sinkConsumers[index],source,line:sink.line,command:sink.command,argumentsDigest:sha(JSON.stringify(sink.args)),sourceEvidence:changed.split('\n')[sink.line-1],channel:sink.channel??'command-output'}));
  write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({shellRawOutputContracts:[contract]}));
 };
 refresh(bytes);const outputs=discoverShellApiOutputs(root);assert.equal(outputs.length,38);
 for(const [line,kind,keys]of [[435,'Namespace',[]],[495,'Secret',['litellmApiKey','stitchApiKey']],[638,'Secret',['privateKey','publicKey']],[911,'Secret',['.dockerconfigjson']],[952,'Secret',['id_rsa']],[1035,'Secret',['proof']]]){
  const output=outputs.find(row=>row.context.line===line&&row.value.kind===kind);assert(output,`${line}:${kind}`);for(const key of keys)assert(Object.hasOwn(output.value.data,key));
 }
 const arrays=outputs.filter(row=>row.context.profile.startsWith('selected-sops-shared-secret-litellm-'));assert.deepEqual(arrays.map(row=>Object.keys(row.value.data).length),[12,13]);
 const patches=outputs.filter(row=>row.context.requestMethod==='PATCH');assert.equal(patches.length,22);assert(patches.every(row=>row.context.kind==='Secret'&&row.context.requestPatchType==='merge'));
 assert(outputs.some(row=>row.context.profile==='inherited-live-secret-serialized-yaml-transform'));assert(outputs.some(row=>row.context.profile==='inherited-live-secret-json-DATABASE_URL-transform'));
 for(const [before,after]of [
  ['[[ $value == "true" ]]','printf "%s" "$value" | kubectl apply -f -'],
  ['--from-literal="gatewayToken-forge=$(sops_get openclaw_gateway_token_forge)"','--from-literal="foreign=$(sops_get openclaw_gateway_token_forge)"'],
  ['--from-file="privateKey=$private_file"','--from-file="foreign=$private_file"'],
  ['--type merge -p','--type json -p'],
  ['sed "s/namespace: ${SRC_NS}/namespace: ${target_namespace}/"','sed "s/kind: Secret/kind: ConfigMap/"'],
 ]){const changed=bytes.replace(before,after);assert.notEqual(changed,bytes);refresh(changed);assert.throws(()=>discoverShellApiOutputs(root),/UNQUALIFIED|UNRESOLVED/);}
 refresh(bytes+'\nnormalize_boolish "$PAYLOAD" | kubectl apply -f -\n');assert.throws(()=>discoverShellApiOutputs(root),/UNQUALIFIED|UNRESOLVED/);
 // No raw occurrences remain: revocation must precede sink-dependent checks
 // and cached success. An entirely missing declared source is not a clean scan.
 refresh('#!/usr/bin/env bash\n');assert.throws(()=>discoverShellApiOutputs(root),/SECRET_SOURCE_CHANGED_UNQUALIFIED/);
 refresh(bytes);assert.equal(discoverShellApiOutputs(root).length,38);
 fs.rmSync(path.join(root,source));assert.throws(()=>discoverShellApiOutputs(root),/SECRET_SOURCE_PHYSICAL_UNQUALIFIED/);
 fs.symlinkSync('missing-secret-source.sh',path.join(root,source));assert.throws(()=>discoverShellApiOutputs(root),/SECRET_SOURCE_PHYSICAL_UNQUALIFIED/);
}));


test('selected database outputs retain native receivers without generic tool or scalar grants',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),sources=['scripts/postgresql-recovery.sh','scripts/redis-prepare-migration.sh'];
 for(const file of [...sources,'versions.json','my-values/infra/redis-values.yaml','package.json','package-lock.json'])write(file,fs.readFileSync(path.join(repository,file)));
 for(const packageName of ['js-yaml','argparse'])fs.cpSync(path.join(repository,'node_modules',packageName),path.join(root,'node_modules',packageName),{recursive:true});
 const selected=[];for(const source of sources){const bytes=fs.readFileSync(path.join(root,source),'utf8');for(const sink of shellRawOutputSinks(source,bytes)){const fact=shellSelectedDatabaseReceiverProof(root,source,bytes,sink);if(fact)selected.push({source,bytes,sink,fact});}}
 assert.equal(selected.length,79);assert.equal(selected.filter(row=>row.source===sources[0]).length,52);
 for(const {source,bytes,sink,fact}of selected){
  assert.equal(fact.role,'non-api');assert.equal(fact.selectedOperation.canonicalStandaloneRole,'unknown');assert.equal(fact.selectedOperation.runtimeExecutionAuthorized,false);assert.equal(fact.selectedOperation.apiApplyAuthorized,false);
  assert(!shellSelectedDatabaseReceiverProof(root,source,bytes,{...sink,line:-1}));assert(!shellSelectedDatabaseReceiverProof(root,source,bytes,{...sink,args:[...sink.args,'$payload']}));assert(!shellSelectedDatabaseReceiverProof(root,source,bytes,{...sink,channel:sink.channel==='command-substitution'?'command-output':'command-substitution'}));assert(!shellSelectedDatabaseReceiverProof(root,'scripts/unlisted.sh',bytes,sink));
 }
 for(const [source,before,after]of [
  [sources[0],'metadata "$directory" format','metadata "$directory" arbitrary'],
  [sources[0],"sql 'SHOW server_version_num'","sql 'SELECT arbitrary_payload'"],
  [sources[0],'--command "$1"','--command "$UNBOUND_QUERY"'],
  [sources[0],'--check --status SHA256SUMS','--check --status "$unbound"'],
  [sources[0],'>"$stage/metadata.env"','| kubectl apply -f -'],
  [sources[1],'>"$stage/policy.conf"','| kubectl apply -f -'],
  [sources[1],'trap cleanup EXIT','trap : EXIT'],
  [sources[1],"commonConfiguration + '\\n'",'process.env.PAYLOAD'],
 ]){const bytes=fs.readFileSync(path.join(root,source),'utf8'),changed=bytes.replace(before,after);assert.notEqual(changed,bytes,before);write(source,changed);const sink=selected.find(row=>row.source===source).sink;assert(!shellSelectedDatabaseReceiverProof(root,source,changed,sink));write(source,bytes);}
 const {source,bytes,sink}=selected.find(row=>row.source===sources[1]&&row.sink.command==='node');
 for(const file of ['versions.json','my-values/infra/redis-values.yaml','package.json','package-lock.json','node_modules/js-yaml/lib/loader.js','node_modules/argparse/argparse.js']){const original=fs.readFileSync(path.join(root,file));write(file,Buffer.concat([original,Buffer.from('\n')]));assert(!shellSelectedDatabaseReceiverProof(root,source,bytes,sink),file);write(file,original);}
 write('node_modules/js-yaml/unreviewed.js','process.stdout.write(process.env.PAYLOAD)');assert(!shellSelectedDatabaseReceiverProof(root,source,bytes,sink));fs.rmSync(path.join(root,'node_modules/js-yaml/unreviewed.js'));assert(shellSelectedDatabaseReceiverProof(root,source,bytes,sink));
 const registry=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json'))),contracts=registry.shellRawOutputContracts.filter(row=>sources.includes(row.source));
 // Copy the actual isolated candidate registry verbatim: Redis has only the
 // four independently qualified parser-metadata additions, not a rewritten
 // receipt/role/consumer. The test no longer refreshes a fixture-only recipe.
 for(const contract of contracts){const current=fs.readFileSync(path.join(root,contract.source),'utf8');assert.deepEqual(contract.sinks,shellRawOutputSinks(contract.source,current));assert.equal(JSON.stringify(contract.operationRecipe),JSON.stringify(shellRawOutputOperationRecipe(contract.source,current)));}
 write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({shellRawOutputContracts:contracts}));
 assert.deepEqual(discoverShellApiOutputs(root),[]); // actual candidate registry; never starts either DB
 const pg=discoverShellOutputRoleClassifications(root).find(row=>row.source===sources[0]);assert(pg);
 for(const line of [27,65]){
  const channels=pg.fileChannels.filter(row=>row.line===line);assert(channels.length>=2);
  for(const channel of channels){assert.equal(channel.selectedOperation.command,channel.command);assert.deepEqual(channel.selectedOperation.argv,channel.args);}
 }
 assert.deepEqual(pg.fileChannels.filter(row=>row.line===27).map(row=>row.command).sort(),['id','stat']);
 assert(pg.fileChannels.some(row=>row.line===65&&row.command==='date'));assert(pg.fileChannels.some(row=>row.line===65&&row.command==='mktemp'));

 // New package files must revoke a previously cached acceptance too.
 write('node_modules/js-yaml/unreviewed.js','process.stdout.write(process.env.PAYLOAD)');assert.throws(()=>discoverShellApiOutputs(root),/DATABASE_FORMAT_INPUT_UNQUALIFIED/);fs.rmSync(path.join(root,'node_modules/js-yaml/unreviewed.js'));assert.deepEqual(discoverShellApiOutputs(root),[]);
 const original=fs.readFileSync(path.join(root,sources[0]));write(sources[0],'#!/usr/bin/env bash\n');assert.throws(()=>discoverShellApiOutputs(root),/DATABASE_SOURCE_CHANGED_UNQUALIFIED/);write(sources[0],original);fs.rmSync(path.join(root,sources[0]));assert.throws(()=>discoverShellApiOutputs(root),/DATABASE_SOURCE_PHYSICAL_UNQUALIFIED/);
 // Native package resolution caches an admitted nearer path; isolate that
 // destructive negative last rather than treating removal as a new process.
 write('my-values/infra/node_modules/js-yaml/package.json','{"main":"index.js"}');write('my-values/infra/node_modules/js-yaml/index.js','process.stdout.write(process.env.PAYLOAD)');assert(!shellSelectedDatabaseReceiverProof(root,source,bytes,sink));fs.rmSync(path.join(root,'my-values/infra/node_modules'),{recursive:true});
}));


test('authored host children bind complete native file and response receivers without granting external observations',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),sources=['scripts/activate-native-worker-ax41.sh','scripts/install-native-worker-pools-stage.sh','scripts/prepare-ax41-buster-browser.sh','scripts/repair-native-nri-launch.sh','scripts/repair-native-worker-pools-lifetime.sh'];
 const children=['scripts/build-native-worker-nri.mjs','scripts/native-worker-node-capacity.mjs','scripts/native-worker-node-policy.mjs','scripts/native-worker-node-preflight.mjs','scripts/prepare-native-worker-pools.mjs','scripts/render-native-worker-node.mjs','skills/worker/core/worker/native-pool-policy.ts','skills/worker/core/worker/native-resource-observation.ts','skills/worker/core/worker/native-resource-pool.ts','skills/worker/core/worker/native-resource-scope.ts','skills/worker/core/worker/native-runtime-identity.ts','skills/worker/core/worker/resource-reservations.ts','tools/native-worker-nri/main.go','tools/native-worker-nri/main_test.go','tools/native-worker-nri/go.mod','tools/native-worker-nri/go.sum','versions.json','my-values/infra/native-worker-pools-ax41.yaml','package.json','package-lock.json'];
 for(const file of [...sources,...children])write(file,fs.readFileSync(path.join(repository,file)));
 for(const packageName of ['js-yaml','argparse'])fs.cpSync(path.join(repository,'node_modules',packageName),path.join(root,'node_modules',packageName),{recursive:true});
 const importer=path.join(root,'scripts/render-native-worker-node.mjs'),requireResolution=spawnSync(process.execPath,['--input-type=module','-e','import {createRequire} from "node:module";console.log(createRequire(process.argv[1]).resolve("js-yaml"));',importer],{cwd:root,encoding:'utf8'}),importResolution=spawnSync(process.execPath,['--experimental-import-meta-resolve','--input-type=module','-e','import {pathToFileURL} from "node:url";console.log(import.meta.resolve("js-yaml",pathToFileURL(process.argv[1]).href));',importer],{cwd:root,encoding:'utf8'});assert.equal(requireResolution.status,0,requireResolution.stderr);assert.equal(importResolution.status,0,importResolution.stderr);assert.equal(requireResolution.stdout.trim(),path.join(root,'node_modules/js-yaml/index.js'));assert.equal(importResolution.stdout.trim(),new URL('file://'+path.join(root,'node_modules/js-yaml/dist/js-yaml.mjs')).href);assert.notEqual(requireResolution.stdout.trim(),importResolution.stdout.trim());
 const selected=[];for(const source of sources){const bytes=fs.readFileSync(path.join(root,source),'utf8');for(const sink of shellRawOutputSinks(source,bytes)){const fact=shellSelectedHostReceiverProof(root,source,bytes,sink);if(fact)selected.push({source,bytes,sink,fact});}}
 assert.equal(selected.length,26);assert.equal(selected.filter(row=>row.sink.command==='node'||row.sink.command==='/usr/local/bin/node').length,9);
 for(const {source,bytes,sink,fact}of selected){assert.equal(fact.role,'non-api');assert.equal(fact.selectedOperation.canonicalStandaloneRole,'unknown');assert.equal(fact.selectedOperation.runtimeExecutionAuthorized,false);assert.equal(fact.selectedOperation.apiApplyAuthorized,false);assert(!shellSelectedHostReceiverProof(root,source,bytes,{...sink,line:-1}));assert(!shellSelectedHostReceiverProof(root,source,bytes,{...sink,args:[...sink.args,'$unreviewed']}));assert(!shellSelectedHostReceiverProof(root,source,bytes,{...sink,channel:sink.channel==='command-substitution'?'command-output':'command-substitution'}));}
 const {source,bytes,sink}=selected.find(row=>row.sink.command==='node');
 for(const file of children){const original=fs.readFileSync(path.join(root,file));write(file,Buffer.concat([original,Buffer.from('\n// unreviewed API writer/input change\n')]));assert(!shellSelectedHostReceiverProof(root,source,bytes,sink),file);write(file,original);}
 for(const parent of sources){const original=fs.readFileSync(path.join(root,parent),'utf8');write(parent,original+'\npayload-emitter | kubectl apply -f -\n');const row=selected.find(row=>row.source===parent);assert(!shellSelectedHostReceiverProof(root,parent,original,row.sink));assert(!shellSelectedHostReceiverProof(root,parent,original+'\npayload-emitter | kubectl apply -f -\n',row.sink));write(parent,original);}
 for(const [parent,command]of [[sources[0],'/opt/nri/plugins/10-kubeclaw-native'],[sources[1],'$bundle/10-kubeclaw-native'],[sources[0],'systemctl']]){const original=fs.readFileSync(path.join(root,parent),'utf8'),external=shellRawOutputSinks(parent,original).find(row=>row.command===command);assert(external);assert(!shellSelectedHostReceiverProof(root,parent,original,external),'external observation must not gain authored-child role');}
 write('tools/native-worker-nri/extra.go','package main\nfunc init(){println("apiVersion: v1\\nkind: Secret")}');assert(!shellSelectedHostReceiverProof(root,source,bytes,sink));fs.rmSync(path.join(root,'tools/native-worker-nri/extra.go'));assert(shellSelectedHostReceiverProof(root,source,bytes,sink));
 write('scripts/package.json','{"name":"js-yaml","exports":"./unreviewed.mjs"}');assert(!shellSelectedHostReceiverProof(root,source,bytes,sink));fs.rmSync(path.join(root,'scripts/package.json'));assert(shellSelectedHostReceiverProof(root,source,bytes,sink));
 const registry=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json')));write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({shellRawOutputContracts:registry.shellRawOutputContracts.filter(row=>sources.includes(row.source))}));
 write(source,'#!/usr/bin/env bash\n');assert.throws(()=>discoverShellApiOutputs(root),/HOST_SOURCE_CHANGED_UNQUALIFIED/);write(source,bytes);fs.rmSync(path.join(root,source));assert.throws(()=>discoverShellApiOutputs(root),/HOST_SOURCE_PHYSICAL_UNQUALIFIED/);
}));


test('deployment receipt programs preserve private effects and actual API selector inputs without runtime success claims',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),source='scripts/deploy.sh',helper='scripts/production-receipt-attestation.mjs',bytes=fs.readFileSync(path.join(repository,source),'utf8');
 write(source,bytes);write(helper,fs.readFileSync(path.join(repository,helper)));
 const raw=shellRawOutputSinks(source,bytes),selected=raw.map(sink=>({sink,fact:shellSelectedDeploymentReceiptReceiverProof(root,source,bytes,sink)})).filter(row=>row.fact);
 assert.equal(selected.length,82);assert.equal(selected.filter(row=>row.fact.role==='api').length,18);
 for(const {sink,fact}of selected){assert.deepEqual(fact.outputs,[]);assert.equal(fact.selectedOperation.canonicalStandaloneRole,'unknown');assert.equal(fact.selectedOperation.runtimeExecutionAuthorized,false);assert.equal(fact.selectedOperation.apiApplyAuthorized,false);assert.equal(fact.selectedOperation.knownUnresolvedSourceContracts.length,2);assert(!shellSelectedDeploymentReceiptReceiverProof(root,source,bytes,{...sink,line:-1}));assert(!shellSelectedDeploymentReceiptReceiverProof(root,source,bytes,{...sink,args:[...sink.args,'$unreviewed']}));assert(!shellSelectedDeploymentReceiptReceiverProof(root,source,bytes,{...sink,channel:sink.channel==='command-substitution'?'command-output':'command-substitution'}));assert(!shellSelectedDeploymentReceiptReceiverProof(root,'scripts/unowned.sh',bytes,sink));}
 const sink=selected[0].sink;
 for(const [before,after]of [
  ['.resources.leaseName','.unreviewedBody'],
  ['.resources.namespace','.unreviewedNamespace'],
  ['cleanupVerified:true,clusterCleanupObserved:true','cleanupVerified:false,clusterCleanupObserved:false'],
  ['--ignore-not-found','--unreviewed-selector'],
 ]){const changed=bytes.replace(before,after);assert.notEqual(changed,bytes,before);write(source,changed);assert(!shellSelectedDeploymentReceiptReceiverProof(root,source,changed,sink));write(source,bytes);}
 const original=fs.readFileSync(path.join(root,helper),'utf8');write(helper,original+'\nprocess.stdout.write(process.env.PAYLOAD);\n');assert(!shellSelectedDeploymentReceiptReceiverProof(root,source,bytes,sink));write(helper,original);assert(shellSelectedDeploymentReceiptReceiverProof(root,source,bytes,sink));
 // Source contract conflicts are retained facts, never successful preflight
 // or signing/verification evidence. No real receipt or key is used here.
 assert(!original.match(/const RECEIPT_SCHEMAS = new Set\(\[[\s\S]*?\]\)/u)[0].includes('nova-api-production-preflight.v1'));
 assert(bytes.includes('v.resources?.servicePort!==18080'));assert(original.includes('value.resources?.servicePort !== 80'));
 write(source,bytes+'\ncat "$receipt_signed" | kubectl apply -f -\n');assert(!shellSelectedDeploymentReceiptReceiverProof(root,source,bytes,sink));
 const registry=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json')));write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({shellRawOutputContracts:registry.shellRawOutputContracts.filter(row=>row.source===source)}));
 write(source,'#!/usr/bin/env bash\n');assert.throws(()=>discoverShellApiOutputs(root),/RECEIPT_SOURCE_CHANGED_UNQUALIFIED/);write(source,bytes);fs.rmSync(path.join(root,helper));assert.throws(()=>discoverShellApiOutputs(root),/RECEIPT_CHILD_INPUT_UNQUALIFIED/);write(helper,original);fs.rmSync(path.join(root,source));assert.throws(()=>discoverShellApiOutputs(root),/RECEIPT_SOURCE_PHYSICAL_UNQUALIFIED/);
}));


test('Source-only omission stays scoped while checkout source and boundary removal cannot bypass custody',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),sources=['scripts/activate-native-worker-ax41.sh','scripts/install-native-worker-pools-stage.sh'];
 for(const source of sources)write(source,fs.readFileSync(path.join(repository,source)));
 const registry=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json')));write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({shellRawOutputContracts:registry.shellRawOutputContracts.filter(row=>sources.includes(row.source))}));
 const before=discoverShellExternalOutputBoundaries(root);assert.equal(before.length,2);
 const link=(source,line)=>`[${source}](source/${source}#L${line})`,visibleBefore=renderShellExternalOutputBoundaries(before,link,root);assert(visibleBefore);
 // A Source-only corpus is not the selected complete product checkout.
 // The still-declared missing-source negative above remains fail-closed.
 for(const source of sources)fs.rmSync(path.join(root,source));write('scripts/docs-api-producer-adapter-authorities.json','{"shellRawOutputContracts":[]}');
 assert.deepEqual(discoverShellExternalOutputBoundaries(root),[]);assert.deepEqual(discoverShellApiOutputs(root),[]);
 assert.throws(()=>renderShellExternalOutputBoundaries(before,link,root),/API_REFERENCE_EXTERNAL_BOUNDARY_DRIFT/);
 const visibleAfter=renderShellExternalOutputBoundaries([],link,root);assert.notEqual(visibleBefore,visibleAfter); // old generated bytes are stale, not a full --check execution
 write('scripts/still-opaque.sh',`#!/bin/sh\nprintf '%s' "$PAYLOAD"\n`);
 assert.throws(()=>discoverShellApiOutputs(root),/API_PRODUCT_SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED.*still-opaque/);
 // The immutable supported-family declarations remain binding in a full
 // checkout even after deleting both sources AND every mutable contract.
 // Legitimate A911-10 migration must migrate these declarations too; no
 // production flag or receipt rewrite can opt out of this check.
 fs.mkdirSync(path.join(root,'.git'));assert.throws(()=>discoverShellApiOutputs(root),/SOURCE_PHYSICAL_UNQUALIFIED/);
 assert.throws(()=>discoverShellExternalOutputBoundaries(root),/API_EXTERNAL_OUTPUT_BOUNDARY_PHYSICAL_DRIFT/);
}));

test('optional-context arrays retain CronJob merge PATCH and Archviewer Secret bodies with unknown live inputs',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),sources=['scripts/configure-prism-job-cleanup.sh','scripts/prepare-nova-archviewer-auth.sh'];
 for(const source of sources)write(source,fs.readFileSync(path.join(repository,source)));
 const selected=[];for(const source of sources){const bytes=fs.readFileSync(path.join(root,source),'utf8');for(const sink of shellRawOutputSinks(source,bytes)){const fact=shellSelectedAliasedApiRequestProof(root,source,bytes,sink);assert(fact,JSON.stringify(sink));selected.push({source,bytes,sink,fact});}}
 assert.equal(selected.length,9);const outputs=selected.flatMap(row=>row.fact.outputs);assert.equal(outputs.length,4);
 const patches=outputs.filter(row=>row.context.requestMethod==='PATCH');assert.equal(patches.length,3);assert.deepEqual(patches.map(row=>row.context.requestReceiver.name),['prism-backup','prism-backup-verification','prism-restore-proof']);
 for(const row of patches){assert.equal(row.context.apiVersion,'batch/v1');assert.equal(row.context.kind,'CronJob');assert.equal(row.context.requestPatchType,'merge');assert.deepEqual(row.value,{spec:{successfulJobsHistoryLimit:0,failedJobsHistoryLimit:3}});assert.equal(row.context.requestReceiver.namespace,'kubeclaw');assert.equal(row.context.conditions[0].requiredTruth,true);}
 const secret=outputs.find(row=>row.context.requestMethod==='POST');assert.equal(secret.value.kind,'Secret');assert.equal(secret.value.metadata.name,'nova-archviewer-auth');assert.equal(secret.value.metadata.namespace,'kubeclaw');assert(!Object.hasOwn(secret.value,'type'),'retain exact actual kubectl omission; do not insert API default as submitted field');assert.deepEqual(Object.keys(secret.value.data),['htpasswd']);assert.equal(Buffer.from(secret.value.data.htpasswd,'base64').toString(),'__docs_controlled_offline_file_input__\n');assert.equal(secret.context.forwardedProducer.controlledWireShapeOnly,true);assert.equal(secret.context.forwardedProducer.controlledValues,true);assert.equal(secret.context.forwardedProducer.actualCredentialRead,false);assert.equal(secret.context.forwardedProducer.apiServerContact,false);assert(secret.context.forwardedProducer.offlineConstructorArgv.includes('--dry-run=client'));assert(secret.context.forwardedProducer.offlineConstructorArgv.some(argument=>argument?.file==='htpasswd'&&argument.prefix==='--from-file=htpasswd='));assert.match(secret.context.forwardedProducer.inputTransportSourceDigest,/^[a-f0-9]{64}$/u);assert.match(secret.context.forwardedProducer.inputTransport,/no named fixture/);assert.match(secret.context.forwardedProducer.toolchainDigest,/^[a-f0-9]{64}$/u);
 const credential=selected.find(row=>row.sink.command==='htpasswd');assert.equal(credential.fact.role,'api');assert.deepEqual(credential.fact.outputs,[]);assert.equal(credential.fact.selectedOperation.receiver.field,'Secret.data.htpasswd');
 for(const {source,bytes,sink,fact}of selected){assert.equal(fact.selectedOperation.canonicalStandaloneRole,'unknown');assert.equal(fact.selectedOperation.runtimeExecutionAuthorized,false);assert.equal(fact.selectedOperation.apiApplyAuthorized,false);assert(!shellSelectedAliasedApiRequestProof(root,source,bytes,{...sink,line:-1}));assert(!shellSelectedAliasedApiRequestProof(root,source,bytes,{...sink,args:[...sink.args,'$payload']}));assert(!shellSelectedAliasedApiRequestProof(root,source,bytes,{...sink,channel:sink.channel==='command-substitution'?'command-output':'command-substitution'}));assert(!shellSelectedAliasedApiRequestProof(root,'scripts/unowned.sh',bytes,sink));}
 const contracts=()=>sources.map(source=>{const bytes=fs.readFileSync(path.join(root,source),'utf8'),sinks=shellRawOutputSinks(source,bytes);return{source,role:'non-api',basis:'test label must not conceal owned requests',consumer:'test-only actual-source vectors',sinks,operationRecipe:shellRawOutputOperationRecipe(source,bytes),sinkConsumers:sinks.map(sink=>({source,line:sink.line,command:sink.command,channel:sink.channel??'command-output',argumentsDigest:sha(JSON.stringify(sink.args)),kind:sink.channel==='command-substitution'?'captured-operation':'native-tool-or-selected-stream',purpose:'selected full Source receiver/request under test',sourceEvidence:bytes.split('\n')[sink.line-1]}))};});
 const refresh=()=>write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({shellRawOutputContracts:contracts()}));refresh();
 assert.equal(discoverShellApiOutputs(root).length,4);assert(discoverShellOutputRoleClassifications(root).every(row=>row.role==='mixed-api-and-native-channels'));
 for(const [source,before,after]of [
  [sources[0],'prism-backup prism-backup-verification prism-restore-proof','unreviewed-job'],
  [sources[0],'"successfulJobsHistoryLimit":0','"successfulJobsHistoryLimit":1'],
  [sources[0],'--type=merge','--type=json'],
  [sources[0],'kube=(kubectl)','kube=("$UNBOUND_EXECUTABLE")'],
  [sources[1],'namespace=kubeclaw','namespace=unreviewed'],
  [sources[1],'name=nova-archviewer-auth','name=unreviewed'],
  [sources[1],'--from-file="htpasswd=$temporary/htpasswd"','--from-file="foreign=$temporary/htpasswd"'],
  [sources[1],'get("htpasswd")','get("foreign")'],
  [sources[1],'-B -C 10 -c','-b -c'],
  [sources[1],'trap \'rm -f -- "$temporary/htpasswd"; rmdir -- "$temporary"\' EXIT','trap : EXIT'],
 ]){const bytes=fs.readFileSync(path.join(root,source),'utf8'),changed=bytes.replace(before,after);assert.notEqual(changed,bytes,before);write(source,changed);refresh();assert.throws(()=>discoverShellApiOutputs(root),/ALIASED_API_SOURCE_CHANGED_UNQUALIFIED/);write(source,bytes);refresh();assert.equal(discoverShellApiOutputs(root).length,4);}
 const source=sources[1],bytes=fs.readFileSync(path.join(root,source),'utf8');write(source,bytes+'\ncat "$temporary/htpasswd" | kubectl apply -f -\n');refresh();assert.throws(()=>discoverShellApiOutputs(root),/ALIASED_API_SOURCE_CHANGED_UNQUALIFIED/);write(source,bytes);refresh();fs.rmSync(path.join(root,source));assert.throws(()=>discoverShellApiOutputs(root),/ALIASED_API_SOURCE_PHYSICAL_UNQUALIFIED/);
}));


test('deployment configuration captures retain typed API inputs and original all-document renderer ownership',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),source='scripts/deploy.sh',files=["my-values/infra/litellm-config.yaml","my-values/infra/litellm-deployment.yaml","my-values/infra/native-worker-pools-ax41.yaml","my-values/infra/network-policies.yaml","my-values/infra/postgresql-recovery.yaml","my-values/infra/postgresql-values.yaml","my-values/infra/redis-values.yaml","my-values/infra/registry-local.yaml","my-values/infra/tailscale-operator-values.yaml","node_modules/js-yaml/dist/js-yaml.mjs","package-lock.json","package.json","scripts/build-native-worker-nri.mjs","scripts/deploy.sh","scripts/docs-api-product-scope.mjs","scripts/gitops-adoption-shape.mjs","scripts/gitops-bundle.mjs","scripts/gitops-owner.mjs","scripts/infrastructure-chart-lock.mjs","scripts/infrastructure-chart.mjs","scripts/infrastructure-image-renderer.mjs","scripts/infrastructure-oci-chart.mjs","scripts/infrastructure-release.mjs","scripts/native-worker-deployment-preflight.mjs","scripts/native-worker-node-capacity.mjs","scripts/native-worker-node-policy.mjs","scripts/native-worker-node-preflight.mjs","scripts/postgresql-recovery-preflight.mjs","scripts/postgresql-recovery.sh","scripts/prepare-native-worker-pools.mjs","scripts/render-litellm-deployment.mjs","scripts/render-native-worker-node.mjs","scripts/render-postgresql-recovery.mjs","scripts/render-registry-local.mjs","scripts/render-stateful-network-policies.mjs","scripts/stateful-database-service.mjs","scripts/stateful-release-preflight.mjs","scripts/updates/code-release.mjs","scripts/updates/deployment-release.mjs","scripts/updates/materialize-release.mjs","scripts/updates/release-configuration.mjs","scripts/updates/runtime-inputs.mjs","skills/worker/core/worker/native-pool-policy.ts","skills/worker/core/worker/native-resource-observation.ts","skills/worker/core/worker/native-resource-pool.ts","skills/worker/core/worker/native-resource-scope.ts","skills/worker/core/worker/native-runtime-identity.ts","skills/worker/core/worker/resource-reservations.ts","tools/native-worker-nri/go.mod","tools/native-worker-nri/go.sum","tools/native-worker-nri/main.go","tools/native-worker-nri/main_test.go","versions.json"];
 for(const file of files)write(file,fs.readFileSync(path.join(repository,file)));
 for(const packageName of ['js-yaml','argparse','yaml'])fs.cpSync(path.join(repository,'node_modules',packageName),path.join(root,'node_modules',packageName),{recursive:true});
 const bytes=fs.readFileSync(path.join(root,source),'utf8'),selected=shellRawOutputSinks(source,bytes).map(sink=>({sink,fact:shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink)})).filter(row=>row.fact);
 assert.equal(selected.length,84);
 const types=selected.filter(row=>row.fact.selectedOperation.occurrenceRole==='typed-secret-input');assert.equal(types.length,18);assert(types.every(row=>row.fact.role==='api'&&row.fact.outputs.length===0));
 const identity=selected.filter(row=>row.fact.selectedOperation.occurrenceRole==='api-resource-identity-input');assert.equal(identity.length,2);assert(identity.every(row=>row.fact.role==='api'));
 const renderers=selected.filter(row=>row.fact.selectedOperation.occurrenceRole==='api-body-render-child');assert.equal(renderers.length,4);
 for(const {sink,fact}of renderers){assert.equal(fact.role,'api');assert.equal(fact.outputs.length,0);assert.match(fact.selectedOperation.requiredDiscovery,/discoverTransformedApiOutputs/);assert.match(fact.selectedOperation.emissionRule,/every apiVersion\/kind doc/);assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,{...sink,line:-1}));assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,{...sink,args:[...sink.args,'--foreign']}));assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,{...sink,channel:'command-output'}));}
 for(const {fact}of selected){assert.equal(fact.selectedOperation.canonicalStandaloneRole,'unknown');assert.equal(fact.selectedOperation.runtimeExecutionAuthorized,false);assert.equal(fact.selectedOperation.apiApplyAuthorized,false);}
 // Live preflight children are not covered by path/control or stream labels.
 for(const line of [1939,2659,2668]){const sink=shellRawOutputSinks(source,bytes).find(row=>row.line===line);assert(sink);assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink));}
 const sink=renderers[0].sink;
 for(const file of ['scripts/render-stateful-network-policies.mjs','scripts/render-litellm-deployment.mjs','scripts/render-registry-local.mjs','scripts/infrastructure-release.mjs','scripts/gitops-bundle.mjs','scripts/docs-api-product-scope.mjs','my-values/infra/network-policies.yaml','my-values/infra/litellm-deployment.yaml','my-values/infra/registry-local.yaml']){
  const original=fs.readFileSync(path.join(root,file));write(file,Buffer.concat([original,Buffer.from('\n# appended unreviewed resource/forwarding change\n')]));assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink),file);write(file,original);
 }
 for(const changed of [bytes.replace('rand -hex 32','rand -hex 64'),bytes.replace('render-litellm-deployment.mjs','foreign-renderer.mjs'),bytes+'\npayload-emitter | kubectl apply -f -\n']){assert.notEqual(changed,bytes);write(source,changed);assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,changed,sink));assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink));write(source,bytes);}
 write('scripts/package.json','{"name":"js-yaml","exports":"./foreign.mjs"}');assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink));fs.rmSync(path.join(root,'scripts/package.json'));assert(shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink));
 // A previously resolved root package must not hide later nearer packages.
 for(const [directory,packageName]of [['scripts','yaml'],['scripts/updates','js-yaml']]){const entry=`${directory}/node_modules/${packageName}/index.js`;write(entry,'throw Error("foreign package")');write(`${directory}/node_modules/${packageName}/package.json`,JSON.stringify({name:packageName,main:'index.js'}));assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink));fs.rmSync(path.join(root,directory,'node_modules'),{recursive:true});assert(shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink));}
 const yamlEntry='node_modules/yaml/dist/index.js',yamlOriginal=fs.readFileSync(path.join(root,yamlEntry));write(yamlEntry,Buffer.concat([yamlOriginal,Buffer.from('\n// changed serialization\n')]));assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink));write(yamlEntry,yamlOriginal);assert(shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink));
 fs.rmSync(path.join(root,'scripts/render-litellm-deployment.mjs'));assert(!shellSelectedDeploymentConfigurationReceiverProof(root,source,bytes,sink));
}));


test('finite receiver programs do not grant child API, arbitrary scalar, archive contents or cached executable identity',()=>fixture(({root,write})=>{
 const repository=path.resolve(new URL('../..',import.meta.url).pathname),sources=["ops/pod/kubectl-build/verify-version.sh","scripts/bootstrap-prism-tests.sh","scripts/deploy-argocd.sh","scripts/deploy-cilium.sh","scripts/migrate-kubeclaw-network-policies-to-cilium.sh","scripts/package-agent-skill-bundle.sh","scripts/pipeline-light-openclaw-notify.sh","scripts/pipeline-light-watchdog.sh","scripts/prepare-image-build-runner.sh","scripts/prepare-nova-archviewer-auth.sh","scripts/prepare-postgresql-production-upgrade.sh","scripts/prepare-reliability-services.sh","scripts/remove-qdrant.sh","scripts/scan-runtime-images.sh","scripts/setup.sh"];
 for(const file of [...sources,'versions.json'])write(file,fs.readFileSync(path.join(repository,file)));
 const selected=[];for(const source of sources){const bytes=fs.readFileSync(path.join(root,source),'utf8');for(const sink of shellRawOutputSinks(source,bytes)){const fact=shellSelectedFiniteReceiverProof(root,source,bytes,sink);if(fact)selected.push({source,bytes,sink,fact});}}
 assert.equal(selected.length,78);
 for(const {source,bytes,sink,fact}of selected){assert.equal(fact.selectedOperation.canonicalStandaloneRole,'unknown');assert.equal(fact.selectedOperation.runtimeExecutionAuthorized,false);assert.equal(fact.selectedOperation.apiApplyAuthorized,false);assert.deepEqual(fact.outputs,[]);assert(!shellSelectedFiniteReceiverProof(root,source,bytes,{...sink,line:-1}));assert(!shellSelectedFiniteReceiverProof(root,source,bytes,{...sink,args:[...sink.args,'$foreign']}));assert(!shellSelectedFiniteReceiverProof(root,source,bytes,{...sink,channel:sink.channel==='command-substitution'?'command-output':'command-substitution'}));}
 for(const source of sources){const bytes=fs.readFileSync(path.join(root,source),'utf8'),row=selected.find(row=>row.source===source);if(source==='scripts/prepare-reliability-services.sh'){assert(!row);continue;}assert(row);const changed=bytes+'\npayload-emitter | kubectl apply -f -\n';write(source,changed);assert(!shellSelectedFiniteReceiverProof(root,source,bytes,row.sink));assert(!shellSelectedFiniteReceiverProof(root,source,changed,row.sink));write(source,bytes);}
 for(const [source,line]of [['scripts/migrate-kubeclaw-network-policies-to-cilium.sh',80],['scripts/package-agent-skill-bundle.sh',30],['scripts/remove-qdrant.sh',59],['ops/pod/kubectl-build/verify-version.sh',10]]){const bytes=fs.readFileSync(path.join(root,source),'utf8'),sink=shellRawOutputSinks(source,bytes).find(sink=>sink.line===line);assert(sink);assert(!shellSelectedFiniteReceiverProof(root,source,bytes,sink),'unqualified child/API/body/module proof must not acquire finite receiver role');}
 const trivy=selected.filter(row=>row.sink.command==='install_trivy');assert.equal(trivy.length,2);assert(trivy.every(row=>row.fact.selectedOperation.limit.includes('cache-hit identity UNKNOWN')));
 const externalCwdSource='scripts/prepare-reliability-services.sh',externalCwdBytes=fs.readFileSync(path.join(root,externalCwdSource),'utf8'),externalCwdSink=shellRawOutputSinks(externalCwdSource,externalCwdBytes).find(row=>row.line===7);assert(externalCwdSink);assert(!shellSelectedFiniteReceiverProof(root,externalCwdSource,externalCwdBytes,externalCwdSink),'unbound CWD-relative require must remain UNKNOWN');
 write('foreign-cwd/versions.json',JSON.stringify({infrastructure:{redis:'foreign-source-selected-value'}}));const actual=spawnSync(process.execPath,['-p',externalCwdSink.args[1]],{cwd:path.join(root,'foreign-cwd'),encoding:'utf8'});assert.equal(actual.status,0);assert.equal(actual.stdout.trim(),'foreign-source-selected-value');

}));


test('controlled Secret file input uses sealed anonymous descriptors and one exact allowed prefix',()=>fixture(({root})=>{
 const before=fs.readdirSync(root).sort(),program=String.raw`
import errno,fcntl,json,os,sys
argument=sys.argv[1]
assert argument.startswith('--from-file=htpasswd=/proc/')
filename=argument.split('=',2)[2]
fd=os.open(filename,os.O_RDWR)
try:
    content=os.read(fd,4096)
    seals=fcntl.fcntl(fd,fcntl.F_GET_SEALS)
    try:
        os.write(fd,b'changed')
        raise AssertionError('sealed descriptor unexpectedly writable')
    except OSError as error:
        assert error.errno==errno.EPERM
    print(json.dumps({'content':content.decode(),'sealed':seals & 15 == 15,'anonymous':os.readlink(filename).startswith('/memfd:')}))
finally:
    os.close(fd)
`;
 const result=runDocumentationInputs('python3',['-I','-B','-c',program,{file:'htpasswd',prefix:'--from-file=htpasswd='}],new Map([['htpasswd',Buffer.from('public-controlled-input\n')]]),{cwd:root});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{content:'public-controlled-input\n',sealed:true,anonymous:true});assert.deepEqual(fs.readdirSync(root).sort(),before);
 assert.throws(()=>runDocumentationInputs('python3', [{file:'htpasswd',prefix:'--from-file=unqualified='}],new Map([['htpasswd',Buffer.from('public')]]),{cwd:root}),/ARGUMENT_INVALID/);
}));
