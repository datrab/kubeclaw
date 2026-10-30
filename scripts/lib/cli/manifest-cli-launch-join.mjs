/** Pure manifest launch declarations. Native shell AST supplied by pinned coordinator.
 * No process, filesystem, imports of product, or live executable discovery. */
import path from 'node:path';
const p=path.posix;
const pointer=s=>String(s).replace(/~/g,'~0').replace(/\//g,'~1');
const uniq=xs=>[...new Set(xs)];
function literal(word,quoted=false){let value='';for(const part of word?.Parts??[]){if(part.Type==='Lit'){if(!quoted&&/[\\*?\[]/.test(part.Value??''))return {kind:'shell-pattern-or-escape',expression:null};value+=part.Value??''}else if(part.Type==='SglQuoted')value+=part.Value??'';else if(part.Type==='DblQuoted'){const inner=literal({...part,Parts:part.Parts??[]},true);if(inner.kind!=='literal')return inner;value+=inner.value}else return {kind:'dynamic-shell-word',astType:part.Type};}return {kind:'literal',value};}
const sourcePath=(cwd,target)=>{if(!cwd||p.isAbsolute(target))return null;const out=p.normalize(p.join(cwd,target));return out==='..'||out.startsWith('../')?null:out.replace(/^\.\//,'')};
const kinds=new Set(['supported','qualified-maintenance','legacy-gated','source-only-unqualified','delegated-receiver','private-parser-helper','upstream-wrapper','excluded-history','excluded-fixture','excluded-test-implementation']);
export function joinManifestCliLaunches(interfaces,context={}){
 if(typeof context.parseShell!=='function')throw Error('PINNED_NATIVE_SHELL_AST_REQUIRED');
 const files=new Set(context.gitFiles??[]),owners=new Map((context.ownership??[]).map(x=>[x.source??x.path,x]));
 const declarations=[],calls=[],targets=[],scriptEdges=[],symbolic=[],unresolved=[],dependencies=[],cwdTransitions=[];
 const byManifest=new Map(),manifestNames=new Map();
 for(const d of interfaces){if(!byManifest.has(d.manifest))byManifest.set(d.manifest,new Map());if(d.kind==='npm-script-declaration')byManifest.get(d.manifest).set(d.name,d)}
 const readManifest=name=>{if(manifestNames.has(name))return manifestNames.get(name);const src=context.readSource?.(name)??context.readDependency?.(name);if(src?.then)throw Error('SYNCHRONOUS_SOURCE_CUSTODY_REQUIRED');if(!src)return null;const text=typeof src==='string'?src:src.text;try{const data=JSON.parse(text);const row={path:name,data,sha256:src.sha256??null};manifestNames.set(name,row);dependencies.push({path:name,sha256:row.sha256,role:'manifest-source-declaration'});return row}catch(error){unresolved.push({manifest:name,rule:'manifest-json-source-refused',detail:error.message});return null}};
 for(const name of byManifest.keys())readManifest(name);
 const cust=(d,field='scripts')=>({kind:'virtual-manifest-value',manifest:d.manifest,manifestSha256:d.manifestSha256??null,jsonPointer:field==='bin'&&typeof manifestNames.get(d.manifest)?.data.bin==='string'?'/bin':`/${field}/${pointer(d.name)}`,sourceValue:d.command??d.target,physicalSpan:null});
 const mkTarget=(d,call,target,interpreter,argv,extra={})=>{
  const resolved=sourcePath(call.cwd,target),owner=resolved?owners.get(resolved):null;
  const nativeLanguage=['node','nodejs','tsx'].includes(interpreter)?'typescript':['python','python3'].includes(interpreter)?'python':['bash','sh','dash','zsh'].includes(interpreter)?'shell':interpreter==='go-run'?'go':null;
  const suffix=p.extname(resolved??'');const suffixLanguage=['.js','.mjs','.cjs','.ts','.mts','.cts'].includes(suffix)?'typescript':suffix==='.py'?'python':suffix==='.sh'?'shell':suffix==='.go'?'go':null;const knownLanguage=context.languageBySource?.[resolved]??nativeLanguage??suffixLanguage;
  const source=resolved&&files.has(resolved)?(context.readSource?.(resolved)??context.readDependency?.(resolved)):null;if(source?.then)throw Error('SYNCHRONOUS_SOURCE_CUSTODY_REQUIRED');
  const generatedResolution=resolved&&!files.has(resolved)?context.resolveGeneratedEntry?.({targetPath:resolved,cwd:call.cwd,interpreter,manifest:d.manifest}):null;
  const record={declaration:call.declaration,virtualSource:call.virtualSource,commandRange:call.commandRange,cwd:call.cwd,interpreter,targetExpression:target,targetPath:resolved,tracked:resolved?files.has(resolved):false,argv,guards:call.guards,ownership:owner??{kind:'source-only-unqualified',supportState:'not established',boundary:'Literal launch candidate only; source-first owner qualification still required.'},supportGranted:false,sourceLanguage:knownLanguage??'unqualified',sourceLanguageBasis:context.languageBySource?.[resolved]?'coordinator-native-source-custody':nativeLanguage?'literal-interpreter-receiver':suffixLanguage?'tracked-source-language-suffix':'requires-native-source-qualification',sourceBinding:source?{path:resolved,sha256:source.sha256??null,gitObject:source.gitObject??null,bytes:typeof source.text==='string'?Buffer.byteLength(source.text):null}:null,generatedResolution:generatedResolution??null,originManifestBoundary:context.manifestOwnership?.[d.manifest]??null,...extra};
  record.targetRole=record.interpretationMode==='syntax-check-only'?'syntax-only-source-reference':record.testRunnerInput?'test-runner-source-input':'entry-launch-candidate';if(resolved&&files.has(resolved)){targets.push(record);return record}
  symbolic.push({...record,kind:resolved?'literal-target-not-tracked':'absolute-or-outside-repository-target',sourceObligation:generatedResolution?'explicit-generated-source-resolution-supplied':resolved?'literal-interpreter-or-path-target-source-not-bound':'external-or-outside-source-boundary'});return record;
 };
 const wordExpression=(text,w)=>Buffer.from(text).subarray(w.Pos?.Offset??0,w.End?.Offset??0).toString('utf8');
 function npm(d,call,args){
  let prefix=null,workspaces=[],allWorkspaces=false,verb=null,name=null,forward=[],unknown=[];
  for(let i=0;i<args.length;i++){const a=args[i];if(a.kind!=='literal'){symbolic.push({...call,kind:'dynamic-npm-selection',arguments:args});return}const v=a.value;
   if(v==='--'){forward=args.slice(i+1);break}
   if(v==='--prefix'||v==='--workspace'||v==='-w'){if(!args[i+1]||args[i+1].kind!=='literal'){unresolved.push({...call,rule:'npm-selector-value-not-literal',selector:v});return}const x=args[++i].value;if(v==='--prefix')prefix=x;else workspaces.push(x);continue}
   if(v.startsWith('--prefix=')){prefix=v.slice(9);continue}if(v.startsWith('--workspace=')){workspaces.push(v.slice(12));continue}if(v==='--workspaces'){allWorkspaces=true;continue}
   if(v==='--if-present'||v==='--silent'||v==='-s')continue;
   if(!verb){if(['run','run-script','test','start','stop','restart'].includes(v)){verb=v;if(!['run','run-script'].includes(v))name=v}else{symbolic.push({...call,kind:'upstream-npm-command',verb:v,arguments:args});return}continue}
   if(!name){name=v;continue}if(v.startsWith('-'))unknown.push(v);else forward.push(a);
  }
  if(!verb||!name){symbolic.push({...call,kind:'npm-no-script-selection',arguments:args});return}
  if(unknown.length){unresolved.push({...call,rule:'npm-option-receiver-unqualified',options:unknown});return}
  const base=prefix?sourcePath(call.cwd,prefix):call.cwd;if(base===null){symbolic.push({...call,kind:'npm-prefix-outside-or-dynamic',prefix});return}
  let selected=[p.join(base,'package.json')];
  if(workspaces.length||allWorkspaces){
   // Coordinator supplies declared workspace membership. Names/paths are joined
   // only within this source-backed table, never all packages by coincidence.
   const ws=context.workspacePackages??[];const eligible=ws.filter(x=>x.rootManifest===p.join(base,'package.json'));
   selected=allWorkspaces?eligible.map(x=>x.manifest):[];
   for(const selector of workspaces){const matches=eligible.filter(x=>x.name===selector||p.dirname(x.manifest)===sourcePath(base,selector)||x.selector===selector);if(!matches.length)unresolved.push({...call,rule:'declared-workspace-selector-unresolved',selector,rootManifest:p.join(base,'package.json')});selected.push(...matches.map(x=>x.manifest))}
  }
  for(const manifest of uniq(selected)){const table=byManifest.get(manifest),target=table?.get(name);if(!target){unresolved.push({...call,rule:'npm-script-receiver-source-unavailable',targetManifest:manifest,script:name});continue}
   const phases=[`pre${name}`,name,`post${name}`].filter(x=>table.has(x));scriptEdges.push({...call,kind:'npm-script-call',targetManifest:manifest,script:name,targetJsonPointer:`/scripts/${pointer(name)}`,targetManifestSha256:target.manifestSha256,forwardedArguments:forward,lifecycle:phases.map(x=>({name:x,jsonPointer:`/scripts/${pointer(x)}`,sourceValue:table.get(x).command,manifestSha256:table.get(x).manifestSha256})),supportGranted:false,semantics:'Declared npm lifecycle order; status/if-present and environment remain receiver contracts. No launch support granted.'});
  }
 }
 function interpret(d,call,words){
  if(!words.length)return;
  let ws=words,wrappers=[];
  // Each wrapper is a native literal command position, not a path literal scan.
  for(let rounds=0;rounds<8;rounds++){
   if(ws[0]?.kind!=='literal'){symbolic.push({...call,kind:'runtime-selected-executable',words:ws,wrappers});return}
   const executable=ws[0].value;
   if(['command','exec'].includes(executable)){let i=1;if(ws[i]?.value==='--')i++;if(ws[i]?.value?.startsWith('-')){unresolved.push({...call,rule:'wrapper-option-receiver-unqualified',executable,words:ws});return}wrappers.push({executable});ws=ws.slice(i);continue}
   if(executable==='env'||executable==='cross-env'){let i=1;for(;i<ws.length;i++){const v=ws[i].value;if(ws[i].kind!=='literal')break;const eq=v.indexOf('=');if(eq>0){wrappers.push({kind:'environment-assignment',expression:v});continue}if(v==='--'){i++;break}if(v.startsWith('-')){unresolved.push({...call,rule:'env-wrapper-option-contract-required',word:v});return}break}ws=ws.slice(i);continue}
   if(executable==='npx'){let i=1;if(ws[i]?.value==='--no-install'||ws[i]?.value==='--yes'||ws[i]?.value==='-y')i++;if(ws[i]?.value?.startsWith('-')){symbolic.push({...call,kind:'npx-runtime-package-selection',words:ws,wrappers});return}wrappers.push({executable,packageInstallationAuthority:false});ws=ws.slice(i);continue}
   break;
  }
  const exe=ws[0]?.value;if(!exe){symbolic.push({...call,kind:'wrapper-without-literal-executable',words:ws});return}
  call={...call,wrappers,executable:exe};calls.push({...call,arguments:ws.slice(1)});
  if(exe==='npm'){npm(d,call,ws.slice(1));return}
  const base=p.basename(exe),native=['node','nodejs','tsx','python','python3','bash','sh','dash','zsh'];
  if(native.includes(exe)){
   let i=1,testMode=false,syntaxOnly=false;
   while(i<ws.length&&ws[i].kind==='literal'&&ws[i].value.startsWith('-')){
    const flag=ws[i].value;if(flag==='--'){i++;break}
    if((['node','nodejs'].includes(base)&&['--check','-c'].includes(flag))||(['bash','sh','dash','zsh'].includes(base)&&flag==='-n')){syntaxOnly=true;i++;continue}
    if(['-e','--eval','-p','--print','-c','-m'].includes(flag)||flag.startsWith('--eval=')){symbolic.push({...call,kind:'inline-or-module-interpreter-program',interpreter:base,words:ws.slice(i)});return}
    if(flag==='--test'){testMode=true;i++;continue}
    if(flag.startsWith('--test-concurrency=')||flag==='--experimental-strip-types'||flag==='--expose-gc'){i++;continue}
    if(['--import','--loader','--require','-r'].includes(flag)&&base==='node'){if(!ws[i+1]){unresolved.push({...call,rule:'interpreter-option-value-missing',flag});return}symbolic.push({...call,kind:'node-preload-module-dependency',flag,module:ws[i+1]});i+=2;continue}
    if(flag.startsWith('--import=')||flag.startsWith('--loader=')||flag.startsWith('--require=')){symbolic.push({...call,kind:'node-preload-module-dependency',flag});i++;continue}
    unresolved.push({...call,rule:'interpreter-option-receiver-unqualified',interpreter:base,flag});return;
   }
   if(!ws[i]){symbolic.push({...call,kind:'interpreter-stdin-or-default-discovery',interpreter:base,testMode});return}
   const selected=testMode?ws.slice(i):[ws[i]];
   for(const word of selected){if(word.kind==='literal')mkTarget(d,call,word.value,base,testMode?[]:ws.slice(i+1),{testRunnerInput:testMode,interpretationMode:syntaxOnly?'syntax-check-only':testMode?'test-runner-input':'script-execution-declaration',launchesScript:!syntaxOnly});else if(word.kind==='shell-pattern-or-escape'){
    const pattern=word.expression;const projection=context.expandShellPattern?.({pattern,cwd:call.cwd,gitFiles:[...files]});if(projection){for(const target of projection)mkTarget(d,{...call,cwd:'.'},target,base,[],{testRunnerInput:testMode,patternExpression:pattern,semantics:'Tracked-source projection of shell pattern, not effective runtime expansion.'})}else symbolic.push({...call,kind:'shell-pattern-interpreter-targets',pattern,interpreter:base,testMode});
   }else symbolic.push({...call,kind:'runtime-selected-interpreter-target',word,interpreter:base});}return;
  }
  if(exe==='go'){
   let i=1,cwd=call.cwd;if(ws[i]?.value==='-C'){if(ws[i+1]?.kind!=='literal'){symbolic.push({...call,kind:'dynamic-go-cwd',words:ws});return}cwd=sourcePath(cwd,ws[i+1].value);i+=2}
   const action=ws[i++]?.value;if(action==='run'){for(;i<ws.length;i++){const w=ws[i];if(w.kind!=='literal'){symbolic.push({...call,kind:'dynamic-go-run-target',word:w});break}if(w.value.startsWith('-')){unresolved.push({...call,rule:'go-run-option-contract-required',word:w});break}if(w.value.endsWith('.go'))mkTarget(d,{...call,cwd},w.value,'go-run',ws.slice(i+1));else {symbolic.push({...call,cwd,kind:'go-package-source-selection',action,selector:w.value});break}}}else symbolic.push({...call,cwd,kind:'upstream-go-command',action,words:ws.slice(i)});return;
  }
  if(exe.includes('/')){mkTarget(d,call,exe,'direct-path',ws.slice(1));return}
  const bin=context.resolveDeclaredBin?.({executable:exe,cwd:call.cwd});if(bin){for(const target of Array.isArray(bin)?bin:[bin])mkTarget(d,{...call,cwd:p.dirname(target.manifest)},target.target,'manifest-bin',ws.slice(1),{binCustody:target});return}
  symbolic.push({...call,kind:'upstream-or-path-selected-tool',sourceObligation:'external-installed-or-PATH-selected-executable-contract-not-owned-local-script',arguments:ws.slice(1),supportGranted:false});
 }
 for(let index=0;index<interfaces.length;index++){
  const d=interfaces[index];const boundManifest=readManifest(d.manifest);if(boundManifest&&d.manifestSha256&&boundManifest.sha256&&d.manifestSha256!==boundManifest.sha256){unresolved.push({declaration:index,rule:'declaration-manifest-custody-mismatch',manifest:d.manifest,expected:d.manifestSha256,actual:boundManifest.sha256});continue}if(boundManifest&&d.kind==='npm-script-declaration'&&boundManifest.data.scripts?.[d.name]!==d.command){unresolved.push({declaration:index,rule:'virtual-command-value-mismatch',manifest:d.manifest,name:d.name});continue}if(d.kind==='package-bin-declaration'){const virtualSource=cust(d,'bin');declarations.push({id:index,virtualSource,kind:d.kind});mkTarget(d,{declaration:index,virtualSource,cwd:d.cwd??p.dirname(d.manifest),guards:[]},d.target,'manifest-bin',[]);continue}
  if(d.kind!=='npm-script-declaration')continue;
  const virtualSource=cust(d),text=d.command;declarations.push({id:index,virtualSource,kind:d.kind,cwd:d.cwd,supportBoundary:d.supportBoundary,originOwnership:context.manifestOwnership?.[d.manifest]??{kind:'unqualified-manifest-declaration',supportState:'not established'}});let ast;
  try{ast=context.parseShell(text,{virtualSource});if(ast?.then)throw Error('SYNCHRONOUS_NATIVE_AST_REQUIRED');if(ast?.Type!=='File')throw Error('Native shell File required')}catch(error){unresolved.push({declaration:index,virtualSource,rule:'native-manifest-shell-syntax-refused',detail:error.message});continue}
  const expr=n=>Buffer.from(text).subarray(n?.Pos?.Offset??0,n?.End?.Offset??0).toString('utf8');
  const merge=states=>uniq(states);
  function statement(stmt,cwds,guards=[]){const n=stmt?.Cmd??stmt;if(!n)return {success:cwds,failure:cwds};
   if(n.Type==='BinaryCmd'){
    if(n.Op===13||n.Op===14){statement(n.X,cwds,[...guards,{relation:'pipeline-component-subshell'}]);statement(n.Y,cwds,[...guards,{relation:'pipeline-component-subshell'}]);return {success:cwds,failure:cwds}}
    const left=statement(n.X,cwds,guards),relation={virtualByteRange:[n.X.Pos?.Offset,n.X.End?.Offset],expression:expr(n.X)};
    if(n.Op===11){const right=statement(n.Y,left.success,[...guards,{...relation,relation:'left-command-success'}]);return {success:right.success,failure:merge([...left.failure,...right.failure])}}
    if(n.Op===12){const right=statement(n.Y,left.failure,[...guards,{...relation,relation:'left-command-failure'}]);return {success:merge([...left.success,...right.success]),failure:right.failure}}
    unresolved.push({declaration:index,virtualSource,rule:'native-shell-binary-operator-not-qualified',operator:n.Op});return {success:cwds,failure:cwds};
   }
   if(n.Type==='CallExpr'){
    const words=(n.Args??[]).map(w=>({...literal(w),expression:wordExpression(text,w)}));if(words[0]?.value==='cd'){
     const target=words[1];cwdTransitions.push({declaration:index,virtualSource,commandRange:{startVirtualByte:n.Pos?.Offset,endVirtualByte:n.End?.Offset,expression:expr(n)},inputCwds:cwds,arguments:words,guards,semantics:'Literal cd success changes current shell cwd; failure retains prior cwd. AND/OR caller guards select corresponding state.'});if(target?.kind!=='literal'||words.length!==2){unresolved.push({declaration:index,virtualSource,rule:'dynamic-or-option-cd-cwd',words});return {success:[null],failure:cwds}}
     if(stmt.Background)return {success:cwds,failure:cwds};const changed=cwds.map(cwd=>sourcePath(cwd,target.value));return stmt.Negated?{success:cwds,failure:changed}:{success:changed,failure:cwds};
    }
    for(const cwd of cwds)interpret(d,{declaration:index,virtualSource,commandRange:{startVirtualByte:n.Pos?.Offset,endVirtualByte:n.End?.Offset,expression:expr(n)},cwd,guards,assignments:n.Assigns??[],negated:!!stmt.Negated,background:!!stmt.Background},words);
    return {success:cwds,failure:cwds};
   }
   // Actual current782 declarations use only File/BinaryCmd/CallExpr. Other
   // native grammar is explicit rather than recursively mining helper bodies.
   unresolved.push({declaration:index,virtualSource,rule:'native-shell-launch-control-not-qualified',astType:n.Type,expression:expr(n)});return {success:cwds,failure:cwds};
  }
  let cwds=[d.cwd??p.dirname(d.manifest)];for(const stmt of ast.Stmts??[]){const outcomes=statement(stmt,cwds);cwds=merge([...outcomes.success,...outcomes.failure])}
 }
 return {schemaVersion:'native-manifest-cli-launch-join.v1',authority:'Source declarations only; no supported invocation or execution grant inferred.',declarations,calls,targets,scriptEdges,symbolic,unresolved,dependencies,cwdTransitions,ownershipKindsRecognized:[...kinds]};
}

/** Stable coordinator seam. manifestInputs: source-bound {path,sha256,text|data}
 * package manifests, or existing normalized npm-script/package-bin declarations.
 * workspaceMembership: [{rootManifest,manifest,name,...sourceCustody}]. */
export function discoverManifestLaunches(manifestInputs,context={}){
 const native=new Map(),interfaces=[];
 for(const m of manifestInputs){if(m.kind==='npm-script-declaration'||m.kind==='package-bin-declaration'){interfaces.push(m);continue}
  if(!m.path||!m.sha256)throw Error('MANIFEST_SOURCE_CUSTODY_REQUIRED');const data=m.data??JSON.parse(m.text);native.set(m.path,{...m,text:m.text??JSON.stringify(data),data});const cwd=p.dirname(m.path);
  for(const[name,command]of Object.entries(data.scripts??{})){if(typeof command!=='string')throw Error('NPM_SCRIPT_VALUE_MUST_BE_STRING');interfaces.push({kind:'npm-script-declaration',manifest:m.path,manifestSha256:m.sha256,name,command,cwd,supportBoundary:'Manifest declaration only; owner support is separate.'})}
  if(typeof data.bin==='string')interfaces.push({kind:'package-bin-declaration',manifest:m.path,manifestSha256:m.sha256,name:p.basename(data.name??p.basename(cwd)),target:data.bin,cwd});
  else for(const[name,target]of Object.entries(data.bin??{})){if(typeof target!=='string')throw Error('NPM_BIN_VALUE_MUST_BE_STRING');interfaces.push({kind:'package-bin-declaration',manifest:m.path,manifestSha256:m.sha256,name,target,cwd})}
 }
 const files=context.files??context.gitFiles??[];const result=joinManifestCliLaunches(interfaces,{...context,gitFiles:[...files].map(x=>typeof x==='string'?x:x.path),workspacePackages:context.workspaceMembership??context.workspacePackages??[],readSource:file=>native.get(file)??context.readSource?.(file)??context.readDependency?.(file)});
 return {...result,targets:result.targets.map(t=>({...t,path:t.targetPath,language:t.sourceLanguage,launchesScript:t.launchesScript??t.targetRole==='entry-launch-candidate'})),edges:result.scriptEdges};
}
