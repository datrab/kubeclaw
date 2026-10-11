import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import ts from 'typescript';
import { createSerializedOutputRoleClassifier } from './docs-api-output-role-classification.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const syntheticDigest = 'a'.repeat(64);
// Public product execution and extension roots. Tests/fixtures are synthetic;
// dependency/vendor trees are external authorities; docs are publication inputs.
// Experimental spikes are not supported deployment or extension entry points.
const producerRoots=['scripts','skills','ops','tools','bin','cmd','docker','packaging','plugins','contracts','my-values'];
function documentationToolSources(root) {
  const file=path.join(root,'package.json');if(!fs.existsSync(file))return new Set();
  const scripts=JSON.parse(fs.readFileSync(file,'utf8')).scripts??{};const result=new Set();const queue=[];const registryFile=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');const qualifiedBoundary=new Set(fs.existsSync(registryFile)?JSON.parse(fs.readFileSync(registryFile,'utf8')).documentationToolBoundary?.sources??[]:[]);
  for(const [name,command]of Object.entries(scripts))if(name.startsWith('docs:')||name.startsWith('verify:docs:'))for(const match of command.matchAll(/\b(scripts\/docs-[A-Za-z0-9_-]+\.mjs)\b/gu))queue.push(match[1]);
  while(queue.length){const source=queue.pop();if(result.has(source)||!qualifiedBoundary.has(source)||!fs.existsSync(path.join(root,source)))continue;result.add(source);const bytes=fs.readFileSync(path.join(root,source),'utf8');for(const helper of bytes.matchAll(/new URL\('\.\/(docs-[A-Za-z0-9_-]+\.(?:py|go))',import\.meta\.url\)/gu)){const target=path.posix.join(path.dirname(source),helper[1]);if(qualifiedBoundary.has(target))result.add(target);}for(const match of bytes.matchAll(/(?:from\s*|import\s*\()(['"])(\.\.?\/[^'"]+)\1/gu)){const target=path.posix.normalize(path.posix.join(path.dirname(source),match[2]));if(/^scripts\/docs-[^/]+\.mjs$/u.test(target))queue.push(target);}}
  return result;
}
function assertNativeSerializationRoles(root,source,bytes,language) {
  const authority=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');
  const contracts=fs.existsSync(authority)?JSON.parse(fs.readFileSync(authority,'utf8')).nativeLanguageSerializationContracts??[]:[];
  const nativeOutputs=contracts.filter(record=>record.source===source&&record.language===language).flatMap(record=>record.outputs??[]);
  if(language==='Python'){
    const parsed=spawnSync('python3',[new URL('./docs-api-python-output-adapter.py',import.meta.url).pathname,path.join(root,source),'--classify'],{encoding:'utf8',env:{PATH:process.env.PATH}});
    assert.equal(parsed.status,0,`API_PRODUCT_PYTHON_SERIALIZATION_PARSE_FAILED: ${source}: ${parsed.stderr}`);
    assert(JSON.parse(parsed.stdout).every(output=>output.role==='non-api'||nativeOutputConsumerMatches(output,nativeOutputs,root)),`API_PRODUCT_PYTHON_SERIALIZED_OUTPUT_ROLE_UNQUALIFIED: ${source}`);
  }
}
function nativeOutputConsumerMatches(output,contracts,root) {
 // Digests only invalidate reviewed facts. A role also requires the actual
 // operation to satisfy its consumer grammar; a generic diagnostic label does
 // not authorize a new root, writer, HTTP client or output argument.
 if(output.transportBodyQualified===false)return false;
 function nativeHttpResponseRecipe(){
  // These are selected, inspected router/response constructor declarations,
  // not a source-module exemption. The routers return the ready envelope,
  // product-subjects envelope, or the persisted decision receipt. A refreshed
  // registry digest cannot authorize a replacement constructor or new route.
  const routers={productHandler:'e6207009937c85a6c20f24b4c4325afec71d8674fcfd37a442f4ff89cb6f7905',readinessHandler:'fc9bb294ed751512a810cde45e4e329da27e0f4a5dc637a69dffe59d6b71d73e'};
  const constructors={commitProduct:'9db306489982efa4fcb213ee4caa1bfef05175192f077394afa91ba94bc7785d',productReceipt:'093407fbd5fa71a9de7898572aea6a12558779a0782c8c8fcd9cea0502716a3e',productRecords:'53b4c7b8218adbf86e8812eccc803314c5376925c7ab51e6afcf26a2bb3ff1bd',productSubject:'d6ae13944edccd2862149794296a5f0424f9fc69d6863c4e34da06dfcf687da1'};
  if(output.function==='readinessHandler')constructors.readyResponse='c337ca7727f6328352cf424c29e619f67b6d009806a7789de10a7048b4bd04c1';
  return routers[output.function]===hash(output.operation)&&Object.entries(constructors).every(([symbol,sha256])=>output.dependencies?.some(fact=>fact.symbol===symbol&&fact.sha256===sha256));
 }
 function nativeTransportRecipe(kind,operation) {
  // These closed transfer recipes preserve the selected body through JSON
  // encoding and request construction. Incoming bodies are qualified by the
  // AST adapter separately. Adding a replacement body/request invalidates this
  // grammar even if every registry digest is refreshed.
  const payload=`func requestPayload(body interface{}) (io.Reader, error) {
   if body == nil { return nil, nil }
   data, err := json.Marshal(body)
   if err != nil { return nil, err }
   return bytes.NewReader(data), nil
  }`;
  const request=`func (c *controller) kube(ctx context.Context, method string, path string, body interface{}, contentType string, out interface{}) error {
   payload, err := requestPayload(body)
   if err != nil { return err }
   req, err := http.NewRequestWithContext(ctx, method, c.apiURL+kubePath(path), payload)
   if err != nil { return err }
   token, err := os.ReadFile(c.tokenPath)
   if err != nil { return fmt.Errorf("read Kubernetes ServiceAccount token: %w", err) }
   credential := strings.TrimSpace(string(token))
   if credential == "" { return errors.New("Kubernetes ServiceAccount token is empty") }
   req.Header.Set("Authorization", "Bearer "+credential)
   req.Header.Set("Accept", "application/json")
   if body != nil { req.Header.Set("Content-Type", contentType) }
   resp, err := c.httpClient.Do(req)
   if err != nil { return err }
   defer resp.Body.Close()
   responseBody, err := io.ReadAll(resp.Body)
   if err != nil { return err }
   if err := kubeResponseError(resp.StatusCode, responseBody); err != nil { return err }
   if out == nil || len(responseBody) == 0 { return nil }
   return json.Unmarshal(responseBody, out)
  }`;
  const compact=value=>value.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\s+|;/gu,token=>/^["'`]/u.test(token)?token:'');
  return compact(operation)===compact(kind==='go-kubernetes-payload'?payload:request);
 }
 function semanticConsumer(consumer){
  const expression=output.expression,operation=output.operation??'';
  const resultName=operation.match(new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\s*,[^\\n]*:?=\\s*${expression.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')}`,'u'))?.[1];
  const external=/\b(?:os\.Args|os\.Getenv|os\.Stdin|sys\.argv|input\(|eval\(|exec\()/u.test(expression);
  if(external)return false;
  switch(consumer.kind){
   case 'go-error-stderr':return /^fmt\.Fprintln\(os\.Stderr, err(?:\.Error\(\))?\)$/u.test(expression)&&/if (?:[^\n]+;\s*)?err != nil\s*\{/u.test(operation)&&consumer.errorOrigins?.some(origin=>operation.includes(origin))&&/os\.Exit\(1\)/u.test(operation);
   case 'go-digest':return /^json\.Marshal\(/u.test(expression)&&/sha256\.Sum256\(/u.test(operation)&&resultName&&new RegExp(`(?:Sum256|Transform)\\(${resultName}\\)`, 'u').test(operation);
   case 'go-equality':return /^json\.Marshal\(/u.test(expression)&&resultName&&(new RegExp(`bytes\\.Equal\\([^)]*\\b${resultName}\\b`, 'u').test(operation)||new RegExp(`string\\(${resultName}\\)\\s*(?:==|!=)|(?:==|!=)\\s*string\\(${resultName}\\)`, 'u').test(operation));
   case 'go-byte-limit':return /^json\.Marshal\(/u.test(expression)&&resultName&&new RegExp(`len\\(${resultName}\\)`, 'u').test(operation);
   case 'go-roundtrip':return /^json\.Marshal\(/u.test(expression)&&resultName&&new RegExp(`json\\.Unmarshal\\(${resultName},`, 'u').test(operation);
   case 'go-canonical-codec':return /^json\.Marshal\(/u.test(expression)&&resultName&&new RegExp(`jsoncanonicalizer\\.Transform\\(${resultName}\\)`, 'u').test(operation);
   case 'go-retention-parser':return expression==='json.Marshal(value)'&&/state\["schemaVersion"\] != "demo-readiness.v2"/u.test(operation)&&/return parseDemoRetention\(raw\)/u.test(operation);
   case 'go-rbac-projection':return expression==='json.Marshal(value)'&&/"kind": resource\["kind"\], "namespace": metadata\["namespace"\], "name": metadata\["name"\]/u.test(operation)&&/\[\]string\{"roleRef", "subjects", "rules", "aggregationRule"\}/u.test(operation)&&/return string\(encoded\)/u.test(operation);
   case 'go-log-envelope':{
    const closedLog=`func logJSON(level string, message string, detail interface{}) {
      record := map[string]interface{}{ "ts": time.Now().UTC().Format(time.RFC3339Nano), "level": level, "component": "buster-namespace-controller", "message": message, }
      if detail != nil { record["detail"] = detail }
      data, err := json.Marshal(record)
      if err != nil { fmt.Println(\`{"level":"error","component":"buster-namespace-controller","message":"failed to marshal log"}\`); return }
      fmt.Println(string(data))
    }`;
    return operation.replace(/\s+/gu,'').replaceAll(';','')===closedLog.replace(/\s+/gu,'').replaceAll(';','')&&['json.Marshal(record)','fmt.Println(string(data))','fmt.Println(`{"level":"error","component":"buster-namespace-controller","message":"failed to marshal log"}`)'].includes(expression);
   }
   case 'go-kubernetes-payload':return output.transportBodyQualified===true&&expression==='json.Marshal(body)'&&nativeTransportRecipe(consumer.kind,operation);
   case 'go-kubernetes-request':return output.transportBodyQualified===true&&expression==='c.httpClient.Do(req)'&&nativeTransportRecipe(consumer.kind,operation);
   case 'go-native-http-response':return /^json\.NewEncoder\(w\)(?:\.Encode\(result\))?$/u.test(expression)&&nativeHttpResponseRecipe()&&/w.Header\(\).Set\("Content-Type", "application\/json"\)/u.test(operation)&&/authenticate(?:Transport|Ready)\(/u.test(operation)&&/\/v1\/demo-(?:ready|product)/u.test(operation);
   case 'python-native-state':return (output.operation.match(/Name\(id='data', ctx=Store\(\)\)/gu)??[]).length===1&&!/attr='(?:update|setdefault|clear|pop|popitem)'/u.test(output.operation)&&!output.capabilityEscapes&&output.callerArguments?.length&&output.callerArguments.every(call=>call.positionalRoles.every(role=>role==='non-api')&&call.expandedKeys.every(keys=>keys!==null)&&!([...call.keywordNames.filter(Boolean),...call.expandedKeys.flat()].includes('apiVersion')&&[...call.keywordNames.filter(Boolean),...call.expandedKeys.flat()].includes('kind')))&&/^(?:temp.write_text\(json.dumps\(data\) \+ '\\n'\)|json.dumps\(data\))$/u.test(expression)&&operation.includes("Constant(value='phase')")&&operation.includes("Constant(value='observedAt')")&&operation.includes("Constant(value='pairingVerified')")&&operation.includes("Call(func=Attribute(value=Name(id='time', ctx=Load()), attr='time'");
   case 'python-process-exit-diagnostic':return expression==="print(f'Codex app-server failed to become ready (exit {child.poll()}).', flush=True)"&&operation.includes("Call(func=Attribute(value=Name(id='child', ctx=Load()), attr='poll'")&&operation.includes("attr='Popen'");
   case 'python-systemd-unit':return output.systemdUnitFlow?.sourcePath==='/etc/systemd/system/k3s.service'&&(expression==="(backup / 'original.service').write_text(original)"?output.systemdUnitFlow.transform==='original':expression==='staged.write_text(corrected)'&&output.systemdUnitFlow.transform==='repair'&&output.systemdUnitFlow.helperDigest==='5509c7dbc386819dacddc95719508e034aa53c583c1d8e80cb9da99d1d9faf43')&&operation.includes("Constant(value='systemd-analyze')")&&operation.includes("Constant(value='verify')")&&operation.includes("Constant(value='install')");
   default:return false;
  }
 }
 const dependencyFacts=output.dependencies?.map(fact=>({...fact,path:path.relative(root,fact.path)}));
 return contracts.some(contract=>contract.expression===output.expression&&contract.function===output.function&&contract.operationDigest===hash(output.operation)&&(!dependencyFacts||contract.dependencyFactsDigest===hash(JSON.stringify(dependencyFacts)))&&contract.consumer?.source&&contract.consumer?.purpose&&contract.consumer?.evidence?.length&&contract.consumer.evidence.every(expression=>output.operation.includes(expression))&&semanticConsumer(contract.consumer));
}
const syntheticImage = `example.invalid/discovery@sha256:${syntheticDigest}`;
export function producerAdapterOperationRecipe(source,bytes) {
  if(source.endsWith('.sh')){
    const parsed=spawnSync('python3',['-c',"import json,shlex,sys; lexer=shlex.shlex(sys.stdin.read(),posix=True,punctuation_chars=True); lexer.whitespace_split=True; print(json.dumps(list(lexer)))"],{input:bytes,encoding:'utf8',env:{PATH:process.env.PATH}});
    assert.equal(parsed.status,0,`API_PRODUCT_ADAPTER_OPERATION_PARSE_FAILED: ${source}: ${parsed.stderr}`);return {language:'Shell',tokens:JSON.parse(parsed.stdout)};
  }
  if(source.endsWith('.py')){
    const parsed=spawnSync('python3',['-c',"import ast,json,sys; print(json.dumps(ast.dump(ast.parse(sys.stdin.read()),include_attributes=False)))"],{input:bytes,encoding:'utf8',env:{PATH:process.env.PATH}});
    assert.equal(parsed.status,0,`API_PRODUCT_ADAPTER_OPERATION_PARSE_FAILED: ${source}: ${parsed.stderr}`);return {language:'Python',ast:JSON.parse(parsed.stdout)};
  }
  const tree=ts.createSourceFile(source,bytes,ts.ScriptTarget.Latest,true);assert(!tree.parseDiagnostics.length,`API_PRODUCT_ADAPTER_OPERATION_PARSE_FAILED: ${source}`);
  return {language:'TypeScript',statements:tree.statements.map(node=>({kind:ts.SyntaxKind[node.kind],syntax:node.getText(tree)}))};
}
export function assertProducerAdapterAuthority(root,sources) {
  if(!sources.length)return;
  const file=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');
  assert(fs.existsSync(file),'API_PRODUCT_ADAPTER_AUTHORITY_MISSING: documentation output adapter maintainers must classify the original operation before rendering');
  const authority=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(authority.version,1,'API_PRODUCT_ADAPTER_AUTHORITY_INVALID');
  for(const source of sources) {
    const record=authority.sources?.[source];
    assert(record?.sha256&&record.operation,`API_PRODUCT_ADAPTER_OPERATION_UNCLASSIFIED: ${source}; ${authority.owner}`);
    const actualInvocations=fs.readFileSync(path.join(root,source),'utf8').replace(/\\\n/gu,' ').split('\n').map(line=>line.trim()).filter(line=>['helm ',"'helm'",'render-','continuousDocuments','bootstrapDocuments','infrastructure','charts/'].some(token=>line.includes(token))&&!line.startsWith('//')&&!line.startsWith('#'));
    assert.deepEqual(actualInvocations,record.invocations,`API_PRODUCT_ADAPTER_INVOCATION_DRIFT: ${source}; current source invocation differs from the qualified adapter`);
    assert(record.operationRecipe,`API_PRODUCT_ADAPTER_RECIPE_MISSING: ${source}`);
    assert.deepEqual(producerAdapterOperationRecipe(source,fs.readFileSync(path.join(root,source),'utf8')),record.operationRecipe,`API_PRODUCT_ADAPTER_RECIPE_DRIFT: ${source}; actual structured operation differs from the adapter recipe`);
    assert.equal(hash(fs.readFileSync(path.join(root,source))),record.operationDigest,`API_PRODUCT_ADAPTER_OPERATION_DRIFT: ${source}; an operation review and recipe binding are required`);
    assert.equal(hash(fs.readFileSync(path.join(root,source))),record.sha256,`API_PRODUCT_ADAPTER_AUTHORITY_DRIFT: ${source}; ${authority.owner}; ${authority.closureCondition}`);
  }
}
export function walkProductSources(root, directories, accept) {
  const result = [];
  const excluded = new Set(['node_modules', 'vendor', '.git', 'dist', 'test', 'tests', 'fixtures']);
  const visited=new Set();
  function visit(relative) {
    if (!fs.existsSync(path.join(root, relative))) return;
    const real=fs.realpathSync(path.join(root,relative));assert(real===fs.realpathSync(root)||real.startsWith(fs.realpathSync(root)+path.sep),`API_PRODUCT_PUBLIC_SYMLINK_OUTSIDE_ROOT: ${relative}`);if(visited.has(real))return;visited.add(real);
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      if (excluded.has(entry.name)) continue;
      const next = `${relative}/${entry.name}`;
      if(entry.isSymbolicLink()){const absolute=path.join(root,next);assert(fs.existsSync(absolute),`API_PRODUCT_PUBLIC_SYMLINK_DANGLING: ${next}`);const real=fs.realpathSync(absolute);assert(real.startsWith(fs.realpathSync(root)+path.sep),`API_PRODUCT_PUBLIC_SYMLINK_OUTSIDE_ROOT: ${next}`);if(fs.statSync(absolute).isDirectory())visit(next);else if(fs.statSync(absolute).isFile()&&accept(next))result.push(next);}else if (entry.isDirectory()) visit(next);
      else if (entry.isFile() && accept(next)) result.push(next);
    }
  }
  directories.forEach(visit);
  return result;
}
const merge = (base, override) => {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) result[key] = value && typeof value === 'object' && !Array.isArray(value)
    ? merge(result[key] && typeof result[key] === 'object' ? result[key] : {}, value) : value;
  return result;
};

// These are render inputs, never deployment credentials or claims that these
// synthetic identities exist. The producers and ordinary checked-in overrides
// are discovered from source; profile data exercises supported optional routes.
function profiles(root, chart) {
  const read = source => {
    const documents=YAML.parseAllDocuments(fs.readFileSync(path.join(root,source),'utf8'));
    assert(documents.every(document=>!document.errors.length), `API_PRODUCT_YAML_INVALID: ${source}`);
    return documents.length===1 ? documents[0].toJS() : null;
  };
  const defaultValues = read(`${chart}/values.yaml`);
  const name = chart.split('/').at(-1);
  let baseline = {};
  if (name === 'gitops') baseline = { repository: 'https://example.invalid/discovery.git', revision: syntheticDigest.slice(0,40), project:'discovery', rootName:'discovery',
    groups:[{name:'discovery',wave:2,path:'gitops/platform/litellm',namespace:'default',helmReleases:['litellm']}], destinations:['default'],
    clusterResourceWhitelist:[{group:'',kind:'Namespace'}], namespaceResourceWhitelist:[{group:'*',kind:'*'}] };
  if (name === 'prism') baseline = { ...read(`${chart}/ci-values.yaml`), worker: merge(read(`${chart}/ci-values.yaml`).worker, {native:{namespace:'default'}}) };
  if (name === 'ops-pod') baseline = {codexImage:syntheticImage,mcpImage:syntheticImage,networkPolicy:{apiServerCIDRs:['192.0.2.1/32']}};
  const registryBinding={runtimeInfrastructure:{registry:{endpoint:'https://registry.example.invalid',transport:'https',authSecretName:'discovery-registry'}}};
  const result = [{id:'default',inputs:[],values:baseline}];
  const overlays = walkProductSources(root, ['examples','my-values','releases/values'], file=>/\.ya?ml$/u.test(file));
  for (const source of overlays) {
    const values = read(source);
    if (!values || values.apiVersion || values.kind) continue;
    const applicable = name === 'kubeclaw' ? typeof values.agentRole === 'string'
      : name === 'prism' ? /(?:^|\/)prism(?:-values)?\.yaml$/u.test(source)
        : name === 'ops-pod' ? /(?:^|\/)ops\.yaml$/u.test(source) : false;
    if (applicable) result.push({id:source,inputs:[source],values:merge(merge(values,baseline),values.extraContainers?.some(container=>container.name==='buster-v2-runtime')?registryBinding:{})});
  }
  if (name === 'kubeclaw') {
    const buster = fs.existsSync(path.join(root,'my-values/buster-values.yaml')) ? read('my-values/buster-values.yaml') : {agentRole:'buster'};
    result.push({id:'optional-agent-output',inputs:[],values:merge(baseline,{runAsRoot:false,serviceAccount:{create:true},workerTrust:{spiffe:{enabled:true}},
      customSkills:{'discovery.js':'export {}'},imagePullSecrets:[{name:'discovery'}],podAnnotations:{'example.invalid/discovery':'true'},
      nodeSelector:{'example.invalid/discovery':'true'},tolerations:[{key:'discovery',operator:'Exists',effect:'NoSchedule'}],
      extraEnv:[{name:'DISCOVERY',value:'true'}],extraContainers:[{name:'discovery',image:syntheticImage,resources:{requests:{cpu:'10m',memory:'16Mi'}}}],
      extraVolumes:[{name:'discovery',emptyDir:{}}],extraVolumeMounts:[{name:'discovery',mountPath:'/discovery'}],
      service:{type:'NodePort',nodePort:31001,bridgeNodePort:31002,extraPorts:[{name:'discovery',port:8080,targetPort:8080,nodePort:31003}]},
      persistence:{config:{storageClass:'discovery'},workspace:{storageClass:'discovery'}},auth:{token:'discovery'},litellm:{apiKey:'discovery'},discord:{enabled:true,token:'discovery'}})});
    result.push({id:'broker-output',inputs:fs.existsSync(path.join(root,'my-values/buster-values.yaml'))?['my-values/buster-values.yaml']:[],values:merge(merge(buster,registryBinding),{
      agentRole:'buster',serviceAccount:{create:true},busterRuntimePersistence:{enabled:true,storageClass:'discovery'},busterNamespaceBroker:{enabled:true,leaseClient:{enabled:true,verificationRead:{enabled:true}},
        controller:{allowedSourceSecrets:['discovery'],readiness:{enabled:true,audience:'discovery',producerNamespace:'default',producerServiceAccount:'discovery',tlsSecretName:'discovery'},
          productDecisions:{enabled:true,audience:'discovery',producerNamespace:'default',producerServiceAccount:'discovery',issuer:'discovery',verifyKey:Buffer.alloc(32).toString('base64'),allowedActors:['discovery']}}}})});
    result.push({id:'ephemeral-storage-and-ca',inputs:[],values:merge(baseline,{persistence:{config:{enabled:false},workspace:{enabled:false}},runtimeInfrastructure:{registry:{caSecretName:'discovery'}},service:{extraPorts:[{name:'discovery',port:8080,targetPort:8080,nodePort:31003}]}})});
    result.push({id:'nova-ready-client',inputs:[],values:merge(baseline,{agentRole:'nova',serviceAccount:{create:true},busterNamespaceBroker:{readyClient:{enabled:true,endpoint:'https://controller.example.invalid:8443',audience:'discovery',caSecretName:'discovery'}}})});
    result.push({id:'archviewer-output',inputs:[],values:merge(baseline,{archviewer:{enabled:true,existingSecret:'discovery'}})});
    const broker=result.find(profile=>profile.id==='broker-output');
    result.push({id:'broker-registry-ca-and-mirror',inputs:broker.inputs,values:merge(broker.values,{runtimeInfrastructure:{registry:{caSecretName:'discovery-registry-ca',nodeCaFile:'/etc/discovery-registry-ca.crt'},dockerHubMirror:{endpoint:'https://mirror.example.invalid',transport:'https',caSecretName:'discovery-mirror-ca',nodeCaFile:'/etc/discovery-mirror-ca.crt'}}})});
  }
  if (name === 'ops-pod') {
    result.push({id:'optional-ops-output',inputs:[],values:merge(baseline,{githubSecret:'discovery',tailscale:{enabled:true},networkPolicy:{cilium:true},persistence:{storageClass:'discovery'}})});
    result.push({id:'ops-no-exec',inputs:[],values:merge(baseline,{rbac:{execNamespaces:[]},networkPolicy:{enabled:false}})});
  }
  if (name === 'prism') {
    result.push({id:'optional-prism-output',inputs:[],values:merge(baseline,{workerTrust:{spiffe:{enabled:true}},ingestion:{enabled:true,resources:{requests:{cpu:'100m',memory:'128Mi'},limits:{cpu:'1',memory:'1Gi'}}},
      postgresql:{storageClass:'discovery'},artifactStorage:{storageClass:'discovery'},control:{pipelinePreferenceSubject:'user-0123456789abcdef01234567',productDecisions:{enabled:true,issuer:'prism:discovery',operators:['user-0123456789abcdef01234567'],origin:'https://studio.example.invalid',authorityRevision:'discovery',
        signingSecretName:'discovery',signingSecretKey:'private-key.pem',controllerUrl:'https://controller.example.invalid:8443',controllerNamespace:'default',controllerRelease:'discovery',controllerCaSecretName:'discovery',controllerCaSecretKey:'ca.crt',tokenAudience:'discovery',tokenExpirationSeconds:600}}})});
    result.push({id:'external-postgresql-output',inputs:[],values:merge(baseline,{postgresql:{enabled:false},tailscale:{enabled:false}})});
  }
  // Every ordinary boolean option is also exercised independently. Invalid
  // combinations fail rendering; they are not silently classified as unused.
  function booleans(value, parts=[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const [key,item] of Object.entries(value)) {
      if (typeof item === 'boolean') {
        // Feature profiles above supply the required companion credentials and
        // bindings. Bare flag toggles cannot be treated as supported renders.
        if (key !== 'enabled') {
          let override = !item;
          for (const part of [...parts,key].reverse()) override = {[part]:override};
          result.push({id:`boolean:${[...parts,key].join('.')}`,inputs:[],values:merge(baseline,override)});
        }
      } else booleans(item,[...parts,key]);
    }
  }
  booleans(defaultValues);
  return result;
}

// Require a render witness for every source branch that can emit API YAML.
// Validation-only branches are not output alternatives. The temporary copy is
// instrumented; authored sources and published output receive no markers.
function instrumentChart(root, chart, target) {
  fs.cpSync(path.join(root,chart),target,{recursive:true});
  const obligations=[];
  for(const source of walkProductSources(root,[`${chart}/templates`],file=>/\.(?:ya?ml|tpl)$/u.test(file))) {
    const bytes=fs.readFileSync(path.join(root,source),'utf8');
    const actions=[...bytes.matchAll(/\{\{-?([\s\S]*?)-?\}\}/gu)].map(match=>({start:match.index,end:match.index+match[0].length,expression:match[1].trim()}));
    const stack=[];const branches=[];
    for(const action of actions) {
      const command=/^(if|with|range|else|end|define)\b/u.exec(action.expression)?.[1];
      if(['if','with','range','define'].includes(command)) { const branch={action,start:action.end}; stack.push(branch); branches.push(branch); }
      else if(command==='else' && stack.length) { stack.at(-1).end=action.start; const branch={action,start:action.end}; stack[stack.length-1]=branch;branches.push(branch); }
      else if(command==='end' && stack.length) stack.pop().end=action.start;
    }
    const blockIntervals=[];let scalar=null;let offset=0;
    for(const line of bytes.split('\n')) {
      const literal=line.replace(/\{\{.*?\}\}/gu,'');
      if(literal.trim()&&!literal.trimStart().startsWith('#')) {
        const indent=literal.match(/^ */u)[0].length;
        if(scalar!==null&&indent<=scalar.indent) {blockIntervals.push([scalar.start,offset]);scalar=null;}
        if(/:\s*[|>][-+0-9]*\s*$/u.test(literal))scalar={start:offset+line.length,indent};
      }
      offset+=line.length+1;
    }
    if(scalar!==null)blockIntervals.push([scalar.start,bytes.length]);
    const insertions=[];
    for(const branch of branches) {
      if(branch.action.expression.startsWith('define '))continue;
      if(blockIntervals.some(([start,end])=>branch.action.start>=start&&branch.action.start<end))continue;
      assert(branch.end!==undefined,`API_PRODUCT_HELM_CONTROL_UNBALANCED: ${source}`);
      const body=bytes.slice(branch.start,branch.end).replace(/\{\{[\s\S]*?\}\}/gu,'');
      // YAML keys, sequence maps and serialized values are public output.
      // A script inside a YAML block may also contain colons; requiring its
      // witness is conservative and cannot hide a real API branch.
      const branchBody=bytes.slice(branch.start,branch.end);
      const mutatesSerializedValue=/\b(?:set|append|concat|merge|mergeOverwrite)\b/u.test(branchBody);
      if(!/(?:^|\n)\s*(?:-\s*)?(?:[A-Za-z_][A-Za-z0-9_.\/-]*|"[^"\n]+")\s*:/u.test(body)
        && !/\btoYaml\b/u.test(branchBody)&&!mutatesSerializedValue) continue;
      const id=hash(`${source}:${branch.action.start}`).slice(0,16);
      obligations.push({id,path:source,line:bytes.slice(0,branch.action.start).split('\n').length,condition:branch.action.expression});
      const literalLines=body.split('\n').filter(line=>line.trim()&&!line.trimStart().startsWith('#'));
      const indent=Math.min(...literalLines.map(line=>line.match(/^ */u)[0].length),0x7fffffff);
      const rootAlias=bytes.slice(0,branch.action.start).match(/\{\{-?\s*(\$[A-Za-z_][A-Za-z0-9_]*)\s*:=\s*\.root\s*-?\}\}/u)?.[1];
      if(mutatesSerializedValue&&source.endsWith('.tpl')) {
        assert(rootAlias,`API_PRODUCT_HELM_HELPER_ROOT_UNRESOLVED: ${source}:${branch.action.start}`);
        insertions.push({at:branch.action.end,text:`{{- $_docs := set ${rootAlias}.Values "__docsOutputBranchWitnesses" (set (${rootAlias}.Values.__docsOutputBranchWitnesses | default dict) "${id}" true) -}}`});
      } else insertions.push({at:branch.action.end,text:`{{ printf "# docs-output-branch:${id}" | nindent ${indent===0x7fffffff?0:indent} }}\n`});
    }
    let instrumented=bytes;
    for(const insertion of insertions.sort((a,b)=>b.at-a.at)) instrumented=instrumented.slice(0,insertion.at)+insertion.text+instrumented.slice(insertion.at);
    fs.writeFileSync(path.join(target,path.relative(chart,source)),instrumented);
  }
  // Collect helper witnesses after each root template renders. Helper output
  // can be parsed with fromYaml; comments in that intermediate text disappear.
  // The shared root values retain only private instrumentation markers.
  for(const source of walkProductSources(root,[`${chart}/templates`],file=>/\.ya?ml$/u.test(file))) {
    fs.appendFileSync(path.join(target,path.relative(chart,source)),'\n{{ range $id, $_ := .Values.__docsOutputBranchWitnesses }}{{ printf "# docs-output-branch:%s" $id | nindent 0 }}{{ end }}\n');
  }
  return obligations;
}

const cache = new Map();
function rejectedProfileContracts(root) {
  const file=path.join(root,'scripts/docs-api-rejected-output-profiles.json');
  if(!fs.existsSync(file))return [];
  const registry=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(registry.version,1,'API_PRODUCT_REJECTED_PROFILE_REGISTRY_INVALID');
  assert(Array.isArray(registry.profiles),'API_PRODUCT_REJECTED_PROFILE_REGISTRY_INVALID');
  const identities=new Set();
  for(const contract of registry.profiles) {
    const identity=`${contract.chart}:${contract.profile}`;
    assert(!identities.has(identity),`API_PRODUCT_REJECTED_PROFILE_DUPLICATE: ${identity}`);identities.add(identity);
    for(const field of ['expectedError','canonicalProcedure','owner','safeStop','preparationCriterion','discoveryInputDigest'])assert(typeof contract[field]==='string'&&contract[field].trim(),`API_PRODUCT_REJECTED_PROFILE_CONTRACT_INCOMPLETE: ${identity}:${field}`);
    const [procedure,anchor]=contract.canonicalProcedure.split('#');
    assert(procedure.startsWith('docs/site/')&&!procedure.split('/').includes('..')&&fs.existsSync(path.join(root,procedure)),`API_PRODUCT_REJECTED_PROFILE_PROCEDURE_MISSING: ${identity}`);
    const headings=[...fs.readFileSync(path.join(root,procedure),'utf8').matchAll(/^#{1,6}\s+(.+)$/gmu)].map(match=>match[1].toLowerCase().replace(/[^\p{L}\p{N} -]/gu,'').trim().replace(/ +/gu,'-'));
    assert(anchor&&headings.includes(anchor),`API_PRODUCT_REJECTED_PROFILE_PROCEDURE_ANCHOR_MISSING: ${identity}`);
    const actualChart=Object.fromEntries(walkProductSources(root,[contract.chart],()=>true).map(source=>[source,hash(fs.readFileSync(path.join(root,source)))]));
    assert.deepEqual(actualChart,contract.chartSourceDigests,`API_PRODUCT_REJECTED_PROFILE_CHART_DRIFT: ${identity}`);
    for(const [input,digest]of Object.entries(contract.inputSourceDigests??{}))assert.equal(hash(fs.readFileSync(path.join(root,input))),digest,`API_PRODUCT_REJECTED_PROFILE_INPUT_DRIFT: ${identity}:${input}`);
  }
  return registry.profiles;
}
export function discoverRejectedApiOutputProfiles(root) {
  discoverHelmApiOutputs(root);
  return [...cache.values()].find(entry=>entry.root===path.resolve(root)&&!entry.schemaAuthorityOnly)?.rejections??[];
}
export function discoverHelmApiOutputs(root, { allowRejectedInputs = false } = {}) {
  return discoverHelmOutputs(root,{allowRejectedInputs,schemaAuthorityOnly:false});
}
// Schema extraction has a separate, explicit task: chart-owned definitions in
// source-controlled constructor profiles. It never certifies example acceptance.
export function discoverHelmSchemaApiOutputs(root) {
  return discoverHelmOutputs(root,{allowRejectedInputs:false,schemaAuthorityOnly:true}).filter(output=>output.value.kind==='CustomResourceDefinition');
}
function discoverHelmOutputs(root, {allowRejectedInputs,schemaAuthorityOnly}) {
  const sources = walkProductSources(root,['charts','examples','my-values','releases/values'],()=>true);
  const chartFiles=sources.filter(source=>/\/Chart\.yaml$/u.test(source)&&source.split('/').length===3);
  for(const template of sources.filter(source=>/^charts\/[^/]+\/templates\/.*\.(?:ya?ml|tpl)$/u.test(source))) {
    assert(chartFiles.includes(`${template.split('/').slice(0,2).join('/')}/Chart.yaml`),`API_PRODUCT_HELM_TEMPLATE_WITHOUT_CHART_AUTHORITY: ${template}`);
  }
  const dependencyDigest = hash(sources.map(source=>`${source}\0${hash(fs.readFileSync(path.join(root,source)))}`).join('\n'));
  const rejectedContracts=schemaAuthorityOnly?[]:rejectedProfileContracts(root);
  const key = `${path.resolve(root)}:${dependencyDigest}:${schemaAuthorityOnly?'schema-authority':'product-output'}:${hash(JSON.stringify(rejectedContracts))}`;
  if (cache.has(key)) { const cached=cache.get(key); assert(allowRejectedInputs || !cached.failures.length, `API_PRODUCT_HELM_RENDER_FAILED: ${cached.failures.join("; ")}`); return cached.outputs; }
  const result=[];
  const failures=[];
  const rejections=[];
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'docs-api-output-'));
  try {
    for (const chartFile of chartFiles) {
      const chart=path.dirname(chartFile);
      const chartCopy=path.join(temporary,path.basename(chart));
      let obligations=[];
      if(schemaAuthorityOnly) {
        fs.cpSync(path.join(root,chart),chartCopy,{recursive:true});
        for(const template of walkProductSources(root,[`${chart}/templates`],file=>/\.ya?ml$/u.test(file))) {
          if(!/^kind:\s*CustomResourceDefinition\s*$/mu.test(fs.readFileSync(path.join(root,template),'utf8')))fs.rmSync(path.join(chartCopy,path.relative(chart,template)));
        }
      } else obligations=instrumentChart(root,chart,chartCopy);
      const witnessed=new Set();
      for(const profile of profiles(root,chart)) {
        const rejected=rejectedContracts.find(contract=>contract.chart===chart&&contract.profile===profile.id);
        if(rejected) {
          assert.deepEqual(Object.keys(rejected.inputSourceDigests).sort(),profile.inputs.slice().sort(),`API_PRODUCT_REJECTED_PROFILE_INPUT_SET_DRIFT: ${profile.id}`);
          assert.equal(hash(YAML.stringify(profile.values)),rejected.discoveryInputDigest,`API_PRODUCT_REJECTED_PROFILE_DERIVED_INPUT_DRIFT: ${profile.id}`);
        }
        const input=path.join(temporary,'values.yaml');fs.writeFileSync(input,YAML.stringify(profile.values));
        const rendered=spawnSync('helm',['template','discovery',chartCopy,'--namespace','default','--kube-version','1.35.0','--include-crds','-f',input],{encoding:'utf8',maxBuffer:64*1024*1024});
        if (rendered.status !== 0) {
          if(rejected) {
            const command=['template','discovery',path.join(root,chart),'--namespace','default','--kube-version','1.35.0','--include-crds','-f',input];
            const observed=spawnSync('helm',command,{encoding:'utf8',maxBuffer:64*1024*1024});
            assert.notEqual(observed.status,0,`API_PRODUCT_REJECTED_PROFILE_UNEXPECTED_SUCCESS: ${profile.id}`);
            assert.equal(observed.stdout,'',`API_PRODUCT_REJECTED_PROFILE_PARTIAL_OUTPUT: ${profile.id}`);
            assert.equal(observed.stderr.trim(),rejected.expectedError,`API_PRODUCT_REJECTED_PROFILE_ERROR_DRIFT: ${profile.id}`);
            rejections.push({...rejected,observedExitCode:observed.status,observedOutputBytes:Buffer.byteLength(observed.stdout),observedError:observed.stderr.trim(),discoveryInvocation:['helm','template','discovery',chart,'--namespace','default','--kube-version','1.35.0','--include-crds','--values','<source-bound illustrative profile>']});
          } else failures.push(`${chart} ${profile.id}: ${rendered.stderr.trim()}`);
          continue;
        }
        assert(!rejected,`API_PRODUCT_REJECTED_PROFILE_UNEXPECTED_SUCCESS: ${profile.id}`);
        for(const marker of rendered.stdout.matchAll(/# docs-output-branch:([a-f0-9]{16})/gu))witnessed.add(marker[1]);
        const authoritative=spawnSync('helm',['template','discovery',schemaAuthorityOnly?chartCopy:path.join(root,chart),'--namespace','default','--kube-version','1.35.0','--include-crds','-f',input],{encoding:'utf8',maxBuffer:64*1024*1024});
        assert.equal(authoritative.status,0,`API_PRODUCT_HELM_AUTHORITATIVE_RENDER_FAILED: ${chart} ${profile.id}: ${authoritative.stderr}`);
        const clean=authoritative.stdout;
        const chunks=clean.split(/(?:^|\n)---\s*\n/u).filter(chunk=>chunk.trim());
        chunks.forEach((chunk,index)=>{
          const document=YAML.parseDocument(chunk);
          assert.equal(document.errors.length,0,`API_PRODUCT_HELM_YAML_INVALID: ${chart} ${profile.id}#${index}`);
          const value=document.toJS();if(!value?.kind||!value?.apiVersion)return;
          const outputSource=/# Source: [^/]+\/(.+)/u.exec(chunk)?.[1];
          assert(outputSource,`API_PRODUCT_HELM_SOURCE_MISSING: ${chart} ${profile.id}#${index}`);
          const source=`${chart}/${outputSource}`;
          result.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:index,sourceDigest:hash(fs.readFileSync(path.join(root,source))),
            producer:'helm',profile:profile.id,dependencyDigest,outputDigest:hash(chunk),inputDigest:hash(YAML.stringify(profile.values)),inputs:profile.inputs}});
        });
      }
      const missing=obligations.filter(branch=>!witnessed.has(branch.id));
      if(!schemaAuthorityOnly&&missing.length) failures.push(`API_PRODUCT_HELM_BRANCH_UNDISCOVERED: ${JSON.stringify(missing)}`);
    }
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
  for(const rejected of rejectedContracts)assert(rejections.some(entry=>entry.chart===rejected.chart&&entry.profile===rejected.profile),`API_PRODUCT_REJECTED_PROFILE_MISSING: ${rejected.profile}`);
  cache.clear();cache.set(key,{root:path.resolve(root),schemaAuthorityOnly,outputs:result,failures,rejections});
  assert(allowRejectedInputs || !failures.length, `API_PRODUCT_HELM_RENDER_FAILED: ${failures.join("; ")}`);
  return result;
}

// Source-shape analysis never executes scripts/controllers or contacts a
// cluster. Constructors are discovered from AST identity properties, not a
// filename list. Every source position and every changed byte remain bound.
const scriptOutputCache=new Map();
export function discoverScriptApiOutputs(root) {
  const sourceInputs=walkProductSources(root,producerRoots,()=>true);
  if(fs.existsSync(path.join(root,'package.json')))sourceInputs.push('package.json');
  const inputKey=hash(JSON.stringify(sourceInputs.map(source=>[source,hash(fs.readFileSync(path.join(root,source)))])));
  const cached=scriptOutputCache.get(root);
  if(cached?.inputKey===inputKey&&cached.dependencies.every(([source,digest])=>fs.existsSync(path.join(root,source))&&hash(fs.readFileSync(path.join(root,source)))===digest))return cached.result;
  const classifiedDependencies=new Set();
  const result=[];
  for(const source of walkProductSources(root,producerRoots,file=>!/\.(?:[cm]?js|ts|py|sh|go|ya?ml|json|md|txt|toml|lock|pem|crt)$/u.test(file))) {
    const bytes=fs.readFileSync(path.join(root,source),'utf8');
    let unqualified=bytes;
    if(/(?:^|\/)Dockerfile(?:\.|$)/u.test(source)){
      // Docker RUN recipes also contain shell formatting. These closed build
      // records feed APT, checksum verification, subordinate IDs and Git sparse
      // checkout; accepting one does not accept a new dynamic resource stream.
      unqualified=unqualified.replace(/printf '%s\\n'\s*\\\n([\s\S]*?)> \/etc\/apt\/sources\.list\.d\/debian\.sources/gu,(match,argumentsText)=>/^(?:[\s\\]*|'(?:Types: deb|Suites: bookworm(?: bookworm-updates|-security)?|Components: main|Signed-By: \/usr\/share\/keyrings\/debian-archive-keyring\.gpg|)'|"URIs: https?:\/\/snapshot\.debian\.org\/archive\/debian(?:-security)?\/\$\{DEBIAN_SNAPSHOT\}")*$/u.test(argumentsText)?'':match);
      unqualified=unqualified.replace(/printf 'Acquire::Check-Valid-Until "false";\\n' > \/etc\/apt\/apt\.conf\.d\/99snapshot/gu,'');
      unqualified=unqualified.replace(/printf 'builder:100000:65536\\n' >> \/etc\/sub(?:uid|gid)/gu,'');
      unqualified=unqualified.replace(/printf '%s  %s\\n' "\$[a-z_]+_sha" (?:"[^"\n]*"|\/tmp\/kubectl) \| sha256sum -c -/gu,'');
      unqualified=unqualified.replace(/printf '%s  (?:source|helm)\.tar\.gz\\n' "\$(?:GH_SOURCE_SHA256|helm_sha)" \| sha256sum -c -/gu,'');
      unqualified=unqualified.replace(/printf '%s\\n' "v\$\{KUBECTL_VERSION\}-standalone-strict\/" > "\$schema_repo\/\.git\/info\/sparse-checkout"/gu,'');
      unqualified=unqualified.replace(/echo "Unsupported architecture: \$arch" >&2/gu,'');
      assert(!/\b(?:printf|echo)\s/u.test(unqualified.replace(/^\s*#[^\n]*/gmu,'')),`API_PRODUCT_PRODUCER_LANGUAGE_UNQUALIFIED: ${source}`);
    }
    if(source.endsWith('.c')){
      // These native control writes have closed payloads: a positive kernel
      // page size, this process ID, and the cgroup.kill switch. They cannot
      // forward argv/stdin bytes. Any other C writer remains a grammar gap.
      if(/long page_size = sysconf\(_SC_PAGESIZE\);/u.test(bytes)&&(bytes.match(/page_size\s*=/gu)??[]).length===1&&(bytes.match(/\bpage_size\b/gu)??[]).length===3)unqualified=unqualified.replace(/printf\("%ld\\n", page_size\)/gu,'');
      if(/snprintf\(pid, sizeof\(pid\), "%ld\\n", \(long\)getpid\(\)\)/u.test(bytes)&&(bytes.match(/\bpid\s*\[/gu)??[]).length===1&&(bytes.match(/\bpid\b/gu)??[]).length===4)unqualified=unqualified.replace(/write\(descriptor, pid, \(size_t\)length\)/gu,'');
      if(/child_cgroup_kill_fd = open\(kill_file, O_WRONLY \| O_CLOEXEC\)/u.test(bytes)&&/"%s\/cgroup.kill", child_cgroup/u.test(bytes))unqualified=unqualified.replace(/write\(child_cgroup_kill_fd, "1", 1\)/gu,'');
      if(/int membership = openat\(scope, "cgroup.procs", O_WRONLY \| O_CLOEXEC \| O_NOFOLLOW\)/u.test(bytes)&&(bytes.match(/\bmembership\s*=/gu)??[]).length===1)unqualified=unqualified.replace(/write\(membership, "0", 1\)/gu,'');
      const cCode=bytes.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu,'');
      const failCalls=[...cCode.matchAll(/\bfail\(([^)]*)\)/gu)];
      if(/static void fail\(const char \*code\)\s*\{\s*fprintf\(stderr, "%s\\n", code\);\s*_exit\(125\);\s*\}/u.test(cCode)&&failCalls.every(call=>call[1]==='const char *code'||/^"WORKER_NATIVE_[A-Z_]+"$/u.test(call[1]))&&(cCode.match(/\bfail\b/gu)??[]).length===failCalls.length)unqualified=unqualified.replace(/fprintf\(stderr, "%s\\n", code\)/gu,'');
      unqualified=unqualified.replace(/fprintf\(stderr, "(?:[^"%\\]|\\.)*"\)/gu,'').replace(/perror\("[^"\\]*"\)/gu,'');
      assert(!/\b(?:printf|fprintf|puts|fputs|fwrite|write|writev|send|sendto)\s*\(|apiVersion/u.test(unqualified),`API_PRODUCT_PRODUCER_LANGUAGE_UNQUALIFIED: ${source}`);
    }
    assert(!/^#!.*(?:ruby|perl|php|lua|java|deno)|(?:^|[;\n]|<\?php)\s*(?:puts|warn|print|io\.write|echo|printf)\b|std::cout|System\.out\.|apiVersion|kubectl[^\n]*(?:apply|create)|client\.(?:create|apply)|JSON\.(?:generate|dump)|json_encode\s*\(|serde_json::to_(?:string|writer)|writeValueAsString\s*\(|cJSON_Print\s*\(|json_dumps\s*\(/u.test(unqualified),`API_PRODUCT_PRODUCER_LANGUAGE_UNQUALIFIED: ${source}`);
  }
  const documentationLanguageTools=documentationToolSources(root);
  for(const source of walkProductSources(root,producerRoots,file=>/\.py$/u.test(file)&&!documentationLanguageTools.has(file))) {
    const bytes=fs.readFileSync(path.join(root,source),'utf8');
    if(source!=='ops/pod/bootstrap.py')assertNativeSerializationRoles(root,source,bytes,'Python');
    if(source!=='ops/pod/bootstrap.py'&&!/kubectl[^\n]*(?:apply|create)|(?:apply|create)_secret/u.test(bytes))continue;
    if(source==='scripts/verify-cilium-policies.py'){assertProducerAdapterAuthority(root,[source]);continue;}
    assert(source==='ops/pod/bootstrap.py',`API_PRODUCT_PYTHON_PRODUCER_UNQUALIFIED: ${source}`);
    const rendered=spawnSync('python3',[new URL('./docs-api-python-output-adapter.py',import.meta.url).pathname,path.join(root,source)],{encoding:'utf8',env:{PATH:process.env.PATH},maxBuffer:8*1024*1024});
    assert.equal(rendered.status,0,`API_PRODUCT_PYTHON_ADAPTER_FAILED: ${source}: ${rendered.stderr}`);
    JSON.parse(rendered.stdout).forEach((output,index)=>result.push({value:output.value,context:{apiVersion:output.value.apiVersion,kind:output.value.kind,path:source,document:index,sourceDigest:hash(bytes),producer:'python-offline-original',profile:output.profile,inputs:['scripts/deploy-ops-pod.sh'],inputDigest:hash(JSON.stringify({environment:output.environment,responses:output.inputs,caller:hash(fs.readFileSync(path.join(root,'scripts/deploy-ops-pod.sh'))),adapter:hash(fs.readFileSync(new URL('./docs-api-python-output-adapter.py',import.meta.url)))})),outputDigest:hash(JSON.stringify(output.value)),offlineInputs:output.inputs}}));
  }
  const documentationTools=documentationToolSources(root);
  const sources=walkProductSources(root,producerRoots,file=>/\.(?:[cm]?js|ts)$/u.test(file)&&!documentationTools.has(file));
  const classifyOutputRoles=createSerializedOutputRoleClassifier(root,sources);
  for(const source of sources) {
    const bytes=fs.readFileSync(path.join(root,source),'utf8');
    assert(!/(?:from\s*|(?:require|import)\(\s*)['"]@kubernetes\/client-node['"]/u.test(bytes),`API_PRODUCT_SCRIPT_TYPED_SDK_UNQUALIFIED: ${source}; documentation output adapter maintainers must classify the typed emitter`);
    if(/\b(?:spawnSync|execFileSync|execFile|spawn)\(\s*['"]helm['"]/u.test(bytes))assertProducerAdapterAuthority(root,[source]);
    const outputRoles=classifyOutputRoles(source);
    for(const role of outputRoles)for(const dependency of role.dependencies??[])classifiedDependencies.add(dependency);
    for(const role of outputRoles)assert(role.role!=='unknown',`API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED: ${source}:${role.line}: ${role.expression}`);
    if(!outputRoles.some(role=>role.role==='api')&&(!/apiVersion/u.test(bytes)||!/(?:kind\s*:|['"]kind['"]\s*:)/u.test(bytes)))continue;
    const tree=ts.createSourceFile(source,bytes,ts.ScriptTarget.Latest,true);
    assert(!tree.parseDiagnostics.length,`API_PRODUCT_PRODUCER_PARSE_FAILED: ${source}`);
    const declarations=new Map();const assignments=[];const constructors=[];const serializedInputs=new Set();
    const functions=[];const calls=[];const serializedPublications=[];const unsupportedMutations=[];
    const scopeOf=node=>{for(let parent=node.parent;parent;parent=parent.parent)if(ts.isBlock(parent)||ts.isSourceFile(parent)||ts.isFunctionLike(parent))return parent;return tree;};
    function declarationFor(node) {
      const choices=declarations.get(node.text)??[];
      for(let scope=node.parent;scope;scope=scope.parent) {
        const candidates=choices.filter(choice=>choice.scope===scope);
        if(candidates.length)return (candidates.filter(choice=>choice.value.end<node.pos).at(-1)??candidates[0]).value;
      }
      return undefined;
    }
    function collect(node) {
      if(ts.isDeleteExpression(node)||ts.isPostfixUnaryExpression(node)||ts.isPrefixUnaryExpression(node)&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(node.operator)||ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&!(node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&(ts.isPropertyAccessExpression(node.left)||ts.isElementAccessExpression(node.left))))unsupportedMutations.push(node);
      if(ts.isFunctionDeclaration(node)&&node.name)functions.push(node);
      if(ts.isReturnStatement(node)&&node.expression)serializedPublications.push({arguments:[node.expression],parent:node.parent,getStart:()=>node.getStart(tree)});
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression))calls.push(node);
      if(ts.isCallExpression(node)&&['console.log','process.stdout.write','fs.writeFileSync','writeFileSync'].includes(node.expression.getText(tree)))serializedPublications.push(node);
      if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer) {
        const values=declarations.get(node.name.text)??[];values.push({value:node.initializer,scope:scopeOf(node)});declarations.set(node.name.text,values);
      }
      if(ts.isVariableDeclaration(node)&&ts.isObjectBindingPattern(node.name)&&node.initializer)for(const element of node.name.elements) {
        // Unsupported bindings remain unresolved when an API constructor uses
        // them; unrelated analysis destructuring need not become an API input.
        if(!ts.isIdentifier(element.name)||element.dotDotDotToken)continue;
        const values=declarations.get(element.name.text)??[];values.push({value:{__docsBindingExpression:node.initializer,__docsBindingKey:element.propertyName?.text??element.name.text,pos:element.pos},scope:scopeOf(node)});declarations.set(element.name.text,values);
      }
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&(ts.isPropertyAccessExpression(node.left)||ts.isElementAccessExpression(node.left)))assignments.push(node);
      if(ts.isObjectLiteralExpression(node)) {
        const names=node.properties.filter(ts.isPropertyAssignment).map(item=>(ts.isComputedPropertyName(item.name)&&ts.isStringLiteralLike(item.name.expression)?item.name.expression.text:item.name.getText(tree).replace(/^['"]|['"]$/gu,'')));
        if(names.includes('apiVersion')&&names.includes('kind'))constructors.push(node);
      }
      ts.forEachChild(node,collect);
    }
    collect(tree);
    // A fixed diagnostic root can become an API body through terminal identity
    // assignments. Treat that final body as a constructor too.
    for(const [name,choices]of declarations)for(const choice of choices)if(ts.isObjectLiteralExpression(choice.value)&&!constructors.includes(choice.value)) {
      const identity=new Set(choice.value.properties.filter(ts.isPropertyAssignment).map(property=>property.name.getText(tree).replace(/^['"]|['"]$/gu,'')));
      for(const assignment of assignments)if(ts.isIdentifier(assignment.left.expression)&&assignment.left.expression.text===name&&declarationFor(assignment.left.expression)===choice.value){let member=ts.isPropertyAccessExpression(assignment.left)?assignment.left.name.text:assignment.left.argumentExpression;if(typeof member!=='string'&&ts.isIdentifier(member))member=declarationFor(member);if(typeof member!=='string'&&member&&ts.isStringLiteralLike(member))member=member.text;if(typeof member==='string')identity.add(member);}
      if(identity.has('apiVersion')&&identity.has('kind'))constructors.push(choice.value);
    }
    const isExplicitSelfTestCall=call=>{
      for(let parent=call.parent;parent;parent=parent.parent)if(ts.isIfStatement(parent)&&call.pos>=parent.thenStatement.pos&&call.end<=parent.thenStatement.end) {
        const condition=parent.expression.getText(tree);
        if(/process\.argv\.includes\(['"]--self-test['"]\)/u.test(condition)&&!condition.includes('!process.argv.includes'))return true;
      }
      return false;
    };
    const guardedTestFunctions=new Set(functions.filter(fn=>{
      const invocations=calls.filter(call=>call.expression.text===fn.name.text);
      return invocations.length&&invocations.every(isExplicitSelfTestCall);
    }));
    const opaque=new Map();let terminalPosition=Infinity;
    function evaluate(node,seen=new Set()) {
      if(!node)return null;
      if(node.__docsBindingExpression) {
        const value=evaluate(node.__docsBindingExpression,seen);
        return value&&typeof value==='object'&&Object.hasOwn(value,node.__docsBindingKey)?value[node.__docsBindingKey]:{__docsDynamicExpression:`${node.__docsBindingExpression.getText(tree)}.${node.__docsBindingKey}`};
      }
      if(ts.isStringLiteralLike(node))return node.text;
      if(ts.isNumericLiteral(node))return Number(node.text);
      if(node.kind===ts.SyntaxKind.TrueKeyword)return true;
      if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
      if(node.kind===ts.SyntaxKind.NullKeyword)return null;
      if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isTypeAssertionExpression(node)||ts.isNonNullExpression(node))return evaluate(node.expression,seen);
      if(ts.isArrayLiteralExpression(node))return node.elements.flatMap(item=>ts.isSpreadElement(item)?[].concat(evaluate(item.expression,seen)): [evaluate(item,seen)]);
      if(ts.isConditionalExpression(node)) {
        const left=evaluate(node.whenTrue,seen),right=evaluate(node.whenFalse,seen);
        if(left&&right&&typeof left==='object'&&typeof right==='object'&&!Array.isArray(left)&&!Array.isArray(right))return {...left,...right};
        return left??right;
      }
      if(ts.isObjectLiteralExpression(node)) {
        const value={};
        for(const property of node.properties) {
          if(ts.isSpreadAssignment(property)) {
            const item=evaluate(property.expression,seen);
            if(item&&typeof item==='object'&&!Array.isArray(item))Object.assign(value,item);
            else opaque.set(property.getStart(tree),property.expression.getText(tree));
          } else if(ts.isPropertyAssignment(property)||ts.isShorthandPropertyAssignment(property)) {
            const key=ts.isComputedPropertyName(property.name)?evaluate(property.name.expression,seen):property.name.getText(tree).replace(/^['"]|['"]$/gu,'');
            assert(typeof key==='string'||typeof key==='number',`API_PRODUCT_DYNAMIC_PRODUCER_KEY: ${source}:${tree.getLineAndCharacterOfPosition(property.pos).line+1}`);
            value[key]=evaluate(ts.isPropertyAssignment(property)?property.initializer:property.name,seen);
          }
        }
        return value;
      }
      if(ts.isIdentifier(node)) {
        const chosen=declarationFor(node);
        const key=`${node.text}:${chosen?.pos??'parameter'}`;
        if(chosen&&!seen.has(key)) {
          const value=evaluate(chosen,new Set([...seen,key]));
          let unqualifiedProjection=false;
          function projection(expression,visited=new Set()) {
            if(ts.isIdentifier(expression)) {
              if(expression.text===node.text&&declarationFor(expression)===chosen)return [];
              const alias=declarationFor(expression);if(!alias||visited.has(alias)||alias.pos<chosen.pos)return null;
              return projection(alias,new Set([...visited,alias]));
            }
            if(ts.isPropertyAccessExpression(expression)||ts.isElementAccessExpression(expression)) {
              const base=projection(expression.expression,visited);if(!base)return null;
              const member=ts.isPropertyAccessExpression(expression)?expression.name.text:evaluate(expression.argumentExpression,seen);
              if(typeof member!=='string'&&typeof member!=='number'){if(value?.apiVersion&&value?.kind)throw new Error(`API_PRODUCT_SCRIPT_MUTATION_KEY_UNQUALIFIED: ${source}`);unqualifiedProjection=true;return null;}
              return [...base,member];
            }
            return null;
          }
          for(const mutation of unsupportedMutations.filter(item=>!ts.isDeleteExpression(item)&&item.pos>chosen.pos&&item.pos<terminalPosition)){const target=ts.isBinaryExpression(mutation)?mutation.left:mutation.operand;if(target&&projection(target)?.length){if(value?.apiVersion&&value?.kind)throw new Error(`API_PRODUCT_SCRIPT_MUTATION_UNQUALIFIED: ${source}`);unqualifiedProjection=true;}}
          const mutations=[...assignments,...unsupportedMutations.filter(ts.isDeleteExpression)].filter(item=>item.pos>chosen.pos&&item.pos<terminalPosition).sort((left,right)=>left.pos-right.pos);
          for(const mutation of mutations) {
            const members=projection(ts.isDeleteExpression(mutation)?mutation.expression:mutation.left);if(!members?.length)continue;
            for(let parent=mutation.parent;parent&&parent!==scopeOf(chosen);parent=parent.parent)assert(!ts.isIfStatement(parent)&&!ts.isIterationStatement(parent,false),`API_PRODUCT_SCRIPT_MUTATION_BRANCH_UNQUALIFIED: ${source}:${tree.getLineAndCharacterOfPosition(mutation.getStart(tree)).line+1}`);
            let target=value;for(const member of members.slice(0,-1)){assert(target&&typeof target==='object'&&Object.hasOwn(target,member),`API_PRODUCT_SCRIPT_MUTATION_TARGET_UNQUALIFIED: ${source}`);target=target[member];}
            assert(target&&typeof target==='object',`API_PRODUCT_SCRIPT_MUTATION_TARGET_UNQUALIFIED: ${source}`);
            if(ts.isDeleteExpression(mutation))delete target[members.at(-1)];else target[members.at(-1)]=evaluate(mutation.right,new Set([...seen,key]));
          }
          if(unqualifiedProjection)return {__docsDynamicExpression:node.getText(tree)};
          return value;
        }
        if(!chosen&&!seen.has(key))for(let parent=node.parent;parent;parent=parent.parent)if(ts.isFunctionDeclaration(parent)&&parent.name) {
          const index=parent.parameters.findIndex(parameter=>ts.isIdentifier(parameter.name)&&parameter.name.text===node.text);
          if(index>=0){const invocations=calls.filter(call=>call.expression.text===parent.name.text&&!isExplicitSelfTestCall(call));if(invocations.length===1)return evaluate(invocations[0].arguments[index],new Set([...seen,key]));}
          break;
        }
      }
      if(ts.isCallExpression(node)) {
        const name=node.expression.getText(tree);
        if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='find') {
          const collection=evaluate(node.expression.expression,seen),callback=node.arguments[0];
          if(Array.isArray(collection)&&ts.isArrowFunction(callback)&&ts.isBinaryExpression(callback.body)&&ts.isPropertyAccessExpression(callback.body.left)&&callback.body.left.name.text==='kind'&&ts.isStringLiteral(callback.body.right))return collection.find(value=>value?.kind===callback.body.right.text)??{__docsDynamicExpression:node.getText(tree)};
        }
        if((name==='parseAllDocuments'||name==='YAML.parseAllDocuments')&&node.arguments[0]&&ts.isCallExpression(node.arguments[0])&&node.arguments[0].expression.getText(tree)==='fs.readFileSync') {
          const argument=node.arguments[0].arguments[0];
          const declaration=ts.isIdentifier(argument)?declarationFor(argument):argument;
          if(declaration&&ts.isNewExpression(declaration)&&declaration.expression.getText(tree)==='URL'&&ts.isStringLiteral(declaration.arguments?.[0])&&declaration.arguments?.[1]?.getText(tree)==='import.meta.url') {
            const input=path.resolve(root,path.dirname(source),declaration.arguments[0].text);
            assert(input.startsWith(`${path.resolve(root)}${path.sep}`),`API_PRODUCT_SCRIPT_INPUT_OUTSIDE_ROOT: ${source}`);
            serializedInputs.add(path.relative(root,input));
            const documents=YAML.parseAllDocuments(fs.readFileSync(input,'utf8'));
            assert(documents.every(document=>!document.errors.length),`API_PRODUCT_SCRIPT_INPUT_YAML_INVALID: ${source} ${path.relative(root,input)}`);
            return documents.map(document=>document.toJS());
          }
        }

        if(name==='structuredClone'||name==='Object.freeze')return evaluate(node.arguments[0],seen);
        if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='map') {
          const callback=node.arguments[0];
          const input=evaluate(node.expression.expression,seen);
          if(Array.isArray(input)&&ts.isArrowFunction(callback)&&ts.isBlock(callback.body)) {
            const returned=callback.body.statements.find(ts.isReturnStatement);
            if(returned?.expression&&ts.isCallExpression(returned.expression)&&ts.isPropertyAccessExpression(returned.expression.expression)&&returned.expression.expression.name.text==='toJS')return input;
          }
          if(ts.isArrowFunction(callback)||ts.isFunctionExpression(callback)) {
            if(!ts.isBlock(callback.body))return [evaluate(callback.body,seen)];
            const returned=callback.body.statements.find(ts.isReturnStatement);
            if(returned?.expression)return [evaluate(returned.expression,seen)];
          }
        }
        if(name==='stringArray')return [{__docsDynamicExpression:node.getText(tree)}];
      }
      if(ts.isElementAccessExpression(node)){const object=evaluate(node.expression,seen),member=evaluate(node.argumentExpression,seen);if(object&&typeof object==='object'&&(typeof member==='string'||typeof member==='number')&&Object.hasOwn(object,member))return object[member];}
      if(ts.isPropertyAccessExpression(node)) {
        // This checked-in renderer validates the required quantity members but
        // forwards the complete public policy.resources object. Selection must
        // retain its full supported schema, not merely the shipped quantities.
        if(source==='scripts/render-postgresql-recovery.mjs'&&node.getText(tree)==='policy.resources')return {__docsDynamicExpression:node.getText(tree),__docsSupportedSchemaPassthrough:{input:'policy.resources',validation:'validateStorage',serializationLine:tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1}};
        const object=evaluate(node.expression,seen);
        if(object&&typeof object==='object'&&Object.hasOwn(object,node.name.text))return object[node.name.text];
      }
      // Scalar expressions carry source provenance. A later schema join must
      // reject unresolved collections rather than pretend their children known.
      return {__docsDynamicExpression:node.getText(tree)};
    }
    constructors.forEach((node,index)=>{
      for(let parent=node.parent;parent;parent=parent.parent)if(ts.isFunctionLike(parent)){if(guardedTestFunctions.has(parent))return;break;}
      opaque.clear();serializedInputs.clear();const binding=ts.isVariableDeclaration(node.parent)&&ts.isIdentifier(node.parent.name)?node.parent.name:null;const publications=binding?serializedPublications.filter(publication=>{let found=false;const visit=part=>{if(ts.isIdentifier(part)&&declarationFor(part)===node)found=true;ts.forEachChild(part,visit);};publication.arguments.forEach(visit);return found;}):[];
      terminalPosition=publications.length?Math.min(...publications.map(publication=>publication.getStart(tree))):Infinity;
      assert(!publications.some(publication=>assignments.some(assignment=>assignment.left.expression.getText(tree)===binding?.text&&assignment.pos>terminalPosition&&assignment.pos<publication.getStart(tree))),`API_PRODUCT_SCRIPT_MULTIPLE_OUTPUT_VARIANTS_UNQUALIFIED: ${source}:${binding?.text}`);
      const value=evaluate(binding??node);
      if(binding) {
        const name=binding.text;
        assert(!unsupportedMutations.filter(mutation=>!ts.isDeleteExpression(mutation)).some(mutation=>new RegExp(`\\b${name}\\b`,'u').test(mutation.getText(tree))),`API_PRODUCT_SCRIPT_MUTATION_UNQUALIFIED: ${source}:${name}`);
      }
      // A proved ordered deletion can turn an initial API constructor into a
      // published native object. Preserve the final emitted identity.
      if(publications.length&&value&&typeof value==='object'&&(!Object.hasOwn(value,'apiVersion')||!Object.hasOwn(value,'kind'))&&outputRoles.some(role=>role.role==='non-api'&&role.line===tree.getLineAndCharacterOfPosition(publications[0].getStart(tree)).line+1))return;
      let identityWitness;
      if(value.kind==='BusterNamespaceLease'&&typeof value.apiVersion!=='string') {
        const file=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');const registry=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
        const contract=registry.scriptIdentityProfiles?.find(record=>record.source===source&&record.kind===value.kind);
        const property=node.properties?.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(tree)==='apiVersion');
        assert(contract&&property?.initializer.getText(tree)===contract.expression,`API_PRODUCT_SCRIPT_IDENTITY_UNRESOLVED: ${source}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1}`);
        assert.deepEqual(producerAdapterOperationRecipe(source,bytes),contract.operationRecipe,`API_PRODUCT_SCRIPT_IDENTITY_PROFILE_DRIFT: ${source}`);
        const configured=YAML.parse(fs.readFileSync(path.join(root,contract.valuesSource),'utf8')).busterNamespaceBroker;
        const authorityBytes=fs.readFileSync(path.join(root,contract.authoritySource),'utf8');
        assert(/group: \{\{ \.Values\.busterNamespaceBroker\.leaseApiGroup \}\}/u.test(authorityBytes)&&/name: \{\{ \.Values\.busterNamespaceBroker\.leaseApiVersion \}\}/u.test(authorityBytes)&&/kind: BusterNamespaceLease/u.test(authorityBytes),'API_PRODUCT_SCRIPT_IDENTITY_AUTHORITY_UNQUALIFIED');
        assert(typeof configured?.leaseApiGroup==='string'&&typeof configured?.leaseApiVersion==='string','API_PRODUCT_SCRIPT_IDENTITY_WITNESS_UNQUALIFIED');
        value.apiVersion=`${configured.leaseApiGroup}/${configured.leaseApiVersion}`;
        identityWitness={profile:'source-bound-chart-default-identity',parameters:{leaseApiGroup:configured.leaseApiGroup,leaseApiVersion:configured.leaseApiVersion},inputs:[contract.valuesSource,contract.authoritySource],inputDigest:hash(JSON.stringify([contract.valuesSource,hash(fs.readFileSync(path.join(root,contract.valuesSource))),contract.authoritySource,hash(authorityBytes)]))};
      }
      const names=Object.keys(value);
      if(typeof value.apiVersion!=='string'&&names.every(name=>['apiVersion','kind','namespace','name'].includes(name))&&names.includes('name')&&names.includes('namespace'))return; // flattened resource identity index, not an API request body
      assert(typeof value.apiVersion==='string'&&typeof value.kind==='string',`API_PRODUCT_SCRIPT_IDENTITY_UNRESOLVED: ${source}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1}`);
      if(!/(?:^|\/)v[0-9]/u.test(value.apiVersion))return;
      const line=tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1;
      result.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:index,sourceDigest:hash(bytes),producer:'script-shape',line,...(identityWitness?{identityWitness}:{}),
        outputDigest:hash(JSON.stringify(value)),inputs:[...serializedInputs].sort(),inputDigest:hash(JSON.stringify([...serializedInputs].sort().map(input=>[input,hash(fs.readFileSync(path.join(root,input)))]))),expressions:[...opaque.values()]}});
    });
    for(const publication of serializedPublications) {
      terminalPosition=publication.getStart(tree);
      let guarded=false;
      for(let parent=publication.parent;parent;parent=parent.parent)if(ts.isFunctionLike(parent)){guarded=guardedTestFunctions.has(parent);break;}
      if(guarded)continue;
      for(const argument of publication.arguments) {
        const value=evaluate(argument);
        if(value?.__docsDynamicExpression&&/apiVersion[\s\S]*kind|kind[\s\S]*apiVersion/u.test(value.__docsDynamicExpression))throw new Error(`API_PRODUCT_SCRIPT_SERIALIZED_OUTPUT_UNQUALIFIED: ${source}`);
        if(typeof value==='string'&&/^[\s]*[\[{]/u.test(value)) {
          let parsed;try{parsed=JSON.parse(value);}catch{if(/apiVersion|"kind"/u.test(value))throw new Error(`API_PRODUCT_SCRIPT_SERIALIZED_JSON_INVALID: ${source}`);}
          for(const resource of Array.isArray(parsed)?parsed:[parsed])if(resource?.apiVersion&&resource?.kind)result.push({value:resource,context:{apiVersion:resource.apiVersion,kind:resource.kind,path:source,document:constructors.length+result.filter(output=>output.context.path===source&&output.context.profile==='serialized-json-literal').length,sourceDigest:hash(bytes),producer:'script-shape',profile:'serialized-json-literal',line:tree.getLineAndCharacterOfPosition(publication.getStart(tree)).line+1,outputDigest:hash(JSON.stringify(resource)),inputs:[],inputDigest:hash('[]'),expressions:[]}});
        }
        if(typeof value!=='string'||!/(?:^|\n)apiVersion:\s/u.test(value)||!/(?:^|\n)kind:\s/u.test(value))continue;
        const documents=YAML.parseAllDocuments(value);
        assert(documents.every(document=>!document.errors.length),`API_PRODUCT_SCRIPT_SERIALIZED_YAML_INVALID: ${source}`);
        for(const document of documents) {
          const resource=document.toJS();if(!resource?.apiVersion||!resource?.kind)continue;
          result.push({value:resource,context:{apiVersion:resource.apiVersion,kind:resource.kind,path:source,document:constructors.length+result.filter(output=>output.context.path===source&&output.context.profile==='serialized-literal').length,sourceDigest:hash(bytes),producer:'script-shape',profile:'serialized-literal',line:tree.getLineAndCharacterOfPosition(publication.getStart(tree)).line+1,outputDigest:hash(JSON.stringify(resource)),inputs:[],inputDigest:hash('[]'),expressions:[]}});
        }
      }
    }
    assert(!outputRoles.some(role=>role.role==='api')||result.some(output=>output.context.path===source),`API_PRODUCT_SCRIPT_OUTPUT_IDENTITY_UNQUALIFIED: ${source}`);
  }
  for(const output of result)for(const source of output.context.inputs??[])classifiedDependencies.add(source);
  scriptOutputCache.set(root,{inputKey,result,dependencies:[...classifiedDependencies].sort().map(source=>[source,hash(fs.readFileSync(path.join(root,source)))])});
  return result;
}

const goOutputCache=new Map();
export function discoverGoApiOutputs(root) {
  const sources=walkProductSources(root,producerRoots,file=>/\.go$/u.test(file)&&!/_test\.go$/u.test(file));
  if(!sources.length)return [];
  const helper=new URL('./docs-api-go-output-shapes.go',import.meta.url);
  const authorityFile='scripts/docs-api-producer-adapter-authorities.json';
  const cacheInputs=[...sources,authorityFile,'package.json'].filter(source=>fs.existsSync(path.join(root,source)));
  const key=hash(JSON.stringify([root,hash(fs.readFileSync(helper)),hash(fs.readFileSync(new URL('./docs-api-go-output-role-adapter.go',import.meta.url))),cacheInputs.map(source=>[source,hash(fs.readFileSync(path.join(root,source)))])]));
  if(goOutputCache.has(key))return goOutputCache.get(key);
  const documentationTools=documentationToolSources(root);
  for(const source of sources)if(!documentationTools.has(source))assertNativeSerializationRoles(root,source,fs.readFileSync(path.join(root,source),'utf8'),'Go');
  const nativeAuthority=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');const nativeContracts=fs.existsSync(nativeAuthority)?JSON.parse(fs.readFileSync(nativeAuthority,'utf8')).nativeLanguageSerializationContracts??[]:[];
  const roles=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('./docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify(sources.filter(source=>!documentationTools.has(source)).map(source=>({path:path.join(root,source)}))),encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(roles.status,0,`API_PRODUCT_GO_PRODUCER_PARSE_FAILED: ${roles.error?.message??roles.stderr}`);
  const parsedRoles=JSON.parse(roles.stdout);
  for(const role of parsedRoles)assert(role.role==='non-api'||role.role==='api'||nativeOutputConsumerMatches({...role,expression:role.expression,function:role.function},nativeContracts.filter(contract=>contract.source===path.relative(root,role.path)&&contract.language==='Go').flatMap(contract=>contract.outputs??[]),root),`API_PRODUCT_GO_RAW_OUTPUT_ROLE_UNQUALIFIED: ${role.path}:${role.line}: ${role.expression}`);
  const literalOutputs=parsedRoles.filter(role=>role.role==='api').flatMap(role=>YAML.parseAllDocuments(role.value).map(document=>{assert(!document.errors.length,`API_PRODUCT_GO_LITERAL_YAML_INVALID: ${role.path}:${role.line}`);const value=document.toJS();assert(value?.apiVersion&&value?.kind,`API_PRODUCT_GO_LITERAL_IDENTITY_UNQUALIFIED: ${role.path}:${role.line}`);return {value,context:{apiVersion:value.apiVersion,kind:value.kind,path:path.relative(root,role.path),document:role.line,sourceDigest:hash(fs.readFileSync(role.path)),producer:'go-literal-forwarding',line:role.line,outputDigest:hash(JSON.stringify(value))}};}));
  const parsed=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY ?? 'go',['run',helper.pathname],{input:JSON.stringify(sources.map(source=>path.join(root,source))),encoding:'utf8',maxBuffer:32*1024*1024});
  assert.equal(parsed.status,0,`API_PRODUCT_GO_PRODUCER_PARSE_FAILED: ${parsed.error?.message ?? parsed.stderr}`);
  const result=[...literalOutputs,...Object.entries(JSON.parse(parsed.stdout)).flatMap(([absolute,objects])=>objects.map((object,index)=>{
    const source=path.relative(root,absolute);
    return {value:object.value,context:{apiVersion:object.value.apiVersion,kind:object.value.kind,path:source,document:index,sourceDigest:hash(fs.readFileSync(absolute)),producer:'go-shape',line:object.line,...(object.inferredIdentity?{inferredIdentity:true,requestMethod:object.requestMethod}:{}),outputDigest:hash(JSON.stringify(object.value))}};
  }))];
  goOutputCache.clear();goOutputCache.set(key,result);return result;
}

const nonApiOutputClassifications=new Map();
export function discoverScriptOutputRoleClassifications(root) {
  const documentationTools=documentationToolSources(root);
  const sources=walkProductSources(root,producerRoots,file=>/\.(?:[cm]?js|ts)$/u.test(file)&&!documentationTools.has(file));
  const classify=createSerializedOutputRoleClassifier(root,sources);
  return sources.flatMap(source=>classify(source).map(role=>({...role,path:source,sourceDigest:hash(fs.readFileSync(path.join(root,source))),dependencyDigests:Object.fromEntries(role.dependencies.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]))})));
}
export function discoverNonApiOutputClassifications(root) {discoverShellApiOutputs(root);return [...(nonApiOutputClassifications.get(root)??[]),...discoverScriptOutputRoleClassifications(root).filter(role=>role.role==='non-api')];}
export function shellRawOutputSinks(source,bytes) {
 const heredoc=/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?[^\n]*\n([\s\S]*?)\n[ \t]*\1(?:\n|$)/gu;
 const code=bytes.replace(heredoc,match=>match.slice(0,match.indexOf('\n'))+'\n'.repeat((match.match(/\n/gu)??[]).length));
 // Keep quoting and captured substitutions inside a word. Punctuation inside
 // a regex, quoted program or $(...) is not an executable command boundary.
 const tokens=[],substitutions=[];let index=0,line=1;
 function quoted(quote){let value='';index++;while(index<code.length){const char=code[index++];if(char==='\n')line++;if(char===quote)return value;if(quote==='\"'&&char==='$'&&code[index]==='('){index--;value+=substitution();continue;}if(char==='\\'&&quote==='"'&&index<code.length)value+=code[index++];else value+=char;}assert.fail(`API_PRODUCT_SHELL_OUTPUT_ROLE_PARSE_FAILED: ${source}: unterminated quote`);}
 function substitution(){const start=index,at=line;let value='$(',depth=1;index+=2;while(index<code.length&&depth){const char=code[index];if(char==='"'||char==="'"){const quote=char;value+=quote+quoted(quote)+quote;continue;}index++;if(char==='\n')line++;if(char==='(')depth++;if(char===')')depth--;value+=char;}assert.equal(depth,0,`API_PRODUCT_SHELL_OUTPUT_ROLE_PARSE_FAILED: ${source}: unterminated substitution`);substitutions.push({body:code.slice(start+2,index-1),line:at});return value;}
 while(index<code.length){const char=code[index];if(char==='\\'&&code[index+1]==='\n'){index+=2;line++;continue;}if(/[ \t\r]/u.test(char)){index++;continue;}if(char==='#'){while(index<code.length&&code[index]!=='\n')index++;continue;}if(char==='\n'){tokens.push({value:'\n',line,operator:true});index++;line++;continue;}if(/[;()|&<>]/u.test(char)){const start=index++;while(index<code.length&&code[index]===char&&char!=='('&&char!==')')index++;if((char==='>'||char==='<')&&code[index]==='&')index++;tokens.push({value:code.slice(start,index),line,operator:true});continue;}const at=line;let value='';while(index<code.length&&!/[ \t\r\n;()|&<>]/u.test(code[index])){if(code[index]==='"'||code[index]==="'")value+=quoted(code[index]);else if(code[index]==='$'&&code[index+1]==='(')value+=substitution();else if(code[index]==='$'&&code[index+1]==='{'){const close=code.indexOf('}',index+2);assert(close>=0,`API_PRODUCT_SHELL_OUTPUT_ROLE_PARSE_FAILED: ${source}: unterminated expansion`);value+=code.slice(index,close+1);index=close+1;}else if(code[index]==='\\'&&index+1<code.length){index++;if(code[index]==='\n'){index++;line++;}else value+=code[index++];}else value+=code[index++];}tokens.push({value,line:at,operator:false});}
 const sinks=substitutions.flatMap(value=>shellRawOutputSinks(source,value.body).map(sink=>({...sink,line:sink.line+value.line-1,channel:'command-substitution'}))),streamTools=new Set(['sed','awk','gawk','tee','head','tail','cut','paste','sort','uniq','tr','dd','base64','jq','yq']);
 const quietBuiltins=new Set(['return','exit',':','true','false','test','set','export','unset','local','readonly','shift','cd','mkdir','rmdir','rm','mv','cp','chmod','chown','touch','sleep','kill','wait','trap','read','umask','break','continue','mapfile','ulimit']);
 const functionNames=new Set([...code.matchAll(/(?:^|\n)\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*\{/gu)].map(match=>match[1]));
 let boundary=true,skipControl=null,casePattern=false;const caseStack=[];
 for(let at=0;at<tokens.length;at++){
  const token=tokens[at],word=token.value;
  if(/^\d+$/u.test(word)&&['>','>>','<','>&','<&'].includes(tokens[at+1]?.value)){at+=2;continue;}
  if(skipControl){if(word===skipControl){skipControl=null;boundary=true;}continue;}
  if(casePattern){if(word===')'){casePattern=false;boundary=true;}else if(word==='esac'){casePattern=false;caseStack.pop();boundary=true;}continue;}
  if(token.operator){if(['>','>>','<','<<<','>&','<&'].includes(word)){at++;continue;}if(word==='('&&tokens[at+1]?.value==='('){let depth=2;at++;while(++at<tokens.length&&depth){if(tokens[at].value==='(')depth++;if(tokens[at].value===')')depth--;}boundary=true;continue;}if([';;',';&',';;&'].includes(word)&&caseStack.length)casePattern=true;if([';','\n','&&','||','|','&','(',')',';;',';&',';;&'].includes(word))boundary=true;continue;}
  if(['then','do','else','elif'].includes(word)){boundary=true;continue;}
  if(!boundary)continue;
  if(word==='case'){caseStack.push(true);skipControl='in';casePattern=true;continue;}
  if(word==='for'||word==='select'){skipControl='do';continue;}
  if(word==='[['){skipControl=']]';continue;}
  if(word==='['){skipControl=']';continue;}
  if(['if','while','until','!','{','}','fi','done','esac','function'].includes(word)){if(word==='esac')caseStack.pop();continue;}
  if(/^[A-Za-z_][A-Za-z0-9_]*\+?=/u.test(word)){if(tokens[at+1]?.value==='('){let depth=0;while(++at<tokens.length){if(tokens[at].value==='(')depth++;if(tokens[at].value===')'&&--depth===0)break;}}continue;}
  if(tokens[at+1]?.value==='('&&tokens[at+2]?.value===')'){at+=2;continue;}
  boundary=false;
  const commandAt=at;let command=word,args=[];let end=at+1;while(end<tokens.length){if(tokens[end].value==='('&&args.at(-1)?.endsWith('=')){let depth=0;do{const value=tokens[end++].value;args.push(value);if(value==='(')depth++;if(value===')')depth--;}while(end<tokens.length&&depth);continue;}if(tokens[end].operator&&[';','\n','&&','||','|','&','(',')',';;',';&',';;&'].includes(tokens[end].value))break;args.push(tokens[end++].value);}
  at=end-1;
  // command/exec preserve the invoked command's output capability. The bounded
  // command -v introspection returns a command name, never a resource document.
  if(command==='command'&&args[0]==='-v')continue;
  if(command==='exec'&&/^\d+$/u.test(args[0]??'')&&['>','>>','<','>&','<&'].includes(args[1]))continue;
  if(command==='command'||command==='exec'){while(args[0]?.startsWith('-'))args.shift();command=args.shift()??'$unsupported-command';}
  if(['cat','kubectl'].includes(command)&&(args.includes('<<')||args.includes('<<-')))continue;
  const redirectsToNull=args.some((arg,n)=>['>','>>'].includes(arg)&&args[n+1]==='/dev/null');
  const redirectsToError=args.some((arg,n)=>arg==='>&'&&args[n+1]==='2');
  if(redirectsToNull&&['echo','printf','cat','head','tail','cut','paste','tr','base64','jq','yq','grep'].includes(command))continue;
  const argumentsOnly=args.slice(0,args.findIndex(value=>['>','>>','<','<<<','>&','<&'].includes(value))<0?args.length:args.findIndex(value=>['>','>>','<','<<<','>&','<&'].includes(value)));
  if(quietBuiltins.has(command)&&!argumentsOnly.some(arg=>/^-.*v/u.test(arg)))continue;
  if(['kubectl','helm'].includes(command)||functionNames.has(command))continue;
  const unknownEmitter=!['echo','printf','cat'].includes(command)&&!quietBuiltins.has(command);
  const literalApi=argumentsOnly.some(arg=>/apiVersion/u.test(arg)&&/kind/u.test(arg));
  const variable=command==='echo'?argumentsOnly.find(arg=>!arg.startsWith('-')):argumentsOnly[1];
  const opaque=literalApi||streamTools.has(command)||unknownEmitter||command==='cat'||command==='echo'&&/\$|`/u.test(argumentsOnly.join(' '))||command==='printf'&&(/\$|`/u.test(argumentsOnly[0]??'')||/%[sb]/u.test(argumentsOnly[0]??'')&&argumentsOnly.slice(1).some(arg=>/\$|`/u.test(arg)))||quietBuiltins.has(command);
  if(!opaque)continue;
  const name=variable?.match(/^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))$/u),identifier=name?.[1]??name?.[2];
  const first=tokens.find(item=>item.value!=='\n');const initial=identifier&&first?.value.startsWith(identifier+'=')?first.value.slice(identifier.length+1):null;
  const prefix=tokens.slice(0,commandAt).filter(item=>item.value!=='\n'&&item.value!==';');let constantNonApi=false;
  if(initial!==null&&prefix.length===1&&!/[$`]/u.test(initial)&&tokens[end]?.value!=='|'){try{const values=YAML.parseAllDocuments(initial).map(document=>document.toJSON());constantNonApi=!values.some(value=>value&&typeof value==='object'&&'apiVersion'in value&&'kind'in value);}catch{}}
  if(!constantNonApi)sinks.push({line:token.line,command,args:argumentsOnly});
 }
 return sinks;
}
export function shellRawOutputOperationRecipe(source,bytes) {
 const heredocs=[];
 const shell=bytes.replace(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?[^\n]*\n([\s\S]*?)\n[ \t]*\1(?:\n|$)/gu,(match,delimiter,body)=>{heredocs.push({delimiter,sha256:hash(body)});return match.slice(0,match.indexOf('\n'))+'\n'.repeat((match.match(/\n/gu)??[]).length);});
 return {...producerAdapterOperationRecipe(source,shell),heredocs};
}
const shellOutputCache=new Map();
function shellOutputConsumerMatches(source,bytes,sink,consumer) {
 if(consumer.source!==source||consumer.line!==sink.line||consumer.command!==sink.command||consumer.argumentsDigest!==hash(JSON.stringify(sink.args))||!consumer.purpose||typeof consumer.sourceEvidence!=='string'||!consumer.sourceEvidence)return false;
 // Consumer evidence is executable source context, not a free-standing role
 // label. It must still cover the actual selected command at its source line.
 let found=false;
 for(let offset=bytes.indexOf(consumer.sourceEvidence);offset>=0;offset=bytes.indexOf(consumer.sourceEvidence,offset+1)){
  const first=bytes.slice(0,offset).split('\n').length,last=first+consumer.sourceEvidence.split('\n').length-1;
  if(first<=sink.line&&sink.line<=last){found=true;break;}
 }
 if(!found)return false;
 const channel=sink.channel??'command-output';
 if(consumer.channel&&consumer.channel!==channel)return false;
 if(consumer.kind==='captured-operation')return channel==='command-substitution';
 if(!['framed-or-native-scalar-output','declared-child-operation','native-tool-or-selected-stream','fixed-native-text-transform'].includes(consumer.kind))return false;
 if(consumer.kind==='framed-or-native-scalar-output'&&!['echo','printf'].includes(sink.command))return false;
 const streamTools=new Set(['cat','tee','sed','awk','gawk','head','tail','cut','paste','sort','uniq','tr','dd','base64','jq','yq']);
 if(!streamTools.has(sink.command))return true;
 // Stream filters cannot inherit a native role while reading caller stdin.
 // Require a selected pipe, a named input, or the exact scalar-trim recipe.
 const context=bytes.split('\n').slice(Math.max(0,sink.line-3),sink.line).join('\n').replace(/\\\n[ \t]*/gu,' ');
 const command=sink.command.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
 if(new RegExp(`\\|\\s*${command}(?:\\s|$)`,'u').test(context))return true;
 const args=sink.args;
 if(sink.command==='tee')return false; // tee arguments are destinations.
 if(sink.command==='cat')return args.some(value=>value!=='-'&&!value.startsWith('-'));
 if(['sed','awk','gawk','jq','yq'].includes(sink.command)){
  const positional=[];
  for(let index=0;index<args.length;index++){
   if(['-v','-F','-f','-e'].includes(args[index])){index++;continue;}
   if(args[index]==='--arg'||args[index]==='--argjson'){index+=2;continue;}
   if(!args[index].startsWith('-'))positional.push(args[index]);
  }
  if(positional.length>1&&positional.at(-1)!=='-')return true;
  const scalarTrim=`{ sub(/^[[:space:]]+/, "", $0) sub(/[[:space:]]+$/, "", $0) gsub(/^"|"$/, "", $0) gsub(/^'|'$/, "", $0) print }`;
  return ['awk','gawk'].includes(sink.command)&&positional.length===1&&positional[0].replace(/\s+/gu,'')===scalarTrim.replace(/\s+/gu,'');
 }
 if(['head','tail','cut'].includes(sink.command)){
  for(let index=0;index<args.length;index++){if(['-n','-c','-d','-f'].includes(args[index])){index++;continue;}if(args[index]!=='-'&&!args[index].startsWith('-'))return true;}
 }
 return false;
}
export function discoverShellApiOutputs(root) {
  const sources=walkProductSources(root,[...producerRoots,'my-values'],file=>/\.sh$/u.test(file));
  const authority='scripts/docs-api-producer-adapter-authorities.json';
  const cacheInputs=[...sources,authority].filter(source=>fs.existsSync(path.join(root,source)));
  const key=hash(JSON.stringify(cacheInputs.map(source=>[source,hash(fs.readFileSync(path.join(root,source)))])));
  const cached=shellOutputCache.get(root);if(cached?.key===key)return cached.outputs;
  const outputs=[];const classifications=[];nonApiOutputClassifications.set(root,classifications);
  for(const source of sources) {
    const bytes=fs.readFileSync(path.join(root,source),'utf8');
    if(/(?:^|\n)\s*helm\s/u.test(bytes)||/\bnode\b[^\n]*render-[A-Za-z0-9-]+\.mjs/u.test(bytes))assertProducerAdapterAuthority(root,[source]);
    const sourceDigest=hash(bytes);
    const rawSinks=shellRawOutputSinks(source,bytes);if(rawSinks.length){const registryFile=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');const registry=fs.existsSync(registryFile)?JSON.parse(fs.readFileSync(registryFile,'utf8')):{};const contract=(registry.shellRawOutputContracts??[]).find(record=>record.source===source&&JSON.stringify(record.sinks)===JSON.stringify(rawSinks)&&JSON.stringify(record.operationRecipe)===JSON.stringify(shellRawOutputOperationRecipe(source,bytes)));assert(contract,`API_PRODUCT_SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED: ${source}:${rawSinks[0].line}`);assert(contract.sinkConsumers?.length===rawSinks.length,`API_PRODUCT_SHELL_CONSUMER_UNQUALIFIED: ${source}`);for(const [index,consumer]of contract.sinkConsumers.entries())assert(shellOutputConsumerMatches(source,bytes,rawSinks[index],consumer),`API_PRODUCT_SHELL_CONSUMER_UNQUALIFIED: ${source}:${rawSinks[index].line}:${rawSinks[index].command}`);classifications.push({source,sourceDigest,role:contract.role,basis:contract.basis,sinks:rawSinks,consumer:contract.consumer});}
    const scalarize=value=>value.replace(/\$\{[^}\n]+\}|\$[A-Za-z_][A-Za-z0-9_]*/gu,'discovery');
    let document=0;
    const add=(value,line,profile,request={})=>outputs.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:document++,sourceDigest,producer:'shell-shape',line,profile,...request,outputDigest:hash(JSON.stringify(value))}});
    const pattern=/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?[^\n]*\n([\s\S]*?)\n[ \t]*\1(?:\n|$)/gu;
    for(const match of bytes.matchAll(pattern)) {
      const header=bytes.slice(bytes.lastIndexOf('\n',match.index-1)+1,match.index+match[0].indexOf('\n'));
      if(!/(?:^|\n)apiVersion:/u.test(match[2])){assert(!/\bkubectl\s+(?:apply|create|replace)\b/u.test(header),`API_PRODUCT_SHELL_SUBMITTED_OUTPUT_ROLE_UNQUALIFIED: ${source}:${header}`);assert(!/\bcat\b/u.test(header)||!/(?:^|\n)\s*\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)(?:\s*(?:\n|$)|:)/u.test(match[2]),`API_PRODUCT_SHELL_EMITTED_OUTPUT_ROLE_UNQUALIFIED: ${source}:${header}`);continue;}
      assert(header.split('|').slice(1).every(part=>/^\s*kubectl\s+apply\b/u.test(part)),`API_PRODUCT_SHELL_PIPELINE_UNQUALIFIED: ${source}:${header}`);
      let content=match[2];
      // Expand source-authored multiline YAML fragments before replacing their
      // scalar variables. An unsupported dynamically computed fragment fails
      // YAML/context discovery; it cannot vanish as an empty substitution.
      for(const variable of content.matchAll(/^\s*\$\{([A-Za-z_][A-Za-z0-9_]*)\}\s*$/gmu)) {
        const preceding=bytes.slice(0,match.index);
        const assignments=[...preceding.matchAll(new RegExp(`\\b${variable[1]}="([\\s\\S]*?)"`,'gu'))];
        const fragment=assignments.map(item=>item[1]).filter(value=>value.trim()).at(-1);
        assert(fragment!==undefined,`API_PRODUCT_SHELL_FRAGMENT_UNRESOLVED: ${source} ${variable[1]}`);
        content=content.replace(variable[0],fragment);
      }
      const documents=YAML.parseAllDocuments(scalarize(content));
      assert(documents.every(item=>!item.errors.length),`API_PRODUCT_SHELL_YAML_INVALID: ${source}:${bytes.slice(0,match.index).split('\n').length}`);
      const preceding=bytes.slice(0,match.index);
      const invocation=preceding.slice(preceding.lastIndexOf('\n')+1).trim();
      const constructor=[...preceding.matchAll(/^\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*\{/gmu)].at(-1)?.[1];
      const request=/^kubectl\s+apply(?:\s|$)/u.test(invocation)?{requestOperation:'kubectl-apply',requestInvocation:invocation,...(constructor?{requestConstructor:constructor}:{})}:{};
      for(const item of documents) {const value=item.toJS();
        if(value?.apiVersion==='v1'&&value?.kind==='Config') {
          assert(/^cat\s+>\s*"\$kubeconfig"\s*$/u.test(invocation)&&value.clusters&&value.users&&value.contexts&&value['current-context']&&/KUBECONFIG="\$kubeconfig"/u.test(bytes),`API_PRODUCT_CLIENT_CONFIG_SINK_UNQUALIFIED: ${source}`);
          classifications.push({path:source,sourceDigest,line:bytes.slice(0,match.index).split('\n').length+1,classification:'local-kubernetes-client-configuration',sink:invocation,consumer:'KUBECONFIG="$kubeconfig"',reason:'Local kubeconfig file selects client authentication and cluster connection. It is not submitted to a Kubernetes API resource endpoint.',outputDigest:hash(JSON.stringify(value))});continue;
        }
        if(value?.apiVersion&&value?.kind)add(value,bytes.slice(0,match.index).split('\n').length+1,'heredoc',request);}
    }
    const offsets=[];
    let logical='';
    for(let cursor=0;cursor<bytes.length;) {
      const continuation=/^\\\n[ \t]*/u.exec(bytes.slice(cursor));
      offsets.push(cursor);
      if(continuation) {logical+=' ';cursor+=continuation[0].length;}
      else {logical+=bytes[cursor];cursor++;}
    }
    for(const constructor of logical.matchAll(/(?:^|[|;]\s*)[ \t]*kubectl\s+create\s+([^\n]+)/gmu)) {
      assert(/^(?:namespace|configmap)\s|^secret\s+(?:generic|docker-registry)\s/u.test(constructor[1]),`API_PRODUCT_KUBECTL_CONSTRUCTOR_UNCLASSIFIED: ${source}:${bytes.slice(0,offsets[constructor.index]).split('\n').length} ${constructor[1]}`);
    }
    for(const match of logical.matchAll(/(?:^|[|;]\s*)[ \t]*kubectl\s+create\s+(secret\s+(?:generic|docker-registry)|configmap|namespace)\s+([^\n]+)/gmu)) {
      const command=match[2];
      const pipeline=command.split('|').slice(1).map(part=>part.trim());
      assert(pipeline.every(part=>/^kubectl\s+apply\b/u.test(part)),`API_PRODUCT_SHELL_PIPELINE_UNQUALIFIED: ${source}:${bytes.slice(0,offsets[match.index]).split('\n').length} ${pipeline.join(' | ')}`);
      const kind={namespace:'Namespace',configmap:'ConfigMap','secret generic':'Secret','secret docker-registry':'Secret'}[match[1]];
      const name=scalarize(command.match(/^(?:"([^"]+)"|'([^']+)'|([^\s]+))/u)?.slice(1).find(Boolean)??'discovery');
      const namespace=command.match(/(?:^|\s)(?:-n|--namespace)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s|]+))/u)?.slice(1).find(Boolean);
      const value={apiVersion:'v1',kind,metadata:{name,...(namespace?{namespace:scalarize(namespace)}:{})}};
      if(kind!=='Namespace') {
        const data={};for(const field of command.matchAll(/--from-(?:literal|file)(?:=|\s+)["']?([A-Za-z0-9._-]+)=/gu))data[field[1]]='<source-derived-payload>';
        if(match[1]==='secret docker-registry')data['.dockerconfigjson']='<source-derived-registry-authentication>';
        assert(Object.keys(data).length,`API_PRODUCT_KUBECTL_PAYLOAD_UNRESOLVED: ${source} ${kind}`);
        value.data=data;
        if(kind==='Secret')value.type=match[1]==='secret docker-registry'?'kubernetes.io/dockerconfigjson':command.match(/--type=([^\s|]+)/u)?.[1]??'Opaque';
      }
      add(value,bytes.slice(0,offsets[match.index]).split('\n').length,'kubectl-create');
    }
  }
  shellOutputCache.set(root,{key,outputs});
  return outputs;
}

// Invoke only the pure manifest renderers used by deploy.sh. Their source and
// file inputs are fingerprinted together; no cluster preflight is executed.
const transformOutputCache=new Map();
export function discoverTransformedApiOutputs(root) {
  const adapterSources=['scripts/render-litellm-deployment.mjs','scripts/render-postgresql-recovery.mjs','scripts/render-stateful-network-policies.mjs','scripts/render-registry-local.mjs'].filter(source=>fs.existsSync(path.join(root,source)));
  assertProducerAdapterAuthority(root,adapterSources);
  const dependencyFiles=walkProductSources(root,['scripts','my-values/infra'],file=>/\.(?:mjs|ya?ml|json)$/u.test(file));
  const cacheKey=hash(JSON.stringify([root,dependencyFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]),fs.existsSync(path.join(root,'versions.json'))?hash(fs.readFileSync(path.join(root,'versions.json'))):null]));
  if(transformOutputCache.has(cacheKey))return transformOutputCache.get(cacheKey);
  const caller='scripts/deploy.sh';
  if(fs.existsSync(path.join(root,caller))) {
    const callerBytes=fs.readFileSync(path.join(root,caller),'utf8').replace(/\\\n[ \t]*/gu,' ');
    const operations={
      'render-litellm-deployment.mjs':'"$INFRA_DIR/litellm-config.yaml" "$INFRA_DIR/litellm-deployment.yaml"',
      'render-postgresql-recovery.mjs':'--preflight "$NAMESPACE" "$INFRA_DIR/postgresql-recovery.yaml" "$POSTGRESQL_VALUES_FILE" "$INFRA_DIR/litellm-deployment.yaml" "$POSTGRESQL_RELEASE"',
      'render-stateful-network-policies.mjs':'"$INFRA_DIR/network-policies.yaml" "$NAMESPACE" "$REDIS_RELEASE" "$REDIS_VALUES_FILE" "$POSTGRESQL_RELEASE" "$POSTGRESQL_VALUES_FILE"',
      'render-registry-local.mjs':'"$KUBECLAW_LAB_REGISTRY_STORAGE_CONFIG" serve "$registry_existing" "$registry_pvc"',
    };
    for(const [renderer,parameters]of Object.entries(operations)) {
      const actual=[...callerBytes.matchAll(/node "[^"\n]*\/(render-[a-z-]+\.mjs)" ([^\n]*)/gu)].filter(match=>match[1]===renderer).map(match=>match[2].slice(0,match[2].indexOf(')"')).trim());
      assert(actual.length&&actual.every(operation=>operation.replace(/\s+/gu,' ')===parameters),`API_PRODUCT_ADAPTED_RECIPE_INVOCATION_DRIFT: ${caller}:${renderer}; offline recipe positional input mapping must be reviewed`);
    }
  }
  const recipes=[
    ['scripts/render-litellm-deployment.mjs',['my-values/infra/litellm-config.yaml','my-values/infra/litellm-deployment.yaml']],
    ['scripts/render-postgresql-recovery.mjs',['default','my-values/infra/postgresql-recovery.yaml','my-values/infra/postgresql-values.yaml','my-values/infra/litellm-deployment.yaml','postgresql']],
    ['scripts/render-stateful-network-policies.mjs',['my-values/infra/network-policies.yaml','default','redis','my-values/infra/redis-values.yaml','postgresql','my-values/infra/postgresql-values.yaml']],
  ];
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'docs-api-transforms-'));
  const registry='scripts/render-registry-local.mjs';
  if(fs.existsSync(path.join(root,registry))) {
    const config=path.join(temporary,'storage.json'),existing=path.join(temporary,'deployment.json'),pvc=path.join(temporary,'pvc.json');
    fs.writeFileSync(config,JSON.stringify({capacity:'10Gi',storageClassName:'discovery'}));fs.writeFileSync(existing,'');fs.writeFileSync(pvc,'');
    const served=spawnSync(process.execPath,[registry,config,'serve',existing,pvc],{cwd:root,encoding:'utf8'});
    assert.equal(served.status,0,`API_PRODUCT_REGISTRY_RENDER_FAILED: ${served.stderr}`);
    const objects=YAML.parseAllDocuments(served.stdout).map(document=>{assert.equal(document.errors.length,0);return document.toJS();});
    const deployed=path.join(temporary,'deployed.json'),claim=path.join(temporary,'claim.json');
    fs.writeFileSync(deployed,JSON.stringify(objects.find(value=>value.kind==='Deployment')));fs.writeFileSync(claim,JSON.stringify(objects.find(value=>value.kind==='PersistentVolumeClaim')));
    recipes.push([registry,[config,'serve',existing,pvc]],[registry,[config,'gc-dry-run',deployed,claim]],[registry,[config,'gc',deployed,claim]]);
  }
  const result=[];
  const continuous='scripts/gitops-continuous.mjs';
  if(fs.existsSync(path.join(root,continuous))) {
    assertProducerAdapterAuthority(root,[continuous]);
    const bytes=fs.readFileSync(path.join(root,continuous),'utf8');
    const tree=ts.createSourceFile(continuous,bytes,ts.ScriptTarget.Latest,true);
    const fn=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='continuousDocuments');
    assert(fn,`API_PRODUCT_CONTINUOUS_TRANSFORM_MISSING: ${continuous}`);
    const environment=tree.statements.filter(ts.isVariableStatement).flatMap(node=>node.declarationList.declarations).find(node=>node.name.getText(tree)==='environment')?.initializer;
    assert(environment&&ts.isStringLiteral(environment),'API_PRODUCT_CONTINUOUS_ENVIRONMENT_UNQUALIFIED');
    const ancestry=['scripts/gitops.mjs','scripts/gitops-bundle.mjs'];
    const bootstrapBytes=fs.readFileSync(path.join(root,ancestry[0]),'utf8');
    const bootstrapTree=ts.createSourceFile(ancestry[0],bootstrapBytes,ts.ScriptTarget.Latest,true);
    const bootstrap=bootstrapTree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='bootstrapDocuments');
    assert(bootstrap,'API_PRODUCT_CONTINUOUS_BOOTSTRAP_MISSING');
    const helpers=ts.createSourceFile(ancestry[1],fs.readFileSync(path.join(root,ancestry[1]),'utf8'),ts.ScriptTarget.Latest,true).statements.filter(ts.isVariableStatement).flatMap(node=>node.declarationList.declarations).filter(node=>['gitOpsName','gitOpsClusterKinds'].includes(node.name.getText()));
    assert.equal(helpers.length,2,'API_PRODUCT_CONTINUOUS_HELPERS_MISSING');
    const controlled={groups:['buster','prism','nova'].map((role,index)=>({role,name:role,namespace:'discovery',path:`releases/gitops/discovery/${role}`,wave:index===2?1:0,helmReleases:[role],resources:[{apiVersion:'v1',kind:'ConfigMap',namespace:'discovery',name:role}]}))};
    const body=`const environment=${JSON.stringify(environment.text)};${helpers.map(node=>`const ${node.getText()};`).join('')};const readCommittedBundle=()=>input;${bootstrap.getText(bootstrapTree).replace(/^export\s+/u,'')};${fn.getText(tree).replace(/^export\s+/u,'')};continuousDocuments(bootstrapDocuments('offline','releases/gitops/discovery','https://example.invalid/discovery.git','${syntheticDigest.slice(0,40)}','default'),'default')`;
    const program=`import vm from 'node:vm'; const result=vm.runInNewContext(${JSON.stringify(body)},{input:${JSON.stringify(controlled)},structuredClone,URL},{timeout:1000}); process.stdout.write(JSON.stringify(result));`;
    const rendered=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:temporary,env:{PATH:process.env.PATH},encoding:'utf8'});
    assert.equal(rendered.status,0,`API_PRODUCT_CONTINUOUS_TRANSFORM_FAILED: ${rendered.stderr}`);
    JSON.parse(rendered.stdout).forEach((value,index)=>result.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:continuous,document:index,producer:'script-render',profile:'continuous-bootstrap',sourceDigest:hash(bytes),inputs:ancestry,inputDigest:hash(JSON.stringify([controlled,ancestry.map(source=>[source,hash(fs.readFileSync(path.join(root,source)))])])),outputDigest:hash(YAML.stringify(value)),publicOutput:'gitops/production/bootstrap.yaml'}}));
  }
  try { for(const [source,args] of recipes) {
    if(!fs.existsSync(path.join(root,source)))continue;
    const rendered=spawnSync(process.execPath,[source,...args],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
    assert.equal(rendered.status,0,`API_PRODUCT_SCRIPT_RENDER_FAILED: ${source}: ${rendered.stderr}`);
    const inputFiles=args.filter(argument=>fs.existsSync(path.resolve(root,argument))&&fs.statSync(path.resolve(root,argument)).isFile());
    const inputs=inputFiles.filter(argument=>!path.isAbsolute(argument));
    const inputDigest=hash(JSON.stringify(inputFiles.map(input=>[path.isAbsolute(input)?path.basename(input):input,hash(fs.readFileSync(path.resolve(root,input)))])));
    const documents=YAML.parseAllDocuments(rendered.stdout);
    assert(documents.every(document=>!document.errors.length),`API_PRODUCT_SCRIPT_YAML_INVALID: ${source}`);
    documents.forEach((document,index)=>{
      const value=document.toJS();if(!value?.apiVersion||!value?.kind)return;
      result.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:index,producer:'script-render',profile:source===registry?args[1]:'deploy-default',sourceDigest:hash(fs.readFileSync(path.join(root,source))),inputs,inputDigest,outputDigest:hash(JSON.stringify(value))}});
    });
  }} finally {fs.rmSync(temporary,{recursive:true,force:true});}
  transformOutputCache.clear();transformOutputCache.set(cacheKey,result);return result;
}

const infrastructureOutputCache=new Map();
export function discoverInfrastructureApiOutputs(root) {
  const source='scripts/infrastructure-release.mjs';
  if(!fs.existsSync(path.join(root,source)))return [];
  assertProducerAdapterAuthority(root,['scripts/deploy.sh',source,'scripts/infrastructure-chart.mjs','scripts/infrastructure-image-renderer.mjs'].filter(file=>fs.existsSync(path.join(root,file))));
  const versionFile=path.join(root,'versions.json');
  const lock=JSON.parse(fs.readFileSync(versionFile,'utf8')).infrastructureCharts??{};
  const dependencyFiles=walkProductSources(root,['scripts','my-values/infra'],file=>/\.(?:mjs|ya?ml|json)$/u.test(file));
  const cacheKey=hash(JSON.stringify([root,lock,dependencyFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])]));
  if(infrastructureOutputCache.has(cacheKey))return infrastructureOutputCache.get(cacheKey);
  const results=[];
  for(const name of Object.keys(lock).sort()) {
    const directory='my-values/infra';
    const expected=`${directory}/${name==='tailscale'?'tailscale-operator':name}-values.yaml`;
    assert(fs.existsSync(path.join(root,expected)),`API_PRODUCT_INFRASTRUCTURE_VALUES_BINDING_MISSING: ${name}`);
    const chartModule=pathToFileURL(path.join(root,'scripts/infrastructure-chart.mjs')).href;
    const releaseModule=pathToFileURL(path.join(root,source)).href;
    const program=`import {stageInfrastructureChart} from ${JSON.stringify(chartModule)}; import {renderInfrastructureChart} from ${JSON.stringify(releaseModule)}; const name=${JSON.stringify(name)};const archive=stageInfrastructureChart(name); const values=${JSON.stringify(path.join(root,expected))};process.stdout.write(JSON.stringify([false,true].map(upgrade=>({upgrade,yaml:renderInfrastructureChart(name,name,'default',archive,values,'helm',upgrade)}))));`;
    const rendered=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
    assert.equal(rendered.status,0,`API_PRODUCT_INFRASTRUCTURE_RENDER_FAILED: ${name}: ${rendered.stderr}`);
    for(const profile of JSON.parse(rendered.stdout)) {
      const documents=YAML.parseAllDocuments(profile.yaml);
      assert(documents.every(document=>!document.errors.length),`API_PRODUCT_INFRASTRUCTURE_YAML_INVALID: ${name}`);
      documents.forEach((document,index)=>{const value=document.toJS();if(!value?.apiVersion||!value?.kind)return;
        results.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:index,producer:'infrastructure-helm',profile:`${name}:${profile.upgrade?'upgrade':'install'}`,sourceDigest:hash(fs.readFileSync(path.join(root,source))),inputs:[expected,'versions.json'],inputDigest:hash(JSON.stringify([lock[name],hash(fs.readFileSync(path.join(root,expected)))])),dependencyDigest:hash(JSON.stringify(walkProductSources(root,['scripts'],file=>/^scripts\/(?:infrastructure|stateful-database)-.*\.mjs$/u.test(file)).map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]))),outputDigest:hash(JSON.stringify(value))}});
      });
    }
  }
  infrastructureOutputCache.clear();infrastructureOutputCache.set(cacheKey,results);return results;
}

const externalOutputCache = new Map();
const ciliumGeneratedSecretArchive='06210eef7c23d15f7699c79e2fe3a1ec9c389024c5c5c006ea04022d322449a2';
function externalGeneratedSecretFields(root,recipe,archive,document,value) {
  if(recipe.chart!=='cilium'||value.kind!=='Secret'||value.metadata?.labels?.['cilium.io/helm-template-non-idempotent']!=='true')return [];
  assert.equal(archive.sha256,ciliumGeneratedSecretArchive,'API_PRODUCT_GENERATED_SECRET_SOURCE_UNQUALIFIED');
  const template=/# Source: (\S+)/u.exec(document.toString())?.[1];
  const templates={
    'cilium/templates/cilium-ca-secret.yaml':{'ca.crt':'CA certificate','ca.key':'CA private key'},
    'cilium/templates/hubble/tls-helm/relay-client-secret.yaml':{'ca.crt':'CA certificate','tls.crt':'Hubble relay client certificate','tls.key':'Hubble relay client private key'},
    'cilium/templates/hubble/tls-helm/server-secret.yaml':{'ca.crt':'CA certificate','tls.crt':'Hubble server certificate','tls.key':'Hubble server private key'},
  };
  const roles=templates[template];
  assert(roles,`API_PRODUCT_GENERATED_SECRET_TEMPLATE_UNQUALIFIED: ${template}`);
  assert.deepEqual(Object.keys(value.data??{}).sort(),Object.keys(roles).sort(),`API_PRODUCT_GENERATED_SECRET_BOUNDARY_DRIFT: ${template}`);
  const extract=file=>{const result=spawnSync('tar',['-xOf',path.join(root,archive.path),file],{encoding:'utf8'});assert.equal(result.status,0,`API_PRODUCT_GENERATED_SECRET_SOURCE_MISSING: ${file}`);return result.stdout;};
  const helper=extract('cilium/templates/_helpers.tpl');const source=extract(template);
  assert(helper.includes('genCA "Cilium CA" $validity')&&helper.includes('buildCustomCert $crt $key')&&helper.includes('lookup "v1" "Secret"'),'API_PRODUCT_GENERATED_CA_SOURCE_DRIFT');
  if(template!=='cilium/templates/cilium-ca-secret.yaml')assert(source.includes('genSignedCert')&&source.includes('lookup "v1" "Secret"'),`API_PRODUCT_GENERATED_CERT_SOURCE_DRIFT: ${template}`);
  // Supplied CA bytes are real deterministic inputs, so retain them unchanged.
  // Offline Helm has no cluster lookup result; otherwise the helper generates
  // a CA. Live Helm can reuse existing CA/client/server Secrets instead.
  let suppliedCert,suppliedKey;
  for(const input of recipe.inputs.filter(input=>/\.ya?ml$/u.test(input))) {
    const values=YAML.parse(fs.readFileSync(path.join(root,input),'utf8'));
    if(values?.tls?.ca&&Object.hasOwn(values.tls.ca,'cert'))suppliedCert=values.tls.ca.cert;
    if(values?.tls?.ca&&Object.hasOwn(values.tls.ca,'key'))suppliedKey=values.tls.ca.key;
  }
  if(recipe.inline){const values=YAML.parse(recipe.inline);if(values?.tls?.ca&&Object.hasOwn(values.tls.ca,'cert'))suppliedCert=values.tls.ca.cert;if(values?.tls?.ca&&Object.hasOwn(values.tls.ca,'key'))suppliedKey=values.tls.ca.key;}
  assert(!recipe.args.some(argument=>/^tls\.ca\.(?:key|cert)=/u.test(argument)),'API_PRODUCT_GENERATED_CA_PARAMETER_UNQUALIFIED');
  const generated=[];
  for(const [key,role]of Object.entries(roles)) {
    if(key.startsWith('ca.')&&suppliedCert&&suppliedKey)continue;
    assert(typeof value.data[key]==='string'&&value.data[key].length,`API_PRODUCT_GENERATED_SECRET_VALUE_INVALID: ${template}:${key}`);
    value.data[key]=`<offline Helm generated ${role}; private bytes vary per render>`;
    generated.push({fieldPath:yamlGeneratedKey(key),role,mechanism:key.startsWith('ca.')?'cilium.ca.setup genCA fallback':'genSignedCert fallback',archiveSha256:archive.sha256,template,templateSha256:hash(source),helper:'cilium/templates/_helpers.tpl',helperSha256:hash(helper),lookupBoundary:'Offline template has no cluster Secret lookup. Live Helm can reuse complete existing CA or certificate/key data; generated private bytes are not reproduced or published.'});
  }
  return generated;
}
const yamlGeneratedKey=key=>`$.data[${JSON.stringify(key)}]`;
/** Render actual external Application bindings and installer recipes using
 * authenticated archives. Foreign CRD definitions remain registration objects. */
export function discoverExternalChartApiOutputs(root) {
  const manifestPath='scripts/external-helm-archives.json';
  if(!fs.existsSync(path.join(root,manifestPath))) return [];
  const manifestBytes=fs.readFileSync(path.join(root,manifestPath));
  const expectedManifest=fs.readFileSync(path.join(root,'scripts/external-helm-archives.sha256'),'utf8').trim().split(/\s+/)[0];
  assert.equal(hash(manifestBytes),expectedManifest,'API_PRODUCT_EXTERNAL_ARCHIVE_MANIFEST_DRIFT');
  const archives=Object.values(JSON.parse(manifestBytes).charts);
  const recipes=[];
  const normalizeRepo=value=>value.replace(/\/+$/u,'');
  for(const sourcePath of walkProductSources(root,['gitops'],file=>/\.ya?ml$/u.test(file))) {
    const bytes=fs.readFileSync(path.join(root,sourcePath));
    const documents=YAML.parseAllDocuments(bytes.toString());
    assert(documents.every(document=>!document.errors.length),`API_PRODUCT_EXTERNAL_BINDING_YAML_INVALID: ${sourcePath}`);
    for(const document of documents) {
      const app=document.toJS();
      if(app?.kind!=='Application')continue;
      for(const source of app.spec?.sources??(app.spec?.source?[app.spec.source]:[])) {
        if(!source.chart)continue;
        const ignoredValueFiles=[];
        const inputs=(source.helm?.valueFiles??[]).flatMap(file=>{
          assert(file.startsWith('$values/'),`API_PRODUCT_EXTERNAL_VALUE_BINDING_UNRESOLVED: ${sourcePath}:${file}`);
          const relative=file.slice('$values/'.length);
          assert(!path.isAbsolute(relative)&&!relative.split('/').includes('..'),`API_PRODUCT_EXTERNAL_VALUE_BINDING_UNRESOLVED: ${sourcePath}:${file}`);
          if(!fs.existsSync(path.join(root,relative))&&source.helm?.ignoreMissingValueFiles===true){ignoredValueFiles.push(relative);return [];}
          assert(fs.existsSync(path.join(root,relative)),`API_PRODUCT_EXTERNAL_VALUE_INPUT_MISSING: ${sourcePath}:${relative}`);
          return [relative];
        });
        const args=(source.helm?.parameters??[]).flatMap(parameter=>[parameter.forceString?'--set-string':'--set',`${parameter.name}=${parameter.value}`]);
        for(const parameter of source.helm?.fileParameters??[]) {
          assert(parameter.path.startsWith('$values/'),`API_PRODUCT_EXTERNAL_FILE_PARAMETER_UNRESOLVED: ${sourcePath}:${parameter.path}`);
          const input=parameter.path.slice('$values/'.length);
          assert(!path.isAbsolute(input)&&!input.split('/').includes('..')&&fs.existsSync(path.join(root,input)),`API_PRODUCT_EXTERNAL_FILE_PARAMETER_UNRESOLVED: ${sourcePath}:${parameter.path}`);
          inputs.push(input);args.push('--set-file',`${parameter.name}=${path.join(root,input)}`);
        }
        const inline=source.helm?.valuesObject!==undefined?YAML.stringify(source.helm.valuesObject):source.helm?.values;
        const helm=source.helm??{};
        assert(helm.apiVersions===undefined||(Array.isArray(helm.apiVersions)&&helm.apiVersions.every(value=>typeof value==='string')),`API_PRODUCT_EXTERNAL_API_VERSIONS_INVALID: ${sourcePath}`);
        assert(helm.kubeVersion===undefined||typeof helm.kubeVersion==='string',`API_PRODUCT_EXTERNAL_KUBE_VERSION_INVALID: ${sourcePath}`);
        recipes.push({path:sourcePath,profile:`application:${app.metadata.name}`,chart:source.chart,version:source.targetRevision,repository:source.repoURL,release:helm.releaseName??app.metadata.name,namespace:helm.namespace??app.spec.destination.namespace,inputs,args,inline,ignoredValueFiles,kubeVersion:helm.kubeVersion??'1.35.0',apiVersions:helm.apiVersions??[],skipCrds:helm.skipCrds===true,skipSchemaValidation:helm.skipSchemaValidation===true});
      }
    }
  }
  const installerRecipes=[
    {path:'scripts/deploy-argocd.sh',chart:'argo-cd',version:'10.8.0',repository:'https://argoproj.github.io/argo-helm',release:'argocd',namespace:'argocd',inputs:['my-values/infra/argocd-values.yaml','charts/gitops/files/application-health.lua'],args:['--set-string','configs.cm.application\\.resourceTrackingMethod=annotation','--set-file',`configs.cm.resource\\.customizations\\.health\\.argoproj\\.io_Application=${path.join(root,'charts/gitops/files/application-health.lua')}`]},
    {path:'scripts/deploy-cilium.sh',chart:'cilium',version:'1.20.1',repository:'https://helm.cilium.io/',release:'cilium',namespace:'cilium',inputs:['my-values/infra/cilium-values.yaml'],args:[]},
    {path:'scripts/deploy.sh',chart:'spire',version:'0.30.0',repository:'https://spiffe.github.io/helm-charts-hardened/',release:'spire',namespace:'spire-server',inputs:['my-values/infra/spire-values.yaml'],args:[]},
    {path:'scripts/deploy.sh',chart:'spire-crds',version:'0.6.0',repository:'https://spiffe.github.io/helm-charts-hardened/',release:'spire-crds',namespace:'spire-server',inputs:[],args:[]},
  ];
  assertProducerAdapterAuthority(root,[...new Set(installerRecipes.map(recipe=>recipe.path).filter(source=>fs.existsSync(path.join(root,source))))]);
  for(const recipe of installerRecipes)if(fs.existsSync(path.join(root,recipe.path))) {
    const source=fs.readFileSync(path.join(root,recipe.path),'utf8').replace(/\\\n[ \t]*/gu,' ');
    const invocations=source.split('\n').filter(line=>/\bhelm upgrade --install\b/u.test(line));
    const invocation=invocations.find(line=>line.includes(recipe.chart==='argo-cd'?'argo/argo-cd':recipe.chart==='cilium'?'cilium/cilium':`spiffe/${recipe.chart}`));
    assert(invocation,`API_PRODUCT_INSTALLER_RECIPE_OPERATION_MISSING: ${recipe.path}:${recipe.chart}`);
    const variables={REPO_DIR:root,INFRA_DIR:path.join(root,'my-values/infra')};
    for(const line of source.split('\n')) {
      const assignment=/^([A-Z_][A-Z0-9_]*)="([^"\n]*)"$/u.exec(line.trim());if(!assignment)continue;
      let value=assignment[2].replace(/\$\{[A-Z_][A-Z0-9_]*:-([^}]*)\}/gu,'$1');
      value=value.replace(/\$([A-Z_][A-Z0-9_]*)/gu,(match,key)=>variables[key]??match);
      if(!/[`$]/u.test(value))variables[assignment[1]]=value;
    }
    const expanded=invocation.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/gu,(match,braced,plain)=>{const value=variables[braced??plain];assert(value!==undefined,`API_PRODUCT_INSTALLER_VARIABLE_UNQUALIFIED: ${recipe.path}:${match}`);return value;});
    assert(!/[`$;|]/u.test(expanded),`API_PRODUCT_INSTALLER_INVOCATION_UNQUALIFIED: ${recipe.path}`);
    const parsed=spawnSync('python3',['-c','import json,shlex,sys; print(json.dumps(shlex.split(sys.stdin.read())))'],{input:expanded,encoding:'utf8'});
    assert.equal(parsed.status,0,`API_PRODUCT_INSTALLER_PARSE_FAILED: ${recipe.path}`);
    const argv=JSON.parse(parsed.stdout);const install=argv.indexOf('--install');
    assert(install>=0,`API_PRODUCT_INSTALLER_OPERATION_UNQUALIFIED: ${recipe.path}`);
    recipe.release=argv[install+1];recipe.chart=argv[install+2].split('/').at(-1);recipe.args=[];recipe.inputs=[];
    for(let index=install+3;index<argv.length;index++) {
      const flag=argv[index];
      if(['--wait','--create-namespace'].includes(flag))continue;
      if(flag==='--timeout'){index++;continue;}
      if(flag==='--version'){recipe.version=argv[++index];continue;}
      if(['--namespace','-n'].includes(flag)){recipe.namespace=argv[++index];continue;}
      if(['--values','-f'].includes(flag)){const input=argv[++index];assert(input.startsWith(root+'/'),`API_PRODUCT_INSTALLER_INPUT_UNQUALIFIED: ${input}`);recipe.inputs.push(path.relative(root,input));continue;}
      if(['--set','--set-string','--set-file','--set-json','--set-literal'].includes(flag)) {const value=argv[++index];recipe.args.push(flag,value);if(flag==='--set-file'){const input=value.slice(value.indexOf('=')+1);assert(input.startsWith(root+'/'),`API_PRODUCT_INSTALLER_FILE_UNQUALIFIED: ${input}`);recipe.inputs.push(path.relative(root,input));}continue;}
      throw new Error(`API_PRODUCT_INSTALLER_FLAG_UNQUALIFIED: ${recipe.path}:${flag}`);
    }
    recipe.repository=recipe.chart==='argo-cd'?variables.ARGOCD_HELM_REPO:recipe.chart.startsWith('spire')?variables.SPIFFE_HELM_REPO:recipe.repository;
    recipes.push({...recipe,profile:`installer:${recipe.release}`});
  }
  const cacheKey=hash(JSON.stringify([root,hash(manifestBytes),archives.map(archive=>[archive.path,hash(fs.readFileSync(path.join(root,archive.path)))]),recipes.map(recipe=>({...recipe,sourceDigest:hash(fs.readFileSync(path.join(root,recipe.path))),inputDigests:recipe.inputs.map(input=>[input,hash(fs.readFileSync(path.join(root,input)))])}))]));
  if(externalOutputCache.has(cacheKey))return externalOutputCache.get(cacheKey);
  const results=[];
  for(const recipe of recipes) {
    const archive=archives.find(item=>item.chart===recipe.chart&&item.version===recipe.version&&normalizeRepo(item.repository)===normalizeRepo(recipe.repository));
    assert(archive,`API_PRODUCT_EXTERNAL_ARCHIVE_AUTHORITY_MISSING: ${recipe.path}:${recipe.chart}@${recipe.version}`);
    const archivePath=path.join(root,archive.path);
    assert.equal(hash(fs.readFileSync(archivePath)),archive.sha256,`API_PRODUCT_EXTERNAL_ARCHIVE_DRIFT: ${archive.path}`);
    for(const upgrade of recipe.profile.startsWith('application:')?[false]:[false,true]) {
      const inlineDirectory=recipe.inline!==undefined?fs.mkdtempSync(path.join(os.tmpdir(),'kubeclaw-docs-external-inline-')):null;
      const inlinePath=inlineDirectory?path.join(inlineDirectory,'values.yaml'):null;
      if(inlinePath)fs.writeFileSync(inlinePath,recipe.inline);
      const args=['template',recipe.release,archivePath,'--namespace',recipe.namespace,'--kube-version',recipe.kubeVersion??'1.35.0',...(recipe.apiVersions??[]).flatMap(value=>['--api-versions',value]),...(recipe.skipCrds?[]:['--include-crds']),'--skip-tests',...(recipe.skipSchemaValidation?['--skip-schema-validation']:[]),...recipe.inputs.filter(input=>/\.ya?ml$/u.test(input)).flatMap(input=>['-f',path.join(root,input)]),...(inlinePath?['-f',inlinePath]:[]),...recipe.args,...(upgrade?['--is-upgrade']:[])];
      const rendered=spawnSync('helm',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
      if(inlineDirectory)fs.rmSync(inlineDirectory,{recursive:true,force:true});
      assert.equal(rendered.status,0,`API_PRODUCT_EXTERNAL_RENDER_FAILED: ${recipe.profile}: ${rendered.stderr}`);
      const documents=YAML.parseAllDocuments(rendered.stdout);
      assert(documents.every(document=>!document.errors.length),`API_PRODUCT_EXTERNAL_RENDER_YAML_INVALID: ${recipe.profile}`);
      documents.forEach((document,index)=>{const value=document.toJS();if(!value?.apiVersion||!value?.kind)return;
        const observedOutputDigest=hash(JSON.stringify(value));
        const generatedFields=externalGeneratedSecretFields(root,recipe,archive,document,value);
        results.push({value,...(generatedFields.length?{privateObservation:{observedOutputDigest}}:{}),context:{apiVersion:value.apiVersion,kind:value.kind,path:recipe.path,document:index,producer:'external-helm',archivePath:archive.path,archiveSha256:archive.sha256,...(generatedFields.length?{generatedFields}:{}),profile:`${recipe.profile}:${upgrade?'upgrade':'install'}`,sourceDigest:hash(fs.readFileSync(path.join(root,recipe.path))),inputs:recipe.inputs,inputDigest:hash(JSON.stringify([recipe.inputs.map(input=>[input,hash(fs.readFileSync(path.join(root,input)))]),recipe.inline??null])),dependencyDigest:hash(JSON.stringify([recipe.chart,recipe.version,recipe.repository,archive.sha256,recipe.args,recipe.kubeVersion??'1.35.0',recipe.apiVersions??[],recipe.skipCrds??false,recipe.skipSchemaValidation??false])),outputDigest:hash(JSON.stringify(value))}});
      });
    }
  }
  externalOutputCache.clear();externalOutputCache.set(cacheKey,results);return results;
}
