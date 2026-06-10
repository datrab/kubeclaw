import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('sendDiscord rejects file attachments instead of silently dropping them', async () => {
  const { sendDiscord } = await import('../../../../../skills/buster/pipeline/services/discord.ts');

  assert.throws(
    () => sendDiscord({ files: [{ name: 'evidence.txt', data: 'details' }] }, {
      disableDiscordWebhooks: true,
    }),
    /Discord file attachments are not supported/
  );
});

test('failed Discord audit target does not prevent later target write', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-discord-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const badDir = path.join(dir, 'diagnostic');
  const runId = `run-${process.pid}`;
  const runLogPath = path.join(dir, 'runs', runId, 'pipeline.jsonl');
  const badTarget = path.join(badDir, 'discord.jsonl');
  const runTarget = path.join(path.dirname(runLogPath), 'discord.jsonl');
  const originalAppendFileSync = fs.appendFileSync;
  const originalStderrWrite = process.stderr.write;
  const stderrWrites = [];

  fs.appendFileSync = (filePath, data, options) => {
    if (path.resolve(String(filePath)) === path.resolve(badTarget)) {
      throw Object.assign(new Error('simulated append failure'), { code: 'EACCES' });
    }
    return originalAppendFileSync.call(fs, filePath, data, options);
  };
  process.stderr.write = (chunk, encoding, callback) => {
    stderrWrites.push(String(chunk));
    if (typeof encoding === 'function') encoding();
    if (typeof callback === 'function') callback();
    return true;
  };

  try {
    const { sendDiscord } = await import('../../../../../skills/buster/pipeline/services/discord.ts');
    sendDiscord({ content: 'hello audit' }, {
      project: 'project-a',
      run_id: runId,
      log_dir: badDir,
      pipeline_run_log_path: runLogPath,
      disableDiscordWebhooks: true,
    });
  } finally {
    fs.appendFileSync = originalAppendFileSync;
    process.stderr.write = originalStderrWrite;
  }

  const [entry] = readJsonl(runTarget);
  assert.equal(entry.run_id, runId);
  assert.equal(entry.payload.content, 'hello audit');
  assert.equal(fs.existsSync(badTarget), false);

  const reports = stderrWrites.filter((line) => line.includes('Buster Discord artifact write failed'));
  assert.equal(reports.length, 1);
  assert.match(reports[0], /diagnostic\/discord\.jsonl: EACCES/);
});
