import {observerMaterializedSourceState, canonicalObserverDocumentationSource, resolveObserverDocumentationImport} from './docs-api-observer-materialized-source.mjs';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import YAML from 'yaml';

const canonicalOperationRecipes=[
  {
    "source": "scripts/production-receipt-attestation.mjs",
    "operation": "export function canonicalJson(value) {\n  if (value === null) return 'null';\n  if (typeof value === 'string') return encodeString(value);\n  if (typeof value === 'boolean') return value ? 'true' : 'false';\n  if (typeof value === 'number') {\n    if (!Number.isFinite(value)) throw new TypeError('RFC8785_INVALID_NUMBER');\n    return JSON.stringify(value);\n  }\n  if (typeof value !== 'object') throw new TypeError('RFC8785_INVALID_TYPE');\n  if (Array.isArray(value)) {\n    const items = [];\n    for (let index = 0; index < value.length; index += 1) {\n      if (!Object.hasOwn(value, index)) throw new TypeError('RFC8785_INVALID_ARRAY');\n      items.push(canonicalJson(value[index]));\n    }\n    return `[${items.join(',')}]`;\n  }\n  const prototype = Object.getPrototypeOf(value);\n  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('RFC8785_INVALID_OBJECT');\n  return `{${Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)\n    .map(([key, child]) => `${encodeString(key)}:${canonicalJson(child)}`).join(',')}}`;\n}",
    "helpers": [
      {
        "name": "encodeString",
        "operation": "function encodeString(value) {\n  for (let index = 0; index < value.length; index += 1) {\n    const unit = value.charCodeAt(index);\n    if (unit >= 0xd800 && unit <= 0xdbff) {\n      const next = value.charCodeAt(index + 1);\n      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('RFC8785_INVALID_UNICODE');\n      index += 1;\n    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError('RFC8785_INVALID_UNICODE');\n  }\n  return JSON.stringify(value);\n}"
      }
    ]
  },
  {
    "source": "skills/buster/engine/test-gates/kubernetes-runtime-security.ts",
    "operation": "function canonicalJson(value: unknown): string {\n  const normalized = (entry: unknown): unknown => {\n    if (Array.isArray(entry)) return entry.map(normalized);\n    if (entry && typeof entry === 'object') return Object.fromEntries(Object.entries(entry as JsonObject)\n      .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalized(item)]));\n    return entry;\n  };\n  return JSON.stringify(normalized(value));\n}",
    "helpers": []
  },
  {
    "source": "skills/nova/core/execution/engine-snapshots.ts",
    "operation": "export function canonicalJson(value: unknown): string {\n  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;\n  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(',')}}`;\n  return JSON.stringify(value);\n}",
    "helpers": []
  },
  {
    "source": "skills/common/plugin-runtime/sdk/src/values.ts",
    "operation": "export function canonicalJson(value: unknown): string {\n  return serializeJsonValue(value, new Set(), (left, right) => left.localeCompare(right));\n}",
    "helpers": [
      {
        "name": "dataProperty",
        "operation": "function dataProperty(value: object, key: PropertyKey): unknown {\n  const descriptor = Object.getOwnPropertyDescriptor(value, key);\n  if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {\n    throw new Error('CANONICAL_JSON_PROPERTY_INVALID');\n  }\n  return descriptor.value;\n}"
      },
      {
        "name": "serializeJsonValue",
        "operation": "function serializeJsonValue(value: unknown, seen: Set<object>, order: KeyOrder): string {\n  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);\n  if (typeof value === 'number') {\n    if (!Number.isFinite(value)) throw new Error('CANONICAL_JSON_NUMBER_INVALID');\n    return JSON.stringify(value);\n  }\n  if (typeof value !== 'object') throw new Error('CANONICAL_JSON_VALUE_UNSUPPORTED');\n  if (types.isProxy(value)) throw new Error('CANONICAL_JSON_PROXY_UNSUPPORTED');\n  if (seen.has(value)) throw new Error('CANONICAL_JSON_CYCLE');\n  seen.add(value);\n  try {\n    const keys = Reflect.ownKeys(value);\n    if (Array.isArray(value)) return serializeJsonArray(value, keys, seen, order);\n    const prototype = Object.getPrototypeOf(value);\n    if (prototype !== Object.prototype && prototype !== null) throw new Error('CANONICAL_JSON_PROTOTYPE_INVALID');\n    if (keys.some((key) => typeof key !== 'string')) throw new Error('CANONICAL_JSON_PROPERTY_INVALID');\n    return `{${(keys as string[]).sort(order)\n      .map((key) => `${JSON.stringify(key)}:${serializeJsonValue(dataProperty(value, key), seen, order)}`)\n      .join(',')}}`;\n  } finally {\n    seen.delete(value);\n  }\n}"
      },
      {
        "name": "serializeJsonArray",
        "operation": "function serializeJsonArray(value: unknown[], keys: PropertyKey[], seen: Set<object>, order: KeyOrder): string {\n  if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error('CANONICAL_JSON_PROTOTYPE_INVALID');\n  if (keys.length !== value.length + 1) throw new Error('CANONICAL_JSON_ARRAY_INVALID');\n  const entries: string[] = [];\n  for (let index = 0; index < value.length; index++) {\n    entries.push(serializeJsonValue(dataProperty(value, String(index)), seen, order));\n  }\n  return `[${entries.join(',')}]`;\n}"
      }
    ]
  },
  {
    "source": "contracts/pipeline-worker-core/v1/src/digest.ts",
    "operation": "export function canonicalJson(value: unknown): string {\n  if (value === null) return 'null';\n  if (typeof value === 'string') return encodeString(value);\n  if (typeof value === 'boolean') return value ? 'true' : 'false';\n  if (typeof value === 'number') {\n    if (!Number.isFinite(value)) throw new TypeError('RFC8785_INVALID_NUMBER');\n    return JSON.stringify(value);\n  }\n  if (typeof value !== 'object') throw new TypeError('RFC8785_INVALID_TYPE');\n  if (Array.isArray(value)) {\n    const items: string[] = [];\n    for (let index = 0; index < value.length; index += 1) {\n      if (!Object.hasOwn(value, index)) throw new TypeError('RFC8785_INVALID_ARRAY');\n      items.push(canonicalJson(value[index]));\n    }\n    return `[${items.join(',')}]`;\n  }\n  const prototype = Object.getPrototypeOf(value);\n  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('RFC8785_INVALID_OBJECT');\n  return `{${Object.entries(value as Record<string, unknown>)\n    .sort(([left], [right]) => compareText(left, right))\n    .map(([key, child]) => `${encodeString(key)}:${canonicalJson(child)}`)\n    .join(',')}}`;\n}",
    "helpers": [
      {
        "name": "encodeString",
        "operation": "function encodeString(value: string): string {\n  for (let index = 0; index < value.length; index += 1) {\n    const unit = value.charCodeAt(index);\n    if (unit >= 0xd800 && unit <= 0xdbff) {\n      const next = value.charCodeAt(index + 1);\n      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('RFC8785_INVALID_UNICODE');\n      index += 1;\n    } else if (unit >= 0xdc00 && unit <= 0xdfff) {\n      throw new TypeError('RFC8785_INVALID_UNICODE');\n    }\n  }\n  return JSON.stringify(value);\n}"
      },
      {
        "name": "compareText",
        "operation": "function compareText(left: string, right: string): number {\n  // RFC 8785 section 3.2.3 requires raw UTF-16 code-unit ordering.\n  return left < right ? -1 : left > right ? 1 : 0;\n}"
      }
    ]
  },
  {
    "source": "contracts/pipeline-observability/v1/src/canonical-json.ts",
    "operation": "export function canonicalJson(value:unknown):string { if(value===null)return 'null';if(typeof value==='boolean')return value?'true':'false';if(typeof value==='string')return encodeString(value);if(typeof value==='number'){if(!Number.isFinite(value))throw new TypeError('RFC8785_INVALID_NUMBER');return JSON.stringify(value);}if(Array.isArray(value)){const values:string[]=[];for(let index=0;index<value.length;index+=1){if(!Object.hasOwn(value,index))throw new TypeError('RFC8785_INVALID_ARRAY');values.push(canonicalJson(value[index]));}return `[${values.join(',')}]`;}if(typeof value==='object'){const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw new TypeError('RFC8785_INVALID_OBJECT');const record=value as Record<string,unknown>;return `{${Object.entries(record).sort(([left],[right])=>left<right?-1:left>right?1:0).map(([key,child])=>`${encodeString(key)}:${canonicalJson(child)}`).join(',')}}`;}throw new TypeError('RFC8785_INVALID_TYPE'); }",
    "helpers": [
      {
        "name": "encodeString",
        "operation": "function encodeString(value:string):string { for(let index=0;index<value.length;index+=1){const unit=value.charCodeAt(index);if(unit>=0xd800&&unit<=0xdbff){const next=value.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))throw new TypeError('RFC8785_INVALID_UNICODE');index+=1;}else if(unit>=0xdc00&&unit<=0xdfff)throw new TypeError('RFC8785_INVALID_UNICODE');}return JSON.stringify(value); }"
      }
    ]
  }
];

// Reconstruct operation facts from source. The registry stores selectors and a
// review digest; it never maintains a second copy of a complete source module.
// Only operations reached from selected sink/caller/consumer expressions are
// dependencies, so an unrelated sibling function does not invalidate a role.
function resolveNativeModule(root, file, specifier, dependency = () => {}) {
 const observerTarget=resolveObserverDocumentationImport(root,file,specifier,'import',dependency);
 if(observerTarget)return observerTarget;
 let target=path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier));
 if(specifier.startsWith('@kubeclaw/')){
  const pieces=specifier.split('/'),packageName=pieces.slice(0,2).join('/'),subpath=pieces.length>2?'./'+pieces.slice(2).join('/'):'.';
  let directory=null;for(let ancestor=path.dirname(path.join(root,file));;ancestor=path.dirname(ancestor)){const candidate=path.join(ancestor,'node_modules',packageName);if(fs.existsSync(path.join(candidate,'package.json'))){directory=candidate;break;}if(path.dirname(ancestor)===ancestor)break;}
  if(!directory)throw new Error(`OUTPUT_ROLE_PACKAGE_RESOLUTION_UNQUALIFIED: ${file}: ${specifier}`);
  const packageFile=path.join(directory,'package.json');dependency(path.relative(root,fs.realpathSync(packageFile)));const pkg=JSON.parse(fs.readFileSync(packageFile,'utf8'));
  function runtime(entry){if(typeof entry==='string')return entry;if(Array.isArray(entry))throw new Error(`OUTPUT_ROLE_PACKAGE_RESOLUTION_UNQUALIFIED: ${file}: export alternatives`);if(entry&&typeof entry==='object')for(const [condition,value]of Object.entries(entry))if(['node','import','default'].includes(condition)){const selected=runtime(value);if(selected)return selected;}return null;}
  const exports=pkg.exports;let entry=typeof exports==='string'||exports&&Object.keys(exports).every(key=>!key.startsWith('.'))?(subpath==='.'?exports:null):exports?.[subpath],capture=null;
  if(entry===undefined&&exports&&typeof exports==='object'){const matches=Object.keys(exports).filter(key=>key.includes('*')).sort((left,right)=>right.indexOf('*')-left.indexOf('*')||right.length-left.length);for(const key of matches){const [before,after]=key.split('*');if(subpath.startsWith(before)&&subpath.endsWith(after)){entry=exports[key];capture=subpath.slice(before.length,after?-after.length:undefined);break;}}}
  let selected=runtime(entry);if(exports===undefined&&subpath==='.')selected=pkg.main??'./index.js';if(exports===undefined&&subpath!=='.')selected=subpath;
  if(!selected)throw new Error(`OUTPUT_ROLE_PACKAGE_RESOLUTION_UNQUALIFIED: ${file}: ${specifier}`);
  if(capture!==null)selected=selected.replaceAll('*',capture);if(!selected.startsWith('./'))throw new Error(`OUTPUT_ROLE_PACKAGE_RESOLUTION_UNQUALIFIED: ${file}: invalid export target`);
  const resolved=path.resolve(directory,selected);if(!resolved.startsWith(path.resolve(directory)+path.sep)||!fs.existsSync(resolved))throw new Error(`OUTPUT_ROLE_PACKAGE_RESOLUTION_UNQUALIFIED: ${file}: missing runtime target`);target=path.relative(root,fs.realpathSync(resolved));
 }
 return target;
}

export function deriveNativeOperationFacts(root,source,selectors,{trustAnchorSources=[]}={}) {
 observerMaterializedSourceState(root);
 source=canonicalObserverDocumentationSource(root,source);
 const facts=new Map(),modules=new Map(),pending=[];
 const completedInitializationScans=new WeakMap();
 function inputFact(file){const bytes=fs.readFileSync(path.join(root,file),'utf8');facts.set(file,{source:file,kind:'source-input',sha256:createHash('sha256').update(bytes).digest('hex')});}
 function read(file){
  if(modules.has(file))return modules.get(file);const absolute=path.join(root,file);if(!fs.existsSync(absolute))return null;const bytes=fs.readFileSync(absolute,'utf8');
  if(!/\.(?:[cm]?js|ts)$/u.test(file)){const state={file,bytes};modules.set(file,state);return state;}
  const tree=ts.createSourceFile(file,bytes,ts.ScriptTarget.Latest,true),definitions=new Map(),imports=new Map(),reexports=[];
  for(const statement of tree.statements){
   if(statement.name)definitions.set(statement.name.getText(tree),statement);
   if(statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.DefaultKeyword)||ts.isExportAssignment(statement)&&!statement.isExportEquals)definitions.set('default',statement);
   if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){if(ts.isIdentifier(declaration.name))definitions.set(declaration.name.text,statement);if(ts.isObjectBindingPattern(declaration.name))for(const element of declaration.name.elements)if(ts.isIdentifier(element.name))definitions.set(element.name.text,statement);}
   if((ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement))&&statement.moduleSpecifier&&ts.isStringLiteralLike(statement.moduleSpecifier)&&(statement.moduleSpecifier.text.startsWith('.')||statement.moduleSpecifier.text.startsWith('@kubeclaw/'))){
    const specifier=statement.moduleSpecifier.text;
    if(specifier.startsWith('@kubeclaw/')&&statement.importClause?.isTypeOnly)continue;
    // Resolve only a reached import; unused sibling imports do not bind a role.
    const binding=name=>({specifier,name,statement});
    for(const item of statement.importClause?.namedBindings?.elements??statement.exportClause?.elements??[])imports.set(item.name.text,binding(item.propertyName?.text??item.name.text));
    if(statement.importClause?.name)imports.set(statement.importClause.name.text,binding('default'));
    if(statement.importClause?.namedBindings&&ts.isNamespaceImport(statement.importClause.namedBindings))imports.set(statement.importClause.namedBindings.name.text,binding('*'));
    if(ts.isExportDeclaration(statement)&&!statement.exportClause)reexports.push({specifier,statement});
   }
   if(ts.isExportDeclaration(statement)&&!statement.moduleSpecifier&&statement.exportClause&&ts.isNamedExports(statement.exportClause))for(const item of statement.exportClause.elements)imports.set(item.name.text,{local:item.propertyName?.text??item.name.text,statement});
  }
  const state={file,bytes,tree,definitions,imports,reexports};modules.set(file,state);return state;
 }
 function enclosing(node){for(let parent=node;parent&&!ts.isSourceFile(parent);parent=parent.parent){if(ts.isFunctionDeclaration(parent)||ts.isMethodDeclaration(parent))return parent;if(ts.isSourceFile(parent.parent))return parent;}return node;}
 function enqueue(state,node){if(!node)return;const syntax=node.getText(state.tree),key=state.file+':'+ts.SyntaxKind[node.kind]+':'+syntax;if(facts.has(key))return;facts.set(key,{source:state.file,kind:ts.SyntaxKind[node.kind],symbol:node.name?.getText(state.tree)??(ts.isVariableStatement(node)?node.declarationList.declarations.map(value=>value.name.getText(state.tree)).join(','):'<operation>'),sha256:createHash('sha256').update(syntax).digest('hex')});pending.push({state,node});}
 // Bind finite module initialization and writes to reached state. A selected
 // definition alone cannot establish an instance subsequently configured by
 // top-level calls (AJV formats/schema installation) or caller-time writes.
 function initializationEffects(state,name){
  const completed=completedInitializationScans.get(state);if(completed?.has(name))return;
  for(const statement of state.tree.statements){
   if(ts.isFunctionDeclaration(statement)||ts.isClassDeclaration(statement)||ts.isImportDeclaration(statement)||ts.isTypeAliasDeclaration(statement)||ts.isInterfaceDeclaration(statement)||ts.isExportDeclaration(statement))continue;
   let reached=false;function visit(node){if(ts.isIdentifier(node)&&node.text===name)reached=true;ts.forEachChild(node,visit);}visit(statement);if(reached)enqueue(state,statement);
  }
  function writes(node){if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment){let target=node.left;while(ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target))target=target.expression;if(ts.isIdentifier(target)&&target.text===name)enqueue(state,enclosing(node));}ts.forEachChild(node,writes);}writes(state.tree);
  if(completed)completed.add(name);else completedInitializationScans.set(state,new Set([name]));
 }
 function importedState(state,binding){const file=resolveNativeModule(root,state.file,binding.specifier,inputFact);return trustAnchorSources.includes(file)?null:read(file);}
 function hasSymbol(state,name,seen=new Set()){
  if(!state?.tree)return false;const key=state.file+':'+name;if(seen.has(key))return false;seen.add(key);
  if(state.definitions.has(name)||state.imports.has(name))return true;
  return state.reexports.some(binding=>hasSymbol(importedState(state,binding),name,seen));
 }
 function symbol(state,name,seen=new Set()){
  if(!state)return;if(!state.tree){inputFact(state.file);return;}const key=state.file+':'+name;if(seen.has(key))return;seen.add(key);
  if(state.definitions.has(name)){initializationEffects(state,name);const definition=state.definitions.get(name);enqueue(state,definition);if(ts.isVariableStatement(definition))for(const declaration of definition.declarationList.declarations)if(ts.isObjectBindingPattern(declaration.name)&&declaration.initializer){const element=declaration.name.elements.find(element=>ts.isIdentifier(element.name)&&element.name.text===name),binding=element&&namespaceBinding(state,declaration.initializer);if(binding){enqueue(state,binding.statement);symbol(importedState(state,binding),element.propertyName?.getText(state.tree).replace(/^['"]|['"]$/gu,'')??element.name.text,seen);}}return;}
  const imported=state.imports.get(name);if(imported){initializationEffects(state,name);enqueue(state,imported.statement);if(imported.local&&imported.local!==name)symbol(state,imported.local,seen);else if(imported.specifier)symbol(importedState(state,imported),imported.name,seen);return;}
  for(const reexport of state.reexports){const target=importedState(state,reexport);if(hasSymbol(target,name)){enqueue(state,reexport.statement);symbol(target,name,seen);}}
 }
 function namespaceBinding(state,node,seen=new Set()) {
  if(!node||!ts.isIdentifier(node)||seen.has(node.text))return null;seen.add(node.text);
  const imported=state.imports.get(node.text);if(imported?.name==='*')return imported;
  const definition=state.definitions.get(node.text);const declaration=definition&&ts.isVariableStatement(definition)?definition.declarationList.declarations.find(value=>ts.isIdentifier(value.name)&&value.name.text===node.text):null;
  return declaration?.initializer?namespaceBinding(state,declaration.initializer,seen):null;
 }
 const initial=read(source);if(!initial?.tree)return initial?[{source,kind:'source-input',sha256:createHash('sha256').update(initial.bytes).digest('hex')}]:null;
 const selectedExpressions=new Set(selectors.filter(selector=>selector.expression).map(selector=>selector.expression)),selectedSymbols=new Set(selectors.filter(selector=>selector.symbol).map(selector=>selector.symbol)),expressions=new Map(),symbols=new Map();
 function selectedNodes(node){
  if(selectedSymbols.has(node.name?.getText(initial.tree))&&(ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node)||ts.isVariableDeclaration(node)||ts.isTypeAliasDeclaration(node))){const name=node.name.getText(initial.tree);symbols.set(name,[...(symbols.get(name)??[]),node]);}
  const expression=node.getText(initial.tree);if(selectedExpressions.has(expression))expressions.set(expression,[...(expressions.get(expression)??[]),node]);ts.forEachChild(node,selectedNodes);
 }
 selectedNodes(initial.tree);
 for(const selector of selectors){const candidates=selector.symbol?symbols.get(selector.symbol):expressions.get(selector.expression),matches=(candidates??[]).filter(node=>selector.line===undefined||initial.tree.getLineAndCharacterOfPosition(node.getStart(initial.tree)).line+1===selector.line);if(!matches.length)return null;for(const node of matches)enqueue(initial,enclosing(node));}
 while(pending.length){const {state,node}=pending.pop();const names=new Set();function visit(child){if(ts.isIdentifier(child))names.add(child.text);if(ts.isPropertyAccessExpression(child)||ts.isElementAccessExpression(child)){const binding=namespaceBinding(state,child.expression),member=ts.isPropertyAccessExpression(child)?child.name.text:ts.isStringLiteralLike(child.argumentExpression)?child.argumentExpression.text:null;if(binding&&member){enqueue(state,binding.statement);symbol(importedState(state,binding),member);}}if(ts.isNewExpression(child)&&child.expression.getText(state.tree)==='URL'&&ts.isStringLiteralLike(child.arguments?.[0])&&child.arguments?.[1]?.getText(state.tree)==='import.meta.url'&&child.arguments[0].text.endsWith('.json')){const file=path.posix.normalize(path.posix.join(path.posix.dirname(state.file),child.arguments[0].text));if(!fs.existsSync(path.join(root,file)))throw new Error(`OUTPUT_ROLE_SCHEMA_DEPENDENCY_UNQUALIFIED: ${file}`);inputFact(file);}ts.forEachChild(child,visit);}visit(node);for(const name of names){const imported=state.imports.get(name);if(imported?.name==='*'){enqueue(state,imported.statement);const target=importedState(state,imported);const members=new Set();function membersOf(child){if(ts.isPropertyAccessExpression(child)&&ts.isIdentifier(child.expression)&&child.expression.text===name)members.add(child.name.text);ts.forEachChild(child,membersOf);}membersOf(node);for(const member of members)symbol(target,member);}else symbol(state,name);}}
 return [...facts.values()].sort((left,right)=>left.source.localeCompare(right.source)||left.kind.localeCompare(right.kind)||left.symbol.localeCompare(right.symbol)||left.sha256.localeCompare(right.sha256));
}
export function nativeOperationFactDigest(facts){return facts&&createHash('sha256').update(JSON.stringify(facts)).digest('hex');}

// A fixed root without API identity is a diagnostic/configuration envelope.
// Unknown roots, unknown root spreads and unknown collection items are not a
// role. Resolve the actual producer expression and its source dependencies.
export function classifySerializedOutputRoles(root,source,universe=[]) {return createSerializedOutputRoleClassifier(root,universe)(source);}
export function createSerializedOutputRoleClassifier(root,universe=[]) {
 root=path.resolve(root);
 const roleRegistryFile=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');
 const roleRegistry=fs.existsSync(roleRegistryFile)?JSON.parse(fs.readFileSync(roleRegistryFile,'utf8')):{};
 const nativeRoleContracts=roleRegistry.nonApiOutputContracts??[];
 const operationMatchesCache=new Map();
 function operationMatches(operation){const key=JSON.stringify(operation);if(operationMatchesCache.has(key))return operationMatchesCache.get(key);let matches=false;if(operation.selectors&&operation.factsDigest){const facts=deriveNativeOperationFacts(root,operation.source,operation.selectors);matches=facts!==null&&nativeOperationFactDigest(facts)===operation.factsDigest;if(matches)for(const fact of facts)dependencies.add(fact.source);}operationMatchesCache.set(key,matches);return matches;}

 const cache=new Map();const dependencies=new Set();const parameterBindings=new Map();
 let observerState;
 function refreshObserverState(){const next=observerMaterializedSourceState(root);if(next!==observerState){cache.clear();dependencies.clear();parameterBindings.clear();operationMatchesCache.clear();observerState=next;}}
 function module(file) {
  file=canonicalObserverDocumentationSource(root,file);
  if(cache.has(file))return cache.get(file);
  const bytes=fs.readFileSync(path.join(root,file),'utf8');dependencies.add(file);
  // The caller's universe is the admitted executable closure. CommonJS can
  // compile fallback names such as `.json` as JavaScript; their filename must
  // not silently select the JSON parser. Passive JSON dependencies remain data.
  const scriptKind=/\.[cm]?ts$/u.test(file)?ts.ScriptKind.TS:universe.includes(file)||!file.endsWith('.json')?ts.ScriptKind.JS:ts.ScriptKind.JSON;
  const tree=ts.createSourceFile(file,bytes,ts.ScriptTarget.Latest,true,scriptKind);
  const state={tree,file,processFunctions:new Set(['execFileSync','spawnSync','execFile','spawn']),qualifiedProcessFunctions:new Set(),declarations:new Map(),functions:new Map(),types:new Map(),typeDefinitions:new Map(),cliStrings:new Set(),classes:new Map(),mutations:[],allCalls:[],outputImports:new Map(),destructiveMutations:[],calls:[],imports:new Map(),reexports:[],sinks:[]};cache.set(file,state);
  function publicFunction(owner){if(owner?.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))return true;for(let parent=owner?.parent;parent&&!ts.isSourceFile(parent)&&!ts.isFunctionLike(parent);parent=parent.parent)if((ts.isVariableStatement(parent)||ts.isClassDeclaration(parent))&&parent.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))return true;return false;}
  function visit(node) {
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier)&&['node:fs','fs','node:fs/promises','fs/promises','node:process','process'].includes(node.moduleSpecifier.text)){const base=/process$/u.test(node.moduleSpecifier.text)?'process':'fs';if(node.importClause?.name)state.outputImports.set(node.importClause.name.text,base);if(node.importClause?.namedBindings&&ts.isNamespaceImport(node.importClause.namedBindings))state.outputImports.set(node.importClause.namedBindings.name.text,base);for(const element of node.importClause?.namedBindings?.elements??node.exportClause?.elements??[])state.outputImports.set(element.name.text,base+'.'+(element.propertyName?.text??element.name.text));}
   if(ts.isImportDeclaration(node)&&ts.isStringLiteralLike(node.moduleSpecifier)&&['node:child_process','child_process'].includes(node.moduleSpecifier.text)){for(const element of node.importClause?.namedBindings?.elements??[])if(['execFileSync','spawnSync','execFile','spawn'].includes(element.propertyName?.text??element.name.text)){state.processFunctions.add(element.name.text);state.qualifiedProcessFunctions.add(element.name.text);}if(node.importClause?.namedBindings&&ts.isNamespaceImport(node.importClause.namedBindings))for(const name of ['execFileSync','spawnSync','execFile','spawn']){state.processFunctions.add(node.importClause.namedBindings.name.text+'.'+name);state.qualifiedProcessFunctions.add(node.importClause.namedBindings.name.text+'.'+name);}}
   if(ts.isClassDeclaration(node)&&node.name)state.classes.set(node.name.text,node);
   if((ts.isTypeAliasDeclaration(node)||ts.isInterfaceDeclaration(node))&&node.name)state.typeDefinitions.set(node.name.text,node);
   if(ts.isCallExpression(node))state.allCalls.push(node);
   if(ts.isDeleteExpression(node)||(ts.isPrefixUnaryExpression(node)||ts.isPostfixUnaryExpression(node))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(node.operator))state.destructiveMutations.push(node);
   if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression))state.calls.push(node);
   if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment)state.mutations.push(node);
   if(ts.isVariableDeclaration(node)&&ts.isObjectBindingPattern(node.name)&&node.initializer){for(const element of node.name.elements)if(ts.isIdentifier(element.name)){const choices=state.declarations.get(element.name.text)??[];let scope=node.parent;while(scope&&!ts.isBlock(scope)&&!ts.isSourceFile(scope))scope=scope.parent;choices.push({value:{bindingExpression:node.initializer,bindingKey:element.propertyName?.getText(tree)??element.name.text},scope});state.declarations.set(element.name.text,choices);}}
   if(ts.isVariableDeclaration(node)&&ts.isArrayBindingPattern(node.name)&&!node.initializer&&ts.isForOfStatement(node.parent?.parent)){for(const [index,element]of node.name.elements.entries())if(ts.isBindingElement(element)&&ts.isIdentifier(element.name)){const choices=state.declarations.get(element.name.text)??[];choices.push({value:{tupleCollection:node.parent.parent.expression,tupleIndex:index},scope:node.parent.parent.statement});state.declarations.set(element.name.text,choices);}}
   if(ts.isVariableDeclaration(node)&&ts.isArrayBindingPattern(node.name)&&node.initializer&&/process\.argv\.slice/u.test(node.initializer.getText(tree)))for(const element of node.name.elements)if(ts.isBindingElement(element)&&ts.isIdentifier(element.name)){state.types.set(element.name.text,'string');state.cliStrings.add(element.name.text);}
   if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer){const choices=state.declarations.get(node.name.text)??[];let scope=node.parent;while(scope&&!ts.isBlock(scope)&&!ts.isSourceFile(scope))scope=scope.parent;choices.push({value:node.initializer,scope});state.declarations.set(node.name.text,choices);}
   if((ts.isVariableDeclaration(node)||ts.isParameter(node))&&ts.isIdentifier(node.name)&&node.type)state.types.set(node.name.text,node.type.getText(tree));
   if(ts.isFunctionDeclaration(node)){if(node.name)state.functions.set(node.name.text,node);if(node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.DefaultKeyword))state.functions.set('default',node);}
   if(ts.isExportAssignment(node)&&!node.isExportEquals)state.declarations.set('default',[{value:node.expression,scope:tree}]);
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&(node.moduleSpecifier.text.startsWith('.')||node.moduleSpecifier.text.startsWith('@kubeclaw/'))) {
    const target=resolveNativeModule(root,file,node.moduleSpecifier.text,dependency=>dependencies.add(dependency));
    if(fs.existsSync(path.join(root,target))&&ts.isExportDeclaration(node)&&!node.exportClause)state.reexports.push(target);
    if(fs.existsSync(path.join(root,target))&&node.importClause?.namedBindings&&ts.isNamespaceImport(node.importClause.namedBindings))state.imports.set(node.importClause.namedBindings.name.text,{file:target,name:'*'});
    if(fs.existsSync(path.join(root,target))&&node.importClause?.name)state.imports.set(node.importClause.name.text,{file:target,name:'default'});
    if(fs.existsSync(path.join(root,target)))for(const element of node.importClause?.namedBindings?.elements??node.exportClause?.elements??[])state.imports.set(element.name.text,{file:target,name:element.propertyName?.text??element.name.text});
   }
   if(ts.isReturnStatement(node)&&node.expression&&(/JSON\.stringify|(?:yaml|YAML)\.(?:dump|stringify)/u.test(node.expression.getText(tree))||ts.isCallExpression(node.expression)&&node.expression.expression.getText(tree)==='JSON.parse'||ts.isTemplateExpression(node.expression)&&!node.expression.head.text.trim())){let owner=node.parent;while(owner&&!ts.isFunctionLike(owner))owner=owner.parent;if(publicFunction(owner))state.sinks.push({expression:{getText:()=> 'return'},arguments:[node.expression],getStart:()=>node.getStart(tree)});}
   if(ts.isArrowFunction(node)&&!ts.isBlock(node.body)&&publicFunction(node)&&/JSON\.(?:stringify|parse)|(?:yaml|YAML)\.(?:dump|stringify)/u.test(node.body.getText(tree)))state.sinks.push({expression:{getText:()=> 'return'},arguments:[node.body],getStart:()=>node.getStart(tree)});
   if(ts.isCallExpression(node)&&state.processFunctions.has(node.expression.getText(tree))&&ts.isStringLiteralLike(node.arguments[0])&&node.arguments[0].text==='kubectl'){const options=node.arguments[2];const input=options&&ts.isObjectLiteralExpression(options)?options.properties.find(value=>ts.isPropertyAssignment(value)&&value.name.getText(tree)==='input')?.initializer:null;state.sinks.push({expression:{getText:()=> 'kubectl-request'},arguments:[input??node],originalCall:node,getStart:()=>node.getStart(tree)});}
   if(ts.isCallExpression(node)&&['fetch','http.request','https.request'].includes(node.expression.getText(tree))&&/\/apis?\/(?:v[0-9]|[a-z0-9.-]+\/v[0-9])/u.test(node.arguments[0]?.getText(tree)??'')&&node.arguments.slice(1).some(value=>/\b(?:body|method)\s*:/u.test(value.getText(tree))))state.sinks.push({expression:{getText:()=> 'kubernetes-http-request'},arguments:[node],getStart:()=>node.getStart(tree)});

   ts.forEachChild(node,visit);
  }
  visit(tree);
  const outputNames=new Map();
  function outputName(node,seen=new Set()){if(!node)return null;if(outputNames.has(node))return outputNames.get(node);outputNames.set(node,null);const result=resolveOutputName(node,seen);outputNames.set(node,result);return result;}
  function resolveOutputName(node,seen=new Set()) {
   if(!node||seen.has(node))return null;seen=new Set([...seen,node]);if(node.bindingExpression){const base=outputName(node.bindingExpression,seen);return base?base+'.'+node.bindingKey.replace(/^['"]|['"]$/gu,''):null;}if(ts.isAwaitExpression(node)||ts.isParenthesizedExpression(node))return outputName(node.expression,seen);
   if(ts.isArrayLiteralExpression(node)&&node.elements.some(element=>outputCapabilityName(outputName(ts.isSpreadElement(element)?element.expression:element,seen))))return 'unknown-output-function';
   if(ts.isObjectLiteralExpression(node)&&node.properties.some(property=>ts.isPropertyAssignment(property)&&outputCapabilityName(outputName(property.initializer,seen))))return 'unknown-output-function';
   if(ts.isIdentifier(node)){const localValue=declarationFor(node,state);const writes=state.mutations.filter(write=>ts.isIdentifier(write.left)&&write.left.text===node.text&&declarationFor(write.left,state)===localValue);if(writes.length&&writes.every(write=>outputName(write.right,seen)==='file-stream'))return 'file-stream';if(writes.length&&(state.outputImports.has(node.text)||writes.some(write=>concreteWriterName(outputName(write.right,seen))||outputName(write.right,seen)==='unknown-output-function')))return 'unknown-output-function';const imported=state.outputImports.get(node.text);if(imported)return imported;const value=declarationFor(node,state)??state.declarations.get(node.text)?.find(choice=>ts.isSourceFile(choice.scope))?.value;if(value){const name=outputName(value,seen);return writes.length&&name?'unknown-output-function':name;}const importedSource=state.imports.get(node.text);if(importedSource?.name==='*')return 'module:'+importedSource.file;if(importedSource){const key=importedSource.file+':'+importedSource.name;if(!seen.has(key))return module(importedSource.file).outputName?.(ts.factory.createIdentifier(importedSource.name),new Set([...seen,key]))??null;}const fn=state.functions.get(node.text);if(fn){let escaped=false;function returned(child){if(child!==fn&&ts.isFunctionLike(child))return;if(ts.isReturnStatement(child)&&child.expression&&outputCapabilityName(outputName(child.expression,seen)))escaped=true;ts.forEachChild(child,returned);}returned(fn);if(escaped)return 'unknown-output-function';}return ['fs','process','console','writeFileSync'].includes(node.text)?node.text:null;}
   if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)){const base=outputName(node.expression,seen);const key=ts.isPropertyAccessExpression(node)?node.name.text:ts.isStringLiteralLike(node.argumentExpression)?node.argumentExpression.text:null;if(base?.startsWith('module:')&&key)return module(base.slice(7)).outputName(ts.factory.createIdentifier(key),seen);if(base==='unknown-output-function'||['call','apply','bind'].includes(key)&&/^(?:console\.(?:log|dir|error|warn|info|debug)|process\.(?:stdout|stderr)\.write|file-stream\.(?:write|end|writeFile)|(?:fs\.)?(?:writeFileSync|writeFile|appendFileSync|appendFile)|fs\.promises\.(?:writeFile|appendFile))$/u.test(base??''))return 'unknown-output-function';return base&&key?base+'.'+key:base&&['fs','fs.promises','process.stdout','process.stderr','console','file-stream'].includes(base)?'unknown-output-function':null;}
   if(ts.isCallExpression(node)){if(ts.isIdentifier(node.expression)&&node.expression.text==='require'&&ts.isStringLiteralLike(node.arguments[0])){const name=node.arguments[0].text;if(['node:fs','fs','node:fs/promises','fs/promises'].includes(name))return 'fs';if(['node:process','process'].includes(name))return 'process';}const name=outputName(node.expression,seen);if(name==='unknown-output-function')return name;if(name?.endsWith('.bind'))return 'unknown-output-function';if(name==='fs.createWriteStream')return 'file-stream';if(name==='fs.promises.open'||name==='fs.open'){const flag=node.arguments[1];return flag&&(ts.isStringLiteralLike(flag)&&flag.text==='r'||/\.O_RDONLY\b/u.test(flag.getText(tree))&&flag.getText(tree).split('|').every(part=>/^(?:fs\.)?constants\.O_(?:RDONLY|NOFOLLOW|NONBLOCK|CLOEXEC|DIRECTORY)$/u.test(part.trim())))?'file-reader':'file-stream';}}
   return null;
  }
  const outputCapabilityName=name=>concreteWriterName(name)||['unknown-output-function','file-stream','fs','fs.promises','console','process','process.stdout','process.stderr'].includes(name);
  const concreteWriterName=name=>/^(?:console\.(?:log|dir|error|warn|info|debug)|process\.(?:stdout|stderr)\.write|file-stream\.(?:write|end|writeFile)|(?:fs\.)?(?:writeFileSync|writeFile|appendFileSync|appendFile)|fs\.promises\.(?:writeFile|appendFile))$/u.test(name??'');
  for(const call of state.allCalls)if(call.arguments.some(argument=>concreteWriterName(outputName(argument))))state.sinks.push({expression:{getText:()=> 'unknown-output-function'},arguments:[call],getStart:()=>call.getStart(tree)});
  // A writer capability must stay a direct callee or an immutable alias.
  // Containers, returns, callback arguments and property storage require a
  // separate interpreter; report the gap even if the eventual call is opaque.
  function capabilityUses(node){const name=outputName(node);if((ts.isIdentifier(node)||ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node))&&(concreteWriterName(name)||indirectWriter(node))){const parent=node.parent;let allowed=ts.isCallExpression(parent)&&parent.expression===node||ts.isPropertyAccessExpression(parent)&&(parent.expression===node||parent.name===node)||ts.isImportSpecifier(parent)||ts.isExportSpecifier(parent)||ts.isImportClause(parent)||ts.isNamespaceImport(parent)||ts.isVariableDeclaration(parent)&&parent.name===node||ts.isFunctionDeclaration(parent)&&parent.name===node||ts.isParameter(parent)&&parent.name===node;if(ts.isBinaryExpression(parent)&&parent.operatorToken.kind===ts.SyntaxKind.EqualsToken){if(parent.left===node)allowed=true;else if(/^console\.(?:log|info|warn|error|debug)$/u.test(name??'')&&/^console\.(?:log|info|warn|error|debug)$/u.test(outputName(parent.left)??''))allowed=true;}if(ts.isVariableDeclaration(parent)&&parent.initializer===node&&ts.isIdentifier(parent.name))allowed=!state.mutations.some(write=>ts.isIdentifier(write.left)&&write.left.text===parent.name.text);if(!allowed)state.sinks.push({expression:{getText:()=> 'unknown-output-function'},arguments:[node],getStart:()=>node.getStart(tree)});}ts.forEachChild(node,capabilityUses);}

  state.outputName=outputName;
  for(const call of state.allCalls){const name=outputName(call.expression);let canonical=null;if(name==='unknown-output-function')state.sinks.push({expression:{getText:()=>name},arguments:[call],getStart:()=>call.getStart(tree)});if(['process.stdout.write','process.stderr.write','console.log','console.dir','console.error','console.warn','console.info','console.debug','file-stream.write','file-stream.end','file-stream.writeFile'].includes(name))canonical=name==='console.dir'?'console.log':name?.startsWith('file-stream.')?'file-stream.write':name;if(name==='writeFileSync'||/^fs\.(?:promises\.)?(?:writeFileSync|writeFile|appendFileSync|appendFile)$/u.test(name??''))canonical=call.expression.getText(tree)==='writeFileSync'?'writeFileSync':'fs.writeFileSync';if(canonical)state.sinks.push({expression:{getText:()=>canonical},arguments:call.arguments,getStart:()=>call.getStart(tree)});}
  function indirectWriter(node,owner=state,seen=new Set()){if(!node||seen.has(node))return null;seen=new Set([...seen,node]);if(ts.isIdentifier(node)){const resolved=symbol(owner,node.text);if(!resolved)return null;const direct=(roleRegistry.nativeFileWriterCapabilities??[]).find(c=>c.source===resolved.state.file&&c.export&&c.export===resolved.node.name?.text);if(direct)return {capability:direct,indirect:owner.mutations.some(write=>ts.isIdentifier(write.left)&&write.left.text===node.text)};return indirectWriter(resolved.node,resolved.state,seen);}if(ts.isCallExpression(node)){const value=indirectWriter(node.expression,owner,seen);return value?{...value,indirect:true}:null;}if(ts.isPropertyAccessExpression(node)){if(['bind','call','apply'].includes(node.name.text)){const value=indirectWriter(node.expression,owner,seen);return value?{...value,indirect:true}:null;}const klass=klassOf(node.expression,owner);const capability=klass&&(roleRegistry.nativeFileWriterCapabilities??[]).find(c=>c.source===klass.state.file&&c.class===klass.node.name?.text&&c.method===node.name.text);return capability?{capability,indirect:false}:null;}return null;}
  capabilityUses(tree);
  for(const call of state.allCalls){const value=indirectWriter(call.expression);if(value?.indirect)state.sinks.push({expression:{getText:()=> 'unknown-output-function'},arguments:[call],getStart:()=>call.getStart(tree)});}
  for(const call of state.allCalls){const resolved=ts.isIdentifier(call.expression)?symbol(state,call.expression.text):ts.isPropertyAccessExpression(call.expression)?klassOf(call.expression.expression,state):null;if(!resolved)continue;const capability=(roleRegistry.nativeFileWriterCapabilities??[]).find(c=>c.source===resolved.state.file&&(c.export&&c.export===resolved.node.name?.text||c.class&&c.class===resolved.node.name?.text&&c.method===call.expression.name?.text));if(capability){const fn=capability.class?resolved.node.members.find(member=>ts.isMethodDeclaration(member)&&member.name.getText(resolved.state.tree)===capability.method):resolved.node;const index=fn.parameters?.findIndex(parameter=>parameter.name.getText(resolved.state.tree)===capability.inputParameter)??-1;state.sinks.push({expression:{getText:()=> 'native-file-writer-call'},arguments:[index>=0&&!call.arguments.some(ts.isSpreadElement)?call.arguments[index]??call:call],getStart:()=>call.getStart(tree),originalCall:call,capability});}}
  return state;
 }
 function declarationFor(node,state){const choices=state.declarations.get(node.text)??[];for(let scope=node.parent;scope;scope=scope.parent){const matches=choices.filter(choice=>choice.scope===scope);if(matches.length)return (matches.filter(choice=>(choice.value.end??choice.value.bindingExpression?.end??0)<=node.pos).at(-1)??matches[0]).value;}return null;}
 const unknown=(node,state)=>({role:'unknown',expression:node?.getText(state.tree)??'<missing>'});
 const discriminatorContracts=new Map();let discriminatorScanned=false;
 function scanDiscriminators() {
  if(discriminatorScanned)return;discriminatorScanned=true;
  for(const file of universe){const bytes=fs.readFileSync(path.join(root,file),'utf8');if(!/schemaVersion\s*:|schema_version\s*:/u.test(bytes))continue;const owner=module(file);
   function visit(node){if(ts.isObjectLiteralExpression(node)&&!node.properties.some(property=>ts.isSpreadAssignment(property)||property.name&&ts.isComputedPropertyName(property.name))){const keys=node.properties.filter(property=>property.name).map(property=>property.name.getText(owner.tree).replace(/^['"]|['"]$/gu,''));if(!keys.includes('apiVersion')&&!keys.includes('kind'))for(const property of node.properties)if(ts.isPropertyAssignment(property)&&['schemaVersion','schema_version'].includes(property.name.getText(owner.tree).replace(/^['"]|['"]$/gu,''))&&(ts.isStringLiteralLike(property.initializer)||ts.isNumericLiteral(property.initializer))){const value=property.initializer.text;const existing=discriminatorContracts.get(value)??[];existing.push({keys,file,line:owner.tree.getLineAndCharacterOfPosition(node.getStart(owner.tree)).line+1});discriminatorContracts.set(value,existing);}}ts.forEachChild(node,visit);}visit(owner.tree);
  }
  for(const file of ['versions.json','.github/lint-baseline.json','releases/runtime-images.json','releases/runtime-code.json'])if(fs.existsSync(path.join(root,file))){const value=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));if(value&&typeof value==='object'&&!('apiVersion'in value)&&!('kind'in value)){const discriminator=value.schemaVersion??value.schema_version;if(discriminator!==undefined)discriminatorContracts.set(String(discriminator),[...(discriminatorContracts.get(String(discriminator))??[]),{keys:Object.keys(value),file}]);}}
 }
 function validatedRole(node,state) {
  if(!ts.isIdentifier(node))return null;scanDiscriminators();
  const name=node.text;const before=state.tree.getText().slice(0,node.getStart(state.tree));
  // These domain discriminators are backed by a fixed source constructor or
  // current authored input. A guard alone cannot invent a role for raw JSON.
  if(!new RegExp(`Object\\.keys\\(\\s*${name}\\s*\\)\\.sort\\(\\)\\.join\\(`,'u').test(before))return null;
  const guards=[...before.matchAll(new RegExp(`\\b${name}\\??\\.(?:schemaVersion|schema_version)\\s*!==?\\s*(['"])([^'"]+)\\1`,'gu'))];
  for(const guard of guards){if(bindingCustodyViolation(node,state,guard.index,true))continue;const contracts=discriminatorContracts.get(guard[2]);if(!contracts?.length)continue;const expected=contracts.map(contract=>[...contract.keys].sort().join(','));const exact=[...before.matchAll(new RegExp(`Object\\.keys\\(\\s*${name}\\s*\\)\\.sort\\(\\)\\.join\\(\\s*['"]([^'"]*)['"]\\s*\\)\\s*!==?\\s*['"]([^'"]*)['"]`,'gu'))].some(match=>expected.includes(match[2])&&match[1]===',');if(!exact)continue;const tail=before.slice(guard.index,guard.index+1500);if(!/throw\s+new|fail\(|process\.exit\(/u.test(tail))continue;contracts.forEach(contract=>dependencies.add(contract.file));return {role:'non-api',keys:[...new Set(contracts.flatMap(contract=>contract.keys))],basis:'source-discriminator-and-fixed-constructor-contract',discriminator:guard[2],contracts};}
  return null;
 }
 function symbol(state,name,seen=new Set()) {const key=state.file+':'+name;if(seen.has(key))return null;seen.add(key);const local=state.functions.get(name)??state.classes.get(name)??state.typeDefinitions.get(name)??state.declarations.get(name)?.find(choice=>ts.isSourceFile(choice.scope))?.value;if(local)return ts.isIdentifier(local)?symbol(state,local.text,seen):{node:local,state};const imported=state.imports.get(name);if(imported)return symbol(module(imported.file),imported.name,seen);for(const file of state.reexports){const found=symbol(module(file),name,seen);if(found)return found;}return null;}
 // Resolve imported callable values before a receipt can assign their role.
 // Namespace aliases and finite string members follow the same runtime module
 // selection as named imports; opaque member access remains an explicit gap.
 function callable(node,state,seen=new Set()) {
  if(!node||seen.has(node))return null;seen=new Set([...seen,node]);
  if(node.bindingExpression){if(!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(node.bindingKey))return null;return callable(ts.factory.createPropertyAccessExpression(node.bindingExpression,node.bindingKey),state,seen);}
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node))return callable(node.expression,state,seen);
  if(ts.isIdentifier(node)){const value=declarationFor(node,state);if(value&&state.mutations.some(write=>ts.isIdentifier(write.left)&&write.left.text===node.text&&write.end<node.pos&&declarationFor(write.left,state)===value))return null;if(value)return ts.isFunctionLike(value)?{node:value,state}:callable(value,state,seen);const resolved=symbol(state,node.text);return resolved&&ts.isFunctionLike(resolved.node)?resolved:resolved?callable(resolved.node,resolved.state,seen):null;}
  if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)){
   const key=ts.isPropertyAccessExpression(node)?node.name.text:ts.isStringLiteralLike(node.argumentExpression)?node.argumentExpression.text:null;
   let base=node.expression;while(ts.isIdentifier(base)){const value=declarationFor(base,state);if(!value)break;if(state.mutations.some(write=>ts.isIdentifier(write.left)&&write.left.text===base.text&&write.end<base.pos&&declarationFor(write.left,state)===value))return null;if(seen.has(value))return null;seen.add(value);base=value;}
   const imported=ts.isIdentifier(base)&&state.imports.get(base.text);
   if(key&&imported?.name==='*'){const resolved=symbol(module(imported.file),key);return resolved&&ts.isFunctionLike(resolved.node)?resolved:resolved?callable(resolved.node,resolved.state,seen):null;}
  }
  return ts.isFunctionLike(node)?{node,state}:null;
 }
 function klassOf(node,state,seen=new Set()) {
  if(!node||seen.has(node))return null;seen=new Set([...seen,node]);
  if(ts.isIdentifier(node)){const value=declarationFor(node,state);return value?klassOf(value,state,seen):null;}
  if(ts.isAwaitExpression(node))return klassOf(node.expression,state,seen);
  if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)){const resolved=symbol(state,node.expression.text);return resolved&&ts.isClassDeclaration(resolved.node)?resolved:null;}
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)){const fn=symbol(state,node.expression.text);const type=fn?.node.type;if(type&&ts.isTypeReferenceNode(type)){const resolved=symbol(fn.state,type.typeName.getText(fn.state.tree));if(resolved&&ts.isClassDeclaration(resolved.node))return resolved;}}
  return null;
 }
 function sourcePath(node,state,seen=new Set()) {
  if(!node)return null;const key=state.file+':'+node.pos+':'+node.kind;if(seen.has(key))return null;seen=new Set([...seen,key]);
  if(ts.isStringLiteralLike(node))return {value:node.text};
  if(ts.isCallExpression(node)&&node.expression.getText(state.tree)==='process.cwd')return {value:root};
  if(ts.isIdentifier(node)){const value=declarationFor(node,state);if(!value)return null;const derived=sourcePath(value,state,seen);if(derived?.temporary){let copied=null;function visit(child){if(ts.isCallExpression(child)&&child.expression.getText(state.tree)==='fs.cpSync'&&child.arguments[1]?.getText(state.tree)===node.text&&declarationFor(child.arguments[1],state)===value&&child.pos<node.pos)copied=sourcePath(child.arguments[0],state,seen);ts.forEachChild(child,visit);}visit(state.tree);if(copied?.value)return {...copied,copiedOrigin:node.text};}return derived;}
  if(ts.isCallExpression(node)) {
   const name=node.expression.getText(state.tree);
   if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='join'){const base=shape(node.expression.expression,state,seen);if(base.role!=='unknown')return {...base,basis:'resolved-serialized-collection-join'};}
   if(name==='fs.mkdtempSync')return {temporary:true,basis:node.getText(state.tree)};
   if(['path.join','path.resolve'].includes(name)) {
    const parts=node.arguments.map(argument=>sourcePath(argument,state,seen));
    if(parts[0]?.temporary)return {temporary:true,basis:parts[0].basis};
    if(parts.every(part=>part?.value!==undefined))return {value:path.posix.join(...parts.map(part=>part.value))};
    if(node.arguments[0]?.getText(state.tree)==='import.meta.dirname') {const parts=node.arguments.slice(1).map(argument=>sourcePath(argument,state,seen));if(parts.every(part=>part?.value!==undefined))return {value:path.resolve(root,path.dirname(state.file),...parts.map(part=>part.value))};}
    if(node.arguments[0]&&ts.isIdentifier(node.arguments[0])&&node.arguments[0].text==='root'&&parts.slice(1).every(part=>part?.value!==undefined)) {
     const declaration=declarationFor(node.arguments[0],state);if(declaration&&typeof declaration.getText==='function'&&/path\.resolve|fileURLToPath|new URL/u.test(declaration.getText(state.tree)))return {value:path.resolve(root,...parts.slice(1).map(part=>part.value))};
    }
   }
  }
  return null;
 }
 function jsonRole(value,state){if(value===null||typeof value!=='object')return {role:'non-api',basis:'source-json-scalar'};if(Array.isArray(value)){const elements=value.map(item=>jsonRole(item,state));return {role:elements.some(item=>item.role==='api')?'api':'non-api',elements,basis:'source-json-collection'};}const keys=Object.keys(value);return {role:keys.includes('apiVersion')&&keys.includes('kind')?'api':'non-api',keys,properties:Object.fromEntries(keys.map(key=>[key,{node:{resolvedRole:jsonRole(value[key],state)},state}])),basis:'source-bound-static-json-input'};}
 function typeShape(node,state,seen=new Set()) {
  if(!node)return null;
  if([ts.SyntaxKind.StringKeyword,ts.SyntaxKind.NumberKeyword,ts.SyntaxKind.BooleanKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind)||ts.isLiteralTypeNode(node))return {role:'non-api',basis:'declared-scalar-contract'};
  if(ts.isTypeReferenceNode(node)) {
   const name=node.typeName.getText(state.tree);
   if(['Omit','Pick'].includes(name)){const base=typeShape(node.typeArguments?.[0],state,seen);const names=node.typeArguments?.[1];const literals=names&&(ts.isUnionTypeNode(names)?names.types:[names]);if(base?.keys&&literals?.every(type=>ts.isLiteralTypeNode(type)&&ts.isStringLiteralLike(type.literal))){const selected=literals.map(type=>type.literal.text);return {...base,keys:base.keys.filter(key=>name==='Omit'?!selected.includes(key):selected.includes(key)),basis:'declared-selected-response-contract'};}}
   if(['Promise','Readonly'].includes(name))return typeShape(node.typeArguments?.[0],state,seen);
   if(seen.has(state.file+':'+name))return null;seen=new Set([...seen,state.file+':'+name]);
   const resolvedDefinition=symbol(state,name);const definition=resolvedDefinition?.node;if(definition&&(ts.isTypeAliasDeclaration(definition)||ts.isInterfaceDeclaration(definition)))return typeShape(ts.isTypeAliasDeclaration(definition)?definition.type:definition,resolvedDefinition.state,seen);
   const imported=state.imports.get(name);if(imported){const target=module(imported.file);const resolved=symbol(target,imported.name);const definition=resolved?.node;if(definition&&(ts.isTypeAliasDeclaration(definition)||ts.isInterfaceDeclaration(definition)))return typeShape(ts.isTypeAliasDeclaration(definition)?definition.type:definition,resolved.state,seen);}
  }
  if(ts.isInterfaceDeclaration(node)||ts.isTypeLiteralNode(node)) {
   if(node.members.some(ts.isIndexSignatureDeclaration))return null;
   const keys=node.members.filter(member=>member.name).map(member=>member.name.getText(state.tree).replace(/^['"]|['"]$/gu,''));const properties=Object.fromEntries(node.members.filter(member=>member.name&&member.type).map(member=>[member.name.getText(state.tree).replace(/^['"]|['"]$/gu,''),{node:{resolvedRole:typeShape(member.type,state,seen)??{role:'unknown',expression:member.type.getText(state.tree)}},state}]));
   if(ts.isInterfaceDeclaration(node)&&node.heritageClauses?.length){for(const clause of node.heritageClauses)for(const type of clause.types){const resolved=symbol(state,type.expression.getText(state.tree));const base=resolved?typeShape(resolved.node,resolved.state,seen):null;if(!base?.keys)return null;keys.push(...base.keys);}}
   return {role:keys.includes('apiVersion')&&keys.includes('kind')?'api':'non-api',keys,properties,basis:'declared-fixed-response-contract'};
  }
  if(ts.isArrayTypeNode(node)){const element=typeShape(node.elementType,state,seen);return element?{role:element.role,elements:[element],basis:'declared-array-element-contract'}:null;}
  if(ts.isTupleTypeNode(node)){const elements=node.elements.map(element=>typeShape(element,state,seen));return elements.every(Boolean)?{role:elements.some(element=>element.role==='api')?'api':'non-api',elements,basis:'declared-tuple-contract'}:null;}
  if(ts.isConditionalTypeNode(node)){const choices=[typeShape(node.trueType,state,seen),typeShape(node.falseType,state,seen)];if(choices.every(Boolean))return {role:choices.some(choice=>choice.role==='api')?'api':'non-api',keys:[...new Set(choices.flatMap(choice=>choice.keys??[]))],basis:'declared-conditional-response-contract'};}
  if(ts.isUnionTypeNode(node)||ts.isIntersectionTypeNode(node)){const choices=node.types.map(type=>typeShape(type,state,seen));if(choices.every(Boolean))return {role:choices.some(choice=>choice.role==='api')?'api':'non-api',...(choices.every(choice=>choice.keys)?{keys:[...new Set(choices.flatMap(choice=>choice.keys))]}:{}),basis:'declared-composite-contract'};}
  return null;
 }
 function canonicalOperation(fn,state){if(fn.name?.getText(state.tree)!=='canonicalJson')return null;const operation=fn.getText(state.tree);for(const recipe of canonicalOperationRecipes)if(recipe.operation===operation&&recipe.helpers.every(helper=>{const resolved=symbol(state,helper.name);return resolved&&resolved.node.getText(resolved.state.tree)===helper.operation;}))return recipe;return null;}
 function returns(fn,state,seen,args=[],argumentState=state) {
  const canonical=canonicalOperation(fn,state);if(canonical&&args[0])return {...shape(args[0],argumentState,seen),basis:'enforced-original-key-preserving-canonical-serialization',operationSource:canonical.source};
  const recipe=fn.getText(state.tree).replace(/\s+/gu,'');if(recipe==="functionstable(value){if(Array.isArray(value))returnvalue.map(stable);if(value&&typeofvalue==='object')returnObject.fromEntries(Object.entries(value).sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>[key,stable(item)]));returnvalue;}"&&args[0])return {...shape(args[0],argumentState,seen),basis:'enforced-key-preserving-sort-transform'};
  const previous=[];fn.parameters?.forEach((parameter,index)=>{if(args[index]){previous.push([parameter.name,parameterBindings.get(parameter.name)]);parameterBindings.set(parameter.name,{node:args[index],state:argumentState});}});
  const result=returnShape(fn,state,seen);for(const [key,value]of previous){if(value)parameterBindings.set(key,value);else parameterBindings.delete(key);}return result;
 }
 function returnShape(fn,state,seen) {
  const recipe=fn.getText(state.tree).replace(/\s+/gu,'');
  if(recipe.includes("spawnSync(process.execPath,[script,'--platform',platform,'--run-id',runId,'--heartbeat',heartbeat,'--resource-log',resourceLog,'--stale-after-seconds','120']")&&recipe.includes('status=JSON.parse(result.stdout)')&&recipe.includes("status?.schemaVersion!=='repository-review-status.v1'")&&recipe.includes("!['running','succeeded','failed','blocked','cancelled'].includes(status.status)")&&recipe.endsWith('returnstatus;}')&&state.tree.getText().includes("const statusScript = path.join(cwd, 'scripts', 'repository-review-status.mjs');")) {
   const child=module('scripts/repository-review-status.mjs');const outputs=child.sinks.filter(sink=>sink.expression.getText(child.tree)==='process.stdout.write').map(sink=>shape(sink.arguments[0],child,seen));if(outputs.length&&outputs.every(output=>output.role==='non-api'))return {role:'non-api',basis:'guarded-original-status-subprocess-response',keys:[...new Set(outputs.flatMap(output=>output.keys??[]))]};
  }
  let declared=typeShape(fn.type,state);
  if(!declared&&fn.type&&fn.typeParameters?.length){const genericNames=fn.typeParameters.map(parameter=>parameter.name.text);for(const parameter of fn.parameters??[]){const bound=parameterBindings.get(parameter.name);if(bound&&parameter.type&&ts.isFunctionTypeNode(parameter.type)&&genericNames.some(name=>new RegExp(`\\b${name}\\b`,'u').test(parameter.type.type.getText(state.tree)))&&(ts.isArrowFunction(bound.node)||ts.isFunctionExpression(bound.node))){declared=returns(bound.node,bound.state,seen);break;}}}
  const results=[];
  function visit(node) {if(node!==fn&&ts.isFunctionLike(node))return;if(ts.isReturnStatement(node)&&node.expression)results.push(shape(node.expression,state,seen));ts.forEachChild(node,visit);}
  if(ts.isArrowFunction(fn)&&!ts.isBlock(fn.body))return shape(fn.body,state,seen);
  visit(fn);if(results.length===1&&results[0].elements)return results[0];if(results.some(result=>result.role==='api'))return {role:'api',basis:'actual-return-api-identity',...(results.every(result=>result.keys)?{keys:[...new Set(results.flatMap(result=>result.keys))].sort()}:{}),...(results.length===1&&results[0].properties?{properties:results[0].properties}:{})};return results.length&&results.every(result=>result.role!=='unknown')?{role:results.some(result=>result.role==='api')?'api':'non-api',returns:results,...(results.every(result=>result.keys)?{keys:[...new Set(results.flatMap(result=>result.keys))].sort()}:{}),...(results.length===1&&results[0].properties?{properties:results[0].properties}:results.some(result=>result.properties)?{properties:Object.fromEntries([...new Set(results.flatMap(result=>Object.keys(result.properties??{})))].map(key=>{const values=results.map(result=>{const property=result.properties?.[key];return property?shape(property.node,property.state,seen):{role:'non-api',basis:'absent-optional-return-property'};});return [key,{node:{resolvedRole:values.every(value=>value.role!=='unknown')?{role:values.some(value=>value.role==='api')?'api':'non-api',basis:'actual-union-return-property'}:{role:'unknown',expression:key}},state}];}))}:{})}:unknown(fn,state);
 }
 function bindingDeclaration(node,state){
  const value=declarationFor(node,state);if(value)return value;
  for(let owner=node.parent;owner;owner=owner.parent)if(ts.isFunctionLike(owner)){const parameter=owner.parameters?.find(parameter=>ts.isIdentifier(parameter.name)&&parameter.name.text===node.text);if(parameter)return parameter;}
  return null;
 }
 function bindingCustodyViolation(node,state,after=0,includeEscapes=false){
  if(!ts.isIdentifier(node))return null;
  const value=bindingDeclaration(node,state);if(!value)return null;
  const scopeOf=entry=>{for(let parent=entry?.parent;parent;parent=parent.parent)if(ts.isFunctionLike(parent)||ts.isSourceFile(parent))return parent;return null;};
  const consumerScope=scopeOf(node),bindingScope=scopeOf(value),captured=consumerScope!==bindingScope;
  const identity=rootIdentity(node,state);
  const relevant=operation=>operation.pos>=after&&(operation.end<node.pos||captured);
  for(const operation of state.mutations.filter(relevant)){
   let target=operation.left;while(ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target))target=target.expression;
   if(ts.isIdentifier(target)&&bindingDeclaration(target,state)===value&&(ts.isIdentifier(operation.left)||after>0))return operation;
   if(after>0&&identity&&(rootIdentity(operation.left,state)===identity||(ts.isPropertyAccessExpression(operation.left)||ts.isElementAccessExpression(operation.left))&&rootIdentity(operation.left.expression,state)===identity))return operation;
  }
  for(const operation of state.destructiveMutations.filter(relevant)){const target=operation.expression??operation.operand;if(identity&&(rootIdentity(target,state)===identity||(ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target))&&rootIdentity(target.expression,state)===identity))return operation;}
  if(includeEscapes){
   const pure=new Set(['JSON.stringify','Object.keys','Object.values','Object.entries','Object.hasOwn','Object.isFrozen','Object.freeze','Array.isArray','structuredClone','String','Number','parseInt','parseFloat','Boolean','Buffer.byteLength','console.log','console.dir','console.error','console.warn','console.info','console.debug','process.stdout.write','process.stderr.write']);
   const same=argument=>ts.isIdentifier(argument)&&bindingDeclaration(argument,state)===value||identity&&rootIdentity(argument,state)===identity;
   for(const call of state.allCalls.filter(relevant)){if(call.pos<=node.pos&&call.end>=node.end||pure.has(call.expression.getText(state.tree)))continue;const receiver=ts.isPropertyAccessExpression(call.expression)?call.expression.expression:null;if(receiver&&same(receiver)||call.arguments.some(same))return call;}
  }
  return null;
 }
 function runtimeScalarGuard(node,state) {
  if(!ts.isIdentifier(node))return null;
  function leaves(condition){return ts.isBinaryExpression(condition)&&condition.operatorToken.kind===ts.SyntaxKind.BarBarToken?[...leaves(condition.left),...leaves(condition.right)]:[condition];}
  function throws(statement){return ts.isThrowStatement(statement)||ts.isBlock(statement)&&statement.statements.length===1&&ts.isThrowStatement(statement.statements[0]);}
  function objectTest(condition){return ts.isBinaryExpression(condition)&&condition.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&ts.isTypeOfExpression(condition.left)&&condition.left.expression.getText(state.tree)===node.text&&ts.isStringLiteralLike(condition.right)&&condition.right.text==='object';}
  for(let scope=node.parent;scope;scope=scope.parent)if(ts.isBlock(scope)||ts.isSourceFile(scope))for(const statement of scope.statements)if(ts.isIfStatement(statement)&&statement.end<node.pos&&!bindingCustodyViolation(node,state,statement.end,true)&&ts.isReturnStatement(statement.thenStatement)){const condition=statement.expression;if(objectTest(condition)||ts.isBinaryExpression(condition)&&condition.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&ts.isIdentifier(condition.left)&&condition.left.text===node.text&&objectTest(condition.right))return {role:'non-api',basis:'preceding-return-excludes-structured-roots'};}
  for(let scope=node.parent;scope;scope=scope.parent)if(ts.isBlock(scope)||ts.isSourceFile(scope))for(const statement of scope.statements)if(ts.isIfStatement(statement)&&statement.end<node.pos&&!bindingCustodyViolation(node,state,statement.end,true)&&throws(statement.thenStatement)) {
   const terms=leaves(statement.expression);
   if(terms.some(term=>ts.isBinaryExpression(term)&&[ts.SyntaxKind.ExclamationEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(term.operatorToken.kind)&&ts.isTypeOfExpression(term.left)&&ts.isIdentifier(term.left.expression)&&term.left.expression.text===node.text&&ts.isStringLiteralLike(term.right)&&['string','number','boolean'].includes(term.right.text)))return {role:'non-api',basis:'enforced-preceding-scalar-rejection-guard'};
   const array=terms.some(term=>ts.isPrefixUnaryExpression(term)&&term.operator===ts.SyntaxKind.ExclamationToken&&ts.isCallExpression(term.operand)&&term.operand.expression.getText(state.tree)==='Array.isArray'&&term.operand.arguments[0]?.getText(state.tree)===node.text);
   const items=terms.some(term=>ts.isCallExpression(term)&&ts.isPropertyAccessExpression(term.expression)&&term.expression.expression.getText(state.tree)===node.text&&term.expression.name.text==='some'&&term.arguments[0]&&ts.isArrowFunction(term.arguments[0])&&leaves(term.arguments[0].body).some(part=>ts.isBinaryExpression(part)&&part.operatorToken.kind===ts.SyntaxKind.ExclamationEqualsEqualsToken&&ts.isTypeOfExpression(part.left)&&part.left.expression.getText(state.tree)===term.arguments[0].parameters[0]?.name.getText(state.tree)&&ts.isStringLiteralLike(part.right)&&part.right.text==='string'));
   if(array&&items)return {role:'non-api',basis:'enforced-preceding-scalar-array-rejection-guard',elements:[{role:'non-api',basis:'validated-string-element'}]};
  }
  return null;
 }
 function literalKeys(node,state) {if(ts.isStringLiteralLike(node)||ts.isNumericLiteral(node))return [node.text];if(ts.isConditionalExpression(node)){const left=literalKeys(node.whenTrue,state),right=literalKeys(node.whenFalse,state);return left&&right?[...left,...right]:null;}if(ts.isIdentifier(node)){const value=declarationFor(node,state);return value?literalKeys(value,state):null;}return null;}
 function rootIdentity(node,state,seen=new Set()) {
  if(!node)return null;if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node))return rootIdentity(node.expression,state,seen);
  if(ts.isIdentifier(node)){const value=declarationFor(node,state);if(!value){const binding=bindingDeclaration(node,state);return binding&&ts.isParameter(binding)?`${state.file}:parameter:${binding.pos}`:null;}if(seen.has(value))return null;const identity=rootIdentity(value,state,new Set([...seen,value]));return identity??(ts.isCallExpression(value)||ts.isNewExpression(value)||ts.isPropertyAccessExpression(value)||ts.isElementAccessExpression(value)?`${state.file}:binding:${value.pos}`:null);}
  if(ts.isObjectLiteralExpression(node)||ts.isArrayLiteralExpression(node))return `${state.file}:${node.pos}:${node.end}`;
  if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)){const base=rootIdentity(node.expression,state,seen);const keys=ts.isPropertyAccessExpression(node)?[node.name.text]:literalKeys(node.argumentExpression,state);return base&&keys?.length===1?`${base}.${keys[0]}`:null;}
  return null;
 }
 function unsupportedTerminalRootMutation(node,state,value) {
  const identity=rootIdentity(node,state);if(!identity)return null;
  const before=operation=>operation.pos>=(value.end??0)&&operation.end<node.pos;
  for(const mutation of state.mutations.filter(before)){
   if(ts.isIdentifier(mutation.left)&&rootIdentity(mutation.left,state)===identity)return mutation;
   if((ts.isPropertyAccessExpression(mutation.left)||ts.isElementAccessExpression(mutation.left))&&rootIdentity(mutation.left.expression,state)===identity&&(!ts.isIdentifier(mutation.left.expression)||mutation.left.expression.text!==node.text))return mutation;
  }
  for(const mutation of state.destructiveMutations.filter(before)){const target=mutation.expression??mutation.operand;if(ts.isDeleteExpression(mutation)&&(ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target))&&literalKeys(ts.isPropertyAccessExpression(target)?ts.factory.createStringLiteral(target.name.text):target.argumentExpression,state)?.length===1){let ambiguous=false;for(let parent=mutation.parent;parent&&!ts.isSourceFile(parent)&&!ts.isFunctionLike(parent);parent=parent.parent)if(ts.isIfStatement(parent)||ts.isIterationStatement(parent,false)||ts.isConditionalExpression(parent))ambiguous=true;if(!ambiguous)continue;}if(rootIdentity(target,state)===identity||(ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target))&&rootIdentity(target.expression,state)===identity)return mutation;}
  const pure=new Set(['JSON.stringify','Object.keys','Object.values','Object.entries','Object.hasOwn','Object.isFrozen','Object.freeze','Array.isArray','structuredClone']);
  for(const call of state.allCalls.filter(before)){const name=call.expression.getText(state.tree);if(pure.has(name))continue;const receiver=ts.isPropertyAccessExpression(call.expression)?call.expression.expression:null;if(receiver&&rootIdentity(receiver,state)===identity)return call;if(call.arguments.some(argument=>rootIdentity(argument,state)===identity))return call;}
  return null;
 }
 function shape(node,state,seen=new Set()) {
  if(!node)return unknown(node,state);if(node.tupleCollection){const collection=shape(node.tupleCollection,state,seen);const items=collection.elements??[];const choices=items.map(item=>item.elements?.[node.tupleIndex]);return choices.length&&choices.every(choice=>choice&&choice.role!=='unknown')?{role:choices.some(choice=>choice.role==='api')?'api':'non-api',basis:'actual-for-of-tuple-bindings'}:{...unknown(node.tupleCollection,state),tupleDiagnostics:items.map(item=>({role:item.role,element:item.elements?.[node.tupleIndex]?.role,expression:item.expression,elementExpression:item.elements?.[node.tupleIndex]?.expression}))};}if(node.resolvedRole)return node.resolvedRole;if(node.bindingExpression){const base=shape(node.bindingExpression,state,seen);const property=base.properties?.[node.bindingKey];return property?shape(property.node,property.state,seen):unknown(node.bindingExpression,state);}
  const override=parameterBindings.get(node);if(override)return shape(override.node,override.state,seen);const key=state.file+':'+node.pos+':'+node.kind;if(seen.has(key))return unknown(node,state);seen=new Set([...seen,key]);
  if(ts.isParenthesizedExpression(node)||ts.isAwaitExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node)||ts.isSatisfiesExpression(node))return shape(node.expression,state,seen);
  if(ts.isObjectLiteralExpression(node)) {
   const keys=[];const properties={};
   for(const property of node.properties){if(ts.isSpreadAssignment(property)){const spread=shape(property.expression,state,seen);if(!spread.keys){const names=node.properties.filter(ts.isPropertyAssignment).filter(property=>property.name&&!ts.isComputedPropertyName(property.name)).map(property=>property.name.getText(state.tree).replace(/^['"]|['"]$/gu,''));if(names.includes('apiVersion')&&names.includes('kind'))return {role:'api',keys:names,basis:'source-api-root-with-unresolved-spread',unresolvedRoot:true};return unknown(property,state);}keys.push(...spread.keys);Object.assign(properties,spread.properties);}else if(property.name&&ts.isComputedPropertyName(property.name)){const names=literalKeys(property.name.expression,state);if(!names)return unknown(property,state);for(const key of names){keys.push(key);properties[key]={node:property.initializer,state};}}else if(property.name&&!ts.isComputedPropertyName(property.name)){const key=property.name.getText(state.tree).replace(/^['"]|['"]$/gu,'');keys.push(key);properties[key]={node:ts.isPropertyAssignment(property)?property.initializer:property.name,state};}else return unknown(property,state);}
   return {role:keys.includes('apiVersion')&&keys.includes('kind')?'api':'non-api',keys:[...new Set(keys)].sort(),properties,basis:'fixed-source-root-properties'};
  }
  if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='Map'&&!declarationFor(node.expression,state)&&!state.imports.has('Map')&&node.arguments?.length===1&&ts.isArrayLiteralExpression(node.arguments[0]))return {...shape(node.arguments[0],state,seen),basis:'actual-fixed-native-map-entry-tuples'};
  if(ts.isArrayLiteralExpression(node)){const elements=node.elements.flatMap(element=>{const value=shape(ts.isSpreadElement(element)?element.expression:element,state,seen);return ts.isSpreadElement(element)&&value.elements?value.elements:[value];});return {role:elements.some(element=>element.role==='unknown')?'unknown':elements.some(element=>element.role==='api')?'api':'non-api',elements,basis:'resolved-collection-elements'};}
  if(ts.isStringLiteralLike(node)&&/(?:^|\n)apiVersion:\s/u.test(node.text)&&/(?:^|\n)kind:\s/u.test(node.text)){try{const values=YAML.parseAllDocuments(node.text).map(doc=>doc.toJS());if(values.some(value=>value?.apiVersion&&value?.kind))return {role:'api',basis:'literal-yaml-api-identity'};}catch{return unknown(node,state);}}
  if(ts.isStringLiteralLike(node)&&/^[\s]*[\[{]/u.test(node.text)){try{return jsonRole(JSON.parse(node.text),state);}catch{return unknown(node,state);}}
  if(ts.isStringLiteralLike(node)||ts.isNumericLiteral(node)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind))return {role:'non-api',basis:'literal-scalar'};
  if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.QuestionQuestionToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)){const choices=[shape(node.left,state,seen),shape(node.right,state,seen)];if(choices.every(choice=>choice.role==='non-api'&&!choice.keys))return {role:'non-api',basis:'source-scalar-fallback'};}
  if(ts.isTemplateExpression(node)&&/^import\s/u.test(node.head.text)&&node.templateSpans.every(span=>ts.isCallExpression(span.expression)&&span.expression.expression.getText(state.tree)==='JSON.stringify'))return {role:'non-api',basis:'source-generated-javascript-module'};
  if(ts.isTemplateExpression(node)){const parts=node.templateSpans.map(span=>shape(span.expression,state,seen));return parts.every(part=>part.role!=='unknown')?{role:parts.some(part=>part.role==='api')?'api':'non-api',basis:'resolved-template-spans'}:{...unknown(node,state),spanDiagnostics:parts.map(part=>({role:part.role,expression:part.expression,basis:part.basis}))};}
  if(ts.isElementAccessExpression(node)){const base=shape(node.expression,state,seen);let names=literalKeys(node.argumentExpression,state);if(!names&&ts.isIdentifier(node.argumentExpression)){const name=node.argumentExpression.text;const before=state.tree.getText().slice(0,node.getStart(state.tree));const match=[...before.matchAll(new RegExp(`if\\s*\\(\\s*!\\s*\\[([^\\]]+)\\]\\.includes\\(\\s*${name}\\s*\\)\\)\\s*throw\\s+new`,'gu'))].at(-1);if(match){const entries=match[1].split(',').map(value=>value.trim());if(entries.every(value=>/^['"][^'"]+['"]$/u.test(value)))names=entries.map(value=>value.slice(1,-1));}}if(names?.length){const choices=names.map(name=>base.properties?.[name]).map(property=>property?shape(property.node,property.state,seen):unknown(node,state));if(choices.every(choice=>choice.role!=='unknown'))return {role:choices.some(choice=>choice.role==='api')?'api':'non-api',basis:'enforced-finite-output-projection',keys:[...new Set(choices.flatMap(choice=>choice.keys??[]))]};}return unknown(node,state);}
  if(ts.isPropertyAccessExpression(node)&&node.name.text==='length'&&ts.isIdentifier(node.expression)){const value=declarationFor(node.expression,state);if(value&&ts.isArrayLiteralExpression(value)&&ts.isVariableDeclaration(value.parent)&&(value.parent.parent.flags&ts.NodeFlags.Const))return {role:'non-api',basis:'constant-native-array-length'};}
  if(ts.isPropertyAccessExpression(node)&&node.name.text==='byteLength'&&ts.isCallExpression(node.expression)&&ts.isPropertyAccessExpression(node.expression.expression)&&node.expression.expression.name.text==='encode'&&ts.isNewExpression(node.expression.expression.expression)&&node.expression.expression.expression.expression.getText(state.tree)==='TextEncoder')return {role:'non-api',basis:'built-in-encoded-byte-count'};
  if(ts.isPropertyAccessExpression(node)&&node.name.text==='length'&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(state.tree)==='JSON.stringify')return {role:'non-api',basis:'built-in-serialized-character-count'};
  if(ts.isPropertyAccessExpression(node)){const base=shape(node.expression,state,seen);if(node.name.text==='length'&&base.elements)return {role:'non-api',basis:'actual-source-collection-length'};const property=base.properties?.[node.name.text];return property?shape(property.node,property.state,seen):unknown(node,state);}
  if(ts.isIdentifier(node)) {
   if(node.text==='undefined'&&!declarationFor(node,state))return {role:'non-api',basis:'language-undefined-literal'};
   for(let parent=node.parent;parent;parent=parent.parent)if(ts.isIfStatement(parent)&&node.pos>=parent.thenStatement.pos&&node.end<=parent.thenStatement.end){const condition=parent.expression;if(ts.isBinaryExpression(condition)&&[ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.EqualsEqualsEqualsToken].includes(condition.operatorToken.kind)&&ts.isTypeOfExpression(condition.left)&&ts.isIdentifier(condition.left.expression)&&condition.left.expression.text===node.text&&ts.isStringLiteralLike(condition.right)&&['string','number','boolean'].includes(condition.right.text))return {role:'non-api',basis:'actual-enclosing-scalar-type-branch'};}
   const bindingWrite=bindingCustodyViolation(node,state,(bindingDeclaration(node,state)?.end??0));if(bindingWrite)return unknown(bindingWrite,state);
   const scalarGuard=runtimeScalarGuard(node,state);if(scalarGuard)return scalarGuard;
   const validated=validatedRole(node,state);if(validated)return validated;

   const value=declarationFor(node,state);if(value){const resolved=shape(value,state,seen);if(resolved.role!=='unknown'){const unsupported=unsupportedTerminalRootMutation(node,state,value);if(unsupported)return unknown(unsupported,state);const identity=rootIdentity(node,state);const mutations=[...state.mutations.filter(mutation=>mutation.pos>=(value.end??0)&&mutation.pos<node.pos&&(ts.isPropertyAccessExpression(mutation.left)||ts.isElementAccessExpression(mutation.left))&&(identity?rootIdentity(mutation.left.expression,state)===identity:ts.isIdentifier(mutation.left.expression)&&mutation.left.expression.text===node.text)),...state.destructiveMutations.filter(mutation=>ts.isDeleteExpression(mutation)&&mutation.pos>=(value.end??0)&&mutation.pos<node.pos&&(ts.isPropertyAccessExpression(mutation.expression)||ts.isElementAccessExpression(mutation.expression))&&(identity?rootIdentity(mutation.expression.expression,state)===identity:ts.isIdentifier(mutation.expression.expression)&&mutation.expression.expression.text===node.text))].sort((left,right)=>left.pos-right.pos);if(mutations.length){if(!resolved.keys)return unknown(node,state);let keys=[...resolved.keys];const properties={...resolved.properties};for(const mutation of mutations){const target=ts.isDeleteExpression(mutation)?mutation.expression:mutation.left;if(!ts.isDeleteExpression(mutation)&&mutation.operatorToken.kind!==ts.SyntaxKind.EqualsToken)return unknown(mutation,state);const names=ts.isPropertyAccessExpression(target)?[target.name.text]:literalKeys(target.argumentExpression,state);if(!names)return unknown(mutation,state);if(ts.isDeleteExpression(mutation)){keys=keys.filter(key=>!names.includes(key));for(const name of names)delete properties[name];}else{keys.push(...names);for(const name of names)properties[name]={node:mutation.right,state};}}return {...resolved,properties,keys:[...new Set(keys)],role:keys.includes('apiVersion')&&keys.includes('kind')?'api':'non-api',basis:'terminal-fixed-property-mutations'};}return resolved;}const validated=validatedRole(node,state);if(validated)return validated;return resolved;}
   for(let parent=node.parent;parent;parent=parent.parent)if(ts.isFunctionLike(parent)){const parameter=parent.parameters?.find(item=>ts.isIdentifier(item.name)&&item.name.text===node.text);if(parameter){const bound=parameterBindings.get(parameter.name);if(bound)return shape(bound.node,bound.state,seen);const name=parent.name?.getText(state.tree);const index=parent.parameters.indexOf(parameter);const invocations=state.calls.filter(call=>call.expression.text===name).map(call=>({call,state}));
        if(parent.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))for(const file of universe){if(file===state.file)continue;const bytes=fs.readFileSync(path.join(root,file),'utf8');if(!bytes.includes(path.posix.basename(state.file).replace(/\.(?:[cm]?js|ts)$/u,'')))continue;const caller=module(file);for(const [alias,imported]of caller.imports)if(imported.file===state.file&&imported.name===name)for(const call of caller.calls.filter(call=>call.expression.text===alias))invocations.push({call,state:caller});}
        const values=invocations.map(({call,state:caller})=>shape(call.arguments[index],caller,seen));if(values.length&&values.every(value=>value.role!=='unknown'))return {role:values.some(value=>value.role==='api')?'api':'non-api',...(values.every(value=>value.keys)?{keys:[...new Set(values.flatMap(value=>value.keys))]}:{}),basis:'resolved-function-call-inputs'};}break;}
   const fn=state.functions.get(node.text);if(fn)return returns(fn,state,seen);
   const imported=state.imports.get(node.text);if(imported){const target=module(imported.file);const value=target.declarations.get(imported.name)?.find(choice=>ts.isSourceFile(choice.scope))?.value,fn=target.functions.get(imported.name);return value?shape(value,target,seen):fn?returns(fn,target,seen):unknown(node,state);}
  }
  if(ts.isConditionalExpression(node)){const choices=[shape(node.whenTrue,state,seen),shape(node.whenFalse,state,seen)];return choices.every(choice=>choice.role!=='unknown')?{role:choices.some(choice=>choice.role==='api')?'api':'non-api',choices,...(choices.every(choice=>choice.keys)?{keys:[...new Set(choices.flatMap(choice=>choice.keys))]}:{})}:unknown(node,state);}
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken){const left=shape(node.left,state,seen),right=shape(node.right,state,seen);return left.role!=='unknown'&&right.role!=='unknown'?{role:left.role==='api'||right.role==='api'?'api':'non-api',basis:'resolved-serialized-concatenation'}:right.role==='unknown'?right:unknown(node,state);}
  if(ts.isNewExpression(node)&&node.expression.getText(state.tree)==='Set')return shape(node.arguments?.[0],state,seen);
  if(ts.isCallExpression(node)) {
   const name=node.expression.getText(state.tree);
   if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='join'){const base=shape(node.expression.expression,state,seen);if(base.role!=='unknown')return {...base,basis:'resolved-serialized-collection-join'};}
   if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='join'&&ts.isArrayLiteralExpression(node.expression.expression)&&ts.isStringLiteralLike(node.expression.expression.elements[0])&&/^disable_checkpoint\s*=/u.test(node.expression.expression.elements[0].text))return {role:'non-api',basis:'source-generated-terraform-cli-configuration'};
   if(['Number','parseInt','parseFloat','Buffer.byteLength'].includes(name)||/^Math\.(?:min|max|floor|ceil|round|abs)$/u.test(name))return {role:'non-api',basis:'built-in-numeric-operation'};
   if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='digest'&&ts.isStringLiteralLike(node.arguments[0])&&['hex','base64url','base64'].includes(node.arguments[0].text)&&/(?:createHash|createHmac)\(/u.test(node.expression.expression.getText(state.tree)))return {role:'non-api',basis:'built-in-encoded-cryptographic-digest'};
   if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='toString'&&ts.isStringLiteralLike(node.arguments[0])&&['hex','base64url','base64'].includes(node.arguments[0].text)&&/Buffer\.from/u.test(node.expression.expression.getText(state.tree)))return {role:'non-api',basis:'built-in-encoded-byte-string'};
   if(ts.isPropertyAccessExpression(node.expression)&&['slice','replace','replaceAll','toLowerCase','toUpperCase','trim','toLocaleString'].includes(node.expression.name.text)){const base=shape(node.expression.expression,state,seen);if(base.role==='non-api'&&!base.keys)return {role:'non-api',basis:'source-scalar-method-operation'};}
   if(['JSON.stringify','yaml.dump','YAML.stringify','yaml.stringify','dump'].includes(name)&&node.arguments[0])return shape(node.arguments[0],state,seen);
   if(['path.join','path.resolve','path.basename','path.dirname','path.extname','fs.mkdtempSync','String'].includes(name)||ts.isPropertyAccessExpression(node.expression)&&['toString','trim','slice'].includes(node.expression.name.text)&&name.startsWith('process.argv['))return {role:'non-api',basis:'source-scalar-operation'};
   if(['Object.freeze','structuredClone','Buffer.from'].includes(name))return shape(node.arguments[0],state,seen);
   if(ts.isIdentifier(node.expression)){const bound=(()=>{for(let parent=node.expression.parent;parent;parent=parent.parent)if(ts.isFunctionLike(parent)){const parameter=parent.parameters?.find(parameter=>parameter.name.getText(state.tree)===node.expression.text);if(parameter)return parameterBindings.get(parameter.name);break;}return null;})();if(bound&&(ts.isArrowFunction(bound.node)||ts.isFunctionExpression(bound.node)))return returns(bound.node,bound.state,seen,node.arguments,state);const resolved=callable(node.expression,state);const fn=resolved?.node??declarationFor(node.expression,state);if(fn&&ts.isFunctionLike(fn))return returns(fn,resolved?.state??state,seen,node.arguments,state);return shape(node.expression,state,seen);}
   const importedCallable=callable(node.expression,state);if(importedCallable)return returns(importedCallable.node,importedCallable.state,seen,node.arguments,state);
   if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='filter')return shape(node.expression.expression,state,seen);
   if(ts.isPropertyAccessExpression(node.expression)&&['map','flatMap'].includes(node.expression.name.text)) {
    const callback=node.arguments[0];if(ts.isArrowFunction(callback)||ts.isFunctionExpression(callback)){const collection=shape(node.expression.expression,state,seen);const role=collection.role!=='unknown'?{resolvedRole:collection.elements?.length===1?collection.elements[0]:{role:collection.role,...(collection.keys?{keys:collection.keys}:{}),...(collection.properties?{properties:collection.properties}:{}),basis:'resolved-map-input-elements'}}:null;const item=returns(callback,state,seen,role?[role]:[],state);return {role:item.role,elements:node.expression.name.text==='flatMap'&&item.elements?item.elements:[item],basis:'resolved-source-map-callback'};}
   }
   if(name==='JSON.parse'){let read=node.arguments[0];const visited=new Set();while(read&&ts.isIdentifier(read)&&!visited.has(read.text)){visited.add(read.text);read=declarationFor(read,state);}if(read&&ts.isCallExpression(read)&&read.expression.getText(state.tree)==='fs.readFileSync'){const input=sourcePath(read.arguments[0],state);if(input?.value){const absolute=path.resolve(root,input.value);if(absolute.startsWith(root+'/')&&fs.existsSync(absolute)){const value=JSON.parse(fs.readFileSync(absolute,'utf8'));dependencies.add(path.relative(root,absolute));if(value&&typeof value==='object'&&!Array.isArray(value))return jsonRole(value,state);}}}}
   if(ts.isPropertyAccessExpression(node.expression)){const resolved=klassOf(node.expression.expression,state);const method=resolved?.node.members.find(member=>ts.isMethodDeclaration(member)&&member.name.getText(resolved.state.tree)===node.expression.name.text);if(method)return returns(method,resolved.state,seen,node.arguments,state);}
   if(name==='JSON.parse'&&ts.isStringLiteralLike(node.arguments[0])){try{const value=JSON.parse(node.arguments[0].text);return {role:value&&typeof value==='object'&&('apiVersion'in value||'kind'in value)?'api':'non-api',basis:'parsed-literal'};}catch{return unknown(node,state);}}
  }
  return unknown(node,state);
 }
 // A source-level receipt cannot qualify another subprocess call. Resolve
 // every effective argv alternative of the selected call before granting a
 // reader role. null scalar slots are allowed only as read-command operands.
 function importedConstructorGap(node,state,seen=new Set()) {
  if(!node||seen.has(node))return false;seen.add(node);
  // A supported instance method is evaluated by shape() at its call; the
  // constructor of its receiver is not itself the published return value.
  if(ts.isPropertyAccessExpression(node)&&klassOf(node.expression,state))return false;
  if(ts.isIdentifier(node)){const value=declarationFor(node,state);if(value&&importedConstructorGap(value,state,seen))return true;}
  if(ts.isCallExpression(node)||ts.isNewExpression(node)){
   const bases=new Set();let base=node.expression;while(ts.isPropertyAccessExpression(base)||ts.isElementAccessExpression(base))base=base.expression;
   while(ts.isIdentifier(base)){const value=declarationFor(base,state);if(!value||bases.has(value))break;bases.add(value);base=value.bindingExpression??value;}
   const imported=ts.isIdentifier(base)&&state.imports.get(base.text);
   if(imported&&!callable(node.expression,state))return true;
  }
  let gap=false;ts.forEachChild(node,child=>{if(importedConstructorGap(child,state,seen))gap=true;});return gap;
 }
 function commandArgv(node,state,seen=new Set()) {
  if(!node||seen.has(node))return null;seen=new Set([...seen,node]);
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node))return commandArgv(node.expression,state,seen);
  if(ts.isStringLiteralLike(node))return [[node.text]];
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken){const left=commandArgv(node.left,state,seen),right=commandArgv(node.right,state,seen);return left&&right&&left.every(v=>v.length===1&&v[0]!==null)&&right.every(v=>v.length===1&&v[0]!==null)?left.flatMap(a=>right.map(b=>[a[0]+b[0]])):null;}
  if(ts.isArrayLiteralExpression(node)){let vectors=[[]];for(const element of node.elements){const values=ts.isSpreadElement(element)?commandArgv(element.expression,state,seen):commandArgv(element,state,seen)??[[null]];if(!values)return null;vectors=vectors.flatMap(prefix=>values.map(value=>[...prefix,...value]));if(vectors.length>128)return null;}return vectors;}
  if(ts.isIdentifier(node)){
   const value=declarationFor(node,state);if(value)return commandArgv(value,state,seen);
   let owner=node.parent;while(owner&&!ts.isFunctionLike(owner))owner=owner.parent;
   const index=owner?.parameters?.findIndex(parameter=>ts.isIdentifier(parameter.name)&&parameter.name.text===node.text)??-1;
   if(index>=0){const name=owner.name?.getText(state.tree)??(ts.isParameter(owner.parent)||ts.isVariableDeclaration(owner.parent)?owner.parent.name.getText(state.tree):null);if(!name)return null;
    // The finite caller set must be closed: a function alias, callback escape,
    // reassignment or exported wrapper introduces callers this grammar cannot
    // resolve. Likewise the argv parameter cannot be mutated or forwarded.
    if(owner.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))return null;
    let closed=true;function references(child){if(ts.isIdentifier(child)&&child.text===name&&child!==owner.name&&child!==owner.parent?.name){if(!(ts.isCallExpression(child.parent)&&child.parent.expression===child))closed=false;}ts.forEachChild(child,references);}references(state.tree);
    function parameterUses(child){if(ts.isIdentifier(child)&&child.text===node.text&&child!==owner.parameters[index].name&&child!==node)closed=false;ts.forEachChild(child,parameterUses);}parameterUses(owner.body);
    if(!closed)return null;
    const calls=state.calls.filter(call=>call.expression.text===name);if(!calls.length)return null;const alternatives=calls.map(call=>commandArgv(call.arguments[index],state,seen));return alternatives.every(Boolean)?alternatives.flat():null;}
  }
  return null;
 }
 function readOnlyCommand(call,state) {
  if(!state.qualifiedProcessFunctions.has(call.expression.getText(state.tree)))return false;
  const callee=ts.isPropertyAccessExpression(call.expression)?call.expression.expression:call.expression;if(ts.isIdentifier(callee)){if(declarationFor(callee,state))return false;for(let owner=callee.parent;owner;owner=owner.parent)if(ts.isFunctionLike(owner)&&owner.parameters?.some(parameter=>ts.isIdentifier(parameter.name)&&parameter.name.text===callee.text))return false;}
  const vectors=commandArgv(call.arguments[1],state);if(!vectors?.length)return false;
  return vectors.every(argv=>{let index=0;while(['-n','--namespace','--context','--kubeconfig'].includes(argv[index]))index+=2;const verb=argv[index++];if(['get','version'].includes(verb))return true;if(verb!=='exec')return false;const separator=argv.indexOf('--',index);if(separator<0)return false;const command=argv.slice(separator+1);if(command.length===2&&['postgres','redis-server'].includes(command[0])&&command[1]==='--version')return true;
   // This supported shell consumer only sets redis authentication and performs
   // CONFIG GET; it cannot admit another shell command by refreshing metadata.
   return command.length===3&&command[0]==='/bin/sh'&&command[1]==='-c'&&typeof command[2]==='string'&&/^if \[ -n "\$\{REDIS_PASSWORD_FILE:-\}" \]; then REDISCLI_AUTH="\$\(cat "\$REDIS_PASSWORD_FILE"\)"; else REDISCLI_AUTH="\$\{REDIS_PASSWORD:-\}"; fi; export REDISCLI_AUTH; exec redis-cli --json CONFIG GET [a-z-]+(?: [a-z-]+)*$/u.test(command[2]);});
 }
 function selectedCommand(contract,sink,state) {
  const call=sink.originalCall;if(!call)return false;
  let owner=call.parent;while(owner&&!ts.isFunctionLike(owner))owner=owner.parent;
  return contract.operations.some(operation=>operation.source===state.file&&operation.selectors?.some(selector=>
   selector.expression===call.getText(state.tree)&&(selector.line===undefined||selector.line===state.tree.getLineAndCharacterOfPosition(call.getStart(state.tree)).line+1)
   ||selector.symbol&&selector.symbol===owner?.name?.getText(state.tree)))&&readOnlyCommand(call,state);
 }
 function serialized(node,state,seen=new Set()){if(!node)return false;const key=state.file+':'+node.pos+':'+node.kind;if(seen.has(key))return false;seen=new Set([...seen,key]);if(ts.isIdentifier(node)){const value=declarationFor(node,state);if(value?.bindingExpression)return serialized(value.bindingExpression,state,seen);if(value)return serialized(value,state,seen);}if(ts.isCallExpression(node)&&['JSON.stringify','yaml.dump','YAML.stringify','yaml.stringify','dump'].includes(node.expression.getText(state.tree)))return true;if(ts.isFunctionLike(node)){if(ts.isArrowFunction(node)&&!ts.isBlock(node.body))return serialized(node.body,state,seen);let found=false;function returned(child){if(child!==node&&ts.isFunctionLike(child))return;if(ts.isReturnStatement(child)&&child.expression&&serialized(child.expression,state,seen))found=true;ts.forEachChild(child,returned);}returned(node);return found;}if(ts.isCallExpression(node)){if(ts.isIdentifier(node.expression)){const fn=symbol(state,node.expression.text);if(fn&&ts.isFunctionLike(fn.node))return serialized(fn.node,fn.state,seen);}return node.arguments.some(argument=>serialized(argument,state,seen));}let found=false;ts.forEachChild(node,child=>{if(serialized(child,state,seen))found=true;});return found;}
 function rawPublication(node,state,seen=new Set()) {
  if(!node)return false;if(node.bindingExpression)return rawPublication(node.bindingExpression,state,seen);if(node.tupleCollection||node.resolvedRole)return false;const key=state.file+':'+node.pos+':'+node.kind;if(seen.has(key))return false;seen=new Set([...seen,key]);
  if(ts.isIdentifier(node)){if(state.cliStrings.has(node.text))return true;const value=declarationFor(node,state);return value?rawPublication(value,state,seen):false;}
  if(ts.isCallExpression(node)&&node.expression.getText(state.tree)==='JSON.parse')return true;
  if(ts.isCallExpression(node)&&node.expression.getText(state.tree)==='String')return rawPublication(node.arguments[0],state,seen);
  if(ts.isTemplateExpression(node)&&(!node.head.text.trim()||/^[\s]*[\[{]|apiVersion:/u.test(node.head.text)))return true;
  if(ts.isStringLiteralLike(node)&&/^[\s]*[\[{]|(?:^|\n)apiVersion:/u.test(node.text))return true;
  return /^(?:process\.argv\[|process\.env(?:\.|\[))/u.test(node.getText(state.tree));
 }
 function unknownRawText(node,state,seen=new Set()) {
  if(!node)return false;if(node.bindingExpression)return unknownRawText(node.bindingExpression,state,seen);if(node.tupleCollection||node.resolvedRole)return false;const key=state.file+':'+node.pos+':'+node.kind;if(seen.has(key))return false;seen=new Set([...seen,key]);
  if(ts.isIdentifier(node)){if(state.cliStrings.has(node.text))return true;const value=declarationFor(node,state);return value?unknownRawText(value,state,seen):false;}
  if((ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node))&&/^(?:process\.argv\[|process\.env(?:\.|\[))/u.test(node.getText(state.tree)))return true;
  if(ts.isCallExpression(node)&&['JSON.stringify','yaml.dump','YAML.stringify','yaml.stringify','dump'].includes(node.expression.getText(state.tree)))return false;
  let found=false;ts.forEachChild(node,child=>{if(unknownRawText(child,state,seen))found=true;});return found;
 }
 function untrustedPublicationRoot(node,state,seen=new Set()) {
  if(!node)return false;if(node.bindingExpression)return untrustedPublicationRoot(node.bindingExpression,state,seen);if(node.tupleCollection)return untrustedPublicationRoot(node.tupleCollection,state,seen);if(node.resolvedRole)return false;const key=state.file+':'+node.pos+':'+node.kind;if(seen.has(key))return false;seen=new Set([...seen,key]);
  if(ts.isParenthesizedExpression(node)||ts.isAwaitExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node))return untrustedPublicationRoot(node.expression,state,seen);
  // A fixed envelope contains an unknown value without forwarding its root.
  if(ts.isObjectLiteralExpression(node))return node.properties.some(property=>ts.isSpreadAssignment(property)&&untrustedPublicationRoot(property.expression,state,seen));
  if(ts.isArrayLiteralExpression(node))return node.elements.some(element=>untrustedPublicationRoot(ts.isSpreadElement(element)?element.expression:element,state,seen));
  if(ts.isIdentifier(node)){if(bindingCustodyViolation(node,state,bindingDeclaration(node,state)?.end??0))return true;const value=declarationFor(node,state);if(value)return untrustedPublicationRoot(value,state,seen);for(let owner=node.parent;owner;owner=owner.parent)if(ts.isFunctionLike(owner)){const parameter=owner.parameters?.find(value=>value.name.getText(state.tree)===node.text),binding=parameter&&parameterBindings.get(parameter.name);if(binding)return untrustedPublicationRoot(binding.node,binding.state,seen);if(parameter)break;}return false;}
  if((ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node))&&/^(?:process\.argv\[|process\.env(?:\.|\[))/u.test(node.getText(state.tree)))return true;
  if(ts.isCallExpression(node)){
   const name=node.expression.getText(state.tree);
   if(ts.isPropertyAccessExpression(node.expression)&&['map','flatMap','filter','slice'].includes(node.expression.name.text)){const callback=node.arguments[0];if(callback&&(ts.isArrowFunction(callback)||ts.isFunctionExpression(callback))&&ts.isObjectLiteralExpression(callback.body)&&!callback.body.properties.some(ts.isSpreadAssignment))return false;return untrustedPublicationRoot(node.expression.expression,state,seen);}
   if(['JSON.stringify','JSON.parse','yaml.dump','yaml.load','YAML.stringify','YAML.parse','Buffer.from','String'].includes(name))return node.arguments.some(argument=>untrustedPublicationRoot(argument,state,seen));
   if(['path.resolve','path.join','path.dirname','path.basename'].includes(name))return false;if(ts.isIdentifier(node.expression)){const resolved=symbol(state,node.expression.text);if(resolved&&ts.isFunctionLike(resolved.node)){const previous=[];resolved.node.parameters?.forEach((parameter,index)=>{if(node.arguments[index]){previous.push([parameter.name,parameterBindings.get(parameter.name)]);parameterBindings.set(parameter.name,{node:node.arguments[index],state});}});let unsafe=false;function visit(child){if(child!==resolved.node&&ts.isFunctionLike(child))return;if(ts.isReturnStatement(child)&&child.expression&&untrustedPublicationRoot(child.expression,resolved.state,seen))unsafe=true;ts.forEachChild(child,visit);}if(ts.isArrowFunction(resolved.node)&&!ts.isBlock(resolved.node.body))unsafe=untrustedPublicationRoot(resolved.node.body,resolved.state,seen);else visit(resolved.node);for(const [key,value]of previous){if(value)parameterBindings.set(key,value);else parameterBindings.delete(key);}return unsafe;}}
   return node.arguments.some(argument=>untrustedPublicationRoot(argument,state,seen));
  }
  if(ts.isTemplateExpression(node)){if(node.head.text.trim()&&!/^[\s]*[\[{]|(?:^|\n)apiVersion:/u.test(node.head.text))return false;return node.templateSpans.some(span=>untrustedPublicationRoot(span.expression,state,seen));}
  if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken,ts.SyntaxKind.LessThanToken,ts.SyntaxKind.GreaterThanToken].includes(node.operatorToken.kind))return false;
  if(ts.isConditionalExpression(node))return untrustedPublicationRoot(node.whenTrue,state,seen)||untrustedPublicationRoot(node.whenFalse,state,seen);
  if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node))return untrustedPublicationRoot(node.expression,state,seen);
  return false;
 }
 function qualifiedFileRole(sink,argument,state) {
  const text=state.tree.getText();const compact=value=>value.replace(/\s+/gu,'');const expression=compact(argument.getText(state.tree));const destination=sink.arguments[0]?.getText(state.tree)??'';const compactDestination=compact(destination);
  if(sink.expression.getText(state.tree)==='process.stdout.write'&&ts.isCallExpression(argument)&&argument.expression.getText(state.tree)==='execFileSync'&&argument.arguments[0]?.getText(state.tree)==="'kubectl'"&&argument.arguments[1]?.getText(state.tree).replace(/\s+/gu,'')==="['apply','-f','-']")return {role:'non-api',basis:'kubectl-apply-cli-text-response',sinkContract:{destination:'stdout',expression}};
  function authority(file,requirements){if(!fs.existsSync(path.join(root,file)))return false;const bytes=fs.readFileSync(path.join(root,file),'utf8');if(!requirements.every(requirement=>requirement.test(bytes)))return false;dependencies.add(file);return true;}
  const role=basis=>({role:'non-api',basis,sinkContract:{destination,expression}});
  // Resolve a selected finite query before tracing its subprocess return.
  // An explicit input body still crosses the normal root qualification below.
  if(sink.expression.getText(state.tree)==='kubectl-request'&&argument===sink.originalCall){const contract=(roleRegistry.kubernetesCommandContracts??[]).find(contract=>contract.source===state.file&&selectedCommand(contract,sink,state)&&contract.operations.every(operationMatches));if(contract){dependencies.add('scripts/docs-api-producer-adapter-authorities.json');return {role:'non-api',basis:contract.basis,operationSources:contract.operations.map(operation=>operation.source)};}}
  if(untrustedPublicationRoot(argument,state)&&!runtimeScalarGuard(argument,state))return unknown(argument,state);
  // An exact operation receipt invalidates stale review; it cannot replace
  // positively resolved API identity with a diagnostic or native-file label.
  const adaptedIdentity=nativeRoleContracts.some(contract=>contract.source===state.file&&contract.role==='api-adapted'&&(sink.expression.getText(state.tree)==='kubectl-request'||contract.sink===sink.expression.getText(state.tree)&&contract.expression===argument.getText(state.tree)&&(contract.line===undefined||contract.line===state.tree.getLineAndCharacterOfPosition(sink.getStart(state.tree)).line+1))&&contract.operations.every(operationMatches));
  // Trace the published value through imports, constructors and callback
  // returns before consulting a native receipt. A refreshed dependency digest
  // records syntax; it cannot relabel an actual API root as a diagnostic.
  if(!adaptedIdentity){const actualRoot=shape(argument,state);if(actualRoot.role==='api')return actualRoot;if(importedConstructorGap(argument,state))return {...unknown(argument,state),basis:'unsupported-runtime-imported-constructor'};}
  if(sink.expression.getText(state.tree)==='native-file-writer-call'){const call=sink.originalCall.getText(state.tree);const contract=(roleRegistry.nativeFileWriterCallContracts??[]).find(c=>c.source===state.file&&c.call===call&&(c.line===undefined||c.line===state.tree.getLineAndCharacterOfPosition(sink.originalCall.getStart(state.tree)).line+1)&&c.operations.every(operationMatches));if(contract){dependencies.add('scripts/docs-api-producer-adapter-authorities.json');return {role:'non-api',basis:contract.basis,operationSources:contract.operations.map(o=>o.source)};}if(!sink.capability.operations.every(operationMatches))return unknown(argument,state);return shape(argument,state);}
  if(sink.expression.getText(state.tree)==='kubernetes-http-request')return unknown(argument,state);
  if(sink.expression.getText(state.tree)==='kubectl-request'){if(ts.isArrayLiteralExpression(sink.originalCall?.arguments[1])&&readOnlyCommand(sink.originalCall,state))return {role:'non-api',basis:'actual-call-read-only-kubernetes-argv'};const readContract=(roleRegistry.kubernetesCommandContracts??[]).find(contract=>contract.source===state.file&&selectedCommand(contract,sink,state)&&contract.operations.every(operationMatches));if(readContract){dependencies.add('scripts/docs-api-producer-adapter-authorities.json');return {role:'non-api',basis:readContract.basis,operationSources:readContract.operations.map(operation=>operation.source)};}const contract=nativeRoleContracts.find(contract=>contract.source===state.file&&contract.role==='api-adapted'&&contract.operations.every(operationMatches));if(contract){dependencies.add('scripts/docs-api-producer-adapter-authorities.json');return {role:'api-adapted',basis:'actual-adapted-kubectl-submission',operationSources:contract.operations.map(operation=>operation.source)};}return unknown(argument,state);}
  {for(const contract of nativeRoleContracts)if(contract.source===state.file&&contract.sink===sink.expression.getText(state.tree)&&contract.expression===argument.getText(state.tree)&&(contract.line===undefined||contract.line===state.tree.getLineAndCharacterOfPosition(sink.getStart(state.tree)).line+1)&&contract.operations.every(operationMatches)){dependencies.add('scripts/docs-api-producer-adapter-authorities.json');return {...role(contract.basis),role:contract.role??'non-api',operationSources:contract.operations.map(operation=>operation.source)};}}
  // Evidence descriptors establish the consumer role of the exact local file.
  // The bytes must originate in the guarded browser capability response.
  if(compactDestination==='path.join(workspace,invocation.workspace.evidence,reportFile)'&&expression==='`${JSON.stringify(report,null,2)}\\n`'&&/const report = \{ \.\.\.response, results: response\.results\.map/u.test(text)&&/context\.invoke\('browser\.axe'/u.test(text)&&/response\.schemaVersion !== 'browser-axe-result\.v1'/u.test(text)&&/const reportFile = 'axe-results\.json'/u.test(text)&&/type: 'test-report', file: reportFile, mediaType: 'application\/vnd\.kubeclaw\.axe\+json'/u.test(text)&&authority('skills/buster/engine/test-gates/browser-axe-runtime.ts',[/schemaVersion: 'browser-axe-result\.v1'/u]))return role('guarded-browser-capability-declared-test-report');
  if(compactDestination==='path.join(workspace,invocation.workspace.evidence,file)'&&expression==='`${JSON.stringify(result.report,null,2)}\\n`'&&/context\.invoke\('browser\.lighthouse'/u.test(text)&&/response\.schemaVersion !== 'browser-lighthouse-result\.v1'/u.test(text)&&/const reports = response\.results\.filter/u.test(text)&&/for \(const \[index, result\] of reports\.entries\(\)\)/u.test(text)&&/type: 'performance-report', file,/u.test(text)&&/mediaType: 'application\/vnd\.google\.lighthouse\+json'/u.test(text)&&authority('skills/buster/engine/test-gates/browser-lighthouse-runtime.ts',[/schemaVersion: 'browser-lighthouse-result\.v1'/u]))return role('guarded-browser-capability-declared-performance-report');
  if(compactDestination==='path.join(evidence,reportFile)'&&argument.getText(state.tree)==='reportBytes'&&/const reportBytes = Buffer\.from\(`\$\{JSON\.stringify\(report\)\}\\n`\)/u.test(text)&&/const report = object\(command\.report, 'PLAYWRIGHT_REPORT_INVALID'\)/u.test(text)&&/context\.invoke\('browser\.playwright'/u.test(text)&&/command\.schemaVersion !== 'browser-playwright-result\.v1'/u.test(text)&&/const reportFile = 'playwright-report\.json'/u.test(text)&&/type: 'test-report', file: reportFile, mediaType: 'application\/vnd\.kubeclaw\.playwright\+json'/u.test(text)&&authority('skills/buster/engine/test-gates/browser-playwright-runtime.ts',[/browser-playwright-result\.v1/u]))return role('guarded-browser-capability-declared-playwright-report');
  if(compactDestination==='file'&&argument.getText(state.tree)==='output'&&/const file = `releases\/values\/\$\{role\}\.yaml`/u.test(text)&&/const values = role === 'ops' \? \{\} : yaml\.load\(fs\.readFileSync\(`my-values\/\$\{role\}-values\.yaml`, 'utf8'\)\)/u.test(text)&&/yaml\.dump\(values, \{ lineWidth: 120, noRefs: true \}\)/u.test(text)&&authority('scripts/updates/deployment-release.mjs',[/baselineArgs\.push\('-f', path\.join\(root, `releases\/values\/\$\{role\}\.yaml`\)\)/u,/validateRenderedRelease\(baseline, rendered, receipt/u]))return role('original-values-projection-consumed-as-helm-values');
  if(compactDestination==='outputPath'&&argument.getText(state.tree)==='generated'&&/import \{ compile \} from 'json-schema-to-typescript'/u.test(text)&&/const generatedTypes = await compile\(wrapper, 'PluginSystemV2'/u.test(text)&&/const schema = JSON\.parse\(fs\.readFileSync\(schemaPath, 'utf8'\)\)/u.test(text)&&/const outputPath = '[^']+\.ts'/u.test(text)&&/const schemaPath = '[^']+\.schema\.json'/u.test(text)&&/export const CURRENT_RUNTIME_DISPATCH_PROFILE = Object\.freeze/u.test(text)&&/export const CURRENT_REVIEW_CACHE_PROFILE = Object\.freeze/u.test(text)&&authority('skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json',[/"\$schema"/u,/runtimeDispatchProfile/u,/reviewCacheProfile/u]))return role('source-json-schema-typescript-compilation-output');
  if(compactDestination==='target'&&argument.getText(state.tree)==='text'&&/const target = path\.join\(root, 'schemas', name\)/u.test(text)&&/const text = `\$\{JSON\.stringify\(schema, null, 2\)\}\\n`/u.test(text)&&/for \(const \[name, schema\] of additional\)/u.test(text)&&/\['review-bundle\.v2\.schema\.json', \{/u.test(text)&&/\['review-report\.v3\.schema\.json', report\]/u.test(text)&&/const report = JSON\.parse\(fs\.readFileSync\(path\.join\(root, 'schemas', 'review-report\.v2\.schema\.json'\), 'utf8'\)\)/u.test(text)&&authority('skills/nova/plugins/review/schemas/review-report.v2.schema.json',[/"\$schema"/u,/"\$defs"/u])&&authority('skills/nova/plugins/review/src/review-bundle-contract.ts',[/portableReviewBundleSchema/u,/additionalProperties/u]))return role('source-json-schema-version-projection-file');
  if(sink.expression.getText(state.tree)==='return'&&['JSON.stringify(schema.const)',"schema.enum.map((value)=>JSON.stringify(value)).join('|')"].includes(expression)&&/export function tsType\(schema = \{\}\)/u.test(text)&&/supported\(schema\)/u.test(text)&&authority('scripts/generate-telemetry-contracts.mjs',[/import \{[^}]*tsType[^}]*\} from '\.\/lib\/telemetry-type-generation\.mjs'/u,/output\('telemetry-types\.ts'/u,/output\('bundle-types\.ts'/u]))return role('source-schema-to-typescript-type-expression');
  if(sink.expression.getText(state.tree)==='return'&&expression==="JSON.stringify(Object.fromEntries(entries.sort(([a],[b])=>a.localeCompare(b))))"&&/const entries = checksumEntries\(files\)/u.test(text)&&/function checksumEntries\(files: Readonly<Record<string, string>>\)/u.test(text)&&/\^sha256:\[a-f0-9\]\{64\}\$/u.test(text)&&/PRISM_ARCHIVE_CHECKSUM_SET_INVALID/u.test(text)&&/filePath\(name\)/u.test(text)&&/baselineChecksumText/u.test(text))return role('validated-file-digest-checksum-map-codec');
  if(compactDestination==='target'&&expression==='`${JSON.stringify(value,null,2)}\\n`'&&/function mutateJson\(relativePath, edit\)/u.test(text)&&/const target = path\.join\(temporaryRoot, relativePath\)/u.test(text)&&/const original = fs\.readFileSync\(target, 'utf8'\)/u.test(text)&&/const value = JSON\.parse\(original\)/u.test(text)&&/edit\(value\)/u.test(text)&&/return \(\) => fs\.writeFileSync\(target, original\)/u.test(text)&&/const generator = path\.join\(temporaryRoot, 'scripts\/docs-configuration-inventory\.mjs'\)/u.test(text)&&/spawnSync\(process\.execPath, \[generator/u.test(text)&&authority('scripts/docs-configuration-inventory.mjs',[/--check/u,/configuration/u]))return role('isolated-copy-documentation-drift-mutation-fixture');
  if(compactDestination==='mappingPath'&&expression==='`${JSON.stringify(mapping,null,2)}\\n`'&&/const mappingPath = path\.join\(isolatedSourceRoot, 'docs\/config\/platform-surface-map\.json'\)/u.test(text)&&/const mapping = JSON\.parse\(mappingBefore\)/u.test(text)&&/const digestBypass = runInventory\(isolatedSourceRoot, true\)/u.test(text)&&/assert\.notEqual\(digestBypass\.status, 0/u.test(text)&&/DOC_DRIFT_MAP_REVIEW/u.test(text)&&authority('scripts/docs-platform-surface-inventory.mjs',[/DOC_DRIFT_MAP_REVIEW/u,/platform-surface-map/u]))return role('isolated-documentation-review-map-rejection-fixture');
  if(compactDestination==='target'&&["`${original.replace(/\\s*$/,'')}\\n${text}\\n`","`${text.replace(/\\s*$/u,'')}\\n`"].includes(expression)&&/const target = path\.join\(temporaryRoot, relativePath\)/u.test(text)&&/const temporaryRoot = fs\.mkdtempSync/u.test(text)&&/const generator = path\.join\(temporaryRoot, 'scripts\/docs-configuration-inventory\.mjs'\)/u.test(text)&&/spawnSync\(process\.execPath, \[generator/u.test(text)&&authority('scripts/docs-configuration-inventory.mjs',[/--check/u,/configuration/u]))return role('isolated-copy-documentation-source-mutation-fixture');
  if(sink.expression.getText(state.tree)==='process.stdout.write'&&expression==='`${format(process.argv.slice(2))}\\n`'&&/`Active as of \$\{utcTime\(\)\} UTC`/u.test(text)&&/`Primary batches:/u.test(text)&&/`Actual concurrency:/u.test(text)&&/`Expansion \/ verification:/u.test(text)&&/`Tokens:/u.test(text)&&/`Recovery:/u.test(text)&&/`Resources:/u.test(text)&&/`Gateway:/u.test(text)&&/\]\.join\('\\n'\)/u.test(text)&&/repository-review-status\.mjs/u.test(text)&&authority('scripts/repository-review-status.mjs',[/repository-review-status\.v1/u,/process\.stdout\.write/u]))return role('original-human-status-text-layout-from-qualified-status-source');
  const authoredFile=sourcePath(sink.arguments[0],state)?.value;const relativeFile=authoredFile&&path.relative(root,path.resolve(root,authoredFile)).replaceAll(path.sep,'/');
  if(relativeFile&&/^docs\/site\/.*\.md$/u.test(relativeFile)&&authority('scripts/docs-publication.mjs',[/docs\/site/u,/markdown|Markdown/u]))return role('source-bound-reader-markdown-publication-file');
  if(sink.expression.getText(state.tree)==='return'&&['`${unitToken}.${unitDigest}.${statusCode(status)}.${commit.slice(0,12)}.json`','`${recordKey}.${gateToken}.${gateDigest}.log`'].includes(expression)&&/export function parityEvidence(?:Record|Output)Basename/u.test(text)&&/const unitToken = compactToken\(unitId, 20\)/u.test(text)&&/const recordKey = digest\(evidenceIdentity\(unitId, status, commit\)\)\.slice\(0, 16\)/u.test(text)&&/function compactToken/u.test(text)&&/\[\^a-z0-9\._-\]/u.test(text)&&/createHash\('sha256'\)\.update\(value\)\.digest\('hex'\)/u.test(text))return role('source-bounded-canonical-evidence-basename-format');
  let owner=argument.parent;while(owner&&!ts.isFunctionLike(owner))owner=owner.parent;
  if(sink.expression.getText(state.tree)==='return'&&owner&&canonicalOperation(owner,state))return role('canonical-serialization-utility-with-input-qualified-at-callers');
  if(sink.expression.getText(state.tree)==='return'&&owner?.name?.getText(state.tree)==='optionalJson'&&expression==="JSON.parse(fs.readFileSync(file,'utf8'))"&&/cause\.code === 'ENOENT'/u.test(text)&&/export function atomicJson\(file, value\)/u.test(text)&&/repository-review-supervisor-lease\.v1/u.test(text)&&authority('scripts/supervise-repository-review.mjs',[/optionalJson/u,/repository-review-status\.mjs/u]))return role('original-optional-supervisor-state-reader-contract');
  if(sink.expression.getText(state.tree)==='process.stdout.write'&&expression==='`${output}\\n`'&&/const output = path\.resolve\(process\.argv\[2\]\)/u.test(text)&&/execFileSync\('go', \['build', '-mod=readonly', '-trimpath', '-buildvcs=false', '-o', output, '\.'\]/u.test(text)&&/const cwd = path\.join\(repository, 'tools\/native-worker-nri'\)/u.test(text)&&authority('tools/native-worker-nri/go.mod',[/module/u]))return role('current-go-build-output-binary-path-diagnostic');
  if(['baselinePath','temporaryPath'].includes(compactDestination)&&/JSON\.stringify\((?:baseline|\{\.\.\.baseline,groups\})/u.test(expression)&&/const baseline = JSON\.parse\(baselineSource\)/u.test(text)&&/const baselineSource = fs\.readFileSync\(baselinePath, 'utf8'\)/u.test(text)&&/baseline\.groups/u.test(text)&&(/schema_version !== 'pipeline_lint_baseline\.v2'/u.test(text)||/report\.policy\?\.baseline_digest !== digest/u.test(text))&&(compactDestination!=='temporaryPath'||/fs\.renameSync\(temporaryPath, baselinePath\)/u.test(text))&&authority('skills/nova/plugins/lint/src/engine/lint-governance.ts',[/pipeline_lint_baseline\.v2/u,/baseline/u]))return role('validated-lint-baseline-local-config-rewrite');
  const file=sourcePath(sink.arguments[0],state)?.value;
  if(file&&['releases/runtime-code.json','releases/runtime-images.json'].includes(file)){const name=file.endsWith('runtime-code.json')?'code':'images';const validator=name==='code'?'validateCodeReceipt':'validateReleaseReceipt';if(expression===`JSON.stringify(${name},null,2)+'\\n'`&&new RegExp(`const ${name} = ${validator}\\(`,'u').test(text)&&authority(name==='code'?'scripts/updates/code-release.mjs':'scripts/updates/deployment-release.mjs',[/schemaVersion/u,name==='code'?/releases\/runtime-code\.json/u:/receipt/u]))return role('validated-selected-release-local-receipt');}
  if(compactDestination==='outputPath'&&expression==='`${JSON.stringify(signed,null,2)}\\n`'&&/const signed = attestProductionReceipt\(receipt, fs\.readFileSync\(keyPath\)\)/u.test(text)&&/validateProductionReceiptPayload\(receipt, \{ expectedRevision, expectedBusterRevision \}\)\.length > 0/u.test(text)&&/command === 'sign'/u.test(text)&&/function attestProductionReceipt/u.test(text)&&/production-receipt-attestation\.v1/u.test(text)&&/function verifyProductionReceipt/u.test(text))return role('validated-signed-operator-observation-artifact');
  return null;
 }
 return source=>{
 refreshObserverState();
 const state=module(source);const results=[];
 for(const sink of state.sinks) {
  const name=sink.expression.getText(state.tree);const argumentsToPublish=name==='fs.writeFileSync'||name==='writeFileSync'?sink.arguments.slice(1,2):sink.arguments;
  for(const argument of argumentsToPublish){const text=argument.getText(state.tree);if(name==='return'&&!serialized(argument,state)&&!rawPublication(argument,state))continue;
   const destination=(name==='fs.writeFileSync'||name==='writeFileSync')?sourcePath(sink.arguments[0],state):null;const classified=qualifiedFileRole(sink,argument,state)??(rawPublication(argument,state)&&unknownRawText(argument,state)?unknown(argument,state):shape(argument,state));const {properties,returns,choices,elements,...role}=classified;results.push({line:state.tree.getLineAndCharacterOfPosition(sink.getStart(state.tree)).line+1,sink:name,...role,dependencies:[...dependencies].sort()});
  }
 }
 return results;
 };
}
