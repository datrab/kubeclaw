import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {materializeCurrentCore} from './repair-identity-historical.mjs';

/** Original historical producer, validated against remote Git blobs, no old Git objects. */
export function materializeLegacyDependencyCore(destination) {
  materializeCurrentCore(destination);
  const archive = JSON.parse(fs.readFileSync(new URL('../../fixtures/adapter-dependency/legacy-core.json', import.meta.url), 'utf8'));
  for (const file of archive.files) {
    const bytes = Buffer.from(file.content);
    assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), file.gitBlob);
    const target = path.join(destination, file.path); assert(target.startsWith(`${destination}${path.sep}`));
    fs.writeFileSync(target, bytes);
  }
  return destination;
}
