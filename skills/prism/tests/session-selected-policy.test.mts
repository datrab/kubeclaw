import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {captureSwarmSettings} from '../../common/plugin-runtime/foundation/config/swarm.ts';
import {exchangeSelectedTailscaleIdentity,exchangeTailscaleIdentity,verifySession} from '../control/session.ts';
const headers={'tailscale-user-login':'operator','x-prism-ingress-secret':'edge'};
function fixture(t:{after(fn:()=>void):void}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'session-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(new URL('../../../config/',import.meta.url),root,{recursive:true});
 const file=path.join(root,'components/prism-control.config.json'),entryFile=path.join(root,'pipeline.config.json');
 const entry=JSON.parse(fs.readFileSync(entryFile,'utf8')),author=JSON.parse(fs.readFileSync(file,'utf8')),instanceId='kubeclaw/prism/prism-control';
 const bindings=entry.bindings.filter((b:any)=>b.instanceId===instanceId).map(({role:_,...b}:any)=>b);
 const selected=bindings.find((b:any)=>b.owner==='prism-control').profileId;
 return {author,selected,write:()=>fs.writeFileSync(file,JSON.stringify(author)),load:()=>captureSwarmSettings(entryFile,{role:'prism',callerId:'prism-control',serviceInstanceId:instanceId,bindings})};
}
test('v4 fixed original role domain is mandatory on every selected/unselected profile',t=>{
 const f=fixture(t),original=structuredClone(f.author);
 for(const profile of Object.keys(original.profiles))for(const invalid of [undefined,null,[],['admin'],['editor','admin'],['editor','editor'],'editor']) {
  Object.assign(f.author,structuredClone(original));f.author.profiles[profile].settings.sessionDefaultRoles=invalid;f.write();assert.throws(f.load,/SWARM_CONFIG_INVALID/);
 }
 Object.assign(f.author,original);f.write();const a=f.load().components['prism-control']!.settings.sessionDefaultRoles;
 assert.deepEqual(a,['editor']);assert.ok(Object.isFrozen(a));
 f.author.profiles[f.selected].settings.sessionDefaultRoles=['admin'];f.write();assert.throws(f.load,/SWARM_CONFIG_INVALID/);
 const token=exchangeSelectedTailscaleIdentity(headers,'edge','session',900,a as unknown as readonly ['editor']);assert.deepEqual(verifySession(token,'session').roles,['editor']);
});
test('original v3 capture and signed tokens retain legacy roles without loading a current owner',t=>{
 const f=fixture(t);f.author.schemaVersion='pipeline-component.v3';for(const p of Object.values(f.author.profiles) as any[]){delete p.settings.sessionDefaultRoles;delete p.settings.productDecisionsEnabled;}
 f.write();const original=f.load();assert.equal(original.components['prism-control']!.settings.sessionDefaultRoles,undefined);
 const token=exchangeTailscaleIdentity(headers,'edge','session',900);f.author.schemaVersion='pipeline-component.v4';f.write();assert.throws(f.load,/SWARM_CONFIG_INVALID/);
 assert.deepEqual(verifySession(token,'session').roles,['editor']);
});
test('selected exchange denies invalid policies and preserves ingress and identity checks',()=>{
 for(const invalid of [undefined,null,[],['admin'],['editor','admin'],'editor'])assert.throws(()=>exchangeSelectedTailscaleIdentity(headers,'edge','session',900,invalid as any),/invalid selected session roles/);
 assert.throws(()=>exchangeSelectedTailscaleIdentity(headers,'wrong','session',900,['editor']),/untrusted ingress/);
 assert.throws(()=>exchangeSelectedTailscaleIdentity({'x-prism-ingress-secret':'edge'},'edge','session',900,['editor']),/missing Tailscale identity/);
 assert.deepEqual(verifySession(exchangeSelectedTailscaleIdentity(headers,'edge','session',900,['editor']),'session').roles,['editor']);
});
