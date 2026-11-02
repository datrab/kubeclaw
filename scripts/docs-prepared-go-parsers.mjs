// Explicitly prepared documentation AST programs. Never compile or acquire in a check.
// These binary identities were built from the unchanged helpers with Go1.26.5,
// CGO_ENABLED=1, GO111MODULE=off, GOWORK=off, GOPROXY=off,
// GOSUMDB=off, GOTELEMETRY=off and go build -trimpath (linux amd64/arm64).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const locks={
  "cli": {
    "source": "scripts/lib/cli/go_cli_ast.go",
    "sourceSha256": "ef7c1ced42aeb627626e7fdb39c47b306cf8d69f1be79fa0f8572ad494b3e948",
    "targets": {
      "linux/amd64": "09580e6f2548b3466cae7473ff5c84d702b0be72557d2ec819cbc3adab23de97",
      "linux/arm64": "60e9543a2c84e4e91c711cec1e2e58316768f78cf071d293e1643aed6cf19121"
    }
  },
  "roles": {
    "source": "scripts/docs-api-go-output-role-adapter.go",
    "sourceSha256": "652c05d25fb524612e792e474ce770fb0a3785fce087a98c054e11ed985ebdda",
    "targets": {
      "linux/amd64": "47fcd8a9b0649e29f9f7b4d44ce32374ce7274893586b8fbed2c3df14ae83da7",
      "linux/arm64": "997d01fd17d221738440e574b510d2c1670f0be24a35273babf292fb4a1bf38f"
    }
  },
  "shapes": {
    "source": "scripts/docs-api-go-output-shapes.go",
    "sourceSha256": "fe51680e52795c85c48793f4adb3544b4ea831919dbedd2a71cf1f77239f1b1c",
    "targets": {
      "linux/amd64": "c571b3a304f5ad1e1db0b1922a7d8d82d7f117949554e6e350bf53aeafff1694",
      "linux/arm64": "cba839112e004f20ba581b4b3b2595c5c140127205354731083364f89b5b252c"
    }
  }
};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function preparedGoParserRecipe(key){
 assert(locks[key],'DOCS_GO_PREPARED_KEY_UNKNOWN:'+key);
 return structuredClone(locks[key]);
}
export function preparedGoParser(root,key){
 const lock=locks[key],target=process.platform+'/'+({x64:'amd64',arm64:'arm64'}[process.arch]??process.arch);
 assert(lock?.targets[target],'DOCS_GO_PREPARED_TARGET_UNSUPPORTED:'+key+':'+target);
 assert.equal(digest(fs.readFileSync(path.join(root,lock.source))),lock.sourceSha256,'DOCS_GO_PREPARED_SOURCE_STALE:'+key);
 const directory=process.env.KUBECLAW_DOCS_GO_PARSERS_DIR??path.join(root,'node_modules/.cache/docs-go-parsers');
 const binary=path.resolve(directory,key+'-'+target.replace('/','-'));
 const verify=()=>{
  const stat=fs.lstatSync(binary);
  assert(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o111),'DOCS_GO_PREPARED_NOT_REGULAR_EXECUTABLE:'+key);
  assert.equal(fs.realpathSync(binary),binary,'DOCS_GO_PREPARED_SYMLINK_PATH:'+key);
  assert.equal(digest(fs.readFileSync(binary)),lock.targets[target],'DOCS_GO_PREPARED_BINARY_MISMATCH:'+key);
  assert.equal(digest(fs.readFileSync(path.join(root,lock.source))),lock.sourceSha256,'DOCS_GO_PREPARED_SOURCE_STALE:'+key);
 };
 verify();
 return {binary,verify};
}
// The native role parser consumes only GOROOT/src directory membership (IsDir),
// not standard-library file contents. Bind that exact Go1.26.5 input universe.
export function preparedGoEnvironment(){
 assert(!process.env.GOFLAGS,'API_PRODUCT_GO_MODULE_AUTHORITY_UNQUALIFIED: explicit GOFLAGS');
 assert(!process.env.GOWORK||process.env.GOWORK==='off','API_PRODUCT_GO_MODULE_AUTHORITY_UNQUALIFIED: explicit GOWORK');
 const command=process.env.KUBECLAW_DOCS_GO_BINARY??'go';
 const directory=process.env.KUBECLAW_DOCS_GO_PARSERS_DIR??path.join(fileURLToPath(new URL('../',import.meta.url)),'node_modules/.cache/docs-go-parsers');
 const config=path.resolve(directory,'go-config');
 const mode=path.join(config,'go/telemetry/mode');
 assert(fs.lstatSync(mode).isFile()&&fs.realpathSync(mode)===mode,'DOCS_GO_PREPARED_CONFIG_NOT_REGULAR');
 assert(/^off \d{4}-\d{2}-\d{2}$/u.test(fs.readFileSync(mode,'utf8')),'DOCS_GO_PREPARED_CONFIG_NOT_OFF');
 const selected=command.includes('/')?path.resolve(command):(process.env.PATH??'').split(path.delimiter).map(dir=>path.resolve(dir,command)).find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return fs.statSync(file).isFile();}catch{return false;}});
 assert(selected,'DOCS_GO_PREPARED_TOOLCHAIN_MISSING');
 const executable=fs.realpathSync(selected);
 const goroot=path.resolve(path.dirname(executable),'..');
 const src=path.join(goroot,'src');
 assert.equal(fs.realpathSync(src),src,'DOCS_GO_PREPARED_GOROOT_SYMLINK');
 assert.equal(digest(fs.readFileSync(path.join(goroot,'VERSION'))),'11b4fb14680701f98ca60fd8464a836ca4374f17896a125f4510ab6ae8cecc9b','DOCS_GO_PREPARED_GOROOT_VERSION');
 const directories=[];
 const visit=(directory,relative='')=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  assert(!entry.isSymbolicLink(),'DOCS_GO_PREPARED_GOROOT_SYMLINK');
  if(entry.isDirectory()){const name=relative?relative+'/'+entry.name:entry.name;directories.push(name);visit(path.join(directory,entry.name),name);}
 }};
 visit(src);
 assert.equal(digest(directories.sort().join('\n')+'\n'),'f903799f2888062d81e06784838d208fdc9c55e82a8c8985fa830c1166f46fe8','DOCS_GO_PREPARED_STDLIB_MEMBERSHIP_CHANGED');
 return {command:executable,env:{...process.env,XDG_CONFIG_HOME:config,GOROOT:goroot,GOENV:'off',GOTOOLCHAIN:'local',GOPROXY:'off',GOSUMDB:'off',GOTELEMETRY:'off'}};
}
export function runPreparedGoParser(root,key,args,options){
 assert(!process.env.GOFLAGS,'DOCS_GO_PREPARED_GOFLAGS_UNQUALIFIED');
 const tool=preparedGoParser(root,key),{command,env}=preparedGoEnvironment();
 const version=execFileSync(command,['version'],{env,encoding:'utf8',timeout:10000}).trim();
 const expected=JSON.parse(fs.readFileSync(path.join(root,'versions.json'),'utf8')).buildArgs.GO_VERSION;
 assert(version.split(/\s+/u).includes('go'+expected),'DOCS_GO_PREPARED_TOOLCHAIN_MISMATCH');
 const result=spawnSync(tool.binary,args,{...options,env});
 tool.verify();preparedGoEnvironment();
 return result;
}
