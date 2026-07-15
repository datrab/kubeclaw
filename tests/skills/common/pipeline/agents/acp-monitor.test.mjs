import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyTranscriptText, getAcpMonitorState, isSessionTerminal } from '../../../../../skills/common/pipeline/agents/acp-monitor.ts';
import { parseSessionState } from '../../../../../skills/common/pipeline/agents/session-semantics.ts';

test('classifyTranscriptText treats provider usage limits as rate limits', () => {
  assert.equal(classifyTranscriptText('5h usage limit reached, try again later').kind, 'rate_limited');
  assert.equal(classifyTranscriptText('usage quota exhausted for this model').kind, 'rate_limited');
  assert.equal(
    classifyTranscriptText("You've reached your Codex subscription usage limit. Next reset in 2 hours.").kind,
    'rate_limited',
  );
});

test('parseSessionState preserves Codex promptError rate-limit evidence', () => {
  const parsed = parseSessionState({
    status: 'error',
    data: {
      promptError: "You've reached your Codex subscription usage limit. Next reset in 2 hours, Jun 29 at 10:45 PM UTC.",
    },
  });

  assert.equal(parsed.active, false);
  assert.equal(parsed.state, 'error');
  assert.match(parsed.detail, /Codex subscription usage limit/);
  assert.equal(parsed.rateLimited, true);
});

test('parseSessionState preserves fallback rate-limit reason and detail', () => {
  const parsed = parseSessionState({
    status: 'error',
    data: {
      fallbackStepFromFailureReason: 'rate_limit',
      fallbackStepFromFailureDetail: "You've reached your Codex subscription usage limit. Next reset in 2 hours.",
    },
  });

  assert.equal(parsed.active, false);
  assert.equal(parsed.state, 'error');
  assert.equal(parsed.rateLimited, true);
  assert.match(parsed.detail, /Codex subscription usage limit/);
});

test('parseSessionState does not treat active usage status as a hard rate limit', () => {
  const statusText = [
    '🦞 OpenClaw 2026.6.10',
    '📊 Usage: 5h 4% left ⏱2h 28m · Week 53% left ⏱6d 10h',
    '📌 Tasks: 1 active · subagent · arch-validator',
    '🪢 Queue: steer (depth 0)',
  ].join('\n');
  const parsed = parseSessionState({ statusText });

  assert.equal(classifyTranscriptText(statusText).kind, 'info');
  assert.equal(parsed.active, true);
  assert.equal(parsed.state, 'running');
  assert.equal(parsed.rateLimited, false);
});

test('parseSessionState ignores stale rate-limit metadata while session is active', () => {
  const parsed = parseSessionState({
    status: 'running',
    data: {
      fallbackStepFromFailureReason: 'rate_limit',
      fallbackStepFromFailureDetail: "You've reached your Codex subscription usage limit. Next reset in 2 hours.",
    },
  });

  assert.equal(parsed.active, true);
  assert.equal(parsed.state, 'running');
  assert.equal(parsed.rateLimited, false);
});

test('parseSessionState ignores rate-limit text unless the current session errored', () => {
  for (const status of ['completed', 'closed', 'idle']) {
    const parsed = parseSessionState({
      status,
      data: {
        promptError: "You've reached your Codex subscription usage limit. Next reset in 2 hours.",
      },
    });

    assert.equal(parsed.rateLimited, false);
  }
});

test('parseSessionState accepts rate-limit text from current errored session only', () => {
  const parsed = parseSessionState({
    raw: "error: You've reached your Codex subscription usage limit. Next reset in 2 hours.",
  });

  assert.equal(parsed.active, false);
  assert.equal(parsed.state, 'error');
  assert.equal(parsed.rateLimited, true);
});

test('isSessionTerminal remains a synchronous monitor-state predicate', () => {
  assert.equal(isSessionTerminal({ terminal: true, sessionState: 'completed' }), true);
  assert.equal(isSessionTerminal({ terminal: false, sessionState: 'running' }), false);
});

test('isSessionTerminal rejects label input instead of returning a truthy Promise', () => {
  assert.throws(
    () => isSessionTerminal('forge-1', {}, { gatewayUrl: 'http://127.0.0.1:1', gatewayToken: '' }),
    /expects an ACP monitor state object/,
  );
});

test('getAcpMonitorState requires explicit gateway session status policy from config', async () => {
  await assert.rejects(
    () => getAcpMonitorState({
      config: {
        acp_monitor: {
          poll_limit: 1,
          max_transcript_extensions: 1,
          transcript_grace_ms: 1,
          monitor_poll_ms: 1,
        },
        gateway: { invoke: {} },
      },
      streamLogPath: null,
      trackedAgent: {},
    }),
    /gateway\.invoke\.session_status object/,
  );
});

test('getAcpMonitorState rejects incomplete gateway session status policy from config', async () => {
  await assert.rejects(
    () => getAcpMonitorState({
      config: {
        acp_monitor: {
          poll_limit: 1,
          max_transcript_extensions: 1,
          transcript_grace_ms: 1,
          monitor_poll_ms: 1,
        },
        gateway: {
          invoke: {
            session_status: {
              timeout_ms: 1,
            },
          },
        },
      },
      streamLogPath: null,
      trackedAgent: {},
    }),
    /gateway\.invoke\.retry object/,
  );
});

test('getAcpMonitorState reads status timeout and retry policy from canonical gateway config', async () => {
  const state = await getAcpMonitorState({
    config: {
      acp_monitor: {
        poll_limit: 1,
        max_transcript_extensions: 1,
        transcript_grace_ms: 1,
        monitor_poll_ms: 1,
      },
      gateway: {
        invoke: {
          retry: {
            max_attempts: 1,
            retry_delay_ms: 0,
          },
          session_status: {
            timeout_ms: 1,
          },
        },
      },
    },
    streamLogPath: null,
    trackedAgent: {},
  });

  assert.equal(state.sessionState, 'no_session_key');
  assert.equal(state.gatewayUnreachable, false);
});

test('getAcpMonitorState rejects stale per-session status retry fields as non-authoritative', async () => {
  await assert.rejects(
    () => getAcpMonitorState({
      config: {
        acp_monitor: {
          poll_limit: 1,
          max_transcript_extensions: 1,
          transcript_grace_ms: 1,
          monitor_poll_ms: 1,
        },
        gateway: {
          invoke: {
            retry: {
              retry_delay_ms: 0,
            },
            session_status: {
              timeout_ms: 1,
              max_retries: 1,
              retry_delay_ms: 0,
            },
          },
        },
      },
      streamLogPath: null,
      trackedAgent: {},
    }),
    /gateway\.invoke\.retry\.max_attempts/,
  );
});
