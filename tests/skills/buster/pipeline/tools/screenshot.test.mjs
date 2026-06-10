import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseBaselineRoutes } from '../../../../../skills/buster/pipeline/tools/screenshot.ts';

function writePreview(routes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-routes-test-'));
  const htmlPath = path.join(dir, 'preview.html');
  fs.writeFileSync(htmlPath, `
    <html>
      <body>
        <script type="application/json" data-routes>${JSON.stringify(routes)}</script>
      </body>
    </html>
  `);
  return { dir, htmlPath };
}

test('parseBaselineRoutes preserves explicit route paths when names differ', () => {
  const { dir, htmlPath } = writePreview([{ name: 'home', nav: 'Home', path: '/' }]);

  try {
    assert.deepEqual(parseBaselineRoutes(htmlPath), [{ name: 'home', nav: 'Home', path: '/' }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parseBaselineRoutes rejects missing or non-root-relative paths', () => {
  for (const routes of [
    [{ name: 'home', nav: 'Home' }],
    [{ name: 'home', nav: 'Home', path: 'home' }],
  ]) {
    const { dir, htmlPath } = writePreview(routes);
    try {
      assert.throws(() => parseBaselineRoutes(htmlPath), /path/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
