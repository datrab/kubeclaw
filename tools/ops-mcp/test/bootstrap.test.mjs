import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('custom namespace migration applies only project policies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ops-migration-'));
  const log = join(directory, 'calls');
  const fake = '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$CALL_LOG"\n';
  writeFileSync(join(directory, 'kubectl'), fake, { mode: 0o755 });
  writeFileSync(join(directory, 'python3'), fake, { mode: 0o755 });
  const migration = fileURLToPath(new URL('../../../scripts/migrate-kubeclaw-network-policies-to-cilium.sh', import.meta.url));
  const custom = { ...process.env, PATH: directory + ':' + process.env.PATH, CALL_LOG: log, NAMESPACE: 'example-project', CILIUM_DATAPLANE_VERIFIED: 'true', CILIUM_TRAFFIC_VERIFIED: 'true' };
  try {
    execFileSync('bash', [migration, 'apply'], { env: custom });
    const applyCalls = readFileSync(log, 'utf8');
    assert.match(applyCalls, /apply -n example-project -f .*\/network-policies.yaml/);
    writeFileSync(log, '');
    execFileSync('bash', [migration, 'cleanup'], { env: custom });
    const cleanupCalls = readFileSync(log, 'utf8');
    assert.match(cleanupCalls, /verify-cilium-policies.py example-project/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
