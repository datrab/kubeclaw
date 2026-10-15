import {publishedControlConfig} from './fixtures/published-config.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Studio loads authored operator values and keeps installation inputs outside JSON', async t => {
  const f = await publishedControlConfig(t, {}, undefined,
    {port:19087, controlTimeoutMs:741, controlUrl:'https://selected.example.test:8443'});
  const environment = {STUDIO_ROOT:'/installed/assets', PRISM_INGRESS_SECRET:'test-secret'};
  const config = f.loadStudioConfig(f.studioCapture, environment);
  assert.equal(config.port,19087); assert.equal(config.controlTimeoutMs,741);
  assert.equal(config.control.href,'https://selected.example.test:8443/');
  assert.equal(config.root,'/installed/assets'); assert.equal(config.ingressSecret,'test-secret');
  assert(Object.isFrozen(config));
  const file = path.join(f.author, 'components/prism-studio.config.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  value.profiles.standard.settings.port=19088;
  fs.writeFileSync(file, JSON.stringify(value));
  assert.equal(config.port,19087);
  assert.equal(f.loadStudioConfig(f.studioCapture, environment).port,19087);
  const next = await publishedControlConfig(t, {}, undefined, {port:19088});
  assert.equal(next.loadStudioConfig(next.studioCapture, {}).port,19088);
  assert.equal(f.loadStudioConfig(f.studioCapture, {}).ingressSecret,'');
});

for (const key of ['PORT','PRISM_CONTROL_URL','PRISM_CONTROL_TIMEOUT_MS']) {
  for (const value of ['', '8080']) {
    test(`Studio rejects retired ${key}=${JSON.stringify(value)}`, async t => {
      const f=await publishedControlConfig(t, {}, undefined, {});
      assert.throws(() => f.loadStudioConfig(f.studioCapture, {[key]:value}),/SWARM_CONFIG_LEGACY_OVERRIDE/u);
    });
  }
}
const invalid: Record<string, unknown[]> = {
  port:[undefined,null,true,0,-1,65536,1.5,'8080'],
  controlTimeoutMs:[undefined,null,false,0,-1,2147483648,1.5,'30000'],
  controlUrl:[undefined,null,1,'','relative','file:///tmp','https://','http://host:99999','https://user:pass@host','http://host/path','http://host?x=1','http://host#x','http://control\\suffix','http://control/\\suffix',...['\0','\t','\r','\n','\x7f'].map(character => `http://control${character}`)],
};
for (const [key,values] of Object.entries(invalid)) {
  test(`Studio rejects invalid ${key} through original shared validation`,async t => {
    for (const value of values) {
      // The selected central author must fail real generation publication before startup.
      await assert.rejects(() => publishedControlConfig(t, {}, undefined, {[key]:value}),
        /SWARM_CONFIG_INVALID/u,JSON.stringify(value));
    }
  });
}
test('Studio rejects unknown settings and invalid startup terminates before serving',async t => {
  // An unknown selected author cannot produce any deliverable boot generation.
  await assert.rejects(() => publishedControlConfig(t, {}, undefined, {extra:1}),/SWARM_CONFIG_INVALID/u);
  // The production entrypoint must also reject startup with no trusted delivery;
  // a legacy locator is not a replacement for authenticated boot receipts.
  const f=await publishedControlConfig(t, {}, undefined, {});
  const entrypoint=path.join(f.root,'role/skills/packages/prism-engine/server/studio.ts');
  const result=spawnSync(process.execPath,[entrypoint],
    {env:{...process.env,SWARM_CONFIG:path.join(f.author,'pipeline.config.json')},encoding:'utf8',timeout:5000});
  assert.equal(result.error,undefined);
  assert.equal(result.signal,null);
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stderr,/ENOENT|PIPELINE_/u);
  assert.match(result.stderr,/\/etc\/kubeclaw\/config|pipeline-delivery|PIPELINE_/u);
  assert.doesNotMatch(result.stderr,/ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED/u);
});
test('production Studio Docker environment does not reintroduce a retired author',async t => {
  const f=await publishedControlConfig(t, {}, undefined, {});
  const source=fs.readFileSync(new URL('../../../docker/Dockerfile.prism-studio',import.meta.url),'utf8');
  const environment: NodeJS.ProcessEnv={...process.env};
  for (const line of source.split('\n').filter(line => line.startsWith('ENV '))) {
    for (const assignment of line.slice(4).split(/\s+/u)) {
      const at=assignment.indexOf('='); assert(at>0); environment[assignment.slice(0,at)]=assignment.slice(at+1);
    }
  }
  const owner=JSON.parse(fs.readFileSync(path.join(f.author, 'components/prism-studio.config.json'),'utf8'));
  assert.equal(f.loadStudioConfig(f.studioCapture, environment).port,owner.profiles.standard.settings.port);
  assert.throws(() => f.loadStudioConfig(f.studioCapture, {...environment,PORT:'8080'}),/SWARM_CONFIG_LEGACY_OVERRIDE/u);
});
