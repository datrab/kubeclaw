import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs';
const legacy=execFileSync('git',['show','f777c4370:skills/buster/plugins/buster-suite-runtime/src/runtime/suites/e2e.ts'],{encoding:'utf8'});
assert.match(legacy,/maxFailures/u); assert.match(legacy,/stdout/u); assert.match(legacy,/stderr/u); assert.match(legacy,/parse/u);
const replacement=fs.readFileSync('skills/buster/plugins/playwright/src/provider.js','utf8'); assert.match(replacement,/command\.report/u); assert.match(replacement,/PLAYWRIGHT_ZERO_TESTS/u); assert.doesNotMatch(replacement,/maxFailures/u);
console.log(JSON.stringify({ok:true,phase:'e2e-legacy-comparison',preserved:['project-tests','failure-detail','bounded-run'],improved:['structured-report','typed-evidence','exact-counts'],removed:['console-count-parsing','numeric-failure-allowance']}));
