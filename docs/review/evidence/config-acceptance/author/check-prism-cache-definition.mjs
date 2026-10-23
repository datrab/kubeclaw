// Exact current typed-library definition; NOT host dispatch/config/F-EFFECT proof.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {PrismEngine,DeterministicDesignProvider} from '../../../../../skills/prism/engine/index.ts';
const sha=data=>createHash('sha256').update(data).digest('hex');
const paths=['docs/review/evidence/config-acceptance/author/check-prism-cache-definition.mjs',
 'skills/prism/engine/index.ts','skills/prism/engine/execution-cache.ts',
 'skills/prism/engine/design-providers.ts','skills/prism/server/native-worker-host.ts',
 'skills/prism/server/worker-operation.ts','package-lock.json'];
console.log(JSON.stringify({kind:'identity',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),node:process.version,
 sources:await Promise.all(paths.map(async path=>({path,sha256:sha(await readFile(path))})))}));
const profiles={A:{maximumInFlight:4,maximumCompletedEntries:32,maximumCompletedBytes:16777216},
 B:{maximumInFlight:2,maximumCompletedEntries:16,maximumCompletedBytes:8388608}};
const records=[];
for(const [name,limits] of Object.entries(profiles)) {
 const engine=new PrismEngine(new DeterministicDesignProvider(),limits);
 const promises=Array.from({length:3},(_,i)=>engine.execute({contract:'kubeclaw.prism-design-engine@1',operation:'ingest',
  input:{text:'current deterministic library definition '+i},idempotencyKey:name+'-'+i}));
 const results=await Promise.allSettled(promises);
 const admitted=results.filter(r=>r.status==='fulfilled').length;
 assert.equal(admitted,name==='A'?3:2);
 for(const r of results)if(r.status==='rejected')assert.match(r.reason.message,/PRISM_ENGINE_IN_FLIGHT_LIMIT/);
 assert.equal(engine.cacheUsage().inFlight,0);
 records.push({profile:name,limits,admitted,rejected:3-admitted,usage:engine.cacheUsage(),result:'passed'});
}
for(const field of Object.keys(profiles.A)) {
 assert.throws(()=>new PrismEngine(new DeterministicDesignProvider(),{...profiles.A,[field]:0}),/PRISM_ENGINE_CACHE_LIMIT_INVALID/);
 records.push({field,input:0,boundary:'actual EngineExecutionCache constructor',result:'passed'});
}
console.log(JSON.stringify({kind:'current-typed-profile-definition',profiles,records,
 limits:'Direct real exported component with real deterministic provider. Native host constructs one engine and invokes one operation only; multi-key library witness does not prove configurable admission/eviction at that productive host. No browser, worker, gateway, paid model or service dispatched.'}));
