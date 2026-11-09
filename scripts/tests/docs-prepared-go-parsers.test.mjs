import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {preparedGoEnvironment,preparedGoParser,preparedGoParserRecipe,runPreparedGoParser} from '../docs-prepared-go-parsers.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// This native contract test requires the declared explicit preparation first.
test('prepared parser exact identity; reject missing, substituted, non-executable, linked and stale without compiling',()=>{
 const previous=process.env.KUBECLAW_DOCS_GO_PARSERS_DIR;
 const genuine=preparedGoParser(root,'cli');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'docs-prepared-control-'));
 const directory=path.join(temp,'tools');fs.mkdirSync(directory);
 const name=path.basename(genuine.binary),binary=path.join(directory,name);
 const fixture=path.join(temp,'fixture');fs.mkdirSync(fixture);
 const source=preparedGoParserRecipe('cli').source;
 fs.mkdirSync(path.dirname(path.join(fixture,source)),{recursive:true});
 fs.copyFileSync(path.join(root,source),path.join(fixture,source));
 try{
  process.env.KUBECLAW_DOCS_GO_PARSERS_DIR=directory;
  assert.throws(()=>preparedGoParser(root,'cli'),/ENOENT/);
  fs.writeFileSync(binary,'not a parser',{mode:0o755});
  assert.throws(()=>preparedGoParser(root,'cli'),/BINARY_MISMATCH/);
  fs.copyFileSync(genuine.binary,binary);fs.chmodSync(binary,0o644);
  assert.throws(()=>preparedGoParser(root,'cli'),/NOT_REGULAR_EXECUTABLE/);
  fs.unlinkSync(binary);fs.symlinkSync(genuine.binary,binary);
  assert.throws(()=>preparedGoParser(root,'cli'),/NOT_REGULAR_EXECUTABLE/);
  fs.unlinkSync(binary);fs.copyFileSync(genuine.binary,binary);fs.chmodSync(binary,0o755);
  preparedGoParser(fixture,'cli').verify();
  fs.appendFileSync(path.join(fixture,source),'\n');
  assert.throws(()=>preparedGoParser(fixture,'cli'),/SOURCE_STALE/);
  assert.throws(()=>preparedGoParser(root,'arbitrary'),/TARGET_UNSUPPORTED/);
  const saved={};for(const key of ['writeFileSync','mkdirSync','mkdtempSync','rmSync','renameSync','unlinkSync']){saved[key]=fs[key];fs[key]=()=>{throw Error('READ_ONLY_CONTROL:'+key);};}
  try{preparedGoParser(root,'cli').verify();}finally{Object.assign(fs,saved);}
 }finally{
  if(previous===undefined)delete process.env.KUBECLAW_DOCS_GO_PARSERS_DIR;else process.env.KUBECLAW_DOCS_GO_PARSERS_DIR=previous;
  fs.rmSync(temp,{recursive:true,force:true});
 }
});
test('actual prepared roles/shapes consumers preserve JSON and native failure without build fallback',()=>{
 const source=path.join(root,'cmd/buster-namespace-controller/exposure-generation.go');
 const roles=runPreparedGoParser(root,'roles',[],{input:JSON.stringify([{path:source}]),encoding:'utf8'});
 assert.equal(roles.status,0,roles.stderr);assert(Array.isArray(JSON.parse(roles.stdout)));
 const shapes=runPreparedGoParser(root,'shapes',[],{input:JSON.stringify([source]),encoding:'utf8'});
 assert.equal(shapes.status,0,shapes.stderr);assert(Object.hasOwn(JSON.parse(shapes.stdout),source));
 const invalid=runPreparedGoParser(root,'shapes',[],{input:'not JSON',encoding:'utf8'});
 assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/invalid character/);
});

test('actual selected Go stdlib directory authority is not inherited GOROOT/GOENV and workspace refusal survives',()=>{
 const previous={GOROOT:process.env.GOROOT,GOENV:process.env.GOENV,GOWORK:process.env.GOWORK,GOFLAGS:process.env.GOFLAGS};
 try{
  delete process.env.GOWORK;delete process.env.GOFLAGS;
  process.env.GOROOT='/definitely-not-the-selected-go';process.env.GOENV='/untrusted-go-environment';
  const selected=preparedGoEnvironment();
  assert.notEqual(selected.env.GOROOT,process.env.GOROOT);assert.equal(selected.env.GOENV,'off');
  process.env.GOWORK='auto';assert.throws(()=>preparedGoEnvironment(),/explicit GOWORK/);
  process.env.GOWORK='off';process.env.GOFLAGS='-overlay=/untrusted';assert.throws(()=>preparedGoEnvironment(),/explicit GOFLAGS/);
 }finally{for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test('Go config must be explicitly prepared and exact off before a read-only query',()=>{
 const prior=process.env.KUBECLAW_DOCS_GO_PARSERS_DIR;
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'docs-go-mode-control-')));
 const mode=path.join(temp,'go-config/go/telemetry/mode');
 try{
  process.env.KUBECLAW_DOCS_GO_PARSERS_DIR=temp;
  assert.throws(()=>preparedGoEnvironment(),/ENOENT/);
  fs.mkdirSync(path.dirname(mode),{recursive:true});
  fs.writeFileSync(mode,'on 2026-11-01');
  assert.throws(()=>preparedGoEnvironment(),/CONFIG_NOT_OFF/);
  fs.writeFileSync(mode,'off 2026-11-01');
  const selected=preparedGoEnvironment();assert.equal(selected.env.XDG_CONFIG_HOME,path.join(temp,'go-config'));
  const outside=path.join(temp,'outside-mode');fs.renameSync(mode,outside);fs.symlinkSync(outside,mode);
  assert.throws(()=>preparedGoEnvironment(),/CONFIG_NOT_REGULAR/);
  fs.unlinkSync(mode);fs.renameSync(outside,mode);
  const original=new Map(['writeFileSync','mkdirSync','mkdtempSync','renameSync','unlinkSync'].map(key=>[key,fs[key]]));
  try{for(const key of original.keys())fs[key]=()=>{throw Error('UNEXPECTED_QUERY_WRITE:'+key);};preparedGoEnvironment();}
  finally{for(const [key,value]of original)fs[key]=value;}
 }finally{
  if(prior===undefined)delete process.env.KUBECLAW_DOCS_GO_PARSERS_DIR;else process.env.KUBECLAW_DOCS_GO_PARSERS_DIR=prior;
  fs.rmSync(temp,{recursive:true,force:true});
 }
});
