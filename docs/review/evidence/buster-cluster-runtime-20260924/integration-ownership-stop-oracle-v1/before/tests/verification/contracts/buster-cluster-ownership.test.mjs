import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const fixture = fileURLToPath(new URL('../../fixtures/test-gate/cluster-ownership-scenario.mjs', import.meta.url));
const reporter = fileURLToPath(new URL('../../fixtures/test-gate/cluster-ownership-reporter.mjs', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function findError(error, message) {
  if (!error) return undefined;
  if (error.message === message) return error;
  return findError(error.cause, message) ?? (error.errors ?? []).map(item => findError(item, message)).find(Boolean);
}
function errorMessages(error) {
  if (!error) return [];
  return [error.message, ...errorMessages(error.cause), ...(error.errors ?? []).flatMap(errorMessages)];
}

for (const scenario of ['OWN-TIMEOUT-CLEAN', 'OWN-STOP-FAILURE', 'OWN-DISPOSAL-TIMEOUT-LATE']) {
  test(`genuine nested test lifetime ${scenario}`, { timeout: 35000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-ownership-gate-'));
    const root = path.join(directory, 'owned-root');
    const runnerEnvironment = { ...process.env,
      CLUSTER_OWNERSHIP_DIRECTORY: directory, CLUSTER_OWNERSHIP_SCENARIO: scenario };
    // Start an independent node:test runner, not another worker of this outer test.
    // Preserve NODE_OPTIONS and all actual tool/trace/mutation bindings unchanged.
    delete runnerEnvironment.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['--unhandled-rejections=strict', '--test', `--test-reporter=${reporter}`, fixture], {
      detached: true, env: runnerEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', terminal, exited = false, passed = false, watchdogError;
    child.stdout.on('data', bytes => { stdout += bytes.toString(); });
    child.stderr.on('data', bytes => { stderr += bytes.toString(); });
    child.once('exit', () => { exited = true; });
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => { terminal = { code, signal }; resolve(terminal); });
    });
    void closed.catch(() => {}); // Observe startup failure immediately; the original promise still rejects to the test.
    const terminate = () => {
      // An observed exit ends this generation's signaling authority, even if
      // inherited stdio delays close. Retain evidence rather than reuse a stale PGID.
      if (!passed && !exited && !terminal && child.exitCode === null && child.signalCode === null
        && Number.isSafeInteger(child.pid) && child.pid > 1) {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') watchdogError = error; }
      }
    };
    const watchdog = setTimeout(() => { watchdogError = new Error('OWNERSHIP_GATE_WATCHDOG'); terminate(); }, 25000);
    t.after(async () => {
      clearTimeout(watchdog); terminate();
      let timer;
      try {
        await Promise.race([closed, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`OWNERSHIP_GATE_GROUP_CLOSE_UNCONFIRMED:${directory}`)), 3000);
        })]);
        fs.writeFileSync(path.join(directory, 'reporter.jsonl'), stdout);
        fs.writeFileSync(path.join(directory, 'stderr.txt'), stderr);
        if (passed && !watchdogError) fs.rmSync(directory, { recursive: true, force: true });
        else throw new Error(`OWNERSHIP_GATE_EVIDENCE_RETAINED:${directory}`, { cause: watchdogError });
      } finally { clearTimeout(timer); }
    });
    const events = () => fs.existsSync(path.join(directory, 'events.jsonl'))
      ? fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
    const reports = () => stdout.split('\n').filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; } // Last stdout chunk may contain a partial JSON line.
    });
    const waitFor = async (predicate, label) => {
      const deadline = Date.now() + 15000;
      while (!predicate()) {
        if (watchdogError) throw watchdogError;
        assert(Date.now() < deadline, `missing ${label}; evidence=${directory}; stdout=${stdout}; stderr=${stderr}`);
        assert(stdout.length + stderr.length < 4 * 1024 * 1024, 'nested reporter output unexpectedly large');
        await delay(20);
      }
    };
    const has = name => events().some(event => event.event === name);
    const release = name => fs.writeFileSync(path.join(directory, name), 'release\n');
    await waitFor(() => has('runtime-started') && has('child-ready'), 'real active child and runtime');
    assert.equal(fs.existsSync(root), true);
    if (scenario === 'OWN-TIMEOUT-CLEAN') {
      await waitFor(() => has('body-aborted') && has('stop-entered') && has('child-stop-requested'), 'timeout propagates abort and enters stop');
      assert.equal(has('body-settled'), false); assert.equal(has('actual-child-close'), false);
      assert.equal(fs.existsSync(root), true);
      release('release-body'); await waitFor(() => has('body-settled'), 'body settles');
      assert.equal(has('stop-settled'), false); assert.equal(fs.existsSync(root), true);
      release('release-stop'); await waitFor(() => has('stop-settled'), 'runtime stop settles');
      assert.equal(has('actual-child-close'), false); assert.equal(fs.existsSync(root), true);
      release('release-child');
    } else {
      const cause = scenario === 'OWN-STOP-FAILURE' ? 'CLUSTER_TEST_SHUTDOWN_FAILED' : `CLUSTER_TEST_DISPOSAL_UNCONFIRMED:${root}`;
      await waitFor(() => reports().some(item => errorMessages(item.error).includes(cause)), 'exact teardown failure cause');
      const retained = reports().map(item => findError(item.error, `CLUSTER_TEST_FILES_RETAINED:${root}`)).find(Boolean);
      assert(retained, stdout); assert.equal(retained.cause.message, cause);
      if (scenario === 'OWN-STOP-FAILURE') assert(retained.cause.errors.some(error => error.message === 'OWN_STOP_SENTINEL'));
      assert.equal(fs.existsSync(root), true); assert.equal(has('actual-child-close'), false);
      if (scenario === 'OWN-STOP-FAILURE') {
        const messages = reports().flatMap(item => errorMessages(item.error));
        assert(messages.includes('OWN_STOP_SENTINEL')); assert(messages.includes('OWN_BODY_SENTINEL'));
      }
      release('release-child');
    }
    await waitFor(() => has('actual-child-close'), 'actual late child close');
    await closed;
    assert.deepEqual(terminal, { code: 1, signal: null }, stdout + stderr);
    assert.equal(fs.existsSync(root), scenario !== 'OWN-TIMEOUT-CLEAN');
    // Child close and process exit are complete: no remaining owner can delete later.
    assert.equal(events().some(event => event.event === 'uncaught'), false, stderr);
    assert.doesNotMatch(stderr, /UnhandledPromiseRejection|unhandledRejection|uncaughtException/);
    for (const line of stdout.trim().split('\n')) JSON.parse(line); // No malformed complete reporter record is ignored.
    const failures = reports().filter(item => item.type === 'test:fail'); assert(failures.length > 0);
    if (scenario === 'OWN-TIMEOUT-CLEAN') {
      assert(failures.some(item => item.error?.failureType === 'testTimeoutFailure'
        || errorMessages(item.error).some(message => /timed out after 2000ms/.test(message))), stdout);
      assert(!failures.some(item => errorMessages(item.error).some(message => message?.startsWith('CLUSTER_TEST_FILES_RETAINED'))));
    }
    const actual = events().find(event => event.event === 'actual-child-close');
    assert.equal(actual.rootPresent, true, 'root must still exist at genuine child close');
    assert.equal(actual.code, 0); assert.equal(actual.signal, null);
    passed = true;
  });
}
