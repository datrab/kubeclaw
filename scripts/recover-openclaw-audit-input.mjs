import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const relative = 'logs/config-audit.jsonl.migrated.raw';
function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1) throw new Error(`REGULAR_UNLINKED_FILE_REQUIRED:${file}`);
  return stat;
}
function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

// Offline operator recovery, not a startup bypass. The caller must stop all
// writers first. OpenClaw doctor still owns import, sanitization and checkpointing.
export function recoverAuditInput({ stateDir, rawSha256, sanitizedSha256, apply = false }) {
  if (![rawSha256, sanitizedSha256].every(value => /^[a-f0-9]{64}$/.test(value ?? ''))) {
    throw new Error('REVIEWED_ARCHIVE_HASHES_REQUIRED');
  }
  const root = path.resolve(stateDir);
  for (const directory of [root, path.join(root, 'logs'), path.join(root, 'state')]) {
    if (!fs.lstatSync(directory).isDirectory() || fs.realpathSync(directory) !== directory) {
      throw new Error('REAL_STATE_DIRECTORY_REQUIRED');
    }
  }
  const rawPath = path.join(root, relative), sanitizedPath = rawPath.slice(0, -4);
  const rawStat = regular(rawPath); regular(sanitizedPath);
  if (fs.existsSync(`${rawPath}.doctor-scrub-restore`)) throw new Error('EXISTING_DOCTOR_RECOVERY_JOURNAL');
  const raw = fs.readFileSync(rawPath), sanitized = fs.readFileSync(sanitizedPath);
  if (digest(raw) !== rawSha256 || digest(sanitized) !== sanitizedSha256) throw new Error('ARCHIVE_HASH_MISMATCH');
  if (!raw.length || !raw.every(byte => byte === 32 || byte === 9)) throw new Error('FULLY_SCRUBBED_RAW_REQUIRED');
  const records = new TextDecoder('utf-8', { fatal: true }).decode(sanitized)
    .split(/\r?\n/u).filter(line => line.trim()).map(line => JSON.parse(line));
  if (!records.length || records.some(record => !record || typeof record !== 'object' || Array.isArray(record))) {
    throw new Error('VALID_SANITIZED_RECORDS_REQUIRED');
  }
  const databasePath = path.join(root, 'state/openclaw.sqlite'); regular(databasePath);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const checkpoints = database.prepare('SELECT payload_json FROM diagnostic_events WHERE scope = ?')
      .all('migration.legacy-audit-raw');
    const generationKey = digest(relative).slice(0, 16);
    if (checkpoints.some(row => JSON.parse(row.payload_json).generationKey === generationKey)) {
      throw new Error('EXISTING_CHECKPOINT_REQUIRES_DOCTOR_RECOVERY');
    }
  } finally { database.close(); }
  const result = { records: records.length, rawSha256, sanitizedSha256, applied: false };
  if (!apply) return result;

  // Preserve the exact original, including the scrub pattern. A prior interrupted
  // attempt may have already created this backup; never overwrite different bytes.
  const backup = `${rawPath}.recovery-${rawSha256}`;
  try { fs.copyFileSync(rawPath, backup, fs.constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  regular(backup);
  if (digest(fs.readFileSync(backup)) !== rawSha256) throw new Error('RECOVERY_BACKUP_MISMATCH');
  fs.chmodSync(backup, 0o600);
  const backupFd = fs.openSync(backup, 'r');
  try { fs.fsyncSync(backupFd); } finally { fs.closeSync(backupFd); }
  syncDirectory(path.dirname(rawPath));

  const temporary = `${rawPath}.recovering`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, sanitized);
    fs.fchownSync(fd, rawStat.uid, rawStat.gid);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  const current = regular(rawPath);
  if (current.dev !== rawStat.dev || current.ino !== rawStat.ino
      || digest(fs.readFileSync(rawPath)) !== rawSha256
      || digest(fs.readFileSync(sanitizedPath)) !== sanitizedSha256) throw new Error('ARCHIVE_CHANGED_DURING_RECOVERY');
  fs.renameSync(temporary, rawPath);
  syncDirectory(path.dirname(rawPath));
  return { ...result, applied: true, backup };
}

if (process.argv[1] === '-' || (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)) {
  const [stateDir, rawSha256, sanitizedSha256, mode] = process.argv.slice(2);
  if (!stateDir || (mode !== undefined && mode !== '--apply')) throw new Error('Usage: node recover-openclaw-audit-input.mjs STATE_DIR RAW_SHA256 SANITIZED_SHA256 [--apply]');
  console.log(JSON.stringify(recoverAuditInput({ stateDir, rawSha256, sanitizedSha256, apply: mode === '--apply' })));
}
