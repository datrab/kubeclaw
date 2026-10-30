/** Unadopted, pure source-reference composition. No execution or acceptance authority. */
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const families=['commands','subcommands','options','positionals','defaults','exits','branches','delegations','guards','functions','sourceBindings','unresolved','adapterLimits'];
const headings={commands:'Command selectors',subcommands:'Subcommand selectors',options:'Option declarations and argument tests',positionals:'Positional access and operand flow',defaults:'Defaults and source value selection',exits:'Exit, return and propagation rules',branches:'Conditional control',delegations:'Callers, receivers and upstream delegation',functions:'Function and receiver declarations',guards:'Entry and execution guards',sourceBindings:'Physical source bindings',unresolved:'Unfulfilled source obligations',adapterLimits:'Adapter limits'};
function walk(v,fn,path=[]){fn(v,path);if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))walk(x,fn,[...path,k]);}
function map(v,fn,path=[]){const x=fn(v,path);if(x!==v)return x;if(Array.isArray(v))return v.map((x,i)=>map(x,fn,[...path,String(i)]));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,map(x,fn,[...path,k])]));return v;}
/** Shared long source expressions are values, not summarized ASTs. Pointer locations
 * make expansion unambiguous even when original data resembles a reference object. */
export function shareExpressions(model){
 const counts=new Map();walk(model,v=>{if(typeof v==='string'&&v.length>=200)counts.set(v,(counts.get(v)||0)+1)});
 const expressions={},references=[];
 const data=map(model,(v,p)=>{if(typeof v!=='string'||(counts.get(v)||0)<2)return v;const id=hash(v);if(expressions[id]!==undefined&&expressions[id]!==v)throw Error('Expression hash collision');expressions[id]=v;references.push({path:p,id});return null});
 return {format:'native-source-expression-table.v1',expressions,references,data};
}
export function expandExpressions(shared){
 const result=structuredClone(shared.data);for(const {path,id}of shared.references){if(!Object.hasOwn(shared.expressions,id))throw Error('Missing source expression '+id);if(hash(shared.expressions[id])!==id)throw Error('Source expression binding mismatch');let o=result;for(const k of path.slice(0,-1))o=o[k];if(o[path.at(-1)]!==null)throw Error('Reference target is not empty');o[path.at(-1)]=shared.expressions[id]}return result;
}
function range(f,row){if(f?.sourceRange){const r=row.sourceBindings?.find(r=>r.id===f.sourceRange);if(r)return {sourcePath:f.sourcePath??r.sourcePath??row.path,line:r.startLine,endLine:r.endLine,startByte:r.startByte,endByte:r.endByte,expression:r.exact}}return {sourcePath:f?.sourcePath??row.path,line:f?.line,endLine:f?.endLine,startByte:f?.startByte,endByte:f?.endByte,expression:f?.expression};}
function boundary(o){return {kind:o?.kind??'unclassified',supportState:o?.supportState??'not established',statement:o?.boundary??'No invocation support inferred.',publicationRole:['source-only-unqualified','private-parser-helper','delegated-receiver'].includes(o?.kind)?'source declaration, not an independent supported invocation':o?.kind==='upstream-wrapper'?'wrapper-owned syntax only; upstream syntax belongs to its receiver':'retain declared ownership limits; no execution grant'};}
export function composeCliReference(model,{repositoryURL='https://github.com/datrab/kubeclaw'}={}){
 if(!model?.sourceRevision||!Array.isArray(model.sources))throw Error('Source-bound native model required');
 const shared=shareExpressions(model), missing=[];
 const sources=model.sources.map((row,i)=>{
  const groups={};for(const family of families){if(!row[family])continue;groups[family]=row[family].map((fact,j)=>({id:`s${i}-${family}-${j}`,modelPath:['sources',String(i),family,String(j)],scope:fact.scope??null,kind:fact.kind??fact.role??null,range:Object.fromEntries(Object.entries(range(fact,row)).filter(([k])=>k!=='expression'))}));}
  const pending=(row.unresolved||[]).map(x=>({source:row.path,...x}));missing.push(...pending);
  return {id:`s${i}`,path:row.path,language:row.language,sourceBinding:row.sourceBinding,boundary:boundary(row.ownership),groups,unfulfilled:pending};
 });
 // Native declaration edges only. No path-literal, basename or package-script token
 // is promoted into a resolved invocation edge.
 return {schemaVersion:'native-cli-reader-composition.v1',sourceRevision:model.sourceRevision,repositoryURL,authority:model.authority,
  acceptance:'NOT_ADJUDICATED: composition retains unresolved semantic duties; no Source/Reader/Quality verdict.',
  sourceModel:shared,sources,manifestInterfaces:model.manifestInterfaces,ownership:model.ownership,dependencyBindings:model.dependencyBindings,
  unfulfilledOriginalObligations:missing,
  compositionLimits:[
   'AST access is not automatically an accepted command/operand/default. Scope and branch/caller conditions must be adjudicated from the exact expression.',
   'No guessed direct launch from path literals, generated filenames, basename similarity or package script membership. Caller and source-first inventory join remains separate.',
   'Unevaluated values and external/framework status behavior remain symbolic unless an owned, bound source contract supplies them.',
   'Generic adapter composition warnings are retained pending concrete semantic qualification; their count is not a count of distinct missing original duties and is not converted to PASS.',
   'This reader is a navigable declaration index, not the missing independent complete command/caller/default/exit adjudication.'
  ]};
}
const esc=s=>String(s).replaceAll('&','&amp;').replace(/[\\`*_{}\[\]<>|]/g,'\\$&').replace(/\r?\n/g,' ');
const fence=s=>{const runs=String(s).match(/`+/g)||[];const ticks='`'.repeat(Math.max(3,...runs.map(x=>x.length+1)));return `${ticks}text\n${s}\n${ticks}`};
function link(c,s,r){const p=(r.sourcePath??s.path).split('/').map(encodeURIComponent).join('/');return `${c.repositoryURL.replace(/\/$/,'')}/blob/${encodeURIComponent(c.sourceRevision)}/${p}${r.line?`#L${r.line}${r.endLine&&r.endLine!==r.line?`-L${r.endLine}`:''}`:''}`}
function readable(v){const t=typeof v==='string'?v:JSON.stringify(v);return t.length<=240?t:'Exact value retained at this fact’s companion-native modelPath (not repeatedly inlined)'}
function describe(f){const keys=['kind','role','scope','name','parameter','bindingExpression','assignment','selectorRole','patterns','parentModes','operatorSource','valueExpression','calleeExpression','target','channel','explicitPassThrough','semantics','statusRule','ownerBoundary','selectionBoundary'];return keys.filter(k=>f[k]!==undefined).map(k=>`${k}: ${readable(f[k])}`).join('; ')}
export function renderCliReference(c,{sourceIndices=null,includePackages=true,expandedModel=null}={}){
 const model=expandedModel??expandExpressions(c.sourceModel);const out=['# Native CLI source reference','',`Revision: ${c.sourceRevision}`,'',c.acceptance,'','Read-only source declarations. Expressions are unevaluated; source-only/private/delegated membership is not supported invocation guidance. Full facts, nested caller conditions, source ranges and dependency bindings remain in the companion native composition artifact. No complete acceptance is inferred from this index.','','## Source navigation',''];
 for(const s of c.sources.filter((_,i)=>!sourceIndices||sourceIndices.includes(i)))out.push(`- [${esc(s.path)}](#${s.id}) — ${esc(s.boundary.kind)}`);
 out.push('','## Package declarations','','Package declarations retain cwd and lifecycle; their presence alone does not establish supported launch or resolve shell receivers.','');
 for(const m of includePackages?(model.manifestInterfaces||[]):[])out.push(`- ${esc(m.manifest)} · ${esc(m.name)} · cwd ${esc(m.cwd)} · ${esc(m.supportBoundary)}\n\n${fence(JSON.stringify(m,null,2))}\n`);
 for(let i=0;i<c.sources.length;i++){
  if(sourceIndices&&!sourceIndices.includes(i))continue;const s=c.sources[i],row=model.sources[i];out.push('',`<a id="${s.id}"></a>`,`## ${esc(s.path)}`,'',`[Bound source](${link(c,s,{})}) · SHA-256 ${s.sourceBinding.sha256}`,'',`Ownership: **${esc(s.boundary.kind)}**. ${esc(s.boundary.statement)} ${esc(s.boundary.publicationRole)}`,'');
  for(const family of families){const entries=s.groups[family];if(!entries?.length||family==='sourceBindings')continue;out.push(`### ${headings[family]}`,'');
   const sites=new Map();for(let j=0;j<entries.length;j++){const e=entries[j],k=JSON.stringify([e.scope,e.kind,e.range]);if(!sites.has(k))sites.set(k,[]);sites.get(k).push(j)}
   for(const variants of sites.values()){
    const j=variants[0],e=entries[j],f=row[family][j],r=range(f,row);
    if(variants.length>1){out.push(`- [${esc(e.kind||family)} · ${esc(e.scope||'source')}](${link(c,s,r)}) — ${variants.length} caller/control variants at this physical declaration. Exact per-variant selector/default/exit/guard semantics remain separately indexed in companion sources[${i}].${family}; no representative variant is substituted for them.`);if(r.expression&&r.expression.length<=200)out.push(`\n${fence(r.expression)}\n`);continue;}
    out.push(`- <a id="${e.id}"></a>[${esc(e.kind||family)}${e.scope?` · ${esc(e.scope)}`:''}](${link(c,s,r)}) — ${esc(describe(f)||JSON.stringify(f))}`);
    // Long expressions remain exact at the bound source span and in native JSON;
    // neither elision nor a snippet is substituted as the semantic source fact.
    if(r.expression&&r.expression.length<=200)out.push(`\n${fence(r.expression)}\n`);
    else if(r.expression)out.push(`  Exact expression: bound source bytes ${r.startByte}–${r.endByte}; retained in companion native facts (not inlined repeatedly).`);
    const conditions=f.conditions??f.guards;if(conditions?.length)out.push(`  Conditions/guards: ${esc(readable(conditions))}`);
    for(const k of ['selector','fallback','selectedInput','command','arguments','argumentKinds','definitionRanges'])if(f[k]!==undefined)out.push(`  ${k}: ${esc(readable(f[k]))}`);
   }out.push('');
  }
 }
 out.push('## Unfulfilled original duties','',...c.compositionLimits.map(x=>`- ${x}`),'',`Retained per-source unresolved obligations: ${c.unfulfilledOriginalObligations.length}. This is an observed count, not acceptance.`, '');return out.join('\n');
}

export function renderCliReferenceIndex(c){
 const out=['# CLI source reference','',`Source revision: ${c.sourceRevision}`,'',c.acceptance,'','These are source declarations, not executable run instructions. Source-only/private/delegated and upstream ownership boundaries remain binding. Each source page retains command selectors, defaults, operands, guard/control and exit/status declarations; complete machine facts are in the companion native composition.','', '## Source and ownership navigation',''];
 for(const s of c.sources)out.push(`- [${esc(s.path)}](native-cli-reader/${s.id}.md) — **${esc(s.boundary.kind)}**; ${esc(s.boundary.statement)}`);
 out.push('','## Remaining original obligations','',...c.compositionLimits.map(x=>`- ${x}`));return out.join('\n')+'\n';
}

/** Native compiler is supplied by the coordinator's already pinned prerequisite.
 * Parse exact source expressions only; do not resolve/evaluate an environment. */
export function translateTypedContracts(model,ts){
 if(!ts?.createSourceFile)throw Error('Bound native TypeScript compiler prerequisite required');
 const issues=[],sources=[];
 const parse=(text,statement=false)=>{const prefix=statement?'':'const __source_value = (';const sf=ts.createSourceFile('source-expression.ts',prefix+text+(statement?'':');'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);if(sf.parseDiagnostics.length)return {error:sf.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; ')};return {sf,node:statement?sf.statements[0]:sf.statements[0]?.declarationList?.declarations[0]?.initializer?.expression};};
 const predicates=f=>(f.conditions??[]).slice().reverse().map(c=>({...c,relation:c.role==='else'?'else-of':c.role==='then'?'then-of':['case','default'].includes(c.role)?'source-bound-switch-selection-and-fallthrough':'condition-or-init',expression:c.conditionExpression,sourceLine:c.line}));
 function selection(n,sf){if(!n)return null;if(ts.isParenthesizedExpression(n))return selection(n.expression,sf);if(ts.isBinaryExpression(n)&&[ts.SyntaxKind.QuestionQuestionToken,ts.SyntaxKind.BarBarToken].includes(n.operatorToken.kind))return {kind:n.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken?'nullish-fallback':'falsy-fallback',primary:selection(n.left,sf),fallback:selection(n.right,sf),semantics:n.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken?'Fallback only when left is null or undefined.':'Fallback when left is falsy; distinct from nullish fallback.'};if(ts.isConditionalExpression(n))return {kind:'conditional-selection',conditionExpression:n.condition.getText(sf),then:selection(n.whenTrue,sf),else:selection(n.whenFalse,sf)};return {kind:'unevaluated-source-expression',expression:n.getText(sf)};}
 for(let i=0;i<model.sources.length;i++){
  const row=model.sources[i];if(row.language!=='typescript')continue;
  const defaults=[],calls=[],branches=[],orderedBindings=new Map();
  for(let j=0;j<(row.defaults??[]).length;j++){
   const f=row.defaults[j],p=parse(f.expression??'');if(p.error){issues.push({source:row.path,family:'defaults',index:j,rule:'native-default-expression-parse-refused',detail:p.error});continue}
   const item={factPath:['sources',String(i),'defaults',String(j)],sourceRange:{startByte:f.startByte,endByte:f.endByte,line:f.line},scope:f.scope,scopeId:f.scopeId??null,scopeIdentity:f.scopeIdentity??null,binding:f.bindingExpression??f.receiverExpression??f.optionName??null,declarationKind:f.kind,predicates:predicates(f),selection:selection(p.node,p.sf)};
   if(f.kind==='source-parameter-default'||f.kind==='destructuring-source-default')item.activation='Only when supplied argument/destructured value is undefined; not on null or other falsy input.';
   if(f.kind==='bound-helper-fallback-argument')item.activation='Actual argument passed to source helper; fallback selection is defined by that helper body, not inferred from adjacency.';
   defaults.push(item);if(item.binding){const key=JSON.stringify([item.scopeId??item.scope,item.binding]);if(!orderedBindings.has(key))orderedBindings.set(key,[]);orderedBindings.get(key).push(item);}
  }
  for(let j=0;j<(row.delegations??[]).length;j++){
   const f=row.delegations[j];if(!f.target?.expression)continue;
   const target=parse(f.target.expression,true),call=parse(f.expression??'');
   if(target.error||call.error){issues.push({source:row.path,family:'delegations',index:j,rule:'native-formal-actual-parse-refused',detail:target.error??call.error});continue}
   let fn=target.node,n=call.node;if(ts.isExpressionStatement(fn))fn=fn.expression;while(n&&(ts.isAwaitExpression(n)||ts.isParenthesizedExpression(n)))n=n.expression;while(fn&&ts.isParenthesizedExpression(fn))fn=fn.expression;if(!fn?.parameters||!ts.isCallExpression(n)){issues.push({source:row.path,family:'delegations',index:j,rule:'native-formal-actual-shape-not-function-call'});continue}
   const args=n.arguments.map(a=>({expression:a.getText(call.sf),spread:ts.isSpreadElement(a)}));
   const bindings=fn.parameters.map((p,k)=>({formalExpression:p.name.getText(target.sf),rest:!!p.dotDotDotToken,defaultExpression:p.initializer?.getText(target.sf)??null,actual:p.dotDotDotToken?{kind:'remaining-actual-expressions',values:args.slice(k)}:args[k]?{kind:args.slice(0,k+1).some(a=>a.spread)?'spread-dependent-actual-position':'actual-expression',...args[k]}:args.some(a=>a.spread)?{kind:'spread-dependent-actual-position',defaultActivated:'unknown-until-source-spread-cardinality'}:{kind:'omitted-actual-undefined',defaultActivated:!!p.initializer}}));
   calls.push({factPath:['sources',String(i),'delegations',String(j)],callerSource:row.path,callerScope:f.scope,callerScopeId:f.scopeId??null,callerScopeIdentity:f.scopeIdentity??null,callerPredicates:predicates(f),calleeSource:f.target.path??f.target.sourcePath,calleeRange:{startByte:f.target.startByte,endByte:f.target.endByte,line:f.target.line},bindings,extraActuals:args.slice(fn.parameters.length),semantics:'Source parameter binding only. Caller predicates and callee lexical predicates compose; no support or runtime outcome is inferred.'});
  }
  for(const family of ['commands','options','defaults','exits'])for(let j=0;j<(row[family]??[]).length;j++){const f=row[family][j];if(f.conditions?.length)branches.push({factPath:['sources',String(i),family,String(j)],scope:f.scope,scopeId:f.scopeId??null,scopeIdentity:f.scopeIdentity??null,predicateAncestry:predicates(f)});}
  sources.push({path:row.path,defaults,formalActualCalls:calls,branchHierarchy:branches,orderedAssignments:[...orderedBindings].map(([key,values])=>({scopeAndBinding:JSON.parse(key),sourceOrderedRules:values.sort((a,b)=>(a.sourceRange.startByte??0)-(b.sourceRange.startByte??0)).map(x=>({factPath:x.factPath,predicates:x.predicates,selection:x.selection})),semantics:'Lexical source order with explicit predicates, not an evaluated final default; cross-function call order is not inferred.'}))});
 }
 return {schemaVersion:'native-typed-source-contracts.v1',sources,unresolved:issues,acceptance:'NOT_ADJUDICATED',remaining:'Map-vs-record option ownership, parser throw/catch/implicit exit contracts and complete root caller/entry inventory join remain separate native obligations. Switch case selector and unique function-symbol identity must be emitted by adapter when absent.'};
}

export function renderCliNativeSection(c){
 const m=expandExpressions(c.sourceModel),groups=new Map();for(let i=0;i<c.sources.length;i++){const kind=c.sources[i].boundary.kind;if(!groups.has(kind))groups.set(kind,[]);groups.get(kind).push(i)}
 const out=['## Native source declarations','',`Revision: ${c.sourceRevision}. Read-only declaration reference, not a grant to run source-only/private/upstream commands.`, '', 'Native facts and exact unevaluated values are in cli-surfaces.json. The grouped source anchors below describe command selectors, options, operands, defaults and exit rules.',''];
 for(const[kind,indices]of groups){out.push(`### ${esc(kind)}`,'');for(const i of indices){const s=c.sources[i],row=m.sources[i];out.push(`<details><summary>${esc(s.path)}</summary>`,`<a id="native-${s.id}"></a>`,'',s.boundary.statement,'');for(const family of ['commands','subcommands','options','positionals','defaults','exits']){const facts=row[family]??[];if(!facts.length)continue;out.push(`**${headings[family]}**`,'');const seen=new Set();for(const f of facts){const r=range(f,row),key=JSON.stringify([f.scope,f.kind,r.line,r.startByte,r.endByte]);if(seen.has(key))continue;seen.add(key);const named=f.name??f.parameter??f.bindingExpression??f.selectorExpression??f.valueExpression;const description=[f.kind??f.role??family,f.scope,named].filter(x=>x!==undefined).map(x=>readable(x)).join(' · ');out.push(`- [${esc(description)}](${link(c,s,r)})${r.expression&&r.expression.length<=100?` — ${esc(r.expression)}`:' — exact declaration and all caller/guard variants in native facts.'}`);}out.push('')}out.push('</details>','')}}return out.join('\n')+'\n';
}

/** Documentation product boundary: factual declarations, not parser AST dumps.
 * Complete fact payloads are retained, including symbolic values and conditions.
 * Source binding tables remain factual provenance, including foreign locators.
 * Function bodies remain extraction inputs; their CLI-facing effects belong to
 * the fact arrays and typed contracts. This projection is not approval.
 */
function documentationPayload(value, role='') {
 if(Array.isArray(value))return value.map(x=>documentationPayload(x));
 if(!value||typeof value!=='object')return value;
 const physical=Number.isInteger(value.startByte)&&Number.isInteger(value.endByte);
 return Object.fromEntries(Object.entries(value).filter(([key])=>!(role==='functionSource'&&physical&&key==='expression')).map(([key,child])=>[key,documentationPayload(child,key)]));
}
export function projectCliDocumentationFacts(model) {
 if (!model?.sourceRevision || !Array.isArray(model.sources)) throw Error('CLI_DOCUMENTATION_MODEL_REQUIRED');
 const internalReturns=new Set(['source-function-return-completion','python-function-return-completion','go-return-completion']);
 const invocationTraceKinds=new Set(['source-local-call-completion-binding','source-argv-call-binding']);
 const factualFamilies=['commands','subcommands','options','positionals','defaults','exits','branches','delegations','guards','unresolved','adapterLimits'];
 return documentationPayload({
  schemaVersion:'cli-documentation-facts.v1', sourceRevision:model.sourceRevision,
  authority:model.authority, acceptance:'NOT_ADJUDICATED',
  ownership:model.ownership, manifestInterfaces:model.manifestInterfaces, launchGraph:model.launchGraph,
  ownershipDeclarationSha256:model.ownershipDeclarationSha256, archivedDataDispositions:model.archivedDataDispositions, unresolved:model.unresolved,
  dependencyBindings:model.dependencyBindings, producerBindings:model.producerBindings,
  tools:model.tools,
  sources:model.sources.map((row,sourceIndex)=>({
   path:row.path, language:row.language, ownership:row.ownership, sourceBinding:row.sourceBinding, sourceBindings:row.sourceBindings??[],
   ...Object.fromEntries(factualFamilies.map(key=>[key,key==='delegations'?(row[key]??[]).filter(f=>!invocationTraceKinds.has(f.kind)):key==='exits'?(row[key]??[]).filter(f=>!internalReturns.has(f.kind)&&!String(f.kind??'').endsWith('normal-completion-policy')&&f.kind!=='whole-shell-exit-boundary'):key==='adapterLimits'?[...(row[key]??[]),...(row.exits??[]).filter(f=>String(f.kind??'').endsWith('normal-completion-policy')||f.kind==='whole-shell-exit-boundary').map(f=>({kind:'language-policy-not-physical-declaration',policy:f}))]:row[key]??[]]))
  })),
  limits:['Source-derived declarations, not runtime execution. Symbolic defaults and conditional or delegated exits are not evaluated.',
   'Unresolved selected receiver/factory shapes require qualification before publication; no count or projection grants acceptance.',
   'Local-call completion traces, internal function returns and compiler parameter-binding proof are extraction inputs, not CLI declarations or process exit codes. The maintained producers retain that analysis while generating this reference. Source locators, conditional CLI/default declarations and process/delegated completion rules remain in the product; no arbitrary helper return is labeled a process status.']
 });
}

/** Reader-facing view of factual declarations; never evaluate defaults/exits. */
export function renderCliDocumentationFacts(product) {
 if(product?.schemaVersion!=='cli-documentation-facts.v1') throw Error('CLI_DOCUMENTATION_FACTS_REQUIRED');
 const rows=product.sources, out=['## Source-derived CLI reference','',
  'Select an entrypoint below. Ownership distinguishes supported frontdoors from private helpers, historical inputs and unresolved source declarations. A declaration is not permission to invoke a private tool.',
  '', 'Values and defaults are source expressions unless explicitly literal. Conditions and caller-dependent exits remain conditional; an unknown status is not success. See the existing command guides for prerequisites and safe operating procedures.','',
  '### Entrypoints',''];
 for(let i=0;i<rows.length;i++)out.push(`- [${esc(rows[i].path)}](#cli-entry-${i}) — ${esc(rows[i].ownership?.kind??'unclassified')}`);
 out.push('', '### Declared package launch routes', '',
  'Run a package script from its listed working directory with npm run followed by the script name. Install dependencies and satisfy the owning guide first. A declaration does not make a private, fixture or historical command an operator-supported task. Lifecycle entries run in the stated order; the command text is the package declaration, not an inferred standalone invocation.', '',
  '| Manifest and JSON property | Working directory | Script / entry | Declared command | Lifecycle | Boundary |',
  '| --- | --- | --- | --- | --- | --- |');
 for(const item of product.manifestInterfaces??[]){
  const pointer=item.kind==='npm-script-declaration'?'/scripts/'+String(item.name).replaceAll('~','~0').replaceAll('/','~1'):'/bin';
  const sourceURL=`https://github.com/datrab/kubeclaw/blob/${product.sourceRevision}/${item.manifest.split('/').map(encodeURIComponent).join('/')}`;
  out.push(`| [${esc(item.manifest)}](${sourceURL}) ${esc(pointer)} | ${esc(item.cwd??'.')} | ${esc(item.name??item.kind)} | ${esc(item.command??item.target??JSON.stringify(item))} | ${esc(JSON.stringify(item.lifecycle??[]))} | ${esc(item.supportBoundary??'Declaration only; owning caller defines support.')} |`);
 }
 const facts=['commands','subcommands','options','positionals','defaults','exits'];
 const provenance=new Set(['sourcePath','sourceRange','line','endLine','startByte','endByte','conditions','guards']);
 for(let i=0;i<rows.length;i++){
  const row=rows[i], context={repositoryURL:'https://github.com/datrab/kubeclaw',sourceRevision:product.sourceRevision};
  out.push('',`<a id="cli-entry-${i}"></a>`,`### ${esc(row.path)}`,'',
   `Ownership: **${esc(row.ownership?.kind??'unclassified')}**. ${esc(row.ownership?.boundary??'Invocation support is not established.')}`,'');
  for(const family of facts){
   if(!row[family]?.length)continue;
   out.push(`**${headings[family]}**`,'','| Source behavior | Applicability | Source |','| --- | --- | --- |');
   for(const fact of row[family]){
    const locator=range(fact,row);
    if(fact.sourceRange&&!row.sourceBindings.some(x=>x.id===fact.sourceRange))throw Error('CLI_DOCUMENTATION_SOURCE_RANGE_UNRESOLVED:'+row.path+':'+fact.sourceRange);
    if(!Number.isInteger(locator.line)||locator.line<1)throw Error('CLI_DOCUMENTATION_PHYSICAL_LOCATOR_REQUIRED:'+row.path+':'+family);
    const behavior=Object.entries(fact).filter(([k])=>!provenance.has(k)).map(([k,v])=>`${esc(k.replace(/([a-z])([A-Z])/g,'$1 $2'))}: ${esc(typeof v==='string'?v:JSON.stringify(v))}`).join('<br>');
    const predicates=fact.conditions??fact.guards??[];
    out.push(`| ${behavior||esc(locator.expression??'Source declaration')} | ${predicates.length?esc(JSON.stringify(predicates)):'No additional predicate recorded; caller and ownership limits still apply.'} | [${esc(row.path)}${locator.line?':'+locator.line:''}](${link(context,row,locator)}) |`);
   }
   out.push('');
  }
  if(row.unresolved?.length)out.push('**Unqualified source behavior — not accepted invocation guidance**','',...row.unresolved.map(x=>`- ${esc(JSON.stringify(x))}`),'');
  if(row.adapterLimits?.length)out.push('**Extractor boundaries**','',...row.adapterLimits.map(x=>`- ${esc(typeof x==='string'?x:JSON.stringify(x))}`),'');
 }
 return out.join('\n')+'\n';
}
