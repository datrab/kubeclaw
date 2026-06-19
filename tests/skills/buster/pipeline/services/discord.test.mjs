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

test('sendDiscord derives readable actionability from notification fields', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-discord-actionability-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const { sendDiscord } = await import('../../../../../skills/buster/pipeline/services/discord.ts');
  const runId = `run-${process.pid}-actionability`;
  const runLogPath = path.join(dir, 'runs', runId, 'pipeline.jsonl');
  const payload = sendDiscord({
    embeds: [{
      title: '🚫 Suite Results: FAIL — 01-foundation',
      fields: [
        { name: 'Status', value: 'FAIL', inline: true },
        { name: 'Summary', value: 'unit failed', inline: false },
        { name: 'Issue', value: 'unit: expected button text was missing', inline: false },
        { name: 'Model', value: 'openai-codex/gpt-5.4', inline: true },
      ],
    }],
  }, {
    project: 'project-a',
    module_id: '01-foundation',
    run_id: runId,
    pipeline_run_log_path: runLogPath,
    disableDiscordWebhooks: true,
  });

  const embed = payload.embeds[0];
  const fieldByName = Object.fromEntries(embed.fields.map((field) => [field.name, field.value]));
  assert.equal(embed.title, '🚫 Suite Results: FAIL — 01-foundation');
  assert.equal(fieldByName.Status, 'FAIL');
  assert.equal(fieldByName.Model, 'openai/gpt-5.4');
  assert.match(fieldByName.Impact, /unit failed/);
  assert.match(fieldByName.Action, /Fix the listed failed suite/);
  assert.match(fieldByName.Evidence, /Issue: unit: expected button text was missing/);
  assert.doesNotMatch(fieldByName.Action, /latest\.json/);
  assert.doesNotMatch(fieldByName.Evidence, /discord\.jsonl/);

  const [entry] = readJsonl(path.join(path.dirname(runLogPath), 'discord.jsonl'));
  assert.equal(entry.actionability.impact, fieldByName.Impact);
  assert.equal(entry.actionability.action, fieldByName.Action);
  assert.equal(entry.actionability.evidence, fieldByName.Evidence);
});
