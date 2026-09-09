// Actual pre-fix/current modules in separate native Node locale processes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../../../', import.meta.url);
const current = new URL('skills/common/plugin-runtime/sdk/src/values.ts', root).href;

test('original validation cutover preserves accepted JSON bytes in each locale; existing cross-locale portability gap remains visible', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'sdk-original-json-'));
  try {
    const baseline = join(temporary, 'values.mts');
    writeFileSync(baseline, execFileSync('git', ['show', 'eaf353a^:skills/common/plugin-runtime/sdk/src/values.ts'], { cwd: root }));
    const program = `
      import assert from 'node:assert/strict';
      const old = await import(process.argv[1]);
      const current = await import(process.argv[2]);
      const values = [null, true, false, 0, -0, 1.5, 1e100, 1e-100, '', '\\ud800', 'a\\n\\t\\"\\\\', [], {}, {'10':10,'2':2,'ä':1,z:2,a:3}, {'__proto__':null}];
      for (let i=0;i<100;i++) values.push(JSON.parse(JSON.stringify({'ä':i,z:[null,true,i/7],a:{'I':i,'ı':i+1,'é':'x'}, '2':i, '10':i+1})));
      for (const value of values) assert.equal(current.canonicalJson(value), old.canonicalJson(value));
      assert.equal(old.canonicalJson(Array(2)), '[,]');
      assert.throws(()=>current.canonicalJson(Array(2)), /CANONICAL_JSON_/);
      assert.equal(old.canonicalJson({x:undefined}), old.canonicalJson({x:null}));
      assert.throws(()=>current.canonicalJson({x:undefined}), /CANONICAL_JSON_/);
      const bytes=current.canonicalJson({'ä':1,z:2,a:3});
      const fs = await import('node:fs');
      const path = await import('node:path');
      const {activate} = await import(${JSON.stringify(new URL('skills/common/plugins/artifact-store/src/adapter.ts', root).href)});
      const store=activate({config:{artifactRoot:path.join(process.argv[3],'artifacts')}});
      const attempt={runId:'run:locale-audit',stageId:'stage:audit',attemptId:'attempt:audit',attemptNumber:1};
      const request={schemaVersion:'effect-request.v1',requestId:'request:audit',effectId:'effect:audit',idempotencyKey:'artifact:audit',attempt,capability:'artifacts.write',operation:'put_json',resource:{type:'artifact.object',canonicalId:'artifact:audit'},payload:{namespace:'sdk.locale.audit',mediaType:'application/json',value:{'ä':1,z:2,a:3}}};
      const signal=new AbortController().signal;
      const invoke=request=>store.invoke({request,signal,confidential:true});
      await store.ready();
      const referencePath=path.join(process.argv[3],'reference.json');
      if(!fs.existsSync(referencePath))fs.writeFileSync(referencePath,JSON.stringify((await invoke(request)).artifact));
      const artifact=JSON.parse(fs.readFileSync(referencePath,'utf8'));
      const loaded=await invoke({...request,capability:'artifacts.read',operation:'get_json',payload:{namespace:artifact.namespace,digest:artifact.digest}});
      assert.equal(loaded.digest,artifact.digest);
      const reserializedDigest=current.sha256Text(current.canonicalJson(loaded.value));
      await store.shutdown(signal);
      console.log(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale, accepted:values.length, bytes, digest:current.sha256Text(bytes),storedDigest:loaded.digest,reserializedDigest}));
    `;
    const observations = ['en_US.UTF-8', 'sv_SE.UTF-8', 'tr_TR.UTF-8'].map(locale => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', program, pathToFileURL(baseline).href, current, temporary], { cwd: root, env: { ...process.env, LANG: locale, LC_ALL: locale }, encoding: 'utf8' })) as { locale: string; accepted: number; bytes: string; digest: string; storedDigest: string; reserializedDigest: string });
    assert.equal(new Set(observations.map(result => result.locale)).size, 3, 'native Node must actually select three different locales');
    assert.notEqual(observations[0]!.bytes, observations[1]!.bytes, 'known remaining unversioned locale difference is explicit, not a claim of portability');
    assert.equal(observations[0]!.storedDigest, observations[1]!.storedDigest, "original artifact bytes remain readable across locale movement");
    assert.notEqual(observations[1]!.storedDigest, observations[1]!.reserializedDigest, "SDK reserialization cannot reproduce that legitimate older-locale artifact digest");
    console.log(JSON.stringify({ originalSource: 'eaf353a^', observations }));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
