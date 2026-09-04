import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { BrowserVisualCapabilityInvoker } from '@kubeclaw/buster-engine';

const old = (file: string) => execFileSync('git', ['show', `4029dabd3:${file}`], { encoding: 'utf8' });
const legacySuite = old('skills/buster/plugins/buster-suite-runtime/src/runtime/suites/visual-reg.ts');
assert.match(legacySuite, /paths\.json/u); assert.match(legacySuite, /baseline/u); assert.match(legacySuite, /Discord/u);

const temporary = fs.mkdtempSync(path.join(process.cwd(), '.visual-legacy-comparison-'));
try {
  const legacyModule = path.join(temporary, 'visual-reg-image.ts');
  fs.writeFileSync(legacyModule, old('skills/buster/plugins/buster-suite-runtime/src/runtime/suites/visual-reg-image.ts'));
  const { compareImages } = await import(`${pathToFileURL(legacyModule).href}?proof=1`);
  const makePng = (red: number) => { const png = new PNG({ width: 8, height: 8 });
    for (let index = 0; index < png.data.length; index += 4) { png.data[index] = red; png.data[index + 3] = 255; }
    return PNG.sync.write(png); };
  const baseline = makePng(0); const unchanged = makePng(0); const changed = makePng(255);
  const baselineFile = path.join(temporary, 'baseline.png'); const actualFile = path.join(temporary, 'actual.png');
  const diffFile = path.join(temporary, 'legacy-diff.png'); fs.writeFileSync(baselineFile, baseline);
  const capability = new BrowserVisualCapabilityInvoker({ allowedOrigins: ['http://127.0.0.1:1'], allowedBrowsers: ['chromium'],
    maximumCombinations: 1, maximumConcurrency: 1, maximumExecutionMs: 1000, maximumResultBytes: 1024 * 1024,
    maximumScreenshotBytes: 1024 * 1024, maximumMasksPerCombination: 1 });
  const compareNew = (current: Buffer) => capability.invoke('browser.visual', { operation: 'compare',
    resource: { type: 'visual.comparison', canonicalId: 'pixelmatch-v1' }, payload: {
      baseline: baseline.toString('base64'), current: current.toString('base64'), pixelThreshold: 0.1,
    } }, new AbortController().signal);
  fs.writeFileSync(actualFile, unchanged); const oldUnchanged = await compareImages(baselineFile, actualFile, diffFile, 0.1);
  const newUnchanged: any = await compareNew(unchanged); assert.equal(oldUnchanged.diffCount, 0); assert.equal(newUnchanged.diffCount, 0);
  fs.writeFileSync(actualFile, changed); const oldChanged = await compareImages(baselineFile, actualFile, diffFile, 0.1);
  const newChanged: any = await compareNew(changed); assert.ok(oldChanged.diffCount > 0); assert.ok(newChanged.diffCount > 0);
  assert.equal(oldChanged.width, newChanged.width); assert.equal(oldChanged.height, newChanged.height);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

console.log(JSON.stringify({ ok: true, phase: 'visual-legacy-comparison', controlledInputs: ['unchanged-png', 'changed-png'],
  preserved: ['png-comparison', 'pass-on-zero-difference', 'fail-on-difference'],
  improved: ['identity', 'digests', 'isolation'], removed: ['implicit-discovery', 'discord-verdict-authority'] }));
