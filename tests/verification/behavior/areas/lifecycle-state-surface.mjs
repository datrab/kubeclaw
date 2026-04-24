export async function registerLifecycleStateSurfaceArea({
  record,
  fs,
  os,
  path,
  assert,
  importRuntimeModule,
  runtimeRoot,
  pipelineIndexMod,
  lifecycleStateMod,
}) {
  await record('lifecycle-state prompt and helper surfaces stay behavior-led on critical paths', async () => {
    const forgePromptMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/prompts/forge.js');
    const busterPromptMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/prompts/buster-module.js');
    const promptSharedMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/prompts/shared.js');
    const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.js');
    const failuresMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/failures.js');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-lifecycle-surface-'));
    const projectRoot = path.join(repoRoot, 'Projects', 'behavior-lifecycle-surface', 'src');
    const swarmRoot = path.join(projectRoot, '.swarm');
    const modulesRoot = path.join(swarmRoot, 'modules');
    const moduleDir = path.join(modulesRoot, '01');

    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'index.js'), 'export const ok = true;\n');
    fs.writeFileSync(path.join(moduleDir, 'FORGE.md'), '# Forge\nImplement the module.\n');
    fs.writeFileSync(path.join(moduleDir, 'BUSTER.md'), '# Buster\nRun smoke checks.\n');
    fs.writeFileSync(path.join(moduleDir, 'status.json'), JSON.stringify({ status: 'FAIL' }, null, 2));

    const config = {
      project: 'behavior-lifecycle-surface',
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmRoot,
        modules_dir: modulesRoot,
      },
      agents: {
        forge: { cwd: repoRoot },
      },
    };

    const forgeStatus = {
      status: 'FAIL',
      fail_count: 1,
      fail_summaries: [{ phase: 'buster', summary: 'Previous suite failed' }],
      history: [],
    };
    const forgePromptResult = await forgePromptMod.buildForgePrompt(
      config,
      '01',
      { title: 'Scaffold', stages: ['forge', 'buster'] },
      '01',
      forgeStatus,
      3,
      null,
    );
    assert.equal(typeof forgePromptResult.prompt, 'string');
    assert.equal(forgePromptResult.metadata.phase, 'forge');
    for (const line of promptSharedMod.buildForgeReadyForTestingLifecycleCommand(config, '01')) {
      assert(forgePromptResult.prompt.includes(line), `forge prompt should include shared lifecycle command: ${line}`);
    }
    assert(forgePromptResult.prompt.includes('canonical READY_FOR_TESTING lifecycle shape'));
    assert.equal(forgePromptResult.prompt.includes('.current_phase = "forge"'), false);

    const busterPromptResult = busterPromptMod.buildBusterModulePrompt(
      config,
      '01',
      { title: 'Scaffold', stages: ['forge', 'buster'] },
      '01',
      {
        status: 'READY_FOR_TESTING',
        fail_count: 1,
        forge_commit_hash: '1234567890abcdef',
        forge_diff_stat: 'src/index.js | 2 ++',
      },
      3,
      { runId: 'run-123', attempt: 2, dispatchId: 'dispatch-123' },
    );
    assert.equal(typeof busterPromptResult.prompt, 'string');
    assert.equal(busterPromptResult.metadata.phase, 'buster');
    assert.equal(busterPromptResult.metadata.stageId, 'worker:module_buster');
    assert.equal(busterPromptResult.metadata.workerType, 'module_buster');
    for (const line of promptSharedMod.buildBusterTerminalLifecycleCommand(config, '01')) {
      assert(busterPromptResult.prompt.includes(line), `buster prompt should include shared lifecycle command: ${line}`);
    }
    assert(busterPromptResult.prompt.includes('/app/skills/buster/CONVENTIONS.md'));
    assert(busterPromptResult.prompt.includes('--run-id run-123'));
    assert(busterPromptResult.prompt.includes('--attempt 2'));
    assert(busterPromptResult.prompt.includes('--dispatch-id dispatch-123'));
    assert.equal(busterPromptResult.prompt.includes('increment `"fail_count"`'), false);
    assert.equal(busterPromptResult.prompt.includes('add a `"fail_summaries"` entry'), false);

    assert.equal(Object.prototype.hasOwnProperty.call(statusStoreMod, 'addHistory'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'addHistory'), false);

    const activeBusterStatus = {
      status: 'FAIL',
      completion_summary: 'old failure',
      completed_at: '2026-04-12T15:55:00.000Z',
      history: [],
    };
    lifecycleStateMod.startModulePhase(activeBusterStatus, 'buster', 'Buster restarted', {
      now: '2026-04-12T16:00:00.000Z',
      clearCompletionSummary: true,
    });
    assert.equal(activeBusterStatus.status, 'TESTING');
    assert.equal(activeBusterStatus.current_phase, 'buster');
    assert.equal(activeBusterStatus.completion_summary, null);
    assert.equal(activeBusterStatus.completed_at, null);

    const readyForTestingRetryStatus = {
      status: 'FAIL',
      completion_summary: 'old buster summary',
      history: [],
    };
    lifecycleStateMod.transitionModuleStatus(readyForTestingRetryStatus, 'READY_FOR_TESTING', {
      note: 'Retrying buster',
      now: '2026-04-12T16:01:00.000Z',
    });
    assert.equal(readyForTestingRetryStatus.status, 'READY_FOR_TESTING');
    assert.equal(readyForTestingRetryStatus.completion_summary, null);

    const activeForgeStatus = {
      status: 'FAIL',
      completion_summary: 'old buster summary',
      history: [],
    };
    lifecycleStateMod.startModulePhase(activeForgeStatus, 'forge', 'Forge restarted', {
      now: '2026-04-12T16:02:00.000Z',
    });
    assert.equal(activeForgeStatus.status, 'IN_PROGRESS');
    assert.equal(activeForgeStatus.current_phase, 'forge');
    assert.equal(activeForgeStatus.completion_summary, null);

    const trustedRedisTerminalStatus = {
      status: 'TESTING',
      current_phase: 'buster',
      completion_summary: null,
      history: [],
    };
    lifecycleStateMod.transitionModuleStatus(trustedRedisTerminalStatus, 'FAIL', {
      note: 'Trusted terminal status from Redis completion (redis)',
      now: '2026-04-12T16:03:00.000Z',
      completionSummary: 'Redis-owned failure summary',
    });
    assert.equal(trustedRedisTerminalStatus.status, 'FAIL');
    assert.equal(trustedRedisTerminalStatus.current_phase, null);
    assert.equal(trustedRedisTerminalStatus.completion_summary, 'Redis-owned failure summary');

    const normalizedRetryStatus = lifecycleStateMod.normalizeLifecycleStatus({
      status: 'IN_PROGRESS',
      completed_at: '2026-04-09T20:12:00.000Z',
      completion_summary: 'stale summary',
    });
    assert.equal(normalizedRetryStatus.completed_at, null);
    assert.equal(normalizedRetryStatus.completion_summary, null);

    assert.equal(
      failuresMod.extractAgentFailReason({
        history: [
          { agent: 'buster', note: 'Old buster failure' },
          { agent: 'pipeline', note: 'Retrying forge' },
        ],
        completion_summary: null,
      }, 'forge'),
      'forge reported FAIL (no details from agent)',
    );
  });
}
