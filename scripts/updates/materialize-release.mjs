import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { selectedCode } from './code-release.mjs';
import { verifyReleaseConfiguration } from './release-configuration.mjs';
const family = process.argv.includes('--family=ops') ? 'ops' : 'runtime';
const release = JSON.parse(fs.readFileSync(`releases/${family}-images.json`, 'utf8'));
if (release.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(release.commit)) throw new Error('Invalid release manifest');
const code = family === 'runtime' ? selectedCode(process.cwd(), release) : undefined;
const sourceCommit = code?.commit ?? release.commit;
// CI may validate a previous selection while building its replacement. Actual
// materialization/deployment must still require byte-matched current sources.
const checkSelectedSource = process.argv.includes('--check-selected-source');
if (checkSelectedSource && !process.argv.includes('--check')) throw new Error('SELECTED_SOURCE_CHECK_ONLY');
if (!checkSelectedSource) verifyReleaseConfiguration(process.cwd(), sourceCommit, family);
const sourceValues = file => checkSelectedSource
  ? execFileSync('git', ['show', `${sourceCommit}:${file}`], { encoding: 'utf8' })
  : fs.readFileSync(file, 'utf8');
const reference = name => {
  const image = release.images[name];
  if (typeof image !== 'string' || !/^ghcr\.io\/[a-z0-9_-]+\/kubeclaw-[a-z0-9-]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error(`Missing immutable image: ${name}`);
  return image;
};
const object = name => { const [repository, digest] = reference(name).split('@'); return { repository, digest, tag: '', pullPolicy: 'IfNotPresent' }; };
function bindSidecarImages(values) {
  for (const container of values.extraContainers ?? []) {
    const name = container.image?.match(/\/kubeclaw-([^:@]+)(?::|@)/)?.[1];
    if (name) container.image = reference(name);
  }
}
fs.mkdirSync('releases/values', { recursive: true });
for (const role of family === 'ops' ? ['ops'] : ['nova', 'buster', 'prism-agent', 'prism']) {
  const values = role === 'ops' ? {} : yaml.load(sourceValues(`my-values/${role}-values.yaml`));
  if (role === 'ops') { values.codexImage = reference('codex-ops'); values.mcpImage = reference('ops-mcp'); }
  else if (role === 'prism') {
    for (const service of ['control', 'studio', 'worker', 'ingestion']) { const image = object(`prism-${service}`); delete image.tag; values.images[service] = image; }
  } else {
    values.image = object(role === 'buster' ? 'buster-gateway' : role);
    bindSidecarImages(values);
    if (values.busterNamespaceBroker?.controller?.image) values.busterNamespaceBroker.controller.image = object('namespace-controller');
  }
  if (code && ['nova', 'buster', 'prism-agent'].includes(role)) {
    const bundle = code.bundles[role === 'prism-agent' ? 'prism' : role];
    values.codeBundle = { ...values.codeBundle, enabled: true, archiveUrl: bundle.url, expectedCommit: code.commit,
      sha256: bundle.sha256, contractVersion: bundle.contractVersion };
  }
  const output = `# Generated from release ${release.commit} and byte-matched source configuration; do not edit.\n${yaml.dump(values, { lineWidth: 120, noRefs: true })}`;
  const file = `releases/values/${role}.yaml`;
  if (process.argv.includes('--check')) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== output) throw new Error(`Release values drift: ${file}`); }
  else fs.writeFileSync(file, output);
}
