import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

// Source-only parser: the CompilerHost below serves only supplied text and no lib.
export function analyzeTypedCliSources(sources,context={}){
 const ts=context.typescript??createRequire(context.requireFrom??path.resolve(context.root??'.','package.json'))('typescript');
 const canonical=p=>path.posix.normalize('/'+p.replaceAll('\\','/').replace(/^\/+/u,'')), supplied=[...(context.allSources??[]).filter(s=>/\.[cm]?[jt]sx?$/u.test(s.path)),...(context.importedSources??[]),...sources],files=new Map(),sourceFiles=new Map();
 for(const source of supplied){const key=canonical(source.path),old=files.get(key);if(old&&old.text!==source.text)throw Error('CLI_ADAPTER_DUPLICATE_SOURCE_BYTES:'+source.path);files.set(key,source)}
 const loadDependency=p=>{if(files.has(p))return true;if(!context.readDependency)return false;let source;try{source=context.readDependency(p.slice(1))}catch(error){if(String(error.message).startsWith('CLI_SOURCE_NOT_REGULAR_TRACKED_FILE:'))return false;throw error}if(source?.then)throw Error('CLI_ADAPTER_REQUIRES_SYNCHRONOUS_READ_DEPENDENCY');if(source){if(canonical(source.path)!==p)throw Error('CLI_ADAPTER_DEPENDENCY_PATH_DRIFT');files.set(p,source);return true}return false};
 const resolve=(specifier,from)=>{
  const bound=context.moduleBindings?.[specifier];
  const target=bound?canonical(typeof bound==='string'?bound:bound.path):specifier.startsWith('.')?path.posix.resolve(path.posix.dirname(from),specifier):null;
  if(!target)return undefined;
  for(const p of [target,target.replace(/\.[cm]?js$/u,'.ts'),target.replace(/\.mjs$/u,'.mts'),...['.ts','.mts','.mjs','.js','/index.ts','/index.mjs'].map(e=>target+e)])if(files.has(p))return p;
 };
 const host={getSourceFile(fileName,languageVersion){const p=canonical(fileName),s=files.get(p);if(!s)return undefined;if(!sourceFiles.has(p))sourceFiles.set(p,ts.createSourceFile(p,s.text,languageVersion,true,ts.ScriptKind.TS));return sourceFiles.get(p)},getDefaultLibFileName(){return ''},writeFile(){throw Error('static adapter never emits')},getCurrentDirectory(){return '/'},getDirectories(){return[]},fileExists:p=>files.has(canonical(p)),readFile:p=>files.get(canonical(p))?.text,getCanonicalFileName:p=>canonical(p),useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n',resolveModuleNames(names,containingFile){return names.map(n=>{const target=resolve(n,canonical(containingFile));return target?{resolvedFileName:target,extension:target.endsWith('.mts')?ts.Extension.Mts:target.endsWith('.mjs')?ts.Extension.Mjs:ts.Extension.Ts}:undefined})}};
 const program=ts.createProgram([...files.keys()],{moduleDetection:ts.ModuleDetectionKind.Force,noLib:true,noResolve:false,allowJs:true,checkJs:false,noEmit:true,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext},host),checker=program.getTypeChecker();
 const blockedSymbols=new Set(),reassignedGlobalSources=new Set();
 const nodes=[],functions=[],calls=[],fnBySymbol=new Map(),symbolKinds=new Map(),functionReturnKinds=new Map(),parserFunctions=new Set(),objectInitializers=new Map(),symbolCallFlags=new Map();
 const symbolCache=new WeakMap();const getSymbol=n=>{if(!n)return undefined;if(symbolCache.has(n))return symbolCache.get(n);let value;try{value=checker.getSymbolAtLocation(n)}catch{}symbolCache.set(n,value);return value};
 const unalias=s=>{if(s&&(s.flags&ts.SymbolFlags.Alias)){try{return checker.getAliasedSymbol(s)}catch{return s}}return s};
 const functionNode=n=>{let p=n.parent;while(p){if(ts.isFunctionLike(p))return p;p=p.parent}return undefined};
 const expression=n=>n?.getText(n.getSourceFile())??'';
 const importOrigin=s=>{for(const d of s?.declarations??[]){let p=d;while(p&&!ts.isImportDeclaration(p))p=p.parent;if(p&&ts.isStringLiteral(p.moduleSpecifier))return {specifier:p.moduleSpecifier.text,declaration:p,node:d}}};
 const globalProcess=n=>{
  if(!ts.isIdentifier(n))return false;const sym=getSymbol(n),origin=importOrigin(sym);
  return n.text==='process'&&!sym||['node:process','process'].includes(origin?.specifier)&&(ts.isImportClause(origin.node)||ts.isNamespaceImport(origin.node));
 };
 const globalArgv=n=>{
  if(ts.isPropertyAccessExpression(n)&&n.name.text==='argv'&&globalProcess(n.expression))return true;
  if(ts.isIdentifier(n)){const sym=getSymbol(n),origin=importOrigin(sym);return ['node:process','process'].includes(origin?.specifier)&&ts.isImportSpecifier(origin.node)&&(origin.node.propertyName??origin.node.name).text==='argv'}return false;
 };
 for(const sf of program.getSourceFiles()){if(!files.has(canonical(sf.fileName)))continue;const walk=n=>{nodes.push(n);if(ts.isFunctionLike(n)&&n.body){functions.push(n);const sym=n.name?getSymbol(n.name):ts.isVariableDeclaration(n.parent)?getSymbol(n.parent.name):undefined;if(sym)fnBySymbol.set(sym,n)}if(ts.isCallExpression(n))calls.push(n);if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer)objectInitializers.set(getSymbol(n.name),n.initializer);ts.forEachChild(n,walk)};walk(sf)}
 const callable=n=>{const sym=unalias(getSymbol(n));return fnBySymbol.get(sym)??sym?.declarations?.find(d=>ts.isFunctionLike(d)&&d.body)};
 const getKinds=s=>blockedSymbols.has(s)?new Set():symbolKinds.get(s)??new Set();
 const addKinds=(s,kinds)=>{if(!s)return false;let into=symbolKinds.get(s);if(!into)symbolKinds.set(s,into=new Set());let changed=false;for(const k of kinds)if(!into.has(k)){into.add(k);changed=true}return changed};
 let kind,kindCache=new WeakMap();
 const union=(...sets)=>new Set(sets.flatMap(s=>[...(s??[])]));
 const has=(n,k)=>kind(n).has(k);
 const recordKeyKinds=n=>{const ks=kind(n),out=[];if(ks.has('key-full-argv'))out.push('record-key-full-argv');if(ks.has('key-stripped-prefix'))out.push('record-key-stripped-prefix');if(ks.has('key-unknown')||!out.length)out.push('record-key-unknown');return out};
 const computeKind=(n,seen=new Set())=>{
  if(!n||seen.has(n))return new Set();seen=new Set(seen).add(n);
  if(globalArgv(n))return reassignedGlobalSources.has(n.getSourceFile())?new Set():new Set(['argv']);
  if(ts.isIdentifier(n))return getKinds(getSymbol(n));
  if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='Map'&&!getSymbol(n.expression))return new Set(['map']);
  if(ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isNonNullExpression(n)||ts.isAwaitExpression(n))return kind(n.expression,seen);
  if(ts.isElementAccessExpression(n)){const base=kind(n.expression,seen);if(base.has('argv'))return new Set(['element','key-full-argv']);if(base.has('rawmap')||base.has('state'))return new Set(['value']);return new Set()}
  if(ts.isPropertyAccessExpression(n)){const base=kind(n.expression,seen);if(base.has('rawmap')||base.has('state'))return new Set(['value']);return new Set()}
  if(ts.isObjectLiteralExpression(n)){const values=n.properties.flatMap(p=>ts.isPropertyAssignment(p)?[p.initializer]:ts.isSpreadAssignment(p)?[p.expression]:[]);if(values.some(v=>[...kind(v,seen)].some(k=>['element','value','rawmap','state'].includes(k))))return new Set(['state']);return new Set()}
  if(ts.isConditionalExpression(n)){const left=kind(n.whenTrue,seen),right=kind(n.whenFalse,seen),result=union(left,right);if([...result].some(k=>k.startsWith('key-'))&&(![...left].some(k=>k.startsWith('key-'))||![...right].some(k=>k.startsWith('key-'))))result.add('key-unknown');return result;}
  if(ts.isBinaryExpression(n)){const left=kind(n.left,seen),right=kind(n.right,seen),result=union(left,right);if([...result].some(k=>k.startsWith('key-'))){if(![ts.SyntaxKind.QuestionQuestionToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.AmpersandAmpersandToken].includes(n.operatorToken.kind)||![...left].some(k=>k.startsWith('key-'))||![...right].some(k=>k.startsWith('key-'))){result.delete('key-full-argv');result.delete('key-stripped-prefix');result.add('key-unknown')}}return result;}
  if(ts.isCallExpression(n)){
   if(ts.isPropertyAccessExpression(n.expression)){
    const method=n.expression.name.text,base=kind(n.expression.expression,seen);
    if(ts.isIdentifier(n.expression.expression)&&n.expression.expression.text==='Object'&&!getSymbol(n.expression.expression)&&['freeze','seal'].includes(method)&&n.arguments[0])return kind(n.arguments[0],seen);
    if(base.has('argv')&&['slice','filter'].includes(method))return new Set(['argv']);
    if(base.has('argv')&&method==='find')return new Set(['element','key-full-argv']);
    if(base.has('element')&&base.has('key-full-argv')&&!base.has('key-unknown')&&!base.has('key-stripped-prefix')&&method==='slice'&&n.arguments.length===1&&expression(n.arguments[0])==='2')return new Set(['name','key-stripped-prefix']);
    if(base.has('rawmap')&&method==='get')return new Set(['value']);
    if([...base].some(k=>['element','name','value'].includes(k)))return new Set(['value','key-unknown']);
   }
   const fn=callable(n.expression);if(fn)return functionReturnKinds.get(fn)??new Set();
   if(n.arguments.some(a=>[...kind(a,seen)].some(k=>['element','name','value'].includes(k))))return new Set(['value']);
  }
  return new Set();
 };
 kind=(n,seen=new Set())=>{if(!n)return new Set();if(kindCache.has(n))return kindCache.get(n);const result=computeKind(n,seen);kindCache.set(n,result);return result};
 // Monotone source/dataflow fixpoint. An explicit cap is reported, never treated complete.
 let stable=false,round=0;
 const propagate=()=>{stable=false;round=0;
 for(;round<Math.max(20,functions.length*3+5);round++){
  kindCache=new WeakMap();let changed=false;
  for(const n of nodes){
   if(ts.isVariableDeclaration(n)&&n.initializer){
    const kinds=kind(n.initializer);
    if(ts.isIdentifier(n.name))changed=addKinds(getSymbol(n.name),kinds)||changed;
    else if(ts.isArrayBindingPattern(n.name)&&kinds.has('argv'))for(const e of n.name.elements)if(ts.isBindingElement(e)&&ts.isIdentifier(e.name))changed=addKinds(getSymbol(e.name),e.dotDotDotToken?['argv']:['element','key-full-argv'])||changed;
    // Destructured argv from a genuine global process object is direct input.
    else if(ts.isObjectBindingPattern(n.name)&&globalProcess(n.initializer))for(const e of n.name.elements)if(ts.isBindingElement(e)&&ts.isIdentifier(e.name)&&(e.propertyName??e.name).getText()==='argv')changed=addKinds(getSymbol(e.name),['argv'])||changed;
   }
   if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken){
    if(ts.isPropertyAccessExpression(n.left)&&ts.isIdentifier(n.left.expression)&&[...kind(n.right)].some(k=>['element','value','rawmap','state'].includes(k)))changed=addKinds(getSymbol(n.left.expression),['state'])||changed;
    if(ts.isIdentifier(n.left))changed=addKinds(getSymbol(n.left),kind(n.right))||changed;
    if(ts.isElementAccessExpression(n.left)&&ts.isIdentifier(n.left.expression)&&[...kind(n.left.argumentExpression)].some(k=>['element','name','value'].includes(k))&&[...kind(n.right)].some(k=>['element','value'].includes(k)))changed=addKinds(getSymbol(n.left.expression),['rawmap','rawrecord',...recordKeyKinds(n.left.argumentExpression)])||changed;
   }
   if(ts.isForOfStatement(n)&&has(n.expression,'argv')){
    const d=ts.isVariableDeclarationList(n.initializer)?n.initializer.declarations[0]:undefined;if(d&&ts.isIdentifier(d.name))changed=addKinds(getSymbol(d.name),['element','key-full-argv'])||changed;
   }
   if(ts.isCallExpression(n)){
    const fn=callable(n.expression);
    if(fn){for(let i=0;i<fn.parameters.length;i++){const p=fn.parameters[i],arg=n.arguments[i];if(ts.isIdentifier(p.name)&&arg){const ks=kind(arg);changed=addKinds(getSymbol(p.name),ks)||changed;if(ks.has('argv')&&!parserFunctions.has(fn)){parserFunctions.add(fn);changed=true}}}}
    if(ts.isPropertyAccessExpression(n.expression)){
     const method=n.expression.name.text,receiver=n.expression.expression;
     if(has(receiver,'argv')&&['map','find','filter','some','every','forEach'].includes(method))for(const a of n.arguments)if((ts.isArrowFunction(a)||ts.isFunctionExpression(a))&&a.parameters[0]&&ts.isIdentifier(a.parameters[0].name))changed=addKinds(getSymbol(a.parameters[0].name),['element','key-full-argv'])||changed;
     if(method==='set'&&has(receiver,'map')&&ts.isIdentifier(receiver)&&n.arguments[0]&&[...kind(n.arguments[0])].some(k=>['element','name','value'].includes(k))&&n.arguments[1]&&[...kind(n.arguments[1])].some(k=>['element','value'].includes(k)))changed=addKinds(getSymbol(receiver),['rawmap','map',...recordKeyKinds(n.arguments[0])])||changed;
    }
   }
   if(ts.isReturnStatement(n)&&n.expression){const fn=functionNode(n);if(fn){const previous=functionReturnKinds.get(fn)??new Set(),after=union(previous,kind(n.expression));if(after.size!==previous.size){functionReturnKinds.set(fn,after);changed=true}}}
  }
  if(!changed){stable=true;break}
 }
 };propagate();
 const ambiguousWrites=[];const writes=new Map();
 for(const n of nodes){let symbol,value;if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer){symbol=getSymbol(n.name);value=n.initializer}else if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken){if(ts.isIdentifier(n.left)){symbol=getSymbol(n.left);value=n.right}else if(globalArgv(n.left)){reassignedGlobalSources.add(n.getSourceFile());ambiguousWrites.push({node:n,rule:'global-argv-reassignment-not-original-input'})}}
  if(symbol&&value){if(!writes.has(symbol))writes.set(symbol,[]);writes.get(symbol).push(value)}
 }
 for(const [symbol,values] of writes)if(values.length>1&&[...getKinds(symbol)].some(k=>['argv','element','name','rawmap'].includes(k))&&values.some(v=>kind(v).size===0)){blockedSymbols.add(symbol);for(const node of values)ambiguousWrites.push({node,rule:'mixed-tainted-and-untainted-symbol-reassignment'})}
 if(ambiguousWrites.length){symbolKinds.clear();functionReturnKinds.clear();parserFunctions.clear();kindCache=new WeakMap();propagate()}
 kindCache=new WeakMap();
 const outputs=new Map([...files.values()].map(s=>[canonical(s.path),{path:s.path,commands:[],subcommands:[],options:[],positionals:[],defaults:[],exits:[],branches:[],delegations:[],guards:[],sourceBindings:[],unresolved:[]}])) ,dedupe=new Map();
 const plainSpanCache=new WeakMap(),siteCache=new WeakMap(),switchContextCache=new WeakMap();
 const plainSpan=n=>{if(plainSpanCache.has(n))return plainSpanCache.get(n);const sf=n.getSourceFile(),start=n.getStart(sf),end=n.end;const result={sourcePath:files.get(canonical(sf.fileName))?.path??sf.fileName.replace(/^\//u,''),line:sf.getLineAndCharacterOfPosition(start).line+1,endLine:sf.getLineAndCharacterOfPosition(end).line+1,startByte:Buffer.byteLength(sf.text.slice(0,start)),endByte:Buffer.byteLength(sf.text.slice(0,end)),expression:sf.text.slice(start,end)};plainSpanCache.set(n,result);return result};
 const abruptTarget=n=>{if(!ts.isBreakStatement(n)&&!ts.isContinueStatement(n))return null;for(let p=n.parent;p;p=p.parent){if(ts.isFunctionLike(p))break;if(n.label){if(ts.isLabeledStatement(p)&&p.label.text===n.label.text)return {kind:ts.isContinueStatement(n)?'continue-labeled-loop':'break-labeled-statement',source:plainSpan(p.statement)}}else if(ts.isIterationStatement(p,false)||ts.isBreakStatement(n)&&ts.isSwitchStatement(p))return {kind:ts.isContinueStatement(n)?'continue-loop':'break-loop-or-switch',source:plainSpan(p)}}return {kind:'unresolved-invalid-control-target',source:null}};
 const switchContext=clause=>{if(switchContextCache.has(clause))return switchContextCache.get(clause);
  const statement=clause.parent.parent,clauses=[...statement.caseBlock.clauses],index=clauses.indexOf(clause),selectorSource=plainSpan(statement.expression),switchSource=plainSpan(statement),orderedLabels=clauses.map((c,i)=>({index:i,kind:ts.isDefaultClause(c)?'default':'case',labelExpression:ts.isCaseClause(c)?expression(c.expression):null,labelSource:ts.isCaseClause(c)?plainSpan(c.expression):{...plainSpan(c),expression:'default',endByte:plainSpan(c).startByte+7},clauseStartByte:plainSpan(c).startByte,clauseEndByte:plainSpan(c).endByte}));
  const priorClauseFlow=clauses.slice(0,index).map((c,i)=>{const completions=[];const walk=n=>{if(ts.isFunctionLike(n))return;if(ts.isReturnStatement(n)||ts.isThrowStatement(n)||ts.isBreakStatement(n)||ts.isContinueStatement(n))completions.push({...plainSpan(n),kind:ts.SyntaxKind[n.kind],labelExpression:n.label?expression(n.label):null,controlTarget:abruptTarget(n),exitsCurrentSwitch:ts.isBreakStatement(n)?abruptTarget(n)?.source?.startByte===switchSource.startByte:null});ts.forEachChild(n,walk)};for(const statement of c.statements)walk(statement);return {fromClauseIndex:i,toClauseIndex:i+1,completionSources:completions,edgeRule:'If this clause is entered and its statements complete normally, execution continues into the next clause without re-testing its label. Abrupt completion follows the actual break/return/throw/continue target and enclosing finally rules.'}});
  const result={conditionExpression:ts.isCaseClause(clause)?expression(clause.expression):null,role:ts.isDefaultClause(clause)?'default':'case',line:plainSpan(clause).line,selectorExpression:expression(statement.expression),selectorSource,switchIdentity:{sourcePath:switchSource.sourcePath,startByte:switchSource.startByte,endByte:switchSource.endByte},clauseIndex:index,orderedLabels,entryRule:'The selector is evaluated once. Case expressions are searched in source order using JavaScript strict equality; default is the fallback only if no case matches. A statement in this clause can also be reached by normal fallthrough from an earlier entered clause; its own label need not match.',priorClauseFlow,fallthroughPolicy:'Native ordered switch execution: case/default labels do not themselves stop execution; only actual abrupt completions prevent the normal next-clause edge. No inferred unconditional break or selector match.'};switchContextCache.set(clause,result);return result;
 };
 const site=n=>{if(siteCache.has(n))return siteCache.get(n);const sf=n.getSourceFile(),conditions=[];let child=n;for(let p=n.parent;p;child=p,p=p.parent){if(ts.isFunctionLike(p))break;if(ts.isIfStatement(p))conditions.push({conditionExpression:expression(p.expression),role:child===p.thenStatement?'then':child===p.elseStatement?'else':'condition',line:sf.getLineAndCharacterOfPosition(p.getStart(sf)).line+1});if(ts.isCaseClause(p)||ts.isDefaultClause(p))conditions.push(switchContext(p))}const owner=functionNode(n),scopeSource=owner?plainSpan(owner):{sourcePath:plainSpan(n).sourcePath,startByte:0,endByte:Buffer.byteLength(sf.text)},scopeIdentity={sourcePath:scopeSource.sourcePath,kind:owner?'function':'module',startByte:scopeSource.startByte,endByte:scopeSource.endByte};const result={...plainSpan(n),scope:expression(owner?.name)||'<module-or-anonymous>',scopeIdentity,scopeId:scopeIdentity.sourcePath+'#'+scopeIdentity.kind+'@'+scopeIdentity.startByte+':'+scopeIdentity.endByte,conditions};siteCache.set(n,result);return result};

 // Preserve prior Array.find first-match ordering, including nested calls sharing
 // the same physical start byte. These maps are AST identity accelerators only.
 const functionBySourceStart=new Map(),callBySourceStart=new Map();
 const indexSourceStart=(index,node)=>{const span=plainSpan(node),key=canonical(span.sourcePath);let offsets=index.get(key);if(!offsets)index.set(key,offsets=new Map());if(!offsets.has(span.startByte))offsets.set(span.startByte,node)};
 for(const fn of functions)indexSourceStart(functionBySourceStart,fn);
 for(const call of calls)indexSourceStart(callBySourceStart,call);
 const indexedNode=(index,sourcePath,startByte)=>index.get(canonical(sourcePath))?.get(startByte);

 const add=(key,n,fields={})=>{const out=outputs.get(canonical(n.getSourceFile().fileName));if(!out)return;const value={...site(n),...fields},id=key+':'+JSON.stringify(value);if(!dedupe.has(id)){dedupe.set(id,true);out[key].push(value)}};
 for(const issue of ambiguousWrites)add('unresolved',issue.node,{rule:issue.rule,qualification:'No option facts may be inferred from this ambiguous/replaced input symbol without control-flow qualification.'});
 const exceptionContext=n=>{const contexts=[];let child=n;for(let p=n.parent;p;child=p,p=p.parent){if(ts.isFunctionLike(p))break;if(ts.isTryStatement(p))contexts.push({trySite:site(p),origin:child===p.tryBlock?'try':child===p.catchClause?'catch':'finally',catchSource:p.catchClause?site(p.catchClause):null,finallySource:p.finallyBlock?site(p.finallyBlock):null,policy:'Lexical completion edge: catch receives throws from try only; a completion in finally may supersede the pending completion. No blanket exit status.'})}return contexts};
 const childOrigin=n=>{if(!n)return null;while(ts.isAwaitExpression(n)||ts.isParenthesizedExpression(n))n=n.expression;if(ts.isIdentifier(n)){const init=initializer(n);if(init&&init!==n)return childOrigin(init)}if(!ts.isCallExpression(n))return null;const origin=importOrigin(getSymbol(n.expression))??(ts.isPropertyAccessExpression(n.expression)?importOrigin(getSymbol(n.expression.expression)):undefined);if(!['node:child_process','child_process'].includes(origin?.specifier))return null;const method=ts.isPropertyAccessExpression(n.expression)?n.expression.name.text:origin.node?.propertyName?.text??origin.node?.name?.text;return {call:site(n),specifier:origin.specifier,method,policy:['spawnSync','execFileSync','execSync'].includes(method)?'synchronous-result-or-throw':'child-handle-events-not-process-status'};};
 const relevantCache=new WeakMap();const relevant=n=>{if(relevantCache.has(n))return relevantCache.get(n);let yes=[...kind(n)].some(k=>['argv','element','name','value','rawmap','state'].includes(k));ts.forEachChild(n,child=>{if(relevant(child))yes=true});relevantCache.set(n,yes);return yes};
 const flag=(n,name,fields={})=>add(name==='--'||name==='-'?'branches':name.startsWith('-')?'options':'commands',n,{name,...fields,...(name==='--'||name==='-'?{kind:'generic-argv-syntax-prefix-not-owned-option'}:{})});
 const mappedKey=(node,receiver,key,fields={})=>{const representations=[...kind(receiver)].filter(k=>k.startsWith('record-key-'));if(representations.length!==1||representations[0]==='record-key-unknown'||has(receiver,'map')&&has(receiver,'rawrecord')){add('unresolved',node,{rule:'raw-argv-key-representation-unresolved',receiverExpression:expression(receiver),consumerKey:key,representations,policy:'Source producer must prove complete argv key versus exactly slice(2) stripped key; mixed/unknown transforms do not grant an invented option name.'});return}flag(node,representations[0]==='record-key-stripped-prefix'?'--'+key:key,{...fields,keyRepresentation:representations[0],sourceConsumerKey:key})};
 const literalNames=(node,fields)=>{if(!node)return;if(ts.isStringLiteralLike(node))flag(node,node.text,fields);else if(ts.isArrayLiteralExpression(node))for(const e of node.elements)if(ts.isStringLiteralLike(e))flag(e,e.text,fields)};
 const initializer=n=>ts.isIdentifier(n)?objectInitializers.get(getSymbol(n)):undefined;
 const helperCallHasInput=(call,owner)=>{const relevantParams=owner.parameters.map((p,i)=>({i,kinds:ts.isIdentifier(p.name)?getKinds(getSymbol(p.name)):new Set()})).filter(p=>p.kinds.has('argv')||p.kinds.has('rawmap'));return !relevantParams.length||relevantParams.some(p=>call.arguments[p.i]&&[...kind(call.arguments[p.i])].some(k=>p.kinds.has(k)))};
 for(const n of nodes){
  if(ts.isVariableDeclaration(n)&&n.initializer&&ts.isArrayBindingPattern(n.name)&&has(n.initializer,'argv'))for(let i=0;i<n.name.elements.length;i++){const element=n.name.elements[i];if(!ts.isBindingElement(element))continue;add('positionals',element,{kind:element.dotDotDotToken?'argv-destructured-rest':'argv-destructured-operand',selectorIndex:i,bindingExpression:expression(element.name),inputExpression:expression(n.initializer)});if(element.initializer)add('defaults',element.initializer,{kind:'destructuring-source-default',bindingExpression:expression(element.name),selectorIndex:i,inputExpression:expression(n.initializer)})}
  if(globalArgv(n))add('delegations',n,{kind:reassignedGlobalSources.has(n.getSourceFile())?'reassigned-global-argv-not-original-input':'actual-global-argv-source'});
  if(ts.isElementAccessExpression(n)&&has(n.expression,'argv'))add('positionals',n,{kind:'argv-index-read-not-automatic-positional-contract',selectorExpression:expression(n.argumentExpression),inputKind:globalArgv(n.expression)?'full-process-argv':'argv-derived-array'});
  if(ts.isPropertyAccessExpression(n)&&has(n.expression,'rawmap')&&!has(n.expression,'map'))mappedKey(n,n.expression,n.name.text,{kind:'raw-pairmap-consumer-key',keyExpression:expression(n.name)});
  if(ts.isElementAccessExpression(n)&&has(n.expression,'rawmap')&&!has(n.expression,'map')&&n.argumentExpression&&ts.isStringLiteralLike(n.argumentExpression))mappedKey(n,n.expression,n.argumentExpression.text,{kind:'raw-pairmap-consumer-key'});
  if(ts.isElementAccessExpression(n)&&n.argumentExpression&&[...kind(n.argumentExpression)].some(k=>['element','name'].includes(k))){const init=initializer(n.expression);if(init&&ts.isObjectLiteralExpression(init))for(const p of init.properties)if(ts.isPropertyAssignment(p)&&p.name&&ts.isStringLiteralLike(p.name))literalNames(p.name,{kind:'tainted-argv-owned-lookup-key',lookupExpression:expression(n)})}
  if(ts.isBinaryExpression(n)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(n.operatorToken.kind)){
   if([...kind(n.left)].some(k=>['element','name'].includes(k)))literalNames(n.right,{kind:'argv-derived-comparison'});if([...kind(n.right)].some(k=>['element','name'].includes(k)))literalNames(n.left,{kind:'argv-derived-comparison'});
  }
  if(ts.isForStatement(n)&&((n.condition&&relevant(n.condition))||(n.initializer&&relevant(n.initializer))))add('branches',n,{kind:'source-argv-index-loop',initializerSource:n.initializer?site(n.initializer):null,conditionSource:n.condition?site(n.condition):null,incrementorSource:n.incrementor?site(n.incrementor):null,policy:'Native loop stride/order are preserved; a prefix-based pair map is not a closed option allowlist.'});
  if(ts.isForOfStatement(n)&&has(n.expression,'argv'))add('branches',n,{kind:'source-argv-for-of-loop',inputSource:site(n.expression),bindingSource:site(n.initializer)});
  if(ts.isIfStatement(n)&&relevant(n.expression))add('branches',n.expression,{kind:'source-argv-condition'});
  if(ts.isIfStatement(n)&&(/import\.meta/.test(expression(n.expression)))&&relevant(n.expression))add('guards',n.expression,{kind:'source-entry-identity-guard-not-public-launch-proof'});
  if(ts.isSwitchStatement(n)&&relevant(n.expression)){add('branches',n.expression,{kind:'argv-switch'});for(const c of n.caseBlock.clauses)if(ts.isCaseClause(c))literalNames(c.expression,{kind:'argv-switch-case'})}
  if(ts.isVariableDeclaration(n)&&n.initializer&&relevant(n.initializer)){const init=n.initializer,op=ts.isBinaryExpression(init)?init.operatorToken.kind:null,defaultKind=op===ts.SyntaxKind.QuestionQuestionToken?'nullish-fallback-rule':op===ts.SyntaxKind.BarBarToken?'falsy-fallback-rule':ts.isConditionalExpression(init)?'guarded-conditional-selection-rule':null;add(defaultKind?'defaults':'delegations',init,{kind:defaultKind??'input-value-transformation-not-a-default',bindingExpression:expression(n.name),precedenceOrder:site(n).startByte,guardExpression:ts.isConditionalExpression(init)?expression(init.condition):undefined})}
  if(ts.isParameter(n)&&n.initializer&&(parserFunctions.has(n.parent)||relevant(n.initializer)))add('defaults',n.initializer,{kind:'source-parameter-default',bindingExpression:expression(n.name)});
  if(ts.isVariableDeclaration(n)&&n.initializer&&ts.isObjectLiteralExpression(n.initializer)&&parserFunctions.has(functionNode(n)))for(const p of n.initializer.properties)if(ts.isPropertyAssignment(p))add('defaults',p.initializer,{kind:'parser-state-source-initializer',bindingExpression:expression(p.name),receiverExpression:expression(n.name)});
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&relevant(n.left))add('defaults',n.right,{kind:'ordered-guarded-input-replacement-rule',bindingExpression:expression(n.left),precedenceOrder:site(n).startByte,policy:'Source-order guarded replacement, not an independent fallback/default grant'});
  const actualExitCall=ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&globalProcess(n.expression.expression)&&n.expression.name.text==='exit';
  const actualExitAssign=ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(n.left)&&globalProcess(n.left.expression)&&n.left.name.text==='exitCode';
  if(ts.isThrowStatement(n))add('exits',n,{kind:'source-throw-completion',functionSource:functionNode(n)?site(functionNode(n)):null,valueExpression:expression(n.expression),exceptionContext:exceptionContext(n),policy:'Propagates through the bound call/Promise and lexical catch/finally edges; not an unconditional process exit or guessed numeric status.'});
  if(ts.isReturnStatement(n)){const owner=functionNode(n);if(owner)add('exits',n,{kind:'source-function-return-completion',valueExpression:expression(n.expression),functionSource:site(owner),exceptionContext:exceptionContext(n),policy:'Returns a value to the actual caller, not directly to the process exit code.'})}
  if(ts.isSourceFile(n))add('exits',n,{kind:'source-module-normal-completion-policy',expression:'',startByte:Buffer.byteLength(n.text),endByte:Buffer.byteLength(n.text),line:n.getLineAndCharacterOfPosition(Math.max(0,n.end-1)).line+1,endLine:n.getLineAndCharacterOfPosition(Math.max(0,n.end-1)).line+1,policy:'On normal module completion Node retains the current process.exitCode and outstanding event-loop work; explicit exits/throws/child events remain separate bound edges. This is not a literal zero exit declaration.'});
  if(ts.isPropertyAccessExpression(n)&&['status','signal','error'].includes(n.name.text)){const origin=childOrigin(n.expression);if(origin)add('exits',n,{kind:'native-child-result-property',property:n.name.text,childSource:origin,policy:'Child result field is symbolic until actual guarded use; no automatic parent status inheritance.'})}
  if(actualExitCall||actualExitAssign)add('exits',n,{kind:actualExitCall?'explicit-process-exit':'explicit-process-exitCode',functionSource:functionNode(n)?site(functionNode(n)):null,exceptionContext:exceptionContext(n),valueExpression:actualExitCall?expression(n.arguments[0]):expression(n.right)});
  if(actualExitCall||actualExitAssign){let value=actualExitCall?n.arguments[0]:n.right;while(value&&(ts.isAwaitExpression(value)||ts.isParenthesizedExpression(value)))value=value.expression;if(value&&ts.isIdentifier(value))value=initializer(value)??value;if(value&&ts.isCallExpression(value)){const target=callable(value.expression);if(target){const returnSources=[];const visit=x=>{if(ts.isReturnStatement(x))returnSources.push(site(x));if(x!==target&&ts.isFunctionLike(x))return;ts.forEachChild(x,visit)};visit(target);add('delegations',value,{kind:'explicit-exit-source-helper-binding',target:{path:files.get(canonical(target.getSourceFile().fileName))?.path,...site(target)},returnSources})}}}

  if(ts.isReturnStatement(n)&&n.expression&&parserFunctions.has(functionNode(n)))add('delegations',n,{kind:'parser-source-return',valueExpression:expression(n.expression),returnKinds:[...kind(n.expression)]});
  if(!ts.isCallExpression(n))continue;
  if(n.expression.kind===ts.SyntaxKind.ImportKeyword){
   let conditionalArgv=false;for(let p=n.parent;p;p=p.parent)if(ts.isIfStatement(p)&&relevant(p.expression))conditionalArgv=true;
   if(conditionalArgv||n.arguments.some(a=>relevant(a))){const spec=n.arguments[0]&&ts.isStringLiteralLike(n.arguments[0])?n.arguments[0].text:undefined,target=spec?resolve(spec,canonical(n.getSourceFile().fileName)):undefined;add('delegations',n,{kind:'conditional-or-input-derived-module-delegation',specifier:spec,moduleExpression:expression(n.arguments[0]),sourcePathTarget:target?files.get(target)?.path:undefined,publicLaunchGranted:false});if(spec&&!target&&!spec.startsWith('node:'))add('unresolved',n,{rule:'conditional-argv-module-delegation-binding-unresolved',specifier:spec,detail:'Native package/relative module source binding required; no dist-to-src or support inference.'})}
  }
  const nativeChild=childOrigin(n);if(nativeChild)add('delegations',n,{kind:'native-child-execution-result-source',...nativeChild,executableExpression:expression(n.arguments[0]),argumentExpressions:n.arguments.slice(1).map(expression)});
  if(ts.isPropertyAccessExpression(n.expression)&&['catch','finally','then'].includes(n.expression.name.text)){const receiver=n.expression.expression,ownerCall=ts.isCallExpression(receiver)?receiver:null,findAsyncProducer=call=>{if(!call)return null;const fn=callable(call.expression);if(fn?.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword))return {call,fn};if(ts.isPropertyAccessExpression(call.expression)&&['then','catch','finally'].includes(call.expression.name.text)&&ts.isCallExpression(call.expression.expression))return findAsyncProducer(call.expression.expression);return null},producer=findAsyncProducer(ownerCall),ownerFn=producer?.fn;if(ownerFn&&ownerFn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword))add('exits',n,{kind:'source-async-function-completion-chain',method:n.expression.name.text,producer:site(producer.call),producerFunction:site(ownerFn),callbacks:n.arguments.map(a=>{const target=callable(a);return {source:site(a),target:target?site(target):null}}),policy:'Actual async producer Promise completion edge; catch handles rejection, finally may replace completion, callbacks determine any explicit parent status.'})}
  const fn=callable(n.expression);
  if(fn&&!n.arguments.some(a=>relevant(a))&&!parserFunctions.has(fn))add('delegations',n,{kind:'source-local-call-completion-binding',calleeExpression:expression(n.expression),target:{path:files.get(canonical(fn.getSourceFile().fileName))?.path,...site(fn)},argumentKinds:n.arguments.map(a=>[...kind(a)])});
  if(n.arguments.some(a=>relevant(a))||fn&&parserFunctions.has(fn)){
   const origin=importOrigin(getSymbol(n.expression))??(ts.isPropertyAccessExpression(n.expression)?importOrigin(getSymbol(n.expression.expression)):undefined);add('delegations',n,{kind:'source-argv-call-binding',calleeExpression:expression(n.expression),target:fn?{path:files.get(canonical(fn.getSourceFile().fileName))?.path,...site(fn)}:undefined,importSpecifier:origin?.specifier,argumentKinds:n.arguments.map(a=>[...kind(a)])});
   if(origin&&!fn&&n.arguments.some(a=>has(a,'argv'))){if(['node:child_process','child_process'].includes(origin.specifier))add('delegations',n,{kind:'native-child-argv-passthrough-not-owned-options',calleeExpression:expression(n.expression),executableExpression:expression(n.arguments[0]),specifier:origin.specifier});else add('unresolved',n,{rule:origin.specifier.startsWith('node:')?'native-parser-api-requires-specific-contract':'tainted-imported-parser-source-unavailable',specifier:origin.specifier});}
  }
  if(ts.isPropertyAccessExpression(n.expression)){
   const receiver=n.expression.expression,method=n.expression.name.text;
   if(method==='set'&&!has(receiver,'map')&&n.arguments[0]&&[...kind(n.arguments[0])].some(k=>['name','element','value'].includes(k))&&n.arguments[1]&&[...kind(n.arguments[1])].some(k=>['element','value'].includes(k)))add('unresolved',n,{rule:'argv-keyed-custom-set-receiver-contract-unresolved',receiverExpression:expression(receiver),policy:'Only an unshadowed native Map constructor supplies Map replacement/get policy; custom receivers require their actual bound source contract.'});
   if(method==='set'&&has(receiver,'rawmap')&&has(receiver,'map'))add('delegations',n,{kind:'native-Map-key-replacement-rule',receiverExpression:expression(receiver),keyExpression:expression(n.arguments[0]),valueExpression:expression(n.arguments[1]),policy:'Source-bound Map.set replaces the existing same key; this is not a declared --set option or closed CLI allowlist.'});
   if(has(receiver,'argv')&&['includes','indexOf'].includes(method)){
    const a=n.arguments[0];if(a&&ts.isStringLiteralLike(a))literalNames(a,{kind:'actual-argv-'+method});
    else if(a&&ts.isIdentifier(a)){
     const parameter=getSymbol(a)?.declarations?.find(d=>ts.isParameter(d)),owner=parameter?.parent;
     if(parameter&&owner){const i=owner.parameters.indexOf(parameter);for(const call of calls)if(callable(call.expression)===owner&&helperCallHasInput(call,owner)&&call.arguments[i]){
      const value=call.arguments[i];if(ts.isStringLiteralLike(value)){literalNames(value,{kind:'bound-argv-lookup-helper-name',helperDeclaration:site(owner)});if(call.arguments[i+1])add('defaults',call.arguments[i+1],{kind:'bound-helper-fallback-argument',helperExpression:expression(call.expression),optionName:value.text})}
      else add('unresolved',value,{rule:'computed-bound-argv-helper-name',helperDeclaration:site(owner)});
     }}else if(a)add('unresolved',a,{rule:'unresolved-argv-lookup-name-source'});
    }
   }
   if(method==='startsWith'&&[...kind(receiver)].some(k=>['element','name'].includes(k)))literalNames(n.arguments[0],{kind:'argv-prefix-selector'});
   if(method==='includes'&&n.arguments[0]&&[...kind(n.arguments[0])].some(k=>['element','name'].includes(k))){const init=ts.isArrayLiteralExpression(receiver)?receiver:initializer(receiver);if(init&&ts.isArrayLiteralExpression(init))literalNames(init,{kind:'argv-allowlist-member'})}
   if(['get','has'].includes(method)&&has(receiver,'rawmap')&&has(receiver,'map')&&n.arguments[0]&&ts.isStringLiteralLike(n.arguments[0]))mappedKey(n.arguments[0],receiver,n.arguments[0].text,{kind:'raw-pairmap-get-key'});
   if(['get','has'].includes(method)&&has(receiver,'rawmap')&&has(receiver,'map')&&n.arguments[0]&&ts.isIdentifier(n.arguments[0])){const parameter=getSymbol(n.arguments[0])?.declarations?.find(d=>ts.isParameter(d)),owner=parameter?.parent;if(parameter&&owner){const i=owner.parameters.indexOf(parameter);for(const call of calls)if(callable(call.expression)===owner&&helperCallHasInput(call,owner)&&call.arguments[i]&&ts.isStringLiteralLike(call.arguments[i]))mappedKey(call.arguments[i],receiver,call.arguments[i].text,{kind:'bound-raw-pairmap-get-helper-key',helperDeclaration:site(owner)})}}
   if(method==='get'&&n.arguments[0]&&relevant(n.arguments[0])){const init=initializer(receiver);if(init&&ts.isNewExpression(init)&&init.arguments?.[0]&&ts.isArrayLiteralExpression(init.arguments[0]))for(const e of init.arguments[0].elements)if(ts.isArrayLiteralExpression(e)&&e.elements[0])literalNames(e.elements[0],{kind:'tainted-argv-map-lookup-key'})}
  }
 }
 for(const out of outputs.values())for(const binding of out.delegations){
  if(!['source-argv-call-binding','source-local-call-completion-binding'].includes(binding.kind)||!binding.target?.sourcePath)continue;
  const targetOut=outputs.get(canonical(binding.target.sourcePath));if(!targetOut)continue;
  const inside=f=>f.sourcePath===binding.target.sourcePath&&f.startByte>=binding.target.startByte&&f.endByte<=binding.target.endByte;
  binding.boundParserDefaultSources=targetOut.defaults.filter(inside);
  binding.callerGuardConjunction=binding.conditions;binding.bindingPolicy='Apply callee own guards only under this actual caller edge; recursion remains symbolic,not unrolled.';
  const targetFunction=indexedNode(functionBySourceStart,binding.target.sourcePath,binding.target.startByte),callNode=indexedNode(callBySourceStart,binding.sourcePath,binding.startByte);
  binding.formalActualBindings=(targetFunction?.parameters??[]).map((parameter,index)=>{const actual=callNode?.arguments[index];return {formal:site(parameter.name),parameterIndex:index,rest:!!parameter.dotDotDotToken,actual:actual?site(actual):null,omitted:!actual,defaultSource:parameter.initializer?site(parameter.initializer):null,callerConditions:binding.conditions}});
  binding.boundCalleeParameterDefaults=(targetFunction?.parameters??[]).filter(p=>p.initializer).map(p=>({...site(p.initializer),kind:'bound-callee-source-parameter-default',bindingExpression:expression(p.name),initializerBinding:ts.isIdentifier(p.initializer)&&initializer(p.initializer)?site(initializer(p.initializer)):undefined}));
  binding.boundCalleeCompletionSources=targetOut.exits.filter(f=>inside(f)&&f.functionSource?.startByte===binding.target.startByte);
  binding.boundParserReturnSources=targetOut.delegations.filter(f=>f.kind==='parser-source-return'&&inside(f));
  if(binding.target.sourcePath!==out.path)out.sourceBindings.push({kind:'actual-bound-parser-source',sourcePath:binding.target.sourcePath,sha256:createHash('sha256').update(files.get(canonical(binding.target.sourcePath)).text).digest('hex'),publicLaunchGranted:false});
 }
 for(const [p,out] of outputs){const source=files.get(p),sf=program.getSourceFile(p);out.sourceBindings.push({kind:'whole-static-source',sha256:createHash('sha256').update(source.text).digest('hex'),utf8Bytes:Buffer.byteLength(source.text),parser:'locked-TypeScript-AST',productExecution:false});for(const d of sf?.parseDiagnostics??[])out.unresolved.push({rule:'syntax-error',start:d.start,message:ts.flattenDiagnosticMessageText(d.messageText,' ')});out.unresolved.push({rule:'static-facts-require-native-route-and-control-flow-composition',detail:'No whole-complete claim: expressions preserve source, options are owned only through scoped argv flow. Reachability/public launch, result/host/framework exits and runtime-derived values require native composition.'});if(!stable)out.unresolved.push({rule:'dataflow-fixpoint-limit',rounds:round});}
 const missing=[...outputs.values()].flatMap(out=>out.unresolved).filter(f=>['tainted-imported-parser-source-unavailable','conditional-argv-module-delegation-binding-unresolved'].includes(f.rule));
 const imported=[];
 for(const issue of missing){
  const target=context.moduleBindings?.[issue.specifier],base=target?canonical(typeof target==='string'?target:target.path):issue.specifier.startsWith('.')?path.posix.resolve(path.posix.dirname(canonical(issue.sourcePath)),issue.specifier):null;
  if(!base)continue;
  const candidates=[base,base.replace(/\.[cm]?js$/u,'.ts'),base.replace(/\.mjs$/u,'.mts'),...['.ts','.mts','.mjs','.js','/index.ts','/index.mjs'].map(e=>base+e)];
  for(const candidate of candidates)if(loadDependency(candidate)){const source=files.get(candidate);if(!supplied.some(s=>canonical(s.path)===candidate))imported.push(source);break}
 }
 if(imported.length&&(context._parserDependencyRound??0)<8)return analyzeTypedCliSources(sources,{...context,importedSources:[...(context.importedSources??[]),...imported],_parserDependencyRound:(context._parserDependencyRound??0)+1});
 if(imported.length)for(const out of outputs.values())out.unresolved.push({rule:'parser-source-dependency-round-limit',rounds:8});
 return {sources:sources.map(s=>outputs.get(canonical(s.path))),analysis:{fixedPointStable:stable,rounds:round+1,productSourceExecuted:false,importedSourcesOnlySuppliedText:true}};
}
