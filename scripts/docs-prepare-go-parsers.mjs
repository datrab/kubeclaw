// Explicit dependency preparation, never imported by a generator/check.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {preparedGoParser,preparedGoParserRecipe} from './docs-prepared-go-parsers.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.equal(process.argv.length,2,'Usage: node scripts/docs-prepare-go-parsers.mjs');
const target=process.platform+'/'+({x64:'amd64',arm64:'arm64'}[process.arch]??process.arch);
const directory=path.resolve(process.env.KUBECLAW_DOCS_GO_PARSERS_DIR??path.join(root,'node_modules/.cache/docs-go-parsers'));
const command=process.env.KUBECLAW_DOCS_GO_BINARY??'go';
const env={...process.env,GOTOOLCHAIN:'local',GOWORK:'off',GO111MODULE:'off',GOPROXY:'off',GOSUMDB:'off',GOTELEMETRY:'off',CGO_ENABLED:'1',GOOS:process.platform,GOARCH:process.arch==='x64'?'amd64':process.arch};
assert(!process.env.GOFLAGS,'DOCS_GO_PREPARATION_GOFLAGS_UNQUALIFIED');
const expected=JSON.parse(fs.readFileSync(path.join(root,'versions.json'),'utf8')).buildArgs.GO_VERSION;
assert(execFileSync(command,['version'],{env,encoding:'utf8'}).trim().split(/\s+/u).includes('go'+expected),'DOCS_GO_PREPARATION_TOOLCHAIN_MISMATCH');
fs.mkdirSync(directory,{recursive:true});
assert.equal(fs.realpathSync(directory),directory,'DOCS_GO_PREPARATION_DIRECTORY_SYMLINK');
const scratch=fs.mkdtempSync(path.join(directory,'.prepare-'));
try{
 for(const key of ['cli','roles','shapes']){
  const recipe=preparedGoParserRecipe(key);
  assert(recipe.targets[target],'DOCS_GO_PREPARATION_TARGET_UNSUPPORTED');
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,recipe.source))).digest('hex'),recipe.sourceSha256,'DOCS_GO_PREPARATION_SOURCE_STALE');
  const output=path.join(scratch,key);
  execFileSync(command,['build','-trimpath','-o',output,path.join(root,recipe.source)],{cwd:root,env,timeout:120000,stdio:'pipe'});
  assert.equal(createHash('sha256').update(fs.readFileSync(output)).digest('hex'),recipe.targets[target],'DOCS_GO_PREPARATION_BINARY_MISMATCH');
  const destination=path.join(directory,key+'-'+target.replace('/','-'));
  let prior;try{prior=fs.lstatSync(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(prior)assert(prior.isFile()&&!prior.isSymbolicLink(),'DOCS_GO_PREPARATION_DESTINATION_NOT_REGULAR');
  fs.renameSync(output,destination);
  preparedGoParser(root,key).verify();
 }
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
