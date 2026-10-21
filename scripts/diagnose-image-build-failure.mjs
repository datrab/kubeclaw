// CI-only diagnostic: read the completed build record, never rebuild or retry.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = process.env.RUNNER_TEMP;
if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('RUNNER_TEMP_REQUIRED');
const file = path.join(directory, 'role-image-build.log');
const output = fs.openSync(file, 'w', 0o600);
let result;
try {
  result = spawnSync('docker', ['buildx', 'history', 'logs', '--progress', 'plain'], {
    stdio: ['ignore', output, output],
  });
} finally { fs.closeSync(output); }

// GitHub's public check annotation remains useful when the binary .dockerbuild
// artifact cannot be downloaded. Keep the full log locally and bound only the
// annotation, escaping workflow-command delimiters rather than altering logs.
// Percent/CR/LF escaping can triple the wire size; reserve room for that too.
const maximumBytes = 12_000;
const input = fs.openSync(file, 'r');
let tail;
try {
  const size = fs.fstatSync(input).size;
  const bytes = Buffer.alloc(Math.min(size, maximumBytes));
  fs.readSync(input, bytes, 0, bytes.length, Math.max(0, size - bytes.length));
  tail = bytes.toString('utf8');
} finally { fs.closeSync(input); }
const status = result.status ?? 1;
const message = `Build record log retrieval exit: ${status}\n${result.error?.message ?? ''}\n${tail}`;
const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
process.stdout.write(`::error title=Original image build output::${escaped}\n`);
process.exitCode = status;
