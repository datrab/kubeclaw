import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mintSession, verifySession } from '../../../../../skills/prism/control/session.ts';
const key = randomBytes(32).toString('hex');
const now = 1700000000000;
const records = [];
for (const roles of [['editor'], [], [17]]) {
  const observed = verifySession(mintSession('definition-only', key, now, roles), key, now);
  assert.deepEqual(observed.roles, roles);
  records.push({roles, result:'passed', observation:'Current signed metadata round-trips; membership is not runtime-validated here'});
}
const paths = [import.meta.filename, 'skills/prism/control/session.ts', 'skills/prism/server/control-context.ts', 'skills/prism/control/product-decisions.ts'];
console.log(JSON.stringify({
  identity:{node:process.version, commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    sources:paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))},
  records, limits:'Current exported signed-role metadata controls only; no role grant, service authorization, migrated schema, selected full profile or runtime binding acceptance; disposable local key not persisted.'
},null,2));
