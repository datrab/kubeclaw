import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {buildCliSourceModel,trackedFiles,readBoundSource} from './cli-source-model.mjs';
import {analyzeTypedCliSources} from './typed-cli-ast.mjs';
import {analyzeShellCli,createShellCliParser} from './shell-cli-adapter.mjs';
import {discoverManifestLaunches} from './manifest-cli-launch-join.mjs';
import {projectCliDocumentationFacts,translateTypedContracts} from './cli-semantic-composition.mjs';

// Run only the maintained extraction producers, never a product entrypoint or
// --help invocation. Compiled helper is private scratch, removed on every exit.
export async function generateNativeCliModel(root,{producerDirectory=path.join(root,'scripts/lib/cli'),ownershipSource='docs/blueprint/cli-source-ownership.json'}={}){
 root=fs.realpathSync(root);
 const files=trackedFiles(root),producers=['cli-source-model.mjs','typed-cli-ast.mjs','shell-cli-adapter.mjs','python_cli_ast.py','go_cli_ast.go','cli-native-driver.mjs','manifest-cli-launch-join.mjs','cli-semantic-composition.mjs'];
 const required=[ownershipSource,'versions.json','package.json','package-lock.json','scripts/docs-shell-source-custody.mjs','scripts/docs-inventory.mjs','scripts/docs-generate.mjs','scripts/docs-generate-core.mjs','.github/workflows/docs-checks.yaml',...producers.map(p=>path.relative(root,path.join(producerDirectory,p)).split(path.sep).join('/'))];
 const producerBindings=required.map(name=>{const b=readBoundSource(root,name,files);return {path:b.path,sha256:b.sha256,bytes:b.bytes,gitObject:b.gitObject,mode:b.mode};});
 const versions=JSON.parse(readBoundSource(root,'versions.json',files).text).buildArgs;
 const require=createRequire(path.join(root,'package.json')),ts=require('typescript'),locked=JSON.parse(readBoundSource(root,'package-lock.json',files).text).packages?.['node_modules/typescript']?.version;
 if(!locked||ts.version!==locked)throw Error('CLI_TYPESCRIPT_INSTALLED_LOCK_MISMATCH');
 const goVersion=execFileSync('go',['version'],{encoding:'utf8',timeout:10000}).trim();
 if(!goVersion.split(/\s+/u).includes('go'+versions.GO_VERSION))throw Error('CLI_GO_INSTALLED_LOCK_MISMATCH');
 const pythonVersion=execFileSync('python3',['-I','-c','import sys;print(".".join(map(str,sys.version_info[:3])))'],{encoding:'utf8',timeout:10000}).trim();
 if(Number(pythonVersion.split('.')[0])!==3||Number(pythonVersion.split('.')[1])!==11)throw Error('CLI_PYTHON_AST_VERSION_UNQUALIFIED');
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'kubeclaw-cli-extractor-'));
 try{
  const binary=path.join(scratch,'go-cli-ast');
  execFileSync('go',['build','-trimpath','-o',binary,path.join(producerDirectory,'go_cli_ast.go')],{cwd:root,env:{...process.env,GOTOOLCHAIN:'local',GOWORK:'off',GO111MODULE:'off',GOPROXY:'off',GOSUMDB:'off'},timeout:120000,stdio:'pipe'});
  const run=(command,args,sources)=>JSON.parse(execFileSync(command,args,{input:JSON.stringify({sources:sources.map(({path,text})=>({path,text}))}),encoding:'utf8',timeout:120000,maxBuffer:256*1024*1024}));
  const ownership=JSON.parse(readBoundSource(root,ownershipSource,files).text),shellParser=createShellCliParser({repositoryRoot:root});
  const model=await buildCliSourceModel(root,ownership,{
   discoverLaunches:(manifests,context)=>{
    const rootManifest=manifests.find(m=>m.path==='package.json')?.manifest;
    if(!Array.isArray(rootManifest?.workspaces))throw Error('CLI_WORKSPACE_DECLARATION_UNQUALIFIED');
    const workspaceMembership=manifests.filter(m=>m.path!=='package.json'&&rootManifest.workspaces.some(pattern=>path.matchesGlob(path.posix.dirname(m.path),pattern))).map(m=>({rootManifest:'package.json',manifest:m.path,name:m.manifest.name,path:path.posix.dirname(m.path),sha256:m.sha256}));
    const extensionLanguages={'.js':'typescript','.mjs':'typescript','.cjs':'typescript','.ts':'typescript','.mts':'typescript','.cts':'typescript','.tsx':'typescript','.py':'python','.go':'go','.sh':'shell','.bash':'shell'};
    const joinContext={files:new Set(context.files.keys()),ownership:ownership.interfaces,workspaceMembership,languageBySource:Object.fromEntries([...context.files.keys()].map(name=>[name,extensionLanguages[path.posix.extname(name)]]).filter(([,lang])=>lang)),readSource:context.readDependency,parseShell:shellParser.parse,expandShellPattern:({pattern,cwd})=>{if(!pattern||/["'\\$`{}]|\*\*/u.test(pattern))return undefined;return [...context.files.keys()].filter(name=>path.matchesGlob(path.posix.relative(cwd,name),pattern));}};
    const joined=discoverManifestLaunches(manifests.filter(m=>m.manifestRole?.kind!=='archived-data-manifest'),joinContext);
    joined.archivedDataCustody=manifests.filter(m=>m.manifestRole?.kind==='archived-data-manifest').map(m=>({path:m.path,sha256:m.sha256,role:m.manifestRole.kind,boundary:'Exact historical input data; no command/default/exit or current launch authority. Original analysis failures remain historical evidence outside the native generated model.'}));
    joined.targets=joined.targets.map(target=>({...target,language:target.language==='unqualified'?undefined:target.language}));
    return joined;
   },
   typescript:(sources,context)=>analyzeTypedCliSources(sources,{...context,typescript:ts}),
   shell:(sources,context)=>sources.map(s=>analyzeShellCli(s.path,s.text,{...context,repositoryRoot:root})),
   python:sources=>run('python3',['-I',path.join(producerDirectory,'python_cli_ast.py')],sources),
   go:sources=>run(binary,[],sources),
  });
  for(const row of model.sources)if(row.unresolved?.some(f=>f.rule==='argparse-factory-receiver-unqualified'))throw Error('CLI_SELECTED_FACTORY_UNQUALIFIED:'+row.path);
  shellParser.verify();
  for(const b of producerBindings)if(readBoundSource(root,b.path,trackedFiles(root)).sha256!==b.sha256)throw Error('CLI_PRODUCER_CHANGED_DURING_GENERATION:'+b.path);
  // A generated-only commit must not invalidate unchanged Source. Pin to the
  // latest actual consumed native input commit, not the renderer's HEAD.
  const sourcePaths=[...new Set([...model.ownership.map(x=>x.source),...model.dependencyBindings.map(x=>x.path),...producerBindings.map(x=>x.path)])].sort();
  model.sourceRevision=execFileSync('git',['log','-1','--format=%H','--',...sourcePaths],{cwd:root,encoding:'utf8',maxBuffer:1024*1024}).trim();
  if(!/^[a-f0-9]{40}$/u.test(model.sourceRevision))throw Error('CLI_NATIVE_SOURCE_REVISION_UNQUALIFIED');
  for(const source of model.sources)if(source.language==='shell'&&source.adapterMetadata?.tool)delete source.adapterMetadata.tool.executable;
  model.producerBindings=producerBindings;
  model.tools={typescript:{version:ts.version,lock:'package-lock.json'},go:{version:'go'+versions.GO_VERSION,lock:'versions.json',sourceHelper:'go_cli_ast.go'},python:{contract:'CPython3.11 qualified stdlib ast; isolated producer, no product imports'},shell:model.sources.find(s=>s.language==='shell')?.sourceBindings?{lock:'versions.json',contract:'hash/version verified shfmt AST; no shell execution'}:null};
  model.typedContracts=translateTypedContracts(model,ts);
  return projectCliDocumentationFacts(model);
 }finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
