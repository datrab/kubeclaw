import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrate } from '../storage/index.ts';
import { ingest, search } from '../corpus/index.ts';
import { captureSwarmSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import { captureCorpusRanking, type CorpusRankingPolicy } from '../../common/plugin-runtime/foundation/config/corpus-ranking.ts';
const policy = (changes = {}): CorpusRankingPolicy => ({schemaVersion:'corpus-ranking.v1', candidateFloor:100, candidateMultiplier:10, rrfDamping:60,...changes});
function fixture(t: {after(fn:()=>void):void}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'corpus-ranking-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.cpSync(new URL('../../../config/',import.meta.url),root,{recursive:true});
  const entryFile=path.join(root,'pipeline.config.json'),entry=JSON.parse(fs.readFileSync(entryFile,'utf8'));
  const instanceId='kubeclaw/prism/prism-control';
  const selection={role:'prism',callerId:'prism-control',serviceInstanceId:instanceId,bindings:entry.bindings.filter((b:any)=>b.instanceId===instanceId).map(({role:_,...b}:any)=>b)} as const;
  const file=path.join(root,'components/prism-control.config.json');
  const author=JSON.parse(fs.readFileSync(file,'utf8'));
  const selected=entry.bindings.find((b:any)=>b.instanceId===instanceId&&b.owner==='prism-control').profileId;
  return {file,author,selected, write:()=>fs.writeFileSync(file,JSON.stringify(author)),load:()=>captureSwarmSettings(entryFile,selection as any)};
}
test('v3 validates the complete owner, rejects missing/equal-old authors and unsafe SQL candidate product',t=>{
  const f=fixture(t);const original=structuredClone(f.author);
  for(const mutation of [
    ()=>{delete f.author.profiles[f.selected].settings.corpusRanking;},
    ()=>{f.author.profiles.standard.settings.corpusRanking.rrfDamping=0;},
    ()=>{f.author.profiles[f.selected].settings.corpusRanking.extra=true;},
    ()=>{f.author.schemaVersion='pipeline-component.v2';},
    ()=>{f.author.profiles[f.selected].settings.corpusRanking.candidateMultiplier=2147483647;},
  ]) {Object.assign(f.author,structuredClone(original));mutation();f.write();assert.throws(f.load,/SWARM_CONFIG_INVALID|CORPUS_CANDIDATE_LIMIT_INVALID/);}
  Object.assign(f.author,original);f.write();assert.equal(f.load().components['prism-control']!.schemaVersion,'pipeline-component.v5');
});
test('original v2 reader remains closed and does not refill missing v3 policy',t=>{
  const f=fixture(t);f.author.schemaVersion='pipeline-component.v2';
  for(const p of Object.values(f.author.profiles) as any[]){delete p.settings.corpusRanking;delete p.settings.sessionDefaultRoles;delete p.settings.productDecisionsEnabled;}
  f.write();const capture=f.load();assert.equal(capture.components['prism-control']!.settings.corpusRanking,undefined);
});
test('captured original ranking survives new B and author deletion without a current read',async t=>{
  const f=fixture(t);f.author.profiles[f.selected].settings.corpusRanking=policy({candidateFloor:2,candidateMultiplier:3,rrfDamping:7});f.write();
  const a=f.load().components['prism-control']!.settings.corpusRanking as unknown as CorpusRankingPolicy;
  f.author.profiles[f.selected].settings.corpusRanking=policy();f.write();fs.unlinkSync(f.file);
  assert.ok(Object.isFrozen(a));const calls:any[]=[];
  await search({query:async(sql:any,values:any)=>{calls.push({sql,values});return {rows:[]};}} as any,'q',2,{embedding:[1,0],model:'test'},{sourceFamilyLimit:2,ranking:a});
  assert.equal(calls[0].values[1],6);assert.deepEqual(calls[0].values.slice(6),[2,7]);assert.match(calls[0].sql,/LIMIT \$7/);assert.match(calls[0].sql,/\$8::numeric/);
});
test('invalid or overflowing explicit ranking rejects before database I/O',async()=>{
  let calls=0;const db={query:async()=>{calls++;return {rows:[]};}} as any;
  for(const invalid of [null,{},policy({candidateFloor:0}),policy({candidateMultiplier:1.5}),policy({rrfDamping:Infinity}),{...policy(),extra:1}]) {
    await assert.rejects(search(db,'q',2,undefined,{sourceFamilyLimit:2,ranking:invalid as any}),/CORPUS_RANKING_INVALID/);
  }
  await assert.rejects(search(db,'q',2147483647,undefined,{sourceFamilyLimit:2,ranking:policy()}),/CORPUS_CANDIDATE_LIMIT_INVALID/);
  assert.equal(calls,0);
});
test('embedded PostgreSQL/PGlite preserves A and exercises both SQL branches, coupled candidate bounds and RRF B',async()=>{
  const db=new PGlite({extensions:{vector}});
  try {
    await migrate(db as any);
    for(let i=0;i<4;i++)await ingest(db as any,{sourceKind:'internal-project',title:'ranking dashboard '+i,summary:'ranking controls',tags:['ranking'],rights:'full'} as any,
      {embedding:[1,0],model:'ranking',modelVersion:'1',sourceDigest:'sha256:'+String(i).repeat(64)});
    const embedding={embedding:[1,0],model:'ranking'};
    const run=(ranking:CorpusRankingPolicy|undefined,queryEmbedding=embedding)=>search(db as any,'ranking',4,queryEmbedding,{sourceFamilyLimit:10,...(ranking?{ranking}:{})});
    const legacy=await run(undefined),a=await run(policy());assert.deepEqual(a,legacy);
    const b=await run(policy({candidateFloor:1,candidateMultiplier:1,rrfDamping:1}));
    assert.notEqual(Number(b[0].score),Number(a[0].score));assert.equal(b.length,1);
    const low=await search(db as any,'ranking',4,undefined,{sourceFamilyLimit:10,ranking:policy({candidateFloor:1,candidateMultiplier:1})});assert.equal(low.length,4);
    const limited=await search(db as any,'ranking',1,undefined,{sourceFamilyLimit:10,ranking:policy({candidateFloor:1,candidateMultiplier:1})});assert.equal(limited.length,1);
    const floor=await run(policy({candidateFloor:4,candidateMultiplier:1,rrfDamping:1}));assert.equal(floor.length,4);
    const multiplier=await run(policy({candidateFloor:1,candidateMultiplier:2}));assert.equal(multiplier.length,1); // inner hybrid floor remains distinct from outer oversampling
    const textAll=await search(db as any,'ranking',4,undefined,{sourceFamilyLimit:10,ranking:policy({candidateFloor:1,candidateMultiplier:1})});
    const wanted=textAll.at(-1)!.normalized as Record<string,unknown>;
    const narrow=await search(db as any,'ranking',1,undefined,{sourceFamilyLimit:10,preferred:{title:wanted.title},ranking:policy({candidateFloor:1,candidateMultiplier:1})});
    const expanded=await search(db as any,'ranking',1,undefined,{sourceFamilyLimit:10,preferred:{title:wanted.title},ranking:policy({candidateFloor:1,candidateMultiplier:4})});
    assert.notEqual(narrow[0].id,expanded[0].id);assert.equal(expanded[0].id,textAll.at(-1)!.id);
    const snapshot=policy();const captured=captureCorpusRanking(snapshot);(snapshot as any).rrfDamping=1;assert.equal(captured.rrfDamping,60);
  } finally {await db.close();}
});
