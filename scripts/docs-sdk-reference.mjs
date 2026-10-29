#!/usr/bin/env node
/** Read-only product discovery. Writes only an explicit documentation staging directory. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {markdownAnchorEntries} from './lib/docs-markdown-anchors.mjs';
import {sdkSemantics, semanticSourceBindings} from './docs-sdk-semantics.mjs';

const sdkPath = 'skills/common/plugin-runtime/sdk';
const schemaPath = 'skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json';
const digest = value => createHash('sha256').update(value).digest('hex');
const sort = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const escapeCell = value => String(value).replaceAll('|','\\|').replaceAll('\n',' ');
const table = (headers,rows) => `| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${rows.map(row=>`| ${row.map(escapeCell).join(' | ')} |`).join('\n')}`;
const pointerToken = key => key.replaceAll('~','~0').replaceAll('/','~1');
const schemaKeywords = new Set(['$schema','$id','$ref','$defs','title','description','type','properties','required','additionalProperties','propertyNames','pattern','minLength','maxLength','minimum','maximum','minItems','maxItems','minProperties','maxProperties','items','uniqueItems','enum','const','oneOf','anyOf','allOf','if','then','not','format','default']);

export function schemaFacts(schema) {
  const result = [];
  function visit(node,pointer) {
    if (typeof node === 'boolean') { result.push({pointer,rule:node}); return; }
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error(`SDK_SCHEMA_UNSUPPORTED:${pointer}`);
    for (const key of Object.keys(node)) if (!schemaKeywords.has(key)) throw new Error(`SDK_SCHEMA_KEYWORD_UNSUPPORTED:${pointer}/${key}`);
    const rule = Object.fromEntries(Object.entries(node).filter(([key]) => !['$defs','properties','items','propertyNames','oneOf','anyOf','allOf','if','then','not'].includes(key)));
    result.push({pointer,rule});
    for (const key of ['$defs','properties']) if (node[key]) for (const [name,child] of Object.entries(node[key])) visit(child,`${pointer}/${key}/${pointerToken(name)}`);
    for (const key of ['items','propertyNames','if','then','not']) if (node[key] !== undefined) visit(node[key],`${pointer}/${key}`);
    for (const key of ['oneOf','anyOf','allOf']) if (node[key]) node[key].forEach((child,index)=>visit(child,`${pointer}/${key}/${index}`));
    if (node.additionalProperties && typeof node.additionalProperties === 'object') visit(node.additionalProperties,`${pointer}/additionalProperties`);
  }
  visit(schema,'#'); return result;
}

/** Uses the installed TypeScript compiler, never imports/executes SDK implementation. */
export function discoverSdkSurface({root}) {
  root = path.resolve(root);
  const require = createRequire(path.join(root,'package.json'));
  const ts = require('typescript');
  const directory = path.join(root,sdkPath);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  if (!manifest.exports || typeof manifest.exports !== 'object' || Array.isArray(manifest.exports)) throw new Error('SDK_EXPORT_MAP_UNSUPPORTED');
  const entries = Object.entries(manifest.exports).map(([entry,target]) => {
    if (typeof target !== 'string' || !target.startsWith('./src/') || !target.endsWith('.ts')) throw new Error(`SDK_ENTRYPOINT_UNSUPPORTED:${entry}`);
    const source = path.resolve(directory,target);
    if (!source.startsWith(`${directory}${path.sep}`)) throw new Error(`SDK_ENTRYPOINT_ESCAPE:${entry}`);
    return {entry,source};
  }).sort((a,b)=>sort(a.entry,b.entry));
  const configFile = path.join(directory,'tsconfig.build.json');
  const config = ts.readConfigFile(configFile,ts.sys.readFile);
  if (config.error) throw new Error(`SDK_COMPILER_CONFIG_INVALID:${ts.flattenDiagnosticMessageText(config.error.messageText,' ')}`);
  const parsed = ts.parseJsonConfigFileContent(config.config,ts.sys,directory);
  if (parsed.errors.length) throw new Error('SDK_COMPILER_CONFIG_INVALID:'+parsed.errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join(';'));
  const program = ts.createProgram({rootNames:[...new Set([...parsed.fileNames,...entries.map(x=>x.source)])],options:{...parsed.options,noEmit:true}});
  const checker = program.getTypeChecker();
  const errors = [...program.getSyntacticDiagnostics(),...program.getSemanticDiagnostics()].filter(x=>x.category===ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error('SDK_COMPILER_DIAGNOSTIC:'+errors.map(x=>`${x.file?path.relative(root,x.file.fileName):'config'}:${ts.flattenDiagnosticMessageText(x.messageText,' ')}`).join(';'));
  const location = node => { const sf=node.getSourceFile(); return {source:path.relative(root,sf.fileName).split(path.sep).join('/'),symbol:node.name?.getText(sf)??null,line:sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1,endLine:sf.getLineAndCharacterOfPosition(node.end).line+1}; };
  const formatFlags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope | ts.TypeFormatFlags.InTypeAlias;
  const result=[];
  for (const entry of entries) {
    const sf = program.getSourceFile(entry.source);
    const module = sf && checker.getSymbolAtLocation(sf);
    if (!module) throw new Error(`SDK_ENTRYPOINT_MISSING:${entry.entry}`);
    for (const exported of checker.getExportsOfModule(module).sort((a,b)=>sort(a.name,b.name))) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const declarations=symbol.declarations??[];
      if (!declarations.length) throw new Error(`SDK_EXPORT_WITHOUT_DECLARATION:${entry.entry}:${symbol.name}`);
      const allowed = declarations.every(x=>ts.isInterfaceDeclaration(x)||ts.isTypeAliasDeclaration(x)||ts.isFunctionDeclaration(x)||ts.isVariableDeclaration(x));
      if (!allowed) throw new Error(`SDK_DECLARATION_UNSUPPORTED:${entry.entry}:${symbol.name}:${declarations.map(x=>ts.SyntaxKind[x.kind]).join(',')}`);
      const declaration=declarations[0];
      const type=(symbol.flags & ts.SymbolFlags.Type) ? checker.getDeclaredTypeOfSymbol(symbol) : checker.getTypeOfSymbolAtLocation(symbol,declaration);
      const members=[];const referencedTypes=new Set();
      function visit(node,memberPath='') {
        if (ts.isTypeReferenceNode(node)) referencedTypes.add(node.typeName.getText());
        if (ts.isPropertySignature(node)||ts.isMethodSignature(node)||ts.isIndexSignatureDeclaration(node)) {
          const name=node.name?.getText()??'[index]';const current=memberPath?`${memberPath}.${name}`:name;
          members.push({path:current,optional:Boolean(node.questionToken),readonly:Boolean(node.modifiers?.some(x=>x.kind===ts.SyntaxKind.ReadonlyKeyword)),signature:node.getText(),...location(node)});
          if(node.type)visit(node.type,current);
          for(const parameter of node.parameters??[]) if(parameter.type)visit(parameter.type,`${current}(${parameter.name.getText()})`);
          return;
        }
        if (ts.isFunctionDeclaration(node)) { for(const parameter of node.parameters)if(parameter.type)visit(parameter.type,`argument:${parameter.name.getText()}`);if(node.type)visit(node.type,'return');return; }
        if (ts.isVariableDeclaration(node)) { if(node.type)visit(node.type); return; }
        ts.forEachChild(node,child=>visit(child,memberPath));
      }
      declarations.forEach(x=>visit(x));
      // Compiler-resolved members also include inheritance and Pick/intersection members.
      for (const member of ((symbol.flags&ts.SymbolFlags.Type) && !(type.flags&(ts.TypeFlags.StringLike|ts.TypeFlags.NumberLike|ts.TypeFlags.BooleanLike)) ? checker.getPropertiesOfType(type) : [])) {
        if (members.some(x=>x.path===member.name)) continue;
        const decl=member.declarations?.[0];
        if (!decl) throw new Error(`SDK_MEMBER_DECLARATION_UNSUPPORTED:${exported.name}:${member.name}`);
        const memberType=checker.getTypeOfSymbolAtLocation(member,decl);
        members.push({path:member.name,optional:Boolean(member.flags&ts.SymbolFlags.Optional),readonly:Boolean(decl.modifiers?.some(x=>x.kind===ts.SyntaxKind.ReadonlyKeyword)),signature:`${member.name}${member.flags&ts.SymbolFlags.Optional?'?':''}: ${checker.typeToString(memberType,decl,formatFlags)}`,...location(decl),inheritedOrResolved:true});
      }
      const signatures=checker.getSignaturesOfType(type,ts.SignatureKind.Call).map(x=>checker.signatureToString(x,declaration,formatFlags));
      const publicType=(symbol.flags&ts.SymbolFlags.Type)!==0;
      const unionVariants=(publicType&&(type.flags&ts.TypeFlags.Union)?type.types:[]).map(branch=>({signature:checker.typeToString(branch,declaration,formatFlags),members:checker.getPropertiesOfType(branch).map(member=>{const decl=member.declarations?.[0];if(!decl)throw new Error(`SDK_UNION_MEMBER_UNSUPPORTED:${exported.name}:${member.name}`);return {name:member.name,optional:Boolean(member.flags&ts.SymbolFlags.Optional),signature:checker.typeToString(checker.getTypeOfSymbolAtLocation(member,decl),decl,formatFlags),...location(decl)};})})).filter(branch=>branch.members.length);

      result.push({entrypoint:entry.entry,name:exported.name,kind:publicType?'type':ts.isFunctionDeclaration(declaration)?'function':'constant',declarationKinds:declarations.map(x=>ts.SyntaxKind[x.kind]),source:location(declaration),signature:signatures.length?signatures.join('\n'):checker.typeToString(type,declaration,formatFlags),members,unionVariants,referencedTypes:[...referencedTypes].sort(sort),declarations:declarations.map(x=>({...location(x),sourceDigest:digest(fs.readFileSync(x.getSourceFile().fileName))}))});
    }
  }
  // Finite compiler-resolved local type closure. Upstream utility/host APIs stay upstream.
  const localSupportSources=new Set([`${sdkPath}/src/runtime.ts`,`${sdkPath}/src/generated/contracts.ts`,'contracts/pipeline-test-gate/v1/src/types.ts']);
  const publicDeclarations=new Set(result.flatMap(item=>item.declarations.map(decl=>`${decl.source}#${decl.symbol}`)));
  const seen=new Set();const supportTypes=[];const queue=[];
  for(const item of result)for(const decl of item.declarations){const file=program.getSourceFile(path.join(root,decl.source));const node=file?.statements.find(x=>x.name?.text===decl.symbol)??file?.statements.flatMap(x=>ts.isVariableStatement(x)?[...x.declarationList.declarations]:[]).find(x=>x.name?.getText()===decl.symbol);if(node)queue.push(node);}
  while(queue.length){
    const node=queue.shift();const loc=location(node);const qualifiedName=`${loc.source}#${loc.symbol}`;
    if(seen.has(qualifiedName))continue;seen.add(qualifiedName);
    const referencedSupport=[];
    function reach(child){
      if(ts.isTypeReferenceNode(child)||ts.isExpressionWithTypeArguments(child)){
        const reference=ts.isTypeReferenceNode(child)?child.typeName:child.expression;
        let symbol=checker.getSymbolAtLocation(reference);if(symbol?.flags&ts.SymbolFlags.Alias)symbol=checker.getAliasedSymbol(symbol);
        for(const decl of symbol?.declarations??[]){if(ts.isTypeParameterDeclaration(decl))continue;const target=location(decl);if(!localSupportSources.has(target.source)){if(publicDeclarations.has(`${target.source}#${target.symbol}`))continue;if(target.source.startsWith('skills/')||target.source.startsWith('contracts/'))throw new Error(`SDK_SUPPORT_SOURCE_UNSUPPORTED:${target.source}:${target.symbol}`);continue;}
          if(!ts.isInterfaceDeclaration(decl)&&!ts.isTypeAliasDeclaration(decl))throw new Error(`SDK_SUPPORT_DECLARATION_UNSUPPORTED:${target.source}:${target.symbol}`);
          const key=`${target.source}#${target.symbol}`;referencedSupport.push(key);queue.push(decl);
        }
      }
      ts.forEachChild(child,reach);
    }
    reach(node);
    if(publicDeclarations.has(qualifiedName))continue;
    if(!localSupportSources.has(loc.source))throw new Error(`SDK_SUPPORT_SOURCE_UNSUPPORTED:${qualifiedName}`);
    const symbol=checker.getSymbolAtLocation(node.name);if(!symbol)throw new Error(`SDK_SUPPORT_SYMBOL_MISSING:${qualifiedName}`);
    const type=checker.getDeclaredTypeOfSymbol(symbol);
    const members=checker.getPropertiesOfType(type).filter(member=>member.declarations?.some(decl=>localSupportSources.has(location(decl).source))).map(member=>{const decl=member.declarations?.[0];if(!decl)throw new Error(`SDK_SUPPORT_MEMBER_UNSUPPORTED:${qualifiedName}:${member.name}`);return {name:member.name,optional:Boolean(member.flags&ts.SymbolFlags.Optional),readonly:Boolean(decl.modifiers?.some(x=>x.kind===ts.SyntaxKind.ReadonlyKeyword)),signature:checker.typeToString(checker.getTypeOfSymbolAtLocation(member,decl),decl,formatFlags),...location(decl)};});
    supportTypes.push({name:loc.symbol,qualifiedName,publicNamedExport:false,source:loc,signature:node.getText(),resolvedSignature:checker.typeToString(type,node,formatFlags),members,referencedSupport:[...new Set(referencedSupport)].sort(sort)});
  }
  supportTypes.sort((a,b)=>sort(a.qualifiedName,b.qualifiedName));
  return {package:manifest.name,private:manifest.private,compilerVersion:ts.version,entrypoints:entries.map(x=>({entrypoint:x.entry,source:path.relative(root,x.source)})),exports:result,supportTypes};
}

export function generateSdkReference({root,revision,repositoryUrl='https://github.com/datrab/kubeclaw',semantics=sdkSemantics,bindings=semanticSourceBindings}) {
  if (!/^[a-f0-9]{40}$/u.test(revision??'')) throw new Error('SDK_SOURCE_REVISION_REQUIRED');
  const surface=discoverSdkSurface({root});
  const actualNames=new Set(surface.exports.map(x=>x.name));
  const extra=Object.keys(semantics).filter(x=>!actualNames.has(x));
  const missing=surface.exports.filter(x=>!Object.hasOwn(semantics,x.name)||!Array.isArray(semantics[x.name])||semantics[x.name].length!==2||semantics[x.name].some(y=>typeof y!=='string'||!y.trim()));
  if(extra.length||missing.length)throw new Error(`SDK_SEMANTIC_COVERAGE_DRIFT:missing=${missing.map(x=>`${x.entrypoint}:${x.name}`).join(',')};removed=${extra.join(',')}`);
  for(const [source,expected] of Object.entries(bindings)) {
    if(!fs.existsSync(path.join(root,source))||digest(fs.readFileSync(path.join(root,source)))!==expected)throw new Error(`SDK_SEMANTIC_SOURCE_DRIFT:${source}:review scripts/docs-sdk-semantics.mjs and docs/site/reference/sdk.md; affected generated page docs/site/reference/sdk-exports.md; do not rebind without semantic review`);
  }
  const sdkSources=fs.readdirSync(path.join(root,sdkPath,'src'),{recursive:true}).filter(x=>x.endsWith('.ts')).map(x=>`${sdkPath}/src/${x.split(path.sep).join('/')}`);
  for(const source of [...new Set([...sdkSources,...surface.entrypoints.map(x=>x.source),`${sdkPath}/package.json`,`${sdkPath}/tsconfig.build.json`,schemaPath,'scripts/generate-plugin-sdk-types.mjs'])])if(!Object.hasOwn(bindings,source))throw new Error(`SDK_SEMANTIC_SOURCE_UNBOUND:${source}`);
  const schema=JSON.parse(fs.readFileSync(path.join(root,schemaPath),'utf8'));
  const require=createRequire(path.join(path.resolve(root),'package.json'));const ts=require('typescript');
  function owningFacts(source,owningSchema){
    const jsonTree=ts.parseJsonText(source,fs.readFileSync(path.join(root,source),'utf8'));const locations=new Map();
    function visit(node,pointer){
      locations.set(pointer,{source,symbol:pointer,line:jsonTree.getLineAndCharacterOfPosition(node.getStart(jsonTree)).line+1,endLine:jsonTree.getLineAndCharacterOfPosition(node.end).line+1});
      if(ts.isObjectLiteralExpression(node))for(const property of node.properties){if(!ts.isPropertyAssignment(property)||!ts.isStringLiteral(property.name))throw new Error(`SDK_SCHEMA_JSON_AST_UNSUPPORTED:${source}:${pointer}`);visit(property.initializer,`${pointer}/${pointerToken(property.name.text)}`);}
      else if(ts.isArrayLiteralExpression(node))node.elements.forEach((child,index)=>visit(child,`${pointer}/${index}`));
    }
    const expression=jsonTree.statements[0]?.expression;if(!expression)throw new Error(`SDK_SCHEMA_JSON_AST_UNSUPPORTED:${source}:#`);visit(expression,'#');
    return schemaFacts(owningSchema).map(fact=>({...fact,source:locations.get(fact.pointer)}));
  }
  const facts=owningFacts(schemaPath,schema);
  const callbackSchemaPath='contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json';
  let callbackContracts=null;
  if(surface.supportTypes.some(x=>x.source.source==='contracts/pipeline-test-gate/v1/src/types.ts')){
    if(!Object.hasOwn(bindings,callbackSchemaPath))throw new Error(`SDK_SEMANTIC_SOURCE_UNBOUND:${callbackSchemaPath}`);
    const owningSchema=JSON.parse(fs.readFileSync(path.join(root,callbackSchemaPath),'utf8'));
    const roots=['providerInvocation','providerResult','reportAdapterResult'];const reachable=new Set();const pending=[...roots];
    while(pending.length){const name=pending.shift();if(reachable.has(name))continue;if(!Object.hasOwn(owningSchema.$defs,name))throw new Error(`SDK_CALLBACK_SCHEMA_DEFINITION_MISSING:${name}`);reachable.add(name);
      function refs(value){if(!value||typeof value!=='object')return;if(typeof value.$ref==='string'){if(!/^#\/\$defs\/[^/]+$/u.test(value.$ref))throw new Error(`SDK_CALLBACK_SCHEMA_REFERENCE_UNSUPPORTED:${value.$ref}`);pending.push(value.$ref.slice('#/$defs/'.length));}for(const child of Object.values(value))refs(child);}refs(owningSchema.$defs[name]);
    }
    const definitions=[...reachable].sort(sort);
    // Apply keyword-domain checking only to the reachable KubeClaw callback boundary.
    const selected={$defs:Object.fromEntries(definitions.map(name=>[name,owningSchema.$defs[name]]))};
    const callbackFacts=owningFacts(callbackSchemaPath,selected).filter(fact=>fact.pointer!=='#');
    const validatorSource='contracts/pipeline-test-gate/v1/src/validation.ts';
    if(!Object.hasOwn(bindings,validatorSource))throw new Error(`SDK_SEMANTIC_SOURCE_UNBOUND:${validatorSource}`);
    callbackContracts={source:callbackSchemaPath,roots,definitions,schemaFacts:callbackFacts,validation:{source:{source:validatorSource,symbol:'reportAdapterResultErrors',line:100,endLine:145},consumerSemantics:"Owning validation first applies the selected JSON Schema without default insertion or coercion. providerInvocation and providerResult have no extra semantic branch in checkPipelineTestGateContract. reportAdapterResult additionally requires outcome counts to sum to total and unique case IDs. Complete cases require zero omittedCaseCount, exact total length and exact outcome counts. Truncated cases require positive omittedCaseCount, listed plus omitted equal total, and listed outcomes no greater than exact counts. Report and case findingsTruncated must be true exactly when omittedFindingCount is positive.\n\nBuster supplies adapter/sourceArtifact provenance before this validation. Failure returns errors from checkPipelineTestGateContract. `validatePipelineTestGateContract` throws PipelineTestGateContractError. Shape acceptance does not authorize provider execution."}};
  }
  if(callbackContracts){
    const e2eSource='contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json';
    if(!Object.hasOwn(bindings,e2eSource))throw new Error(`SDK_SEMANTIC_SOURCE_UNBOUND:${e2eSource}`);
    callbackContracts.providerDetails={selection:'Buster selects these extra rules for kubeclaw.playwright@1, or whenever providerDetails.schemaId is kubeclaw.e2e-result.v1. Other provider-specific details remain governed by their owning provider contract, not a universal E2E requirement.',source:{source:'contracts/pipeline-test-gate/v1/src/validation.ts',symbol:'validateE2eProviderDetails',line:56,endLine:69},consumerSemantics:"Require the exact E2E schema ID and SHA-256 of the owning schema bytes, then validate values against that schema. Total must equal passed plus failed plus skipped plus unexecuted and the number of test cases. IDs must be unique. The number of cases with each status must equal its count. Failure throws TEST_PROVIDER_E2E_DETAILS_INVALID.",schemaFacts:owningFacts(e2eSource,JSON.parse(fs.readFileSync(path.join(root,e2eSource),'utf8')))};
    callbackContracts.consumerValidation=[
      {source:{source:'skills/buster/engine/test-gates/runner.ts',symbol:'validateCounts / validateEvidenceDeclarations / validateProviderReports',line:326,endLine:373},consumerSemantics:"After providerResult schema validation, Buster requires total = passed + failed + skipped, and a passed outcome cannot have failed > 0. Evidence IDs and file paths must each be unique. `runner-log` is reserved. Evidence types must be registered. Report evidence IDs must be unique, report formats registered, and each report must refer to declared test-report evidence."},
      {source:{source:'skills/buster/engine/test-gates/runner.ts',symbol:'provider result admission',line:1224,endLine:1253},consumerSemantics:'Before admission, native JSON.stringify output must fit the configured provider-result UTF-8 byte budget. Buster applies schema, counts, selected details, evidence and report checks before freezing a clone. Artifact outputs must refer to declared evidence IDs. These runtime checks do not run merely because a callback has the TypeScript signature.'}
    ];
  }
  for(const item of surface.supportTypes){
    const callbackName=item.name.replace(/V1$/u,'');const definition=callbackName[0].toLowerCase()+callbackName.slice(1);
    const inlinePointers={PlanNodeKind:'#/$defs/providerInvocation/properties/nodeKind',ReportCaseOutcome:'#/$defs/reportCase/properties/outcome'};
    const pointer=item.source.source==='contracts/pipeline-test-gate/v1/src/types.ts'?(callbackContracts?.definitions.includes(definition)?`#/$defs/${definition}`:inlinePointers[item.name]):item.name==='CapabilityInvocation'?'#/$defs/capabilityInvocation':null;
    item.owningSchema=pointer?{source:item.source.source==='contracts/pipeline-test-gate/v1/src/types.ts'?callbackSchemaPath:schemaPath,pointer}:null;
    item.fieldConstraints=pointer?(item.owningSchema.source===callbackSchemaPath?callbackContracts.schemaFacts:facts).filter(fact=>fact.pointer===pointer||fact.pointer.startsWith(`${pointer}/`)):[];
  }
  const definitionFor=name=> name==='PluginManifest1'?'pluginManifest':name==='CURRENT_RUNTIME_DISPATCH_PROFILE'?'runtimeDispatchProfile':name==='CURRENT_REVIEW_CACHE_PROFILE'?'reviewCacheProfile':name[0].toLowerCase()+name.slice(1);
  const inventory={schemaVersion:'sdk-reference-inventory.v1',purpose:'Compiler-discovered public SDK facts and finite owning callback closure; consumer explanations are authored in the documentation scripts. Not content acceptance.',sourceRevision:revision,owner:'documentation automation',canonicalTarget:'docs/site/reference/sdk.md',generatedTarget:'docs/site/reference/sdk-exports.md',discoveryScope:{entrypoints:'This scope includes all exports in the SDK package-export map, with export-star and named export overrides. It includes no other exports.',parser:'Installed TypeScript compiler with SDK tsconfig.build.json; JSON Schema recursive keyword extraction with explicit unsupported-keyword failures.',sourceRoots:[`${sdkPath}/src`,`${sdkPath}/package.json`,`${sdkPath}/tsconfig.build.json`,schemaPath,'scripts/generate-plugin-sdk-types.mjs',...(callbackContracts?[callbackSchemaPath,'contracts/pipeline-test-gate/v1/src/types.ts','contracts/pipeline-test-gate/v1/src/validation.ts','contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json']:[])],exclusions:[{surface:'Internal types outside the public reachable closure',reason:'Not selected by this SDK contract boundary. All compiler-resolved reachable KubeClaw support declarations are inventoried separately without adding named exports; newly reached unsupported local source shapes fail explicitly.'},{surface:'Node, TypeScript and dependency implementation internals',reason:'Referenced types and relevant selected consumers are linked; SDK enumeration does not duplicate all upstream APIs.'}],check:'generateSdkReference / checkSdkReference and scripts/docs-sdk-reference.mjs --check',readerTask:'Select an SDK entrypoint. Use its consumer meaning. Obey all its field/codec rules. Use the bounded pure JSON example.'},package:surface.package,private:surface.private,compilerVersion:surface.compilerVersion,entrypoints:surface.entrypoints,sourceDependencies:Object.entries(bindings).map(([source,sourceDigest])=>({source,sourceDigest})),exports:surface.exports.map(item=>{
    const key=definitionFor(item.name);const schemaPointer=Object.hasOwn(schema.$defs,key)?`#/$defs/${key}`:null;
    return {...item,sourceId:`sdk:${item.entrypoint}:${item.name}`,canonicalPage:'docs/site/reference/sdk.md',generatedPage:'docs/site/reference/sdk-exports.md',owner:'documentation automation',schemaPointers:schemaPointer?[schemaPointer]:[],fieldConstraints:schemaPointer?facts.filter(x=>x.pointer===schemaPointer||x.pointer.startsWith(`${schemaPointer}/`)):[],semanticAnnotationSource:{source:'scripts/docs-sdk-semantics.mjs',symbol:`sdkSemantics.${item.name}`},consumerSemantics:semantics[item.name][0],example:semantics[item.name][1],exampleStatus:'source-only; illustrative fragment; not executed'};
  }),supportTypes:surface.supportTypes,callbackContracts,schemaFacts:facts};
  const sourceLink = location => `[${location.symbol??location.source}](${repositoryUrl}/blob/${revision}/${location.source}#L${location.line}-L${location.endLine})`;
  const content=['# SDK export and contract inventory','', 'Status: generated current SDK reference', 'Audience: plugin author, runtime maintainer', 'Owner: documentation automation', `Evidence: ${Object.keys(bindings).join('; ')}`, 'Applies to: current private workspace SDK entrypoints and plugin-system v2 schema', `Last verified: generated from source revision ${revision}`, 'Generator: scripts/docs-sdk-reference.mjs', '', '<!-- BEGIN GENERATED: source-backed reference -->', '', 'Mechanical signatures and field rules come from the TypeScript compiler and the owning JSON Schema. Consumer explanations are authored separately. A TypeScript declaration does not execute validation. Use the [SDK reference](sdk.md) for the request path, compatibility rules, JSON domain and error handling.','','Every example below is a source-only fragment. It is not a claim of activation, external effects, live deployment or successful end-to-end execution. Supply the variables shown in each fragment from the owning runtime or contract.','','Source revision: `'+revision+'`. Package: `'+surface.package+'` (private workspace package).','','## Entrypoints','',table(['Import','Source'],surface.entrypoints.map(x=>[x.entrypoint==='.'?'`@kubeclaw/plugin-sdk`':'`@kubeclaw/plugin-sdk/testing`',sourceLink({...x,line:1,endLine:fs.readFileSync(path.join(root,x.source),'utf8').split('\n').length-1,symbol:x.entrypoint})])),''];
  // Derive every named-entry destination using the same heading rules as refs checks.
  const exportAnchors=markdownAnchorEntries([...content,'## Export index',...inventory.exports.map(item=>`## ${item.name}`)].join('\n')).slice(-inventory.exports.length).map(entry=>entry.anchor);
  content.push('## Export index','', "Select an exact name below. Every named export from the discovered package entrypoints is included. Support declarations remain in their separate section. Examples in each entry are source-only fragments. An own property belongs directly to an object, not its prototype. A dense array has an own property at each index from zero to length minus one. A truthy value is a value that JavaScript treats as true in a condition.",'',table(['Export','Import','Kind'],inventory.exports.map((item,index)=>['[`'+item.name+'`](#'+exportAnchors[index]+')',item.entrypoint==='.'?'`@kubeclaw/plugin-sdk`':'`@kubeclaw/plugin-sdk/testing`',item.kind])),'');
  for(const item of inventory.exports){
    content.push(`## ${item.name}`, '', `Import: \`${item.entrypoint==='.'?'@kubeclaw/plugin-sdk':'@kubeclaw/plugin-sdk/testing'}\`. Kind: ${item.kind}.`, '', item.consumerSemantics,'', '```ts',item.signature,'```','', '**Consumer example — source-only fragment:**','','```ts',item.example,'```','','Source: '+item.declarations.map(sourceLink).join(', ')+'.');
    if(item.members.length)content.push('',table(['Member path','Optional','Readonly','TypeScript shape','Source'],item.members.map(x=>[x.path,x.optional?'yes':'no',x.readonly?'yes':'no','`'+x.signature+'`',sourceLink(x)])));
    if(item.unionVariants.length)content.push('', '**Union variants — read required/optional members within each branch, not only the merged member list:**','',...item.unionVariants.flatMap((branch,index)=>[`Branch ${index+1}:`, '', '```typescript', branch.signature, '```', '',table(['Member','Optional in this branch','Type','Source'],branch.members.map(x=>[x.name,x.optional?'yes':'no','`'+x.signature+'`',sourceLink(x)])), '']));
    if(item.schemaPointers.length)content.push('',`Owning schema: [${item.schemaPointers[0]}](${repositoryUrl}/blob/${revision}/${schemaPath}). The rules below are schema facts, not checks performed by this TypeScript type.`,'',table(['JSON pointer','Declared rules','Source'],item.fieldConstraints.map(x=>[x.pointer,'`'+JSON.stringify(x.rule)+'`',sourceLink(x.source)])));
    else content.push('','No one-to-one plugin-system schema definition owns this export. Its declaration and implementation set its local behavior.');
    if(item.referencedTypes.length)content.push('','Referenced types:', '', ...item.referencedTypes.map(x=>'- `'+x+'`'));
    content.push('');
  }
  content.push('## Reachable support types','',"These finite KubeClaw-owned declarations are reachable through the public callback and wrapper types. Source-qualified names distinguish identically named declarations. They are not additional named SDK exports. Use qualified references to other support rows or the exact-source public export above. Upstream Node and TypeScript utility APIs are not reproduced.",'');
  for(const item of inventory.supportTypes){content.push(`### ${item.name} — ${item.source.source}`,'',`Qualified declaration: \`${item.qualifiedName}\`.`, '',sourceLink(item.source),'','```ts',item.signature,'```','');if(item.members.length)content.push(table(['Resolved member','Optional','Readonly','Type','Source'],item.members.map(x=>[x.name,x.optional?'yes':'no',x.readonly?'yes':'no','`'+x.signature+'`',sourceLink(x)])),'');if(item.owningSchema)content.push('Owning schema: `'+item.owningSchema.pointer+'` in ['+item.owningSchema.source+']('+repositoryUrl+'/blob/'+revision+'/'+item.owningSchema.source+'). Read its rows in the owning rule index below.','');else content.push('No one-to-one owning schema definition: read this TypeScript support declaration and the schema at its consuming field. For example, ProviderResultV1 narrows TestOutcome with Exclude<TestOutcome, null>.','');if(item.referencedSupport.length)content.push('Qualified local references: '+item.referencedSupport.map(x=>'`'+x+'`').join(', ')+'.','');}
  if(callbackContracts)content.push('## Callback contract rules','', 'These owning test-gate schemas cover provider invocation, provider result and the assembled report result. Callback ReportAdapterOutput selects only its declared fields; Buster adds adapter and sourceArtifact. `$ref` targets are included recursively, including JSON value recursion. Parent required arrays, unions, defaults/absence and bounds apply independently of TypeScript. JSON Schema string lengths measure Unicode code points.','',callbackContracts.validation.consumerSemantics,'','Semantic validator: '+sourceLink(callbackContracts.validation.source)+'.','',table(['Owning JSON pointer','Declared rules','Source'],callbackContracts.schemaFacts.map(x=>[x.pointer,'`'+JSON.stringify(x.rule)+'`',sourceLink(x.source)])),'');
  if(callbackContracts){
    content.push('### Provider result admission','');
    for(const item of callbackContracts.consumerValidation)content.push(item.consumerSemantics,'','Source: '+sourceLink(item.source)+'.','');
    content.push('### Selected provider-details rules','',callbackContracts.providerDetails.selection,'',callbackContracts.providerDetails.consumerSemantics,'','Source: '+sourceLink(callbackContracts.providerDetails.source)+'.','',table(['Owning E2E JSON pointer','Declared rules','Source'],callbackContracts.providerDetails.schemaFacts.map(x=>[x.pointer,'`'+JSON.stringify(x.rule)+'`',sourceLink(x.source)])),'');
  }
  content.push('## Complete schema rule index','',"This index includes recursive property, item, alternative and conditional rules. A `$ref` points to another row. Read the two rules. An absent `default` is not an SDK default. Parent `required` arrays determine which properties must be present. Conditional `if`/`then` and `not` rows retain rules that TypeScript cannot express.",'',''+table(['JSON pointer','Declared rules','Source'],facts.map(x=>[x.pointer,'`'+JSON.stringify(x.rule)+'`',sourceLink(x.source)])),'');
  content.push('<!-- END GENERATED -->', '');
  return {inventory,generatedMarkdown:content.join('\n')};
}

export function checkSdkReference({root,revision,inventoryPath,markdownPath,repositoryUrl}) {
  const result=generateSdkReference({root,revision,repositoryUrl});
  for(const [file,expected]of [[inventoryPath,JSON.stringify(result.inventory,null,2)+'\n'],[markdownPath,result.generatedMarkdown]]){
    if(!file||!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==expected)throw new Error(`SDK_REFERENCE_OUTPUT_DRIFT:${file??'missing target'}`);
  }return result;
}


/** Resolve nonexistent children through their nearest physical existing ancestor. */
function physicalStagePath(output) {
  let ancestor=path.resolve(output);const children=[];
  while (true) {
    try { fs.lstatSync(ancestor);break; }
    catch(error) { if(error.code!=='ENOENT')throw error;const parent=path.dirname(ancestor);if(parent===ancestor)throw error;children.unshift(path.basename(ancestor));ancestor=parent; }
  }
  const physical=fs.realpathSync(ancestor);
  if(!fs.statSync(physical).isDirectory())throw new Error('SDK_REFERENCE_STAGE_UNSAFE_DIRECTORY');
  return path.join(physical,...children);
}

/** Fresh, private staging only: never reuse or overwrite existing output paths. */
export function stageSdkReference({root,output,render}) {
  if(!output)throw new Error('SDK_REFERENCE_EXPLICIT_STAGE_OUTPUT_REQUIRED');
  const productRoot=fs.realpathSync(root);
  const target=physicalStagePath(output);
  const relative=path.relative(productRoot,target);
  if(relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)))throw new Error('SDK_REFERENCE_STAGE_MUST_BE_OUTSIDE_PRODUCT_WORKTREE');
  // lstat catches dangling symlinks too. Validate both names before rendering/writes.
  const names=['sdk-reference.json','sdk-exports.md'];
  for(const name of names){
    try { fs.lstatSync(path.join(target,name)); }
    catch(error) { if(error.code==='ENOENT')continue;throw error; }
    throw new Error(`SDK_REFERENCE_STAGE_OUTPUT_EXISTS:${name}`);
  }
  let exists=false;
  try { fs.lstatSync(target);exists=true; }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  if(exists)throw new Error('SDK_REFERENCE_STAGE_MUST_BE_FRESH');
  // Exclusive mkdir rejects existing directories, symlinks and unsafe file types.
  // The parent must already exist; no recursive mkdir through unresolved children.
  fs.mkdirSync(target,{mode:0o700});
  const descriptors=[];
  try {
    for(const name of names)descriptors.push(fs.openSync(path.join(target,name),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600));
    const result=render();
    const texts=[JSON.stringify(result.inventory,null,2)+'\n',result.generatedMarkdown];
    texts.forEach((text,index)=>fs.writeFileSync(descriptors[index],text));
    return {...result,stagePath:target};
  } finally { for(const descriptor of descriptors)fs.closeSync(descriptor); }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  const root=path.resolve(value('--root')??process.cwd());
  const revision=value('--revision')??JSON.parse(fs.readFileSync(path.join(root,'docs/generated/inventory/documentation-source-revision.json'),'utf8')).revision;
  if(args.includes('--check')){const result=checkSdkReference({root,revision,inventoryPath:value('--inventory')??path.join(root,'docs/generated/inventory/sdk-reference.json'),markdownPath:value('--markdown')??path.join(root,'docs/site/reference/sdk-exports.md'),repositoryUrl:value('--repository-url')});console.log(`SDK reference check: ${result.inventory.exports.length} exports`);}
  else {const result=stageSdkReference({root,output:value('--stage-output'),render:()=>generateSdkReference({root,revision,repositoryUrl:value('--repository-url')})});console.log(`SDK reference staged: ${result.inventory.exports.length} exports at ${result.stagePath}`);}
}
