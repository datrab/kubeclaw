import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ownedClusterTest } from './cluster-test-ownership.mjs';

const directory = process.env.CLUSTER_OWNERSHIP_DIRECTORY;
const scenario = process.env.CLUSTER_OWNERSHIP_SCENARIO;
if (!directory || !scenario) throw new Error('OWNERSHIP_SCENARIO_INPUT_REQUIRED');
const root = path.join(directory, 'owned-root');
const events = path.join(directory, 'events.jsonl');
const record = (event, details = {}) => fs.appendFileSync(events, JSON.stringify({ event, pid: process.pid, ...details }) + '\n');
async function barrier(name) {
  while (!fs.existsSync(path.join(directory, name))) await new Promise(resolve => setTimeout(resolve, 10));
}

if (process.argv[2] === 'held-child') {
  process.on('message', message => { if (message === 'stop-requested') record('child-stop-requested'); });
  record('child-ready'); process.send('ready');
  await barrier('release-child');
  record('child-exiting'); process.disconnect();
} else {
  process.on('uncaughtExceptionMonitor', error => record('uncaught', { message: error.message }));
  test(scenario, { timeout: scenario === 'OWN-TIMEOUT-CLEAN' ? 2000 : 20000 }, async t => {
    fs.mkdirSync(root);
    return ownedClusterTest(t, root, async owner => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'held-child'],
        { env: process.env, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      child.once('close', (code, signal) => record('actual-child-close', { code, signal, rootPresent: fs.existsSync(root) }));
      await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject); });
      // This intentionally modeled runtime tests the helper's stop contract.
      // It owns the genuine held child above; child disposal is observed separately.
      const lifetime = owner.runtime({
        async start() { record('runtime-started'); },
        async stop() {
          record('stop-entered'); child.send('stop-requested');
          if (scenario === 'OWN-STOP-FAILURE') throw new Error('OWN_STOP_SENTINEL');
          if (scenario === 'OWN-TIMEOUT-CLEAN') await barrier('release-stop');
          record('stop-settled');
        },
      });
      await lifetime.start();
      if (scenario === 'OWN-STOP-FAILURE') {
        // Isolate the teardown failure: node:test otherwise reports only the primary body error.
        record('body-settled'); return;
      }
      if (scenario === 'OWN-DISPOSAL-TIMEOUT-LATE') { record('body-settled'); return; }
      await owner.invoke(async signal => {
        await new Promise(resolve => {
          if (signal.aborted) resolve(); else signal.addEventListener('abort', resolve, { once: true });
        });
        record('body-aborted');
        await barrier('release-body'); record('body-settled');
      });
    });
  });
}
