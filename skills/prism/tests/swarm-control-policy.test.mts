import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadControlServerConfig } from '../server/control-config.ts';
import { captureSwarmSettings, type PrismControlSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import { authorizePipelinePreferenceSubject } from '../control/pipeline-preference-subject.ts';
const configRoot = fileURLToPath(new URL('../../../config/', import.meta.url));
function writeControlPolicy(root: string, changes: Record<string, unknown>) {
  const file = path.join(root, 'components/prism-control.config.json');
  const author = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entry = JSON.parse(fs.readFileSync(path.join(root, 'pipeline.config.json'), 'utf8'));
  const profileId = entry.bindings.find((binding: any) => binding.owner === 'prism-control' && binding.instanceId === 'kubeclaw/prism/prism-control').profileId;
  Object.assign(author.profiles[profileId].settings, changes);
  fs.writeFileSync(file, JSON.stringify(author));
}
function controlPolicyFixture(t: { after(fn: () => void): void }, changes: Record<string, unknown>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-control-selected-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(configRoot, root, { recursive: true });
  writeControlPolicy(root, changes);
  const load = () => {
    const entryFile = path.join(root, 'pipeline.config.json');
    const entry = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
    const instanceId = 'kubeclaw/prism/prism-control';
    const captured = captureSwarmSettings(entryFile, { role: 'prism', callerId: 'prism-control', serviceInstanceId: instanceId,
      bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
        .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) });
    // Consumer settings only: this is not a verified process boot capture.
    const settings = captured.components['prism-control']!.settings as unknown as PrismControlSettings;
    authorizePipelinePreferenceSubject(undefined, settings.pipelinePreferenceSubject ?? undefined);
    return settings;
  };
  return { root, file: path.join(root, 'components/prism-control.config.json'), load };
}

const credentials = { PRISM_SESSION_SECRET:'test', PRISM_INGRESS_SECRET:'test', PRISM_INGESTION_SECRET:'test',
  PRISM_DISPATCH_SECRET:'test', PRISM_WORKER_SECRET:'test' };
const invalid = {
  pipelinePreferenceSubject: [undefined, '', 'operator:test', 'user-abc', 1, false],
  artifactRoot: [undefined, null, '', '/', 'relative', '/tmp/../artifacts', '/tmp/artifacts/', '/tmp//artifacts', '/tmp/\u0000artifacts', 1],
  studioPublicUrl: [undefined, null, '', 'relative', 'file:///tmp', 'https://', 'https://user:pass@studio', 'https://studio?query=1', 'https://studio#fragment', 'https://bad host', 1],
};
for (const [key, values] of Object.entries(invalid)) for (const value of values) {
  test(`CC1 Control ${key} rejects ${JSON.stringify(value)}`, t => {
    const env = controlPolicyFixture(t, {[key]:value});
    assert.throws(() => env.load(), /SWARM_CONFIG_INVALID/);
  });
}
for (const value of [undefined, null, {}, {unknown:1}]) test('CC1 strict Control object', t => {
  const env = controlPolicyFixture(t, {}), config = JSON.parse(fs.readFileSync(env.file, 'utf8'));
  config.profiles.standard.settings = value == null ? value : {dispatchTimeoutMs: config.profiles.standard.settings.dispatchTimeoutMs, ...value};
  fs.writeFileSync(env.file, JSON.stringify(config));
  assert.throws(() => env.load(), /SWARM_CONFIG_INVALID/);
});
for (const key of ['PRISM_PIPELINE_PREFERENCE_SUBJECT','ARTIFACT_ROOT','PRISM_STUDIO_PUBLIC_URL']) {
  test(`CC2 retired ${key} rejects even empty`, t => {
    controlPolicyFixture(t,{});
    for (const value of ['', 'old']) assert.throws(() => loadControlServerConfig(undefined as never, {...credentials,[key]:value}), /SWARM_CONFIG_LEGACY_OVERRIDE/);
  });
}
test('CC2 authored Control snapshot survives file mutation', t => {
  const env = controlPolicyFixture(t, {pipelinePreferenceSubject:`user-${'a'.repeat(24)}`,studioPublicUrl:'https://selected.example.test'});
  const settings = env.load(), service = env.load();
  assert.ok(Object.isFrozen(settings)); assert.ok(Object.isFrozen(service));
  writeControlPolicy(env.root, {pipelinePreferenceSubject:null,studioPublicUrl:'https://changed.example.test'});
  assert.equal(service.pipelinePreferenceSubject,`user-${'a'.repeat(24)}`);
  assert.equal(service.studioPublicUrl,'https://selected.example.test');
  assert.equal(settings.studioPublicUrl,'https://selected.example.test');
});
