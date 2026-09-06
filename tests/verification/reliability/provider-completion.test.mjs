import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { assessPlaywrightReport } from '../../../skills/buster/plugins/playwright/src/provider.js';

// Playwright itself discovers and executes these cases. No browser is needed to
// test its real report semantics; browser enforcement has a separate live gate.
test('real Playwright reports distinguish execution, defects and all-skipped suites', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-playwright-report-'));
  try {
    fs.writeFileSync(path.join(root, 'playwright.config.mjs'), 'export default { testDir: ".", reporter: "json", workers: 1 };');
    fs.writeFileSync(path.join(root, 'behavior.spec.mjs'), `import { test, expect } from ${JSON.stringify(import.meta.resolve('@playwright/test'))};
      test('working behavior', () => expect(2 + 2).toBe(4));
      test('broken behavior', () => expect(2 + 2).toBe(5));
      test.skip('unimplemented behavior', () => {});
    `);
    for (const [selection, expected] of [['working behavior', 'passed'], ['broken behavior', 'failed'], ['unimplemented behavior', 'failed']]) {
      const run = spawnSync(process.execPath, ['node_modules/playwright/cli.js', 'test', '--config', path.join(root, 'playwright.config.mjs'), '--grep', selection], { encoding: 'utf8', timeout: 30000 });
      assert.equal(run.error, undefined);
      const report = JSON.parse(run.stdout);
      const decision = assessPlaywrightReport(report, {}, 'blocking');
      assert.equal(decision.outcome, expected, JSON.stringify(decision));
      assert.equal(run.status, selection === 'broken behavior' ? 1 : 0);
      if (selection === 'working behavior') {
        assert.equal(decision.passed, 1);
        assert.equal(assessPlaywrightReport(report, { requiredTests: ['missing requirement'] }, 'blocking').outcome, 'failed');
        assert.equal(assessPlaywrightReport(report, { requiredTests: [decision.testCases[0].title] }, 'blocking').outcome, 'passed');
      }
      if (selection === 'unimplemented behavior') {
        assert.equal(decision.passed, 0);
        assert.equal(decision.skipped, 1);
        assert.match(decision.findings[0].message, /observed 0/);
      }
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
