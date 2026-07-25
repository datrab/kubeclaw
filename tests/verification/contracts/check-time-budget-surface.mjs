import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-time-budget-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';


const { sourceRoot } = parseSourceRootArgs();
const timingPath = path.join(sourceRoot, 'skills/common/pipeline/timing.ts');
const novaShimPath = path.join(sourceRoot, 'skills/nova/pipeline/timing.ts');
const pollingPath = path.join(sourceRoot, 'skills/nova/pipeline/services/polling.ts');
const sessionPollPath = path.join(sourceRoot, 'skills/nova/pipeline/services/polling-session-end.ts');
const rateLimitPath = path.join(sourceRoot, 'skills/nova/pipeline/services/rate-limit.ts');
const eventContractPath = path.join(sourceRoot, 'skills/common/pipeline/services/pipeline-event-contract.ts');
const commonGatewayPath = path.join(sourceRoot, 'skills/common/pipeline/integrations/gateway.ts');
const commonLifecyclePath = path.join(sourceRoot, 'skills/common/pipeline/agents/lifecycle.ts');
const commonGitWorktreePath = path.join(sourceRoot, 'skills/common/pipeline/integrations/git-worktree.ts');
const moduleRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner.ts');
const novaGitWorktreePath = path.join(sourceRoot, 'skills/nova/pipeline/integrations/git-worktree.ts');
const busterGitWorkflowsPath = path.join(sourceRoot, 'skills/buster/pipeline/services/git-workflows.ts');

const timingSource = fs.readFileSync(timingPath, 'utf8');
const shimSource = fs.readFileSync(novaShimPath, 'utf8');
const pollingSource = fs.readFileSync(pollingPath, 'utf8');
const sessionPollSource = fs.readFileSync(sessionPollPath, 'utf8');
const rateLimitSource = fs.readFileSync(rateLimitPath, 'utf8');
const eventContractSource = fs.readFileSync(eventContractPath, 'utf8');
const commonGatewaySource = fs.readFileSync(commonGatewayPath, 'utf8');
const commonLifecycleSource = fs.readFileSync(commonLifecyclePath, 'utf8');
const commonGitWorktreeSource = fs.readFileSync(commonGitWorktreePath, 'utf8');
const moduleRunnerSource = fs.readFileSync(moduleRunnerPath, 'utf8');
const novaGitWorktreeSource = fs.readFileSync(novaGitWorktreePath, 'utf8');
const busterGitWorkflowsSource = fs.readFileSync(busterGitWorkflowsPath, 'utf8');

for (const marker of [
  'export class BudgetExhaustedError extends Error',
  'export function createBudget(',
  'extendForRateLimit(cooldownMs',
  'throwIfExhausted(reason',
  'export function sleep(ms: number',
]) {
  assert.equal(timingSource.includes(marker), true, `timing primitive must expose ${marker}`);
}

assert.equal(shimSource.includes("export * from '../../common/pipeline/timing.ts';"), true, 'Nova timing shim must re-export common timing authority');
assert.equal(pollingSource.includes('createBudgetFromMinutes'), true, 'pollGeneric must create/use shared budgets');
assert.equal(pollingSource.includes('budget.throwIfExhausted()'), true, 'pollGeneric must consume budget strictly');
assert.equal(pollingSource.includes('sleep(interval, { budget })'), true, 'pollGeneric sleep must be budget-aware');
assert.equal(sessionPollSource.includes('createBudgetFromMinutes'), true, 'pollForSessionEnd must create/use shared budgets');
assert.equal(sessionPollSource.includes('waitForAcpMonitorEvent(Math.min(interval, budget.remainingMs()))'), true, 'pollForSessionEnd housekeeping wait must be budget-aware through ACP event waits');
assert.equal(sessionPollSource.includes('deadline += rateLimitStep.cooldownMs'), false, 'pollForSessionEnd must not mutate local deadlines for rate limits');
assert.equal(sessionPollSource.includes('Transcript active') && sessionPollSource.includes('extending deadline'), false, 'pollForSessionEnd must not extend deadlines for transcript/internal polling activity');
assert.equal(rateLimitSource.includes('budget.extendForRateLimit(cooldownMs'), true, 'rate-limit handling must explicitly authorize cooldown budget extension');
assert.equal(rateLimitSource.includes("reason: 'authorized_rate_limit_cooldown'"), true, 'rate-limit budget extension must carry authorization reason');
assert.equal(eventContractSource.includes('BudgetExhaustedError'), true, 'event waits must surface budget exhaustion');
assert.equal(eventContractSource.includes('budget?.remainingMs'), true, 'event waits must bound waits by shared budget remaining time');
assert.equal(commonGatewaySource.includes('await sleep(retryDelayMs, { budget, signal })'), true, 'gateway retry waits must be abortable and budget-aware');
assert.equal(commonGatewaySource.includes('throwIfCallerAborted(signal, budget)'), true, 'gateway retries must propagate caller aborts instead of retrying them');
assert.equal(commonLifecycleSource.includes('await sleep(retryDelayMs, { budget, signal })'), true, 'session spawn retry waits must be abortable and budget-aware');
assert.equal(
  moduleRunnerSource.includes('deps.sleep(5000, { budget: selectTruthyValue(() => (opts.budget), () => (null)), signal: selectTruthyValue(() => (opts.signal), () => (null)) })'),
  true,
  'module retry wait must receive caller budget/signal',
);
assert.equal(commonGitWorktreeSource.includes('await sleep(delayMs, { budget, signal })'), true, 'shared git push retry waits must be abortable and budget-aware');
assert.equal(novaGitWorktreeSource.includes("export * from '../../../common/pipeline/integrations/git-worktree.ts';"), true, 'Nova git worktree must re-export the shared implementation authority');
assert.equal(busterGitWorkflowsSource.includes('await sleep(retryDelayMs * Math.pow(2, attempt - 1), { budget, signal })'), true, 'Buster git retry backoff must use shared abortable sleep');
assert.equal(busterGitWorkflowsSource.includes('new Promise(resolve => setTimeout'), false, 'Buster git retry backoff must not use raw fixed sleeps');

const timingMod = await import(pathToFileURL(timingPath).href);
for (const name of ['BudgetExhaustedError', 'createBudget', 'createBudgetFromMinutes', 'isBudgetExhaustedError', 'sleep']) {
  assert.equal(typeof timingMod[name], name === 'BudgetExhaustedError' ? 'function' : 'function', `${name} should be exported`);
}

const budget = timingMod.createBudget({ timeoutMs: 1000, label: 'contract-budget' });
const beforeDeadline = budget.deadlineMs;
assert.throws(() => budget.extend(1, { reason: 'not-authorized' }), /explicit authorization/);
budget.extendForRateLimit(10, { bufferMs: 2 });
assert.equal(budget.deadlineMs, beforeDeadline + 12);

const abortController = new AbortController();
const abortStartedAt = Date.now();
setTimeout(() => abortController.abort('contract-abort'), 20);
await assert.rejects(
  () => timingMod.sleep(1000, { signal: abortController.signal }),
  (error) => error?.name === 'AbortError' || error?.code === 'ABORT_ERR',
);
assert.equal(Date.now() - abortStartedAt < 250, true, 'abortable sleep must wake immediately on abort');

const shortBudget = timingMod.createBudget({ timeoutMs: 20, label: 'short-contract-budget' });
const budgetStartedAt = Date.now();
await assert.rejects(
  () => timingMod.sleep(1000, { budget: shortBudget }),
  (error) => error?.name === 'BudgetExhaustedError' || error?.code === 'BUDGET_EXHAUSTED',
);
assert.equal(Date.now() - budgetStartedAt < 250, true, 'budget-aware sleep must wake at budget exhaustion, not at requested delay');

const gatewayMod = await import(pathToFileURL(commonGatewayPath).href);
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => {
    const error = new Error('fetch failed');
    error.cause = { code: 'ECONNRESET' };
    throw error;
  };
  const retryAbort = new AbortController();
  setTimeout(() => retryAbort.abort('gateway-retry-abort'), 20);
  const gatewayStartedAt = Date.now();
  await assert.rejects(
    () => gatewayMod.sendGatewaySessionMessage('agent:main:contract:test', 'contract', 100, {
      gatewayUrl: 'http://127.0.0.1:9',
      gatewayToken: '',
      maxRetries: 2,
      retryDelayMs: 1000,
      signal: retryAbort.signal,
    }),
    (error) => error?.name === 'AbortError' || error?.code === 'ABORT_ERR',
  );
  assert.equal(Date.now() - gatewayStartedAt < 250, true, 'gateway retry sleep must abort immediately');
} finally {
  globalThis.fetch = originalFetch;
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 35 }));
