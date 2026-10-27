import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { publicationExampleBlocks } from './lib/docs-publication-example-coverage.mjs';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

// Validate only the three literal, explicitly materialized embedded resources.
// Never execute their shell wrappers, container commands, kubectl or a cluster.
export function validateEmbeddedYaml(root, { corrupt = null } = {}) {
  const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
  const lock = JSON.parse(read('scripts/docs-api-authority-lock.json'));
  function authority(record, parser) {
    const compressed = fs.readFileSync(path.join(root, record.path));
    assert.equal(compressed.length, record.compressedSize);
    assert.equal(sha(compressed), record.compressedSha256);
    const bytes = zlib.gunzipSync(compressed);
    assert.equal(sha(bytes), record.contentSha256);
    return parser(bytes.toString('utf8'));
  }
  const kubernetes = authority(lock.kubernetes, JSON.parse);
  const cilium = authority(lock.customResources.cilium.crds.CiliumNetworkPolicy, YAML.parse);
  const cnp = cilium.spec.versions.find(version => version.name === 'v2').schema.openAPIV3Schema;
  const block = (relative, ordinal) => publicationExampleBlocks(read(relative))[ordinal - 1].content;
  function heredocs(text) {
    return [...text.matchAll(/<<EOF\n([\s\S]*?)^EOF\s*$/gmu)].map(match => match[1]);
  }
  const diagnose = heredocs(block('docs/site/use/diagnose.md', 22));
  const install = heredocs(block('docs/site/use/install.md', 10));
  assert.equal(diagnose.length, 1); assert.equal(install.length, 2);
  const image = JSON.parse(read('versions.json')).buildArgs.OPS_NODE_BASE;
  const materials = [
    { id: 'cilium-denial-template', content: diagnose[0].replaceAll('${NAMESPACE}', 'mnt014-example'), schema: cnp },
    { id: 'pvc-probe-template', content: install[0].replaceAll('${PREFLIGHT_STORAGE_CLASS}', 'mnt014-fixture-class').replaceAll('${PREFLIGHT_STORAGE_REQUEST}', '1Mi'), definition: 'PersistentVolumeClaim' },
    { id: 'pod-probe-template', content: install[1].replaceAll('${PREFLIGHT_IMAGE}', image).replaceAll('\\$(', '$('), definition: 'Pod' },
  ];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-embedded-yaml-'));
  try {
    const results = [];
    for (const item of materials) {
      assert(!item.content.includes('${'), `unmaterialized embedded YAML: ${item.id}`);
      const value = YAML.parse(item.content);
      if (corrupt === item.id) value.spec = 'not-an-object';
      const schema = item.schema ?? { $schema: 'http://json-schema.org/draft-04/schema#',
        $ref: `#/definitions/io.k8s.api.core.v1.${item.definition}`, definitions: kubernetes.definitions };
      const schemaPath = path.join(directory, `${item.id}.json`);
      const specimenPath = path.join(directory, `${item.id}.yaml`);
      fs.writeFileSync(schemaPath, JSON.stringify(schema));
      fs.writeFileSync(specimenPath, YAML.stringify(value));
      const result = spawnSync('kubeconform', ['-strict', '-summary', '-output', 'json',
        '-kubernetes-version', '1.35.0', '-schema-location', schemaPath, specimenPath],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: directory, LANG: 'C.UTF-8' } });
      assert.ifError(result.error);
      assert.equal(result.status, 0, `native embedded YAML ${item.id}: ${result.stdout} ${result.stderr}`);
      const output = JSON.parse(result.stdout);
      assert.deepEqual(output.summary, { valid: 1, invalid: 0, errors: 0, skipped: 0 });
      results.push({ id: item.id, materializedSha256: sha(item.content), schemaSha256: sha(JSON.stringify(schema)), nativeSummary: output.summary });
    }
    return { results, profile: 'Pinned raw OpenAPI/CRD schema specimens; not approved target admission',
      kubectlClusterCiliumEnforcementOrWorkloadExecution: false };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
