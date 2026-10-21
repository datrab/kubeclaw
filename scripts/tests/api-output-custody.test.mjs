import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import {reviewedImporterResolutionOperation} from '../docs-api-documentation-role-custody.mjs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {documentationModuleInputAuthority,discoverScriptApiOutputs,discoverScriptOutputRoleClassifications,discoverTransformedApiOutputs,discoverShellApiOutputs,producerAdapterOperationRecipe,shellRawOutputSinks,shellRawOutputOperationRecipe} from '../docs-api-output-discovery.mjs';
import {classifySerializedOutputRoles,deriveNativeOperationFacts,nativeOperationFactDigest} from '../docs-api-output-role-classification.mjs';
import {shellHeredocCustody,shellCommandAcquisitions} from '../docs-shell-source-custody.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const secret="const body={apiVersion:'v1',kind:'Secret',metadata:{name:'custody'}};console.log(JSON.stringify(body));\n";
function fixture(run){const root=fs.mkdtempSync(path.join(os.tmpdir(),'docs-output-custody-'));const write=(file,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);};write('package.json','{"scripts":{}}');try{run({root,write,discover:()=>discoverScriptApiOutputs(root)});}finally{fs.rmSync(root,{recursive:true,force:true});}}

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
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));manifest.scripts['verify:migration:package-boundaries']+=' --import ./foreign-loader.mjs';write('package.json',JSON.stringify(manifest));assert.throws(()=>qualify(),/bound bytes/);
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
