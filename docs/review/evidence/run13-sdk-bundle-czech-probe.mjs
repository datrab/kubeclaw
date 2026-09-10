import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Use only the selected checkout's existing original producer/reader, never old Git objects.
const checkout = fs.realpathSync(process.argv[2] ?? process.cwd());
const file = path.join(checkout, 'skills/nova/plugins/review/tests/review-evidence-encoding-independent.test.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-czech-bundle-original-'));
try {
  for (const [mode, locale] of [['--produce', 'en_US.UTF-8'], ['--read', 'en_US.UTF-8'], ['--read', 'cs_CZ.UTF-8']]) {
    const env = { ...process.env, LANG: locale, LC_ALL: locale };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, [file, mode, root], { cwd: checkout, env, encoding: 'utf8', timeout: 30000 });
    console.log(JSON.stringify({ mode, locale, status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr, error: r.error?.message }));
    if (mode === '--produce' && r.status !== 0) break;
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
