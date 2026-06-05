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
    const forgePromptMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/prompts/forge.ts');
    const busterPromptMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/prompts/buster-module.ts');
    const gateFixPromptMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/prompts/gate-fix.ts');
    const reviewPromptMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/prompts/review.ts');
    const promptSharedMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/prompts/shared.ts');
    const pollingMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/polling.ts');
    const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.ts');
    const failuresMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/failures/classification.ts');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-lifecycle-surface-'));
    const projectRoot = path.join(repoRoot, 'Projects', 'behavior-lifecycle-surface', 'src');
    const swarmRoot = path.join(projectRoot, '.swarm');
    const modulesRoot = path.join(swarmRoot, 'modules');
    const moduleDir = path.join(modulesRoot, '01');

    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'index.js'), 'export const ok = true;\n');
    fs.writeFileSync(path.join(moduleDir, 'FORGE.md'), '# Forge\nImplement the module.\n');
    fs.writeFileSync(path.join(moduleDir, 'BUSTER.md'), '# Buster\nRun smoke checks.\n');

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
    for (const line of promptSharedMod.buildForgeCompletionArtifactContract(config, '01')) {
      assert(forgePromptResult.prompt.includes(line), `forge prompt should include shared typed artifact contract: ${line}`);
    }
    assert(forgePromptResult.prompt.includes('Forge completion artifact'));
    assert(forgePromptResult.prompt.includes('raw, directly parseable JSON'));
    assert(forgePromptResult.prompt.includes('"artifact_type": "forge_completion"'));
    assert(forgePromptResult.prompt.includes('`status` must be exactly `READY_FOR_TESTING` when the implementation is ready for Buster, or `BLOCKED` only when implementation cannot be completed.'));
    assert(forgePromptResult.prompt.includes('Do not wrap it in Markdown'));
    assert(forgePromptResult.prompt.includes('After the completion artifact is written, stop.'));
    assert.equal(forgePromptResult.prompt.includes('COMPLETION_STATUS'), false);
    assert.equal(forgePromptResult.prompt.includes('node - <<'), false);
    assert.equal(forgePromptResult.prompt.includes('status.json'), false);
    assert.equal(forgePromptResult.prompt.includes('Nova owns the READY_FOR_TESTING lifecycle transition'), false);
    assert.equal(forgePromptResult.prompt.includes('canonical READY_FOR_TESTING lifecycle shape'), false);
    assert.equal(forgePromptResult.prompt.includes('tmp_status'), false);
    assert.equal(forgePromptResult.prompt.includes('mv "$tmp_status"'), false);
    assert.equal(forgePromptResult.prompt.includes('.current_phase = "forge"'), false);
    for (const forbiddenGitCommand of ['git add', 'git commit', 'git push']) {
      assert.equal(forgePromptResult.prompt.includes(forbiddenGitCommand), false, `forge prompt must not include ${forbiddenGitCommand}`);
    }

    const gateFixPromptResult = gateFixPromptMod.buildGateFixPrompt(
      config,
      { title: 'Gate fix', type: 'buster' },
      [{ title: 'Broken route', description: 'Fix broken route', recommended_fix: 'Update the handler' }],
      1,
      2,
    );
    const gateFixPrompt = gateFixPromptResult.prompt || String(gateFixPromptResult);
    const reviewFixPromptResult = reviewPromptMod.buildReviewFixPrompt(
      config,
      { title: 'Review fix', type: 'review' },
      [{ description: 'Fix review finding', recommended_fix: 'Update the component' }],
      1,
      2,
    );
    const reviewFixPrompt = reviewFixPromptResult.prompt || String(reviewFixPromptResult);
    assert(gateFixPrompt.includes('Allowed action contract:'));
    assert(reviewFixPrompt.includes('Allowed action contract:'));
    assert(gateFixPrompt.includes('Do not write status files, completion files, gate output files, or Redis completion signals.'));
    assert(reviewFixPrompt.includes('Do not write status files, completion files, gate output files, or Redis completion signals.'));
    assert(gateFixPrompt.includes('After fixing all issues above, stop.'));
    assert(reviewFixPrompt.includes('After fixing all issues above, stop.'));
    for (const promptText of [gateFixPrompt, reviewFixPrompt]) {
      for (const forbiddenGitCommand of ['git add', 'git commit', 'git push']) {
        assert.equal(promptText.includes(forbiddenGitCommand), false, `fix prompt must not include ${forbiddenGitCommand}`);
      }
    }

    fs.writeFileSync(path.join(moduleDir, 'forge-completion.json'), JSON.stringify({
      artifact_type: 'forge_completion',
      status: 'READY_FOR_TESTING',
      summary: 'implementation complete',
      completed_at: '2026-04-12T16:00:00Z',
    }, null, 2));
    const forgeCompletionPoll = await pollingMod.pollForgeCompletion({
      ...config,
      agent_observability_forge_completion_settle_ms: 0,
    }, '01', 1, {
      moduleId: '01',
      agentEndedReader: {
        async read() {
          return {
            type: 'agent.ended',
            agent_type: 'forge',
            agent_scope: 'agent',
            module_id: '01',
            session_key: 'agent:forge:01',
            ended_at: '2026-04-12T16:00:00Z',
          };
        },
        close() {},
      },
      diffEvidence: {
        paths: ['src/index.js'],
        ignored_paths: ['01/forge-completion.json', '.swarm/logs/pipeline/latest.json'],
        hasMeaningfulChanges: true,
      },
    });
    assert.equal(forgeCompletionPoll.ok, true);
    assert.equal(forgeCompletionPoll.reason, 'agent_ended_meaningful_diff');
    assert.equal(forgeCompletionPoll.status.status, 'READY_FOR_TESTING');

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
    for (const line of promptSharedMod.buildBusterResultArtifactContract(config, '01')) {
      assert(busterPromptResult.prompt.includes(line), `buster prompt should include shared typed result contract: ${line}`);
    }
    assert(busterPromptResult.prompt.includes('raw, directly parseable JSON'));
    assert(busterPromptResult.prompt.includes('"artifact_type": "buster_output"'));
    assert(busterPromptResult.prompt.includes('`status` must be exactly `PASS` if all tests pass, or `FAIL` if any test fails.'));
    assert.equal(busterPromptResult.prompt.includes('RESULT_STATUS'), false);
    assert.equal(busterPromptResult.prompt.includes('OUTPUT_FILE='), false);
    assert.equal(busterPromptResult.prompt.includes('node - <<'), false);
    assert(busterPromptResult.prompt.includes('/app/skills/buster/CONVENTIONS.md'));
    assert(busterPromptResult.prompt.includes('After output_file is saved, stop. Do **not** call Redis completion tools.'));
    assert(busterPromptResult.prompt.includes('Buster Pipeline reads output_file, runs verify-task.ts to push scoped artifacts, and then emits the canonical completion signal.'));
    assert(busterPromptResult.prompt.includes('Do **not** edit pipeline lifecycle or orchestrator-owned control artifacts directly.'));
    assert.equal(busterPromptResult.prompt.includes('tmp_status'), false);
    assert.equal(busterPromptResult.prompt.includes('mv "$tmp_status"'), false);
    assert.equal(busterPromptResult.prompt.includes('--run-id run-123'), false);
    assert.equal(busterPromptResult.prompt.includes('--attempt 2'), false);
    assert.equal(busterPromptResult.prompt.includes('--dispatch-id dispatch-123'), false);
    assert.equal(busterPromptResult.prompt.includes('increment `"fail_count"`'), false);
    assert.equal(busterPromptResult.prompt.includes('add a `"fail_summaries"` entry'), false);

    assert.equal(Object.prototype.hasOwnProperty.call(statusStoreMod, 'addHistory'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'addHistory'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(promptSharedMod, 'buildForgeReadyForTestingLifecycleJq'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(promptSharedMod, 'buildBusterTerminalLifecycleJq'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(promptSharedMod, 'buildForgeReadyForTestingLifecycleCommand'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(promptSharedMod, 'buildBusterTerminalLifecycleCommand'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(promptSharedMod, 'buildForgeCompletionArtifactCommand'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(promptSharedMod, 'buildBusterResultArtifactCommand'), false);

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
