#!/usr/bin/env node
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'runtime/check-acp-launch' });
import { parseLaunchArgs, verifyLaunchReachability } from './session-launch-lib.mjs';

try {
  const options = parseLaunchArgs(process.argv.slice(2), {
    runtime: 'acp',
    model: 'claude-sonnet-4-6',
    agentId: 'claude',
    labelPrefix: 'verify-acp-launch',
    prompt: 'Reply with READY and stop.',
    timeoutSeconds: 120,
    pollAttempts: 8,
    pollMs: 1000,
    allowTerminalAfterLaunch: true,
  });

  const result = await verifyLaunchReachability(options);
  if (!result.ok) {
    quietConsole.restore();
console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    quietConsole.restore();
console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  quietConsole.restore();
console.error(JSON.stringify({
    ok: false,
    runtime: 'acp',
    error: error?.message || String(error),
  }, null, 2));
  process.exitCode = 1;
}
