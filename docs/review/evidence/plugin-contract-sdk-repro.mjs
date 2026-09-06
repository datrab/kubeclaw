// Read-only probes of production implementations; no substitutes or repairs.
import assert from 'node:assert/strict';
import { parsePluginManifest } from '../../../skills/common/plugin-runtime/foundation/registry/schema.ts';
import { canonicalJson } from '../../../skills/common/plugin-runtime/sdk/src/values.ts';
const manifest = { id: 'review.empty', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', stages: [], observers: [], adapters: [] };
assert.deepEqual(parsePluginManifest(JSON.stringify(manifest), 'review-in-memory'), manifest);
console.log('PCR-CONTRACT-PLUGIN-001: production parser accepts manifest without any registration');
const sparse = canonicalJson(Array(2));
assert.equal(sparse, '[,]');
assert.throws(() => JSON.parse(sparse));
console.log('PCR-SDK-001: canonicalJson(Array(2)) emits invalid JSON:', sparse);
assert.equal(canonicalJson({ x: undefined }), canonicalJson({ x: null }));
console.log('PCR-SDK-001: undefined and null object values collide');
