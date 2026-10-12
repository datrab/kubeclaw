import { readTestBundle, writeTestBundle } from '../../../tests/fixtures/config/swarm-bundle.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, {type TestContext} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadStudioConfig} from '../server/studio-config.ts';

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-policy-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const value = readTestBundle(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));
  const file = path.join(root, 'swarm.json');
  const write = () => writeTestBundle(file, value);
  write();
  return {value, write, environment:{SWARM_CONFIG:file}};
}

test('Studio loads authored operator values and keeps installation inputs outside JSON', t => {
  const f = fixture(t);
  f.value['prism-studio'].settings = {port:19087, controlTimeoutMs:741, controlUrl:'https://selected.example.test:8443'};
  f.write();
  const config = loadStudioConfig({...f.environment, STUDIO_ROOT:'/installed/assets', PRISM_INGRESS_SECRET:'test-secret'});
  assert.equal(config.port,19087); assert.equal(config.controlTimeoutMs,741);
  assert.equal(config.control.href,'https://selected.example.test:8443/');
  assert.equal(config.root,'/installed/assets'); assert.equal(config.ingressSecret,'test-secret');
  assert(Object.isFrozen(config));
  f.value['prism-studio'].settings.port=19088; f.write();
  assert.equal(config.port,19087); assert.equal(loadStudioConfig(f.environment).port,19088);
  assert.equal(loadStudioConfig(f.environment).ingressSecret,'');
});

for (const key of ['PORT','PRISM_CONTROL_URL','PRISM_CONTROL_TIMEOUT_MS']) {
  for (const value of ['', '8080']) {
    test(`Studio rejects retired ${key}=${JSON.stringify(value)}`, t => {
      const f=fixture(t);
      assert.throws(() => loadStudioConfig({...f.environment,[key]:value}),/SWARM_CONFIG_LEGACY_OVERRIDE/u);
    });
  }
}
const invalid: Record<string, unknown[]> = {
  port:[undefined,null,true,0,-1,65536,1.5,'8080'],
  controlTimeoutMs:[undefined,null,false,0,-1,2147483648,1.5,'30000'],
  controlUrl:[undefined,null,1,'','relative','file:///tmp','https://','http://host:99999','https://user:pass@host','http://host/path','http://host?x=1','http://host#x','http://control\\suffix','http://control/\\suffix',...['\0','\t','\r','\n','\x7f'].map(character => `http://control${character}`)],
};
for (const [key,values] of Object.entries(invalid)) {
  test(`Studio rejects invalid ${key} through original shared validation`,t => {
    const f=fixture(t);
    for (const value of values) {
      f.value['prism-studio'].settings[key]=value; f.write();
      assert.throws(() => loadStudioConfig(f.environment),/SWARM_CONFIG_INVALID/u,JSON.stringify(value));
    }
  });
}
test('Studio rejects unknown settings and invalid startup terminates before serving',t => {
  const f=fixture(t); f.value['prism-studio'].settings.extra=1; f.write();
  assert.throws(() => loadStudioConfig(f.environment),/SWARM_CONFIG_INVALID/u);
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../server/studio.ts',import.meta.url))],
    {env:{...process.env,...f.environment},encoding:'utf8',timeout:5000});
  assert.equal(result.status,1,result.stderr); assert.match(result.stderr,/SWARM_CONFIG_INVALID/u);
});
test('production Studio Docker environment does not reintroduce a retired author',t => {
  const f=fixture(t);
  const source=fs.readFileSync(new URL('../../../docker/Dockerfile.prism-studio',import.meta.url),'utf8');
  const environment: NodeJS.ProcessEnv={...process.env,...f.environment};
  for (const line of source.split('\n').filter(line => line.startsWith('ENV '))) {
    for (const assignment of line.slice(4).split(/\s+/u)) {
      const at=assignment.indexOf('='); assert(at>0); environment[assignment.slice(0,at)]=assignment.slice(at+1);
    }
  }
  assert.equal(loadStudioConfig(environment).port,f.value['prism-studio'].settings.port);
  assert.throws(() => loadStudioConfig({...environment,PORT:'8080'}),/SWARM_CONFIG_LEGACY_OVERRIDE/u);
});
