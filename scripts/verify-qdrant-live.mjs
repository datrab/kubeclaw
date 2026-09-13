import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { qdrantClient } from './qdrant-client.mjs';

// Read-only live gate. Snapshot export/recovery is a separate explicit operation.
if (process.argv.length !== 6) throw new Error('Usage: verify-qdrant-live.mjs HTTPS_ORIGIN CA_FILE ADMIN_KEY_FILE READ_ONLY_KEY_FILE');
const [url, caFile, keyFile, readOnlyKeyFile] = process.argv.slice(2);
const options = { url, caFile, keyFile, timeoutMs: 15000 };
const admin = qdrantClient(options);
const reader = qdrantClient({ ...options, keyFile: readOnlyKeyFile });
const adminCollections = (await admin.json('/collections')).result.collections;
const readerCollections = (await reader.json('/collections')).result.collections;
assert.deepEqual(readerCollections.map(value => value.name).sort(), adminCollections.map(value => value.name).sort());
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qdrant-live-denied-'));
try {
  const wrongKey = path.join(temporary, 'invalid-key'); fs.writeFileSync(wrongKey, 'invalid-proof-key-'.repeat(4), { mode: 0o600 });
  await assert.rejects(() => qdrantClient({ ...options, keyFile: wrongKey }).json('/collections'), /QDRANT_HTTP_40[13]/);
  const status = await new Promise((resolve, reject) => {
    https.get(new URL('/collections', url), { ca: fs.readFileSync(caFile), rejectUnauthorized: true,
      signal: AbortSignal.timeout(15000) }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.ok([401, 403].includes(status), 'Unauthenticated reads must be denied');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
process.stdout.write(JSON.stringify({ ok: true, checks: ['TLS-trust', 'admin-read', 'reader-read', 'wrong-key-denied', 'missing-key-denied'],
  excluded: ['cross-pod-network-denial', 'restore', 'rotation'] }) + '\n');
