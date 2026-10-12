from pathlib import Path
import re
r=Path.cwd();o=r/'docs/review/evidence/config-component-layout-20260921/staging/files';name='tests/verification/deployment/prism-swarm-config.test.mjs';s=(r/name).read_text()
s="import { readTestBundle, writeTestBundle, bundleFromConfigMap, projectTestBundle, bundleNames } from '../../fixtures/config/swarm-bundle.mjs';\n"+s
s=s.replace("JSON.parse(fs.readFileSync(canonical, 'utf8'))",'readTestBundle(canonical)')
s=s.replace("['swarm.config.json', 'swarm.schema.json']","[...bundleNames, 'swarm.schema.json', 'swarm-components.schema.json']")
s=s.replace("return config.data['swarm.config.json'];",'return JSON.stringify(bundleFromConfigMap(config.data));')
s=s.replace("assert.deepEqual(JSON.parse(contents), base);", "assert.deepEqual(JSON.parse(contents), base.entry);\n  for (const name of bundleNames.slice(1)) {\n    const component = execFileSync('tar', ['-xzOf', archive, `prism/files/config/${name}`], { encoding: 'utf8' });\n    assert.deepEqual(JSON.parse(component), base[name.slice(0, -'.config.json'.length)]);\n  }")
# Two sites with old whole-native replacement: negatives mutate the raw shared settings;
# the valid positive assignment explicitly writes each actual owner, no generic input translator.
s=s.replace('const chart = copiedChart(t), config = structuredClone(base); config.operator.prism.native = native;', "const chart = copiedChart(t), config = structuredClone(base); config['prism-execution'].settings = native;")
s=s.replace('const config = structuredClone(base); config.operator.prism.native = native;', "const config = structuredClone(base);\n    config['prism-execution'].settings = { resourcePolicy: native.resourcePolicy, maximumResultBytes: native.maximumResultBytes };\n    config['prism-control'].settings.dispatchTimeoutMs = native.dispatchTimeoutMs;\n    config['prism-worker'].settings.supervisor = native.supervisor;")
s=s.replace('config.operator.prism.native[key] = invalid;', "config[key === 'dispatchTimeoutMs' ? 'prism-control' : 'prism-execution'].settings[key] = invalid;")
for old,new in [('.operator.prism.native.supervisor',"['prism-worker'].settings.supervisor"),('.operator.prism.native.resourcePolicy',"['prism-execution'].settings.resourcePolicy"),('.operator.prism.native.maximumResultBytes',"['prism-execution'].settings.maximumResultBytes"),('.operator.prism.native.dispatchTimeoutMs',"['prism-control'].settings.dispatchTimeoutMs"),('.operator.prism.worker',"['prism-worker'].settings.ingress"),('.operator.prism.control',"['prism-control'].settings"),('.operator.prism.studio',"['prism-studio'].settings"),('.operator.buster',"['buster-engine'].settings")]:s=s.replace(old,new)
s=s.replace('base.operator.prism.native','projectTestBundle(base).operator.prism.native')
s=s.replace("['', 'operator', 'operator.prism', 'operator.prism.worker']", "['entry', 'prism-worker', 'prism-worker.settings', 'prism-worker.settings.ingress']")
s=s.replace("config['prism-control'].settings = control;", "config['prism-control'].settings = control == null ? control : { dispatchTimeoutMs: config['prism-control'].settings.dispatchTimeoutMs, ...control };")
# Preserve the unrelated Control-owned dispatch field in valid and invalid old-control replacement cases.
s=s.replace("{...base['prism-control'].settings,unknown:1}","{...base['prism-control'].settings,unknown:1}")
s=re.sub(r'fs\.writeFileSync\(([^;\n]+?),\s*JSON\.stringify\((authored|config)\)\)',r'writeTestBundle(\1, \2)',s)
s=re.sub(r'fs\.writeFileSync\((file),\s*(rendered|controlBytes)\)',r'writeTestBundle(\1, JSON.parse(\2))',s)
s=re.sub(r'fs\.writeFileSync\((file),\s*(delivery\([^;\n]+?\))\)',r'writeTestBundle(\1, JSON.parse(\2))',s)
p=o/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
# Extra owner/ref tests are additive, not substitutes for original behavior cases.
name='tests/verification/deployment/config-component-packaging.test.mjs';p=o/name
p.write_text('''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bundleNames } from '../../fixtures/config/swarm-bundle.mjs';

for (const chart of ['prism', 'kubeclaw']) test(`${chart} package contains the complete canonical bundle and shared validator`, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'component-package-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  execFileSync('helm', ['package', `charts/${chart}`, '--destination', directory]);
  const archive = path.join(directory, fs.readdirSync(directory).find(name => name.endsWith('.tgz')));
  for (const name of bundleNames) {
    const actual = execFileSync('tar', ['-xzOf', archive, `${chart}/files/config/${name}`]);
    assert.deepEqual(actual, fs.readFileSync(`charts/kubeclaw/files/config/${name}`));
  }
  const helper = chart === 'prism' ? '_swarm-bundle.tpl' : '_swarm-config.tpl';
  assert.deepEqual(execFileSync('tar', ['-xzOf', archive, `${chart}/templates/${helper}`]),
    fs.readFileSync('charts/kubeclaw/templates/_swarm-config.tpl'));
});
''')
print('Staged all original Helm cases with explicit raw-document mutation and complete ConfigMap delivery; unexecuted.')
