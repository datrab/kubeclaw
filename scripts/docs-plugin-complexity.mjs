#!/usr/bin/env node
/** Dynamic installable-package discovery and independently reviewable complexity assignments.
 * Check mode never writes. No manifest count, README length or test existence implies depth.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

const registrationKeys = ['stages','observers','adapters','testProviders','reportAdapters'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const slash = value => value.split(path.sep).join('/');
function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
    const file=path.join(directory,entry.name);
    if(entry.isSymbolicLink()) return [];
    if(entry.isDirectory()) return ['node_modules','.git','dist','dist-studio','.tmp'].includes(entry.name)?[]:walk(file);
    return entry.isFile()?[file]:[];
  });
}
function read(root,relative) {
  if(!repositoryFile(relative))throw Error(`PLUGIN_COMPLEXITY_SOURCE_ESCAPE:${relative}`);
  return JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
}
function repositoryFile(relative) {
  return typeof relative==='string' && relative.length>0 && !relative.includes('\\')
    && !path.posix.isAbsolute(relative) && path.posix.normalize(relative)===relative
    && !relative.split('/').some(part=>part==='..'||part==='.'||!part);
}
function local(root,base,relative) {
  const target=path.resolve(root,base,relative),inside=path.relative(root,target);
  if(inside==='..'||inside.startsWith(`..${path.sep}`)||path.isAbsolute(inside))throw Error(`PLUGIN_COMPLEXITY_SOURCE_ESCAPE:${relative}`);
  return slash(inside);
}
/** Every current installable manifest in the same declared product roots as the catalogue. */
export function discover(root) {
  const files=[...walk(path.join(root,'skills')).filter(f=>['plugin.json','openclaw.plugin.json'].includes(path.basename(f))),
    ...walk(path.join(root,'plugins')).filter(f=>path.basename(f)==='plugin.json'&&path.basename(path.dirname(f))==='.codex-plugin')];
  const ids=new Set();
  return files.map(file=>{
    const manifest=JSON.parse(fs.readFileSync(file,'utf8')),id=manifest.id??manifest.name;
    if(typeof id!=='string'||!id||ids.has(id))throw Error(`PLUGIN_COMPLEXITY_MANIFEST_ID_INVALID:${id}`);
    ids.add(id);
    const directory=slash(path.relative(root,path.dirname(file)));
    const host=file.endsWith('openclaw.plugin.json')?'openclaw':directory.endsWith('/.codex-plugin')?'codex':'pipeline-runtime';
    const registrations=registrationKeys.flatMap(kind=>(manifest[kind]??[]).map(item=>({kind,...item})));
    return {id,manifest:slash(path.relative(root,file)),directory,host,registrations};
  }).sort((a,b)=>a.id.localeCompare(b.id));
}
/** Follow local schema refs, including shared definitions and array/item/conditional paths.
 * Source diagnostics are not a green no-complexity result. External refs require an explicit
 * named authority in policy.schemaAuthorities; no network or arbitrary filesystem fallback.
 */
export function schemaSignals(root,packageInfo,policy) {
  const files=new Set(),signals=new Set(),seen=new Set();
  function visit(file,node,pointer='',depth=0) {
    if(!node||typeof node!=='object')return;
    const key=`${file}#${pointer}`;if(seen.has(key))return;seen.add(key);files.add(file);
    if(Array.isArray(node)){node.forEach((child,index)=>visit(file,child,`${pointer}/${index}`,depth));return;}
    if(['oneOf','anyOf','allOf','if','then','else','dependentSchemas','not'].some(k=>Object.hasOwn(node,k)))signals.add('conditional-configuration');
    if(depth>0&&(['properties','patternProperties','additionalProperties','items','prefixItems'].some(k=>Object.hasOwn(node,k))))signals.add('nested-configuration');
    if(node.$ref){
      const [location,fragment='']=node.$ref.split('#');
      const target=location?(policy.schemaAuthorities?.[location]??local(root,path.posix.dirname(file),location)):file;
      if(/^[a-z][a-z0-9+.-]*:/iu.test(target))throw Error(`PLUGIN_COMPLEXITY_SCHEMA_AUTHORITY_MISSING:${node.$ref}`);
      const source=read(root,target);let selected=source;
      if(fragment){if(!fragment.startsWith('/'))throw Error(`PLUGIN_COMPLEXITY_SCHEMA_FRAGMENT_UNSUPPORTED:${node.$ref}`);
        for(const part of fragment.slice(1).split('/'))selected=selected?.[part.replaceAll('~1','/').replaceAll('~0','~')];
        if(selected===undefined)throw Error(`PLUGIN_COMPLEXITY_SCHEMA_REF_MISSING:${node.$ref}`);}
      visit(target,selected,fragment,depth);
    }
    for(const [name,child]of Object.entries(node)){
      if(name==='$ref'||name==='$defs'||name==='definitions')continue;
      visit(file,child,`${pointer}/${name}`,depth+(name==='properties'||name==='items'||name==='patternProperties'?1:0));
    }
  }
  for(const registration of packageInfo.registrations){
    if(registration.configSchema){const file=local(root,packageInfo.directory,registration.configSchema);visit(file,read(root,file));}
  }
  // Host manifests own inline configuration schemas separately from pipeline registrations.
  if(packageInfo.host==='openclaw'){const manifest=read(root,packageInfo.manifest);if(manifest.configSchema)visit(packageInfo.manifest,manifest.configSchema,'/configSchema');}
  return {signals:[...signals].sort(),schemaFiles:[...files].sort()};
}
export function evaluate(root,policy,{checkBindings=true}={}) {
  if(policy.schemaVersion!=='documentation-plugin-complexity.v1')throw Error('PLUGIN_COMPLEXITY_POLICY_VERSION');
  const packages=discover(root),assignments=policy.packages;
  if(!Array.isArray(assignments))throw Error('PLUGIN_COMPLEXITY_ASSIGNMENTS_MISSING');
  const byId=new Map();for(const assignment of assignments){if(byId.has(assignment.id))throw Error(`PLUGIN_COMPLEXITY_ASSIGNMENT_DUPLICATE:${assignment.id}`);byId.set(assignment.id,assignment);}
  const found=new Set(packages.map(item=>item.id));
  for(const id of byId.keys())if(!found.has(id))throw Error(`PLUGIN_COMPLEXITY_REMOVED_PACKAGE_ASSIGNMENT:${id}`);
  return packages.map(item=>{
    const assignment=byId.get(item.id);if(!assignment)throw Error(`PLUGIN_COMPLEXITY_ASSIGNMENT_MISSING:${item.id}`);
    const schemas=schemaSignals(root,item,policy),signals=[...schemas.signals];
    if(item.registrations.length>1)signals.push('multiple-registrations');
    for(const criterion of ['externalEffects','persistence','internalExtension']){
      const judgment=assignment.criteria?.[criterion];
      if(typeof judgment?.applies!=='boolean'||typeof judgment?.reason!=='string'||!judgment.reason.trim()||!Array.isArray(judgment?.sources)||!judgment.sources.length)throw Error(`PLUGIN_COMPLEXITY_JUDGMENT_MISSING:${item.id}:${criterion}`);
      for(const source of judgment.sources)if(!Object.hasOwn(assignment.sourceBindings??{},source))throw Error(`PLUGIN_COMPLEXITY_JUDGMENT_UNBOUND:${item.id}:${source}`);
      if(judgment.applies)signals.push(criterion);
    }
    if(assignment.manifest!==item.manifest)throw Error(`PLUGIN_COMPLEXITY_MANIFEST_MOVED:${item.id}`);
    // Config schema additions/removals and new registration modules cannot hide behind an old manifest binding.
    for(const source of [item.manifest,...schemas.schemaFiles,...item.registrations.map(r=>local(root,item.directory,r.module))]){
      if(!Object.hasOwn(assignment.sourceBindings??{},source))throw Error(`PLUGIN_COMPLEXITY_SOURCE_UNBOUND:${item.id}:${source}`);
    }
    for(const[source,digest]of Object.entries(assignment.sourceBindings??{})){
      if(!repositoryFile(source))throw Error(`PLUGIN_COMPLEXITY_SOURCE_ESCAPE:${source}`);
      if(!/^[a-f0-9]{64}$/u.test(digest)||!fs.existsSync(path.join(root,source)))throw Error(`PLUGIN_COMPLEXITY_SOURCE_MISSING:${item.id}:${source}`);
      if(checkBindings&&sha(fs.readFileSync(path.join(root,source)))!==digest)throw Error(`PLUGIN_COMPLEXITY_REVIEW_SOURCE_CHANGED:${item.id}:${source}`);
    }
    // A scalar enforces exactly one canonical assignment; supporting paths may be many.
    if(!repositoryFile(assignment.canonicalGuide)||!assignment.canonicalGuide.startsWith('docs/site/')||!assignment.canonicalGuide.endsWith('.md'))throw Error(`PLUGIN_COMPLEXITY_CANONICAL_GUIDE_INVALID:${item.id}`);
    if(assignment.canonicalGuide.includes('/plugin-catalogue/'))throw Error(`PLUGIN_COMPLEXITY_CATALOGUE_IS_NOT_DEEP_GUIDE:${item.id}`);
    if(!fs.existsSync(path.join(root,assignment.canonicalGuide)))throw Error(`PLUGIN_COMPLEXITY_GUIDE_MISSING:${item.id}:${assignment.canonicalGuide}`);
    if(typeof assignment.coverageNote!=='string'||!assignment.coverageNote.trim())throw Error(`PLUGIN_COMPLEXITY_COVERAGE_NOTE_MISSING:${item.id}`);
    return {id:item.id,host:item.host,manifest:item.manifest,complex:signals.length>0,signals:[...new Set(signals)].sort(),canonicalGuide:assignment.canonicalGuide,coverageNote:assignment.coverageNote};
  });
}
export function renderIndex(rows) {
  return ['# Package deep-guide ownership','','Status: package behavior and change-guide index','Audience: extension author and maintainer','Owner: plugin-foundation','Evidence: scripts/docs-plugin-complexity.mjs; docs/config/documentation-plugin-complexity.json','Applies to: all discovered installable package manifests','Last verified: current read-only classification check','','Use this index to find the owning behavior and change guide for a package. Related packages can share one specialist guide. Generated catalogue and configuration references supply their separate registration and field facts. Classification reasons identify configuration, effect, state or extension boundaries to inspect before a change; they do not grant runtime authority.','','<!-- BEGIN GENERATED: plugin complexity -->','','| Package | Classification reasons | Owning guide |','| --- | --- | --- |',...rows.map(row=>`| \`${row.id}\` | ${row.complex?row.signals.join(', '):'No complex signal in current sources'} | [${path.posix.basename(row.canonicalGuide,'.md')}](${path.posix.relative('docs/site/extend/deep-guides',row.canonicalGuide)}) |`),'','<!-- END GENERATED: plugin complexity -->','','## Maintain a package assignment','','Use Node.js 24 from the repository root with the complete checkout, installed repository dependencies, and its current package manifests, schemas, classification policy and owning guides. Confirm the toolchain with `node --version`. Run `node scripts/docs-plugin-complexity.mjs --check`. Success exits zero and prints JSON with `ok: true`, the discovered package, complex-package and canonical-assignment counts, and the source/classification-only boundary. Counts describe current discovery, not guide-depth or runtime acceptance. The check is read-only: it creates no resources and needs no cleanup. A nonzero exit prints the failing assertion or `PLUGIN_COMPLEXITY_*` diagnostic. Stop and inspect the named source, consumer, assignment or index difference before changing a binding or guide; do not use a failed check as coverage. It discovers package additions/removals, derives recursive schema/registration signals and rejects stale source bindings for reviewed effect/state/extension decisions. It does not independently approve edits to a manual classification judgment, its reasons, or its cited sources. Such edits require complete source-backed review before the classification is accepted. After reviewing the actual semantics, edit the policy and owning guide, then run the same check. Do not renew a digest to turn a missing explanation green.','','The optional `--index` operation prints this source-derived page to stdout. Review it before replacing this generated owner index. It never changes the policy or a guide. Independent content review and any activation/live checks stay separate.',''].join('\n');
}
/** Reusable actual-discovery controls; every mutation is confined to a new private tree. */
export function selfTest(root,policy) {
  const original=JSON.stringify(policy),baseline=evaluate(root,policy);
  assert.equal(JSON.stringify(policy),original,'read-only evaluation mutated policy');
  assert.equal(renderIndex(baseline),renderIndex(evaluate(root,policy)),'nondeterministic index');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'plugin-complexity-controls-'));
  const copy=relative=>{const target=path.join(temporary,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target);};
  try {
    fs.mkdirSync(path.join(temporary,'plugins'),{recursive:true});
    for(const assignment of policy.packages){for(const source of Object.keys(assignment.sourceBindings))copy(source);copy(assignment.canonicalGuide);}
    const candidate=structuredClone(policy);
    const added='skills/complexity-negative/plugin.json',addedFile=path.join(temporary,added);
    fs.mkdirSync(path.dirname(addedFile),{recursive:true});
    fs.writeFileSync(addedFile,JSON.stringify({id:'new.unmapped',apiVersion:'pipeline-plugin-v2',stages:[],observers:[],adapters:[]}));
    assert.throws(()=>evaluate(temporary,candidate),/PLUGIN_COMPLEXITY_ASSIGNMENT_MISSING:new.unmapped/);
    fs.rmSync(path.dirname(addedFile),{recursive:true});
    const assignment=candidate.packages.find(item=>item.id==='kubeclaw.demo-handoff');
    assert(assignment,'controls require the real multi-registration/intent-store example');
    const manifest=path.join(temporary,assignment.manifest),bytes=fs.readFileSync(manifest);
    fs.rmSync(manifest);assert.throws(()=>evaluate(temporary,candidate),/PLUGIN_COMPLEXITY_REMOVED_PACKAGE_ASSIGNMENT:kubeclaw.demo-handoff/);fs.writeFileSync(manifest,bytes);
    const value=JSON.parse(bytes);value.adapters[0].requiredCapabilities.push('new.changed');fs.writeFileSync(manifest,JSON.stringify(value));
    assert.throws(()=>evaluate(temporary,candidate),/PLUGIN_COMPLEXITY_REVIEW_SOURCE_CHANGED:kubeclaw.demo-handoff/);fs.writeFileSync(manifest,bytes);
    const schema='skills/nova/plugins/demo-handoff/schemas/adapter.schema.json',schemaFile=path.join(temporary,schema),schemaBytes=fs.readFileSync(schemaFile),shape=JSON.parse(schemaBytes);
    shape.properties.nested={type:'object',properties:{future:{type:'boolean'}}};fs.writeFileSync(schemaFile,JSON.stringify(shape));
    assert.throws(()=>evaluate(temporary,candidate),/PLUGIN_COMPLEXITY_REVIEW_SOURCE_CHANGED:kubeclaw.demo-handoff/);fs.writeFileSync(schemaFile,schemaBytes);
    const guide=path.join(temporary,assignment.canonicalGuide);fs.rmSync(guide);
    assert.throws(()=>evaluate(temporary,candidate),/PLUGIN_COMPLEXITY_GUIDE_MISSING:kubeclaw.demo-handoff/);copy(assignment.canonicalGuide);
    const duplicate=structuredClone(candidate);duplicate.packages.push(duplicate.packages[0]);assert.throws(()=>evaluate(temporary,duplicate),/PLUGIN_COMPLEXITY_ASSIGNMENT_DUPLICATE/);
    const escapingGuide=structuredClone(candidate);escapingGuide.packages[0].canonicalGuide='docs/site/../../../package.json';
    assert.throws(()=>evaluate(temporary,escapingGuide),/PLUGIN_COMPLEXITY_CANONICAL_GUIDE_INVALID/);
    const escapingSource=structuredClone(candidate);escapingSource.packages[0].sourceBindings['../outside.json']='0'.repeat(64);
    assert.throws(()=>evaluate(temporary,escapingSource),/PLUGIN_COMPLEXITY_SOURCE_ESCAPE/);
    const config='skills/complexity-negative/config.json';
    fs.mkdirSync(path.dirname(path.join(temporary,config)),{recursive:true});
    fs.writeFileSync(path.join(temporary,config),JSON.stringify({$ref:'https://outside.invalid/schema'}));
    assert.throws(()=>schemaSignals(temporary,{directory:'skills/complexity-negative',registrations:[{configSchema:'config.json'}]},
      {schemaAuthorities:{'https://outside.invalid/schema':'../outside.json'}}),/PLUGIN_COMPLEXITY_SOURCE_ESCAPE/);
    assert.deepEqual(evaluate(temporary,candidate),baseline);
    return {ok:true,controls:['package-add','package-remove','registration-change','nested-config-change','guide-remove','assignment-duplicate','escaping-guide','escaping-source','escaping-schema-authority','restored-baseline','deterministic-read-only']};
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}
function main(){
  const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
  const root=path.resolve(value('--root')??path.join(import.meta.dirname,'..'));
  const policy=read(root,'docs/config/documentation-plugin-complexity.json'),rows=evaluate(root,policy);
  if(args.includes('--self-test'))console.log(JSON.stringify(selfTest(root,policy)));
  else if(args.includes('--index'))process.stdout.write(renderIndex(rows));
  else if(args.includes('--json'))process.stdout.write(`${JSON.stringify(rows,null,2)}\n`);
  else{
    const expected=renderIndex(rows),page='docs/site/extend/deep-guides/README.md';
    assert.equal(fs.readFileSync(path.join(root,page),'utf8'),expected,`PLUGIN_COMPLEXITY_INDEX_DRIFT:${page}`);
    console.log(JSON.stringify({ok:true,discovered:rows.length,complex:rows.filter(row=>row.complex).length,canonicalAssignments:rows.length,boundary:'Source/classification and exact canonical assignments only; not independent guide-depth acceptance or activation.'}));
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(error){console.error(error.message);process.exitCode=1;}
