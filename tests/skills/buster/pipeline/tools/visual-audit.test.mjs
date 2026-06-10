import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import visualAudit from '../../../../../skills/buster/pipeline/tools/visual-audit.ts';
import { BUSTER_CAPABILITIES } from '../../../../../skills/buster/pipeline/services/capabilities.ts';

function createChromiumMock(screenshotPaths) {
  return {
    async launch() {
      let connected = true;
      return {
        isConnected() {
          return connected;
        },
        async close() {
          connected = false;
        },
        async newContext() {
          return {
            async close() {},
            async newPage() {
              return {
                async goto() {},
                async screenshot({ path: screenshotPath }) {
                  screenshotPaths.push(screenshotPath);
                  await new Promise((resolve) => setTimeout(resolve, 5));
                  fs.writeFileSync(screenshotPath, Buffer.from('png'));
                },
              };
            },
          };
        },
      };
    },
  };
}

test('visualAudit uses unique temp directories for concurrent fixed-time image audits', async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-audit-test-'));
  const screenshotPaths = [];
  const originalDateNow = Date.now;

  Date.now = () => 1234567890;
  try {
    const chromiumImpl = createChromiumMock(screenshotPaths);
    const fetchImpl = async () => ({ ok: true });
    const options = {
      chromiumImpl,
      fetchImpl,
      outputRoot,
      capabilities: [
        BUSTER_CAPABILITIES.BROWSER_AUTOMATION,
        BUSTER_CAPABILITIES.DISCORD_MEDIA,
      ],
    };

    const results = await Promise.all([
      visualAudit('https://example.test/a', 'channel', 'token', 'image', options),
      visualAudit('https://example.test/b', 'channel', 'token', 'image', options),
    ]);

    assert.deepEqual(results.map((result) => result.status), ['success', 'success']);
    assert.equal(screenshotPaths.length, 2);
    assert.equal(path.basename(screenshotPaths[0]), 'screenshot.png');
    assert.equal(path.basename(screenshotPaths[1]), 'screenshot.png');
    assert.notEqual(path.dirname(screenshotPaths[0]), path.dirname(screenshotPaths[1]));
  } finally {
    Date.now = originalDateNow;
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});
