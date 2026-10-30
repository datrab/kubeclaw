import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {TextDecoder} from 'node:util';

const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const decode=new TextDecoder('utf-8',{fatal:true});
const languageExtensions=new Map([
 ['.js','typescript'],['.mjs','typescript'],['.cjs','typescript'],['.ts','typescript'],['.mts','typescript'],['.cts','typescript'],['.tsx','typescript'],
 ['.sh','shell'],['.bash','shell'],['.py','python'],['.go','go'],
]);
const factFields=['commands','subcommands','functions','options','positionals','defaults','exits','branches','delegations','guards','sourceBindings','unresolved'];
const ownershipKinds=new Set(['supported','qualified-maintenance','legacy-gated','source-only-unqualified','delegated-receiver','private-parser-helper','upstream-wrapper','excluded-history','excluded-fixture','excluded-test-implementation']);
const excludedKinds=new Set(['excluded-history','excluded-fixture','excluded-test-implementation']);
const fail=(code,detail)=>{throw new Error(`${code}: ${detail}`);};
export function relativeSource(name){
 if(typeof name!=='string'||!name||name.includes('\\')||path.posix.isAbsolute(name)||name.split('/').some(p=>p===''||p==='.'||p==='..'))fail('CLI_SOURCE_PATH_UNQUALIFIED',String(name));
 return name;
}
function git(root,...args){return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trimEnd();}
export function trackedFiles(root){
 const entries=git(root,'ls-files','--stage','-z').split('\0').filter(Boolean),files=new Map();
 const committed=new Map(git(root,'ls-tree','-r','-z','HEAD').split('\0').filter(Boolean).map(entry=>{const [metadata,name]=entry.split('\t');const [mode,type,object]=metadata.split(' ');return [name,{mode,type,object}];}));
 for(const entry of entries){const [metadata,name]=entry.split('\t');const [mode,object,stage]=metadata.split(' ');relativeSource(name);if(stage!=='0'||files.has(name))fail('CLI_SOURCE_INDEX_UNMERGED',name);const head=committed.get(name);files.set(name,{path:name,mode,object,headMode:head?.mode,headObject:head?.object});}
 return files;
}
export function readBoundSource(root,name,files){
 relativeSource(name);const record=files.get(name);if(!record||!['100644','100755'].includes(record.mode))fail('CLI_SOURCE_NOT_REGULAR_TRACKED_FILE',name);
 if(record.mode!==record.headMode||record.object!==record.headObject)fail('CLI_SOURCE_INDEX_NOT_COMMITTED',name);
 const absolute=path.join(root,name),stat=fs.lstatSync(absolute);
 if(!stat.isFile()||stat.isSymbolicLink()||fs.realpathSync(absolute)!==absolute)fail('CLI_SOURCE_PHYSICAL_IDENTITY_DRIFT',name);
 const bytes=fs.readFileSync(absolute);if(bytes.includes(0))fail('CLI_SOURCE_BINARY_UNQUALIFIED',name);
 let text;try{text=decode.decode(bytes);}catch{fail('CLI_SOURCE_UTF8_UNQUALIFIED',name);}
 const object=execFileSync('git',['hash-object','--stdin'],{cwd:root,input:bytes,encoding:'utf8'}).trim();
 if(object!==record.object)fail('CLI_SOURCE_CURRENT_BYTES_UNCOMMITTED',name);
 return {path:name,text,sha256:sha(bytes),bytes:bytes.length,gitObject:object,mode:record.mode};
}
function language(name,text){return languageExtensions.get(path.posix.extname(name))??(/^#![^\n]*\b(?:ba|da|k|z)?sh\b/u.test(text)?'shell':/^#![^\n]*\bpython3?\b/u.test(text)?'python':/^#![^\n]*\b(?:node|nodejs|tsx|deno|bun)\b/u.test(text)?'typescript':null);}
function candidate(name,text){
 return /\.(?:ba)?sh$/u.test(name)||/\b(?:argv|Args)\b/u.test(text)||/['"](?:node:)?process['"]/u.test(text)||/(?:process\s*\.\s*argv|sys\s*\.\s*argv|os\s*\.\s*Args|\bfunc\s+main\s*\(|^#!|__name__\s*==|import\.meta\.url|\bArgumentParser\s*\(|\bparse_args\s*\(|\bgetopts\b|\bcase\s+[^\n]*\$[{@1-9])/mu.test(text);
}
export function validateCliOwnership(map){
 if(map?.schemaVersion!=='kubeclaw-cli-source-ownership.v1'||!Array.isArray(map.interfaces))fail('CLI_OWNERSHIP_SCHEMA_UNQUALIFIED','expected native ownership map');
 const out=new Map();
 for(const row of map.interfaces){relativeSource(row.source);if(out.has(row.source)||!ownershipKinds.has(row.kind))fail('CLI_OWNERSHIP_AMBIGUOUS',row.source);if(typeof row.boundary!=='string'||!row.boundary||typeof row.supportState!=='string'||!row.supportState)fail('CLI_OWNERSHIP_BOUNDARY_MISSING',row.source);out.set(row.source,row);}
 return out;
}
// Membership is independently discovered, not a fixed source-name or flag count.
// New native entries are retained as read-only unqualified declarations. They
// never acquire supported execution or private exclusions by extension/name.
export function acquireCliSources(root,map,{launchTargets=[]}={}){
 root=fs.realpathSync(root);if(git(root,'rev-parse','--show-toplevel')!==root)fail('CLI_SOURCE_ROOT_UNQUALIFIED',root);
 const files=trackedFiles(root),owners=validateCliOwnership(map),selected=[],dispositions=[];
 const targets=new Map();for(const target of launchTargets){relativeSource(target.path);if(!files.has(target.path))fail('CLI_LAUNCH_TARGET_NOT_TRACKED',target.path);if(target.language&&!['typescript','shell','python','go'].includes(target.language))fail('CLI_LAUNCH_TARGET_LANGUAGE_UNQUALIFIED',target.path);const prior=targets.get(target.path);if(prior?.language&&target.language&&prior.language!==target.language)fail('CLI_LAUNCH_TARGET_LANGUAGE_AMBIGUOUS',target.path);targets.set(target.path,{...prior,...target});}
 const dirty=git(root,'diff','--name-only','HEAD','--','.').split('\n').filter(Boolean).filter(name=>!name.startsWith('docs/site/')&&!name.startsWith('docs/generated/')&&name!=='docs/blueprint/documentation-completion-matrix.json'&&!(name.startsWith('docs/blueprint/acceptance-evidence/')&&name.endsWith('.json')));
 if(dirty.length)fail('CLI_SOURCE_ROOT_UNCOMMITTED',dirty.join(', '));
 const untracked=git(root,'ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean).filter(name=>!name.startsWith('docs/generated/')&&!name.startsWith('docs/site/')&&languageExtensions.has(path.posix.extname(name)));
 if(untracked.length)fail('CLI_SOURCE_UNTRACKED_CANDIDATE',untracked.join(', '));
 for(const [name,record]of files){
  const known=owners.get(name),target=targets.get(name),ext=path.posix.extname(name);
  if(!known&&!target&&!languageExtensions.has(ext)){
   // Extensionless entrypoints are discovered from their physical shebang,
   // not just executable bits or known pathname lists. Non-Source binary data
   // remains outside the syntax set; a candidate shebang must pass all guards.
   if(!['100644','100755'].includes(record.mode))continue;
   const absolute=path.join(root,name),stat=fs.lstatSync(absolute);
   if(!stat.isFile()||stat.isSymbolicLink())continue;
   const fd=fs.openSync(absolute,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
   const prefix=Buffer.alloc(256);let length;try{length=fs.readSync(fd,prefix,0,256,0);}finally{fs.closeSync(fd);}
   if(!prefix.subarray(0,length).toString('utf8').startsWith('#!'))continue;
  }
  if(!['100644','100755'].includes(record.mode))fail('CLI_OWNED_SOURCE_NOT_REGULAR',name);
  const source=readBoundSource(root,name,files),lang=language(name,source.text)??target?.language;
  if(!known&&!target&&!candidate(name,source.text))continue;
  const owner=known??{source:name,kind:'source-only-unqualified',supportState:'not established',boundary:'New native entry/parser candidate. Read-only source declaration, not supported invocation or execution authority.'};
  const disposition={source:name,kind:owner.kind,supportState:owner.supportState,boundary:owner.boundary,sha256:source.sha256,gitObject:source.gitObject,mode:source.mode};
  dispositions.push(disposition);
  if(excludedKinds.has(owner.kind))continue;
  if(!lang)fail('CLI_OWNED_SOURCE_LANGUAGE_UNQUALIFIED',name);
  selected.push(Object.freeze({...source,language:lang,ownership:Object.freeze(disposition)}));
 }
 for(const name of owners.keys())if(!files.has(name))fail('CLI_OWNERSHIP_ORPHAN',name);
 return {root,files,selected,dispositions};
}
function verifyPhysicalSpans(value,source,readDependency){
 if(!value||typeof value!=='object')return;
 const hasSpan=Number.isInteger(value.startByte)&&Number.isInteger(value.endByte);
 const named=value.sourcePath??(hasSpan?value.source:undefined);
 if(typeof named==='string'&&named!==source.path)source=readDependency(named);
 if(hasSpan){
  const bytes=Buffer.from(source.text);if(value.startByte<0||value.endByte<value.startByte||value.endByte>bytes.length)fail('CLI_FACT_SOURCE_RANGE_UNQUALIFIED',source.path);
  const expected=value.expression??value.exact;
  if(typeof expected==='string'&&decode.decode(bytes.subarray(value.startByte,value.endByte))!==expected)fail('CLI_FACT_SOURCE_EXPRESSION_DRIFT',source.path);
 }
 for(const child of Object.values(value))if(Array.isArray(child))for(const item of child)verifyPhysicalSpans(item,source,readDependency);else if(child&&typeof child==='object')verifyPhysicalSpans(child,source,readDependency);
}
export function normalizeCliFacts(raw,source,readDependency=()=>fail('CLI_FACT_FOREIGN_SOURCE_UNBOUND',source.path)){
 if(!raw||raw.path!==source.path&&raw.source!==source.path)fail('CLI_FACT_SOURCE_IDENTITY_DRIFT',source.path);
 if(raw.sha256&&raw.sha256!==source.sha256)fail('CLI_FACT_SOURCE_DIGEST_DRIFT',source.path);
 verifyPhysicalSpans(raw,source,readDependency);
 for(const binding of raw.sourceBindings??[]){
  const name=binding.sourcePath??binding.path??binding.source??source.path;
  const bound=name===source.path?source:readDependency(name);
  if(binding.sha256&&binding.sha256!==bound.sha256)fail('CLI_FACT_DEPENDENCY_DIGEST_DRIFT',name);
  if(binding.utf8Bytes!==undefined&&binding.utf8Bytes!==bound.bytes)fail('CLI_FACT_DEPENDENCY_SIZE_DRIFT',name);
 }
 const row={path:source.path,language:source.language,ownership:source.ownership,sourceBinding:{sha256:source.sha256,bytes:source.bytes,gitObject:source.gitObject,mode:source.mode},representation:'Native static source declarations and unevaluated expressions; no product execution or effective runtime outcome.'};
 for(const field of factFields){const value=raw[field]??(field==='commands'?raw.commandTree:field==='exits'?raw.exitRules:field==='sourceBindings'?raw.sourceRanges:undefined)??[];if(!Array.isArray(value))fail('CLI_FACT_SCHEMA_UNQUALIFIED',`${source.path}:${field}`);row[field]=value;}
 const consumed=new Set([...factFields,'path','source','sha256','bytes','commandTree','exitRules','sourceRanges','limitations','limits']);
 row.adapterMetadata=Object.fromEntries(Object.entries(raw).filter(([key])=>!consumed.has(key)));
 row.adapterLimits=raw.limitations??raw.limits??[];
 return row;
}
// Adapters are injected pure syntax/dataflow owners; this coordinator does not
// import product entrypoints, run --help, evaluate defaults or alias API roles.
export async function buildCliSourceModel(root,map,adapters){
 map=JSON.parse(JSON.stringify(map));
 root=fs.realpathSync(root);const initialHead=git(root,'rev-parse','HEAD'),initialFiles=trackedFiles(root),dependencies=new Map();
 const preRead=name=>{relativeSource(name);if(!dependencies.has(name))dependencies.set(name,Object.freeze(readBoundSource(root,name,initialFiles)));return dependencies.get(name);};
 const declaredWorkspaces=JSON.parse(preRead('package.json').text).workspaces;
 const manifestRoles=new Map();for(const role of map.manifestRoles??[]){
 if(role.source==='package.json'||Array.isArray(declaredWorkspaces)&&declaredWorkspaces.some(pattern=>typeof pattern==='string'&&path.matchesGlob(path.posix.dirname(role.source),pattern)))fail('CLI_MANIFEST_ROLE_ACTIVE_ROOT_CONFLICT',role.source);
 if(!Array.isArray(role.roleAuthorities)||role.roleAuthorities.length===0)fail('CLI_MANIFEST_ROLE_AUTHORITIES_MISSING',role.source);
relativeSource(role.source);if(manifestRoles.has(role.source)||role.kind!=='archived-data-manifest'||!(/^[a-f0-9]{64}$/u.test(role.sha256))||!role.boundary)fail('CLI_MANIFEST_ROLE_UNQUALIFIED',role.source);const bound=preRead(role.source);if(bound.sha256!==role.sha256)fail('CLI_MANIFEST_ROLE_SOURCE_CHANGED',role.source);for(const authority of role.roleAuthorities??[])preRead(authority);manifestRoles.set(role.source,Object.freeze({...role}));}
 const manifests=[...initialFiles.keys()].filter(name=>name==='package.json'||name.endsWith('/package.json')).map(name=>{const source=preRead(name);const role=manifestRoles.get(name)??null;return {...source,manifest:role?.kind==='archived-data-manifest'?null:JSON.parse(source.text),manifestRole:role};});
 const launch=adapters.discoverLaunches?await adapters.discoverLaunches(Object.freeze(manifests),{root,files:initialFiles,readDependency:preRead}):{targets:[],declarations:[],edges:[],unresolved:[]};
 if(!launch||!Array.isArray(launch.targets))fail('CLI_MANIFEST_LAUNCH_SCHEMA_UNQUALIFIED','native target array required');
 const acquired=acquireCliSources(root,map,{launchTargets:launch.targets}),byPath=new Map(acquired.selected.map(s=>[s.path,s])),facts=[];
 const readDependency=name=>{relativeSource(name);if(byPath.has(name))return byPath.get(name);if(!dependencies.has(name))dependencies.set(name,Object.freeze(readBoundSource(acquired.root,name,acquired.files)));return dependencies.get(name);};
 const rootManifest=JSON.parse(readDependency('package.json').text),moduleBindings={},manifestInterfaces=[];
 if(!Array.isArray(rootManifest.workspaces))fail('CLI_WORKSPACE_DECLARATION_UNQUALIFIED','expected actual workspace array');
 const patterns=rootManifest.workspaces.map(pattern=>{
  if(typeof pattern!=='string'||pattern.includes('**')||/[?{}[\]\\]/u.test(pattern))fail('CLI_WORKSPACE_PATTERN_UNQUALIFIED',String(pattern));
  relativeSource(pattern);
  return new RegExp('^'+pattern.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')).join('[^/]+')+'$','u');
 });
 const workspaceNames=new Set();
 // Preserve exact native JSON declarations, including hook selection/cwd.
 // A manifest declaration is not a new supported execution grant. In
 // particular fixture/private packages cannot become public by this join.
 for(const name of acquired.files.keys()){
  if(name!=='package.json'&&!name.endsWith('/package.json'))continue;
  if(manifestRoles.has(name))continue; // Exact archived data custody only; never command/default authority.
  const binding=readDependency(name),manifest=JSON.parse(binding.text);
  const scripts=manifest.scripts??{};if(!scripts||typeof scripts!=='object'||Array.isArray(scripts))fail('CLI_MANIFEST_SCRIPTS_UNQUALIFIED',name);
  for(const [script,command]of Object.entries(scripts)){
   if(typeof command!=='string')fail('CLI_MANIFEST_COMMAND_UNQUALIFIED',`${name}:${script}`);
   manifestInterfaces.push({kind:'npm-script-declaration',manifestRole:manifestRoles.get(name)??null,manifest:name,manifestSha256:binding.sha256,name:script,command,cwd:path.posix.dirname(name),lifecycle:['pre'+script,script,'post'+script].filter(key=>Object.hasOwn(scripts,key)).map(key=>({name:key,command:scripts[key]})),supportBoundary:name==='package.json'?'Root maintained command declaration; actual operational duties and delegated parser remain separate.':'Package declaration only; private/fixture/support status must be established by actual caller/owning package, not inferred from package.json existence.'});
  }
  const bins=typeof manifest.bin==='string'?{[manifest.name??'<unnamed>']:manifest.bin}:manifest.bin??{};
  if(typeof bins!=='object'||Array.isArray(bins))fail('CLI_MANIFEST_BIN_UNQUALIFIED',name);
  for(const [command,target]of Object.entries(bins)){if(typeof target!=='string')fail('CLI_MANIFEST_BIN_TARGET_UNQUALIFIED',name);manifestInterfaces.push({kind:'package-bin-declaration',manifestRole:manifestRoles.get(name)??null,manifest:name,manifestSha256:binding.sha256,name:command,target,cwd:path.posix.dirname(name),supportBoundary:'Declared executable mapping; Source/launch/parser and supported operational authority require the owning manifest/caller context.'});}
 }
 for(const name of acquired.files.keys()){
  if(!name.endsWith('/package.json')||!patterns.some(pattern=>pattern.test(path.posix.dirname(name))))continue;
  const manifest=JSON.parse(readDependency(name).text);if(typeof manifest.name!=='string'||workspaceNames.has(manifest.name))fail('CLI_WORKSPACE_NAME_UNQUALIFIED',name);workspaceNames.add(manifest.name);
  const exports=typeof manifest.exports==='string'?{'.':manifest.exports}:manifest.exports??{};
  for(const [key,target]of Object.entries(exports)){
   // Actual source exports are authoritative. Never guess dist-to-src or use
   // a types-only declaration as a runtime parser implementation.
   if(typeof target!=='string'||!target.startsWith('./')||key.includes('*')||target.includes('*'))continue;
   const file=path.posix.normalize(path.posix.join(path.posix.dirname(name),target));relativeSource(file);
   if(!acquired.files.has(file))continue;
   const specifier=key==='.'?manifest.name:key.startsWith('./')?manifest.name+key.slice(1):null;
   if(specifier){if(moduleBindings[specifier])fail('CLI_WORKSPACE_EXPORT_AMBIGUOUS',specifier);moduleBindings[specifier]=file;}
  }
 }
 for(const lang of ['typescript','shell','python','go']){
  const sources=acquired.selected.filter(s=>s.language===lang);if(!sources.length)continue;
  if(typeof adapters[lang]!=='function')fail('CLI_ADAPTER_UNAVAILABLE',lang);
  const result=await adapters[lang](Object.freeze(sources),{root:acquired.root,allSources:Object.freeze([...acquired.selected]),readDependency,moduleBindings:Object.freeze(moduleBindings)});
  const rows=Array.isArray(result)?result:result?.sources;if(!Array.isArray(rows))fail('CLI_ADAPTER_SCHEMA_UNQUALIFIED',lang);
  const returned=new Map();for(const row of rows){const name=row.path??row.source;if(returned.has(name)||!sources.some(s=>s.path===name))fail('CLI_ADAPTER_DUPLICATE_OR_FOREIGN_SOURCE',String(name));returned.set(name,row);}
  if(returned.size!==sources.length)fail('CLI_ADAPTER_SOURCE_OMITTED',lang);
  for(const source of sources)facts.push(normalizeCliFacts(returned.get(source.path),source,readDependency));
 }
 // Reacquire bytes after all child parsers, so a concurrent mutation cannot be
 // disguised by a valid parse of stale input. This is a closed Source snapshot,
 // not an acceptance/role grant.
 if(git(root,'rev-parse','HEAD')!==initialHead)fail('CLI_SOURCE_HEAD_CHANGED_DURING_ACQUISITION','HEAD changed');
 const after=acquireCliSources(root,map,{launchTargets:launch.targets});
 if(JSON.stringify(after.dispositions)!==JSON.stringify(acquired.dispositions))fail('CLI_SOURCE_CHANGED_DURING_ACQUISITION','membership or complete Source vector changed');
 for(const s of after.selected)if(s.sha256!==byPath.get(s.path)?.sha256)fail('CLI_SOURCE_CHANGED_DURING_ACQUISITION',s.path);
 const dependencyBindings=[];
 for(const [name,before]of dependencies){const current=readBoundSource(acquired.root,name,after.files);if(current.sha256!==before.sha256)fail('CLI_DEPENDENCY_CHANGED_DURING_ACQUISITION',name);dependencyBindings.push({path:name,sha256:current.sha256,gitObject:current.gitObject,mode:current.mode,bytes:current.bytes});}
 const sources=facts.sort((a,b)=>a.path.localeCompare(b.path,'en'));
 return {schemaVersion:'kubeclaw-cli-source-model.v1',sourceRevision:git(root,'rev-parse','HEAD'),authority:'Static CLI syntax/dataflow model from complete physical committed native sources; source expressions are not evaluated and supported execution is not inferred.',ownershipDeclarationSha256:sha(Buffer.from(JSON.stringify(map))),ownership:acquired.dispositions,manifestInterfaces,archivedDataDispositions:[...manifestRoles.values()],launchGraph:launch,dependencyBindings:dependencyBindings.sort((a,b)=>a.path.localeCompare(b.path,'en')),sources,unresolved:sources.flatMap(row=>row.unresolved.map(issue=>({source:row.path,...issue}))),acceptance:'NOT_ADJUDICATED; native facts require whole command/caller/default/exit semantic and reader composition.'};
}
