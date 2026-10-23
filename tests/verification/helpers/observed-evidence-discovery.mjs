import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import YAML from 'yaml';

// Source-owned selected observation only. No role receipt, static inventory
// exemption, finite bound on arbitrary provider DATA, or release authority.
const pins = {
  "skills/buster/engine/test-gates/artifacts.ts": "4eedb9892218a3b0ee8a9b14d22c8e37b29c454333adbdf4cbae1772f44e5179",
  "skills/buster/engine/test-gates/runner.ts": "d6695dc52cd1919a88f7feed8051a543bdd9cee260b95afb829cbcee6f254919",
  "skills/buster/engine/test-gates/provider-loader.ts": "8453535b799916c74d2f036ca09a5bc973f600eb402ade0da57f93ab24ab6c85",
  "skills/buster/engine/test-gates/provider-child.mjs": "ce2bd1ddef2b283e5f3ea866c4a03deabfbb36ff3fabe06d73836d1c71611977",
  "skills/common/plugin-runtime/foundation/observability/durable-attempts.ts": "4c0fe1e20bafcddcb21997eb56de19dfcb1ceedeaf0df134c1c19b48781da750",
  "tests/verification/fixtures/evidence-discovery/provider.mjs": "7ef6a9ad7c7e54aa75680f0ced6ed15b6f1c84610366d5fdf8d4d61a21863764",
  "tests/verification/fixtures/evidence-discovery/yaml.bin": "59d99aec95cd035b519c4c5e5b00be6e5dd0c310a61c714d2d0b0a220aabbfac",
  "tests/verification/fixtures/evidence-discovery/json.bin": "f559549428ec02a0d32af9f7515ce51d7e162f01cd9c6ab089706d78cec8f95a"
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixture = 'tests/verification/fixtures/evidence-discovery/';
const fail = detail => assert.fail('OBSERVED_EVIDENCE_DISCOVERY_REJECTED: ' + detail);
function physical(file) {
  // This read-only test adapter accepts only physical regular files. It is not
  // the runtime's adversarial concurrent-file access/security boundary.
  if (!path.isAbsolute(file) || fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) fail('physical file ' + file);
  return fs.readFileSync(file);
}
function custody(root) {
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical source root');
  for (const [file, digest] of Object.entries(pins)) {
    if (hash(physical(path.join(root, file))) !== digest) fail('changed producer/selection/consumer ' + file);
  }
}

export function createObservedEvidenceDiscovery(root) {
  custody(root);
  // Deliberately no output cache: every invocation reacquires Source and DATA,
  // so a warm adapter cannot reuse an earlier producer or consumer observation.
  return observation => {
    custody(root);
    if (!['yaml', 'json'].includes(observation.format)) fail('unseen producer profile');
    if (!['selected', 'error'].includes(observation.route)) fail('unsupported selection');
    const expected = physical(path.join(root, fixture + observation.format + '.bin'));
    // No claimed size, digest, schema, evidence category or media type can
    // replace the producer bytes and the final managed-evidence URL read.
    for (const [stage, file] of Object.entries({producer: observation.producerFile,
      selected: observation.stagedFile, consumer: observation.consumerFile})) {
      if (!physical(file).equals(expected)) fail('complete bytes differ at ' + stage);
    }
    if (path.basename(path.dirname(observation.stagedFile)) !== observation.route) fail('changed selection route');
    const documents = YAML.parseAllDocuments(expected.toString('utf8'));
    if (documents.some(document => document.errors.length)) fail('invalid full stream');
    const outputs = [];
    function emit(value, document, itemPath = []) {
      if (!value || typeof value !== 'object' || typeof value.apiVersion !== 'string' || typeof value.kind !== 'string') fail('unsupported observed API document/item');
      outputs.push({value, context: {document, itemPath, originalStreamDigest: hash(expected),
        producer: 'isolated-synthetic-provider-observation', route: observation.route,
        qualification: 'observation-only-not-static-DATA-authority', runtimeExecutionAuthorized: false, apiApplyAuthorized: false}});
      if (value.kind === 'List') {
        if (!Array.isArray(value.items)) fail('invalid complete List');
        value.items.forEach((item, index) => emit(item, document, [...itemPath, index]));
      }
    }
    documents.forEach((document, index) => emit(document.toJS(), index));
    return {outputs, completeBytes: expected.length, streamDigest: hash(expected),
      staticRoleGrant: false, entireProviderFamilyQualified: false};
  };
}
