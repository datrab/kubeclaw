import fs from 'node:fs';
import yaml from 'js-yaml';
const release = JSON.parse(fs.readFileSync('releases/runtime-images.json', 'utf8'));
if (release.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(release.commit)) throw new Error('Invalid release manifest');
const reference = name => {
  const image = release.images[name];
  if (typeof image !== 'string' || !/^ghcr\.io\/[a-z0-9_-]+\/kubeclaw-[a-z0-9-]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error(`Missing immutable image: ${name}`);
  return image;
};
const object = name => { const [repository, digest] = reference(name).split('@'); return { repository, digest, tag: '', pullPolicy: 'IfNotPresent' }; };
fs.mkdirSync('releases/values', { recursive: true });
for (const role of ['nova', 'buster', 'prism-agent', 'prism']) {
  const values = yaml.load(fs.readFileSync(`my-values/${role}-values.yaml`, 'utf8'));
  if (role === 'prism') {
    for (const service of ['control', 'studio', 'worker', 'ingestion']) values.images[service] = object(`prism-${service}`);
  } else {
    values.image = object(role === 'buster' ? 'buster-gateway' : role);
    for (const container of values.extraContainers ?? []) {
      const name = container.image?.match(/\/kubeclaw-([^:@]+)(?::|@)/)?.[1];
      if (name) container.image = reference(name);
    }
    if (values.busterNamespaceBroker?.controller?.image) values.busterNamespaceBroker.controller.image = object('namespace-controller');
  }
  const output = `# Generated from the selected release and current my-values; do not edit.\n${yaml.dump(values, { lineWidth: 120, noRefs: true })}`;
  const file = `releases/values/${role}.yaml`;
  if (process.argv.includes('--check')) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== output) throw new Error(`Release values drift: ${file}`); }
  else fs.writeFileSync(file, output);
}
