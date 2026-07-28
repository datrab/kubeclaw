import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
for (const file of fs.readdirSync('src')) {
  const source = fs.readFileSync(path.join('src', file), 'utf8');
  assert.equal(source.includes('/pipeline/'), false);
  assert.equal(source.includes('../'), false);
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.architecture-validator', suite: 'package-boundary' }));
