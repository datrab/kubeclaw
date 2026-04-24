import { pathToFileURL } from 'url';

function listFiles(fs, path, root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fs, path, fullPath));
    else files.push(fullPath);
  }
  return files;
}

function assertNoLeaks({ assert, fs, path, root, secrets }) {
  const files = listFiles(fs, path, root);
  assert(files.length > 0, `expected generated artifacts under ${root}`);
  const contents = files.map((filePath) => ({ filePath, text: fs.readFileSync(filePath, 'utf8') }));
  for (const secret of secrets) {
    const leaked = contents.find(({ text }) => text.includes(secret));
    assert.equal(leaked, undefined, `secret leaked into ${leaked?.filePath || root}`);
  }
  return { files, contents };
}

export async function registerRedactionSurfaceArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  xaddEvents,
  flushAsync,
  fs,
  os,
  path,
  assert,
  materializeRuntimeTree,
  importRuntimeModule,
}) {
  await record('seeded secrets are redacted across Nova pipeline logs, Discord audit logs, and module or gate artifacts', async () => {
    const { runtimeRoot: redactionRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(redactionRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const telemetryMod = await importRuntimeModule(redactionRuntimeRoot, '/app/skills/pipeline/services/telemetry.js');
    const discordRuntimeMod = await importRuntimeModule(redactionRuntimeRoot, '/app/skills/pipeline/integrations/discord.js');
    const statusStoreMod = await importRuntimeModule(redactionRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
    const runtimeCoreMod = await importRuntimeModule(redactionRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const redactionMod = await import(`${pathToFileURL(path.join(sourceRoot, 'skills', 'common', 'pipeline', 'redaction.js')).href}?fresh=${Date.now()}-${Math.random()}`);

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redaction-nova-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-redaction-nova-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });

    const rawSecrets = {
      openai: 'sk-live-BehaviorSecretToken1234567890',
      github: 'github_pat_BehaviorSecretToken123456789012345',
      bearer: 'Bearer BehaviorOpaqueSecretToken1234567890',
      password: 'BehaviorPassword123!',
      token: 'BehaviorToken1234567890',
    };
    const secrets = Object.values(rawSecrets);

    const config = {
      project: 'behavior-redaction-nova',
      repo_root: repoRoot,
      telemetry: { enabled: true },
      _logDir: logRoot,
      _runLogDir: runLogDir,
      _runId: runId,
      run_id: runId,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
      discord_alerts: { warn: true, info: true },
      _runStats: runtimeCoreMod.createRunStats('2026-04-17T00:00:00.000Z'),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
    };

    await telemetryMod.emitEvent({ config }, 'observability.degraded', {
      detail: `stderr saw ${rawSecrets.bearer}`,
      stdout: `tool stdout token=${rawSecrets.token}`,
      error: `password=${rawSecrets.password}`,
      authorization: rawSecrets.bearer,
      payload: {
        prompt: `use ${rawSecrets.openai}`,
        nested: { token: rawSecrets.token },
      },
      transcript: [
        { text: `assistant output ${rawSecrets.github}` },
      ],
      module_id: '01',
      gate_id: 'review',
    });
    await flushAsync();

    await discordRuntimeMod.discord(config, 'WARN', 'Secret redaction audit', `tool stderr ${rawSecrets.bearer}`, [
      { name: 'Module', value: '01' },
      { name: 'Authorization', value: rawSecrets.bearer },
      { name: 'stdout', value: `captured stdout ${rawSecrets.openai}` },
      { name: 'payload', value: { prompt: `payload ${rawSecrets.github}`, token: rawSecrets.token } },
    ]);

    statusStoreMod.savePrompt(config, '01', 'forge', 1, `Use api_key=${rawSecrets.token}\n${rawSecrets.openai}\n${rawSecrets.bearer}`);
    const rawTranscriptPath = path.join(repoRoot, 'raw-stream.jsonl');
    fs.writeFileSync(rawTranscriptPath, [
      JSON.stringify({ ts: '2026-04-17T00:00:00.000Z', kind: 'assistant', text: `stdout ${rawSecrets.github}` }),
      JSON.stringify({ ts: '2026-04-17T00:00:01.000Z', kind: 'tool', data: { text: `stderr password=${rawSecrets.password}` } }),
    ].join('\n') + '\n');
    statusStoreMod.saveStreamLog(config, '01', 'forge', 1, rawTranscriptPath);

    const gateLogDir = path.join(logRoot, 'gates', 'review');
    fs.mkdirSync(gateLogDir, { recursive: true });
    redactionMod.writeRedactedPromptArtifact(
      path.join(gateLogDir, 'echo-prompt-attempt-1.md'),
      `token=${rawSecrets.token}\n${rawSecrets.bearer}`,
      { gate_id: 'review', attempt: 1, agent_type: 'echo' },
    );
    redactionMod.copyRedactedTranscriptArtifact(rawTranscriptPath, path.join(gateLogDir, 'echo-transcript-attempt-1.jsonl'));

    const expectedPaths = [
      path.join(logRoot, 'pipeline', 'pipeline.jsonl'),
      path.join(runLogDir, 'pipeline.jsonl'),
      path.join(logRoot, 'pipeline', 'discord.jsonl'),
      path.join(runLogDir, 'discord.jsonl'),
      path.join(logRoot, 'modules', '01', 'forge-prompt-attempt-1.md'),
      path.join(logRoot, 'modules', '01', 'forge-transcript-attempt-1.jsonl'),
      path.join(gateLogDir, 'echo-prompt-attempt-1.md'),
      path.join(gateLogDir, 'echo-transcript-attempt-1.jsonl'),
    ];
    for (const filePath of expectedPaths) assert.equal(fs.existsSync(filePath), true, `missing expected artifact ${filePath}`);

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(streamEvents.length, 1);
    assert.equal(streamEvents[0].authorization, '[redacted-secret]');
    assert.equal(typeof streamEvents[0].payload?.sha256, 'string');
    assert.equal(streamEvents[0].stdout.includes(rawSecrets.token), false);

    const modulePromptText = fs.readFileSync(path.join(logRoot, 'modules', '01', 'forge-prompt-attempt-1.md'), 'utf8');
    assert.equal(modulePromptText.includes('_Prompt content omitted by default for secret hygiene._'), true);
    const moduleTranscriptLines = fs.readFileSync(path.join(logRoot, 'modules', '01', 'forge-transcript-attempt-1.jsonl'), 'utf8').trim().split('\n');
    assert.equal(JSON.parse(moduleTranscriptLines[0]).type, 'transcript.summary');

    const { files, contents } = assertNoLeaks({ assert, fs, path, root: logRoot, secrets });
    assert.equal(files.some((filePath) => filePath.endsWith(path.join('pipeline', 'pipeline.jsonl'))), true);
    assert.equal(contents.some(({ text }) => text.includes('[redacted-secret]')), true);
    assert.equal(contents.some(({ text }) => text.includes('[redacted prompt;') || text.includes('[redacted payload;') || text.includes('transcript.summary')), true);
  });

  await record('seeded secrets are redacted across Buster telemetry mirrors and Discord audit artifacts', async () => {
    const { runtimeRoot: sandboxRedactionRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    installFakeRedis(sandboxRedactionRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const busterTelemetryMod = await importRuntimeModule(sandboxRedactionRoot, '/app/skills/pipeline/services/telemetry.js');
    const busterDiscordMod = await importRuntimeModule(sandboxRedactionRoot, '/app/skills/pipeline/services/discord.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redaction-buster-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs');
    const moduleLogDir = path.join(logRoot, 'modules', '07');
    const runId = 'run-redaction-buster-1';
    const pipelineLogPath = path.join(logRoot, 'pipeline', 'pipeline.jsonl');
    const pipelineRunLogPath = path.join(logRoot, 'pipeline', 'runs', runId, 'pipeline.jsonl');

    const rawSecrets = {
      openai: 'sk-live-BusterSecretToken1234567890',
      github: 'github_pat_BusterSecretToken123456789012345',
      bearer: 'Bearer BusterOpaqueSecretToken1234567890',
      token: 'BusterToken1234567890',
      cookie: 'BusterCookie1234567890',
    };
    const secrets = Object.values(rawSecrets);

    const tctx = busterTelemetryMod.createTelemetryContext({
      project: 'behavior-redaction-buster',
      module: '07',
      runId,
      enabled: true,
      logDir: moduleLogDir,
      pipelineLogPath,
      pipelineRunLogPath,
      attempt: 2,
      dispatchId: 'dispatch-buster-07-2',
      sessionKey: 'agent:main:acp:buster-07-2',
    });

    await busterTelemetryMod.emitEvent(tctx, 'buster.task_completed', {
      module_id: '07',
      outcome: 'FAIL',
      stdout: `pytest stdout ${rawSecrets.openai}`,
      stderr: `cookie=${rawSecrets.cookie}`,
      authorization: rawSecrets.bearer,
      payload: {
        prompt: `payload ${rawSecrets.github}`,
        token: rawSecrets.token,
      },
    });
    await flushAsync();

    const discordPayload = busterDiscordMod.sendDiscord({
      title: 'Buster secret redaction audit',
      description: `captured stderr ${rawSecrets.bearer}`,
      fields: [
        { name: 'payload', value: { prompt: `payload ${rawSecrets.github}`, token: rawSecrets.token } },
        { name: 'stdout', value: `captured stdout ${rawSecrets.openai}` },
      ],
    }, {
      project: 'behavior-redaction-buster',
      moduleId: '07',
      runId,
      attempt: 2,
      dispatchId: 'dispatch-buster-07-2',
      sessionKey: 'agent:main:acp:buster-07-2',
      logDir: moduleLogDir,
      disable_discord_webhooks: true,
      webhookUrl: 'https://example.invalid/webhook',
    });
    await busterTelemetryMod.closeTelemetry(tctx);

    assert.equal(discordPayload.embeds[0].description.includes(rawSecrets.bearer), false);
    assert.equal(discordPayload.embeds[0].fields[0].value.includes(rawSecrets.github), false);

    const streamEvents = xaddEvents(`pipeline:telemetry:behavior-redaction-buster:${runId}`);
    assert.equal(streamEvents.length, 1);
    assert.equal(streamEvents[0].authorization, '[redacted-secret]');
    assert.equal(streamEvents[0].stderr.includes(rawSecrets.cookie), false);

    const expectedPaths = [
      pipelineLogPath,
      pipelineRunLogPath,
      path.join(moduleLogDir, 'discord.jsonl'),
    ];
    for (const filePath of expectedPaths) assert.equal(fs.existsSync(filePath), true, `missing expected artifact ${filePath}`);

    const { contents } = assertNoLeaks({ assert, fs, path, root: logRoot, secrets });
    assert.equal(contents.some(({ text }) => text.includes('[redacted-secret]')), true);
    assert.equal(contents.some(({ text }) => text.includes('"redacted":true') || text.includes('"json_bytes"') || text.includes('```json')), true);
  });
}
