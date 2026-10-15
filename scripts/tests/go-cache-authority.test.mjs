import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverGoApiOutputs } from '../docs-api-output-discovery.mjs';

// Documentation AST fixtures only: no product code is executed or built.
test('Go warm-cache admission retains finite GOFLAGS and selector authority', () => {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'docs-go-cache-authority-'));
  const names=['GOFLAGS','GOWORK','GOMODCACHE','GOPATH'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const fixture=name=>{
    const root=path.join(base,name);fs.mkdirSync(path.join(root,'cmd/probe'),{recursive:true});
    fs.writeFileSync(path.join(root,'go.mod'),'module custody.test/native\ngo 1.22\n');
    fs.writeFileSync(path.join(root,'cmd/probe/main.go'),'package main\nimport "fmt"\nfunc main(){fmt.Println("ordinary diagnostic")}\n');
    return root;
  };
  const rejected=root=>assert.throws(()=>discoverGoApiOutputs(root),error=>
    error.message.includes('API_PRODUCT_GO_RAW_OUTPUT_ROLE_UNQUALIFIED')&&
    error.message.includes(path.join(root,'cmd/probe/main.go'))&&
    error.message.includes('explicit GOFLAGS selection is outside the reviewed finite authority'));
  try {
    process.env.GOFLAGS='';process.env.GOWORK='off';
    const warm=fixture('warm');
    for(let i=0;i<3;i++)assert.deepEqual(discoverGoApiOutputs(warm),[]);
    for(const flags of ['-trimpath',' ']) {
      process.env.GOFLAGS=flags;rejected(warm);rejected(fixture(`fresh-${flags===' '? 'space':'trimpath'}`));
    }
    delete process.env.GOFLAGS;assert.deepEqual(discoverGoApiOutputs(warm),[]);
    process.env.GOFLAGS='';assert.deepEqual(discoverGoApiOutputs(warm),[]);
    process.env.GOWORK='auto';assert.throws(()=>discoverGoApiOutputs(warm),/explicit GOWORK selection is outside the reviewed finite authority/u);
    process.env.GOWORK=path.join(base,'go.work');assert.throws(()=>discoverGoApiOutputs(warm),/API_PRODUCT_GO_MODULE_AUTHORITY_UNQUALIFIED/u);
    process.env.GOWORK='off';assert.deepEqual(discoverGoApiOutputs(warm),[]);
    // Existing module authority bytes must still invalidate a warmed entry.
    fs.appendFileSync(path.join(warm,'go.mod'),'replace example.test/unknown => ./unknown\n');
    assert.throws(()=>discoverGoApiOutputs(warm),/API_PRODUCT_GO_RAW_OUTPUT_ROLE_UNQUALIFIED/u);
    fs.writeFileSync(path.join(warm,'go.mod'),'module custody.test/native\ngo 1.22\n');
    assert.deepEqual(discoverGoApiOutputs(warm),[]);
    // Primary source custody must still invalidate a warmed ordinary diagnostic.
    fs.writeFileSync(path.join(warm,'cmd/probe/main.go'),'package main\nimport "fmt"\nfunc main(){fmt.Println(`{"apiVersion":"v1","kind":"Secret"}`)}\n');
    assert.throws(()=>discoverGoApiOutputs(warm),/API_PRODUCT_GO_RAW_OUTPUT_ROLE_UNQUALIFIED/u);
    // Distinct selected cache/workspace roots remain permitted for stdlib only.
    process.env.GOMODCACHE=path.join(base,'module-cache');process.env.GOPATH=path.join(base,'workspace');
    assert.deepEqual(discoverGoApiOutputs(fixture('alternate-selectors')),[]);
  } finally {
    for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];
    fs.rmSync(base,{recursive:true,force:true});
  }
});

test('Go flags authority precedes maintainer qualification and native child acquisition', async () => {
  const childProcess=(await import('node:child_process')).default;
  const { syncBuiltinESMExports }=await import('node:module');
  const originalSpawn=childProcess.spawnSync,originalFlags=process.env.GOFLAGS;
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'docs-go-acquisition-order-'));
  let nativeCalls=0;
  try {
    fs.mkdirSync(path.join(base,'scripts'),{recursive:true});
    fs.copyFileSync(new URL('../docs-api-go-output-shapes.go',import.meta.url),path.join(base,'scripts/docs-api-go-output-shapes.go'));
    fs.writeFileSync(path.join(base,'scripts/docs-probe.mjs'),"const helper=new URL('./docs-api-go-output-shapes.go',import.meta.url);\n");
    fs.writeFileSync(path.join(base,'package.json'),JSON.stringify({scripts:{'docs:probe':'node scripts/docs-probe.mjs'}}));
    fs.writeFileSync(path.join(base,'scripts/docs-api-producer-adapter-authorities.json'),JSON.stringify({documentationToolBoundary:{sources:['scripts/docs-probe.mjs','scripts/docs-api-go-output-shapes.go']}}));
    // Sentinel only observes acquisition; it does not run a substitute executable.
    childProcess.spawnSync=(command,argv)=>{nativeCalls++;assert.equal(command,process.env.KUBECLAW_DOCS_GO_BINARY??'go');assert.ok(argv.includes('--documentation-custody'));throw new Error('observed native documentation acquisition');};
    syncBuiltinESMExports();
    process.env.GOFLAGS='';
    assert.throws(()=>discoverGoApiOutputs(base),/observed native documentation acquisition/u);
    assert.equal(nativeCalls,1);
    process.env.GOFLAGS='-trimpath';
    assert.throws(()=>discoverGoApiOutputs(base),/explicit GOFLAGS selection is outside the reviewed finite authority/u);
    assert.equal(nativeCalls,1);
    // A broken maintainer/package input is not read before flags rejection.
    fs.writeFileSync(path.join(base,'package.json'),'{invalid');
    assert.throws(()=>discoverGoApiOutputs(base),/explicit GOFLAGS selection is outside the reviewed finite authority/u);
    assert.equal(nativeCalls,1);
    // No selected Go sources retain the original empty result, even with flags.
    fs.rmSync(path.join(base,'scripts/docs-api-go-output-shapes.go'));
    assert.deepEqual(discoverGoApiOutputs(base),[]);
  } finally {
    childProcess.spawnSync=originalSpawn;syncBuiltinESMExports();
    if(originalFlags===undefined)delete process.env.GOFLAGS;else process.env.GOFLAGS=originalFlags;
    fs.rmSync(base,{recursive:true,force:true});
  }
});
