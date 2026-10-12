import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = process.env.REVIEW_GUARD_FIXTURE;
assert.ok(root);
const original = path.join(root, 'original');
for (const file of ['alias', 'hardlink']) {
  assert.throws(() => fs.writeFileSync(path.join(root, file), 'incorrect'), /REVIEW_PROTECTED_SOURCE_WRITE/);
}
assert.equal(fs.readFileSync(original, 'utf8'), 'original');
// Safe alias detachment is required for the actual packaging fixture fix.
fs.unlinkSync(path.join(root, 'alias'));
fs.copyFileSync(original, path.join(root, 'alias'));
assert.equal(fs.realpathSync(path.join(root, 'alias')), path.join(root, 'alias'));
assert.notEqual(fs.statSync(original, { bigint: true }).ino, fs.statSync(path.join(root, 'alias'), { bigint: true }).ino);
fs.writeFileSync(path.join(root, 'alias'), 'independent-copy');
assert.equal(fs.readFileSync(original, 'utf8'), 'original');
assert.equal(fs.readFileSync(path.join(root, 'alias'), 'utf8'), 'independent-copy');
console.log('GUARD: alias/hardlink blocked; unlink and independent copy writable; original unchanged');
