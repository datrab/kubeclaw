// Execute real startup ownership commands under the restricted supervisor.
// Synthetic filesystem only; never touch the active cache or real job store.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
assert.equal(process.getuid(),0,'Run under the restricted root supervisor');
const source=fs.readFileSync(process.argv[2]??'/usr/local/bin/buster-runtime-entrypoint','utf8');
const start=source.indexOf('# Keep the cache on the mounted worker volume');
const end=source.indexOf('\nsetpriv \\\n  --reuid=1000',start);
assert(start>=0&&end>start,'Managed BuildKit cache setup boundary missing');
const setup=source.slice(start,end),root=fs.mkdtempSync('/tmp/buster-buildkit-state-');fs.chmodSync(root,0o755);
const parent=path.join(root,'private-parent'),state=path.join(parent,'cache');fs.mkdirSync(parent,{mode:0o700});fs.chownSync(parent,1000,1000);
const builder=(program,...args)=>spawnSync('setpriv',['--reuid=1000','--regid=1000','--init-groups',process.execPath,'-e',program,...args],{encoding:'utf8'});
const run=(code,value=state)=>spawnSync('sh',['-c','set -eu\nstate="$1"\n'+code,'sh',value],{encoding:'utf8'});
try{
 assert.notEqual(run('mkdir -p "$state"').status,0,'Old root-owned creation must reproduce restricted-supervisor failure');
 const volume=path.join(root,'volume-root');fs.mkdirSync(volume,{mode:0o700});
 const fresh=run(setup.replaceAll('/var/lib/buster-v2',volume),path.join(volume,'buildkit'));assert.equal(fresh.status,0,fresh.stderr);assert.equal(fs.statSync(volume).uid,1000);
 const first=run(setup);assert.equal(first.status,0,first.stderr);
 let r=builder('const f=require("fs"),a=require("assert/strict");const s=f.statSync(process.argv[1]);a.equal(s.uid,1000);a.equal(s.mode&0o777,0o700);f.writeFileSync(process.argv[1]+"/proof","TEST-preserved-cache",{mode:0o600});',state);assert.equal(r.status,0,r.stderr);
 assert.equal(run(setup).status,0,'Restart keeps the existing builder-owned cache');
 r=builder('require("assert/strict").equal(require("fs").readFileSync(process.argv[1]+"/proof","utf8"),"TEST-preserved-cache")',state);assert.equal(r.status,0,r.stderr);
 const outside=path.join(root,'outside');fs.mkdirSync(outside,{mode:0o755});
 const link=path.join(parent,'link');r=builder('require("fs").symlinkSync(process.argv[1],process.argv[2])',outside,link);assert.equal(r.status,0,r.stderr);
 assert.notEqual(run(setup,link).status,0,'A symlink cache root must be refused');assert.equal(fs.statSync(outside).mode&0o777,0o755);
 assert.notEqual(run(setup,'relative-cache').status,0,'Relative cache roots are refused');
 console.log(JSON.stringify({ok:true,oldCreationFails:true,freshVolumeInitialized:true,builderCreatesPrivateCache:true,restartPreservesCache:true,symlinkRejected:true,relativePathRejected:true,additionalCapabilities:false}));
}finally{
 const volume=path.join(root,'volume-root');if(fs.existsSync(volume)){fs.chownSync(volume,0,1000);const cache=path.join(volume,'buildkit');if(fs.existsSync(cache))fs.chownSync(cache,0,1000);}
 fs.chownSync(parent,0,1000);if(fs.existsSync(state))fs.chownSync(state,0,1000);fs.rmSync(root,{recursive:true,force:true});
}
