import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('suite parity entries use locale-independent code-point order', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'suite-parity-report-'));
  try {
    const ledgerPath = path.join(directory, 'ledger.json');
    const reportPath = path.join(directory, 'report.md');
    const entry = { disposition: 'preserved', status: 'ok', rationale: 'test', proof: [] };
    writeFileSync(ledgerPath, JSON.stringify({
      title: 'Parity',
      authority: { old: 'old', replacement: 'new' },
      entries: { z: entry, 'ä': entry, a: entry },
    }));

    execFileSync(process.execPath, ['scripts/suite-parity-report.mjs', ledgerPath, reportPath]);
    const rows = readFileSync(reportPath, 'utf8')
      .split('\n')
      .filter((line) => /^\| (?:a|z|ä) \|/u.test(line));
    assert.deepEqual(rows.map((line) => line.split('|')[1].trim()), ['a', 'z', 'ä']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
