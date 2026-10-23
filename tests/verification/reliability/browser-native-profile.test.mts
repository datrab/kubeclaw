import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { validateBrowserNativeProfile as validate, validatePlaywrightNativePolicy } from '../../../skills/common/plugin-runtime/foundation/config/browser-native-profile.ts';
const root = new URL('../../../', import.meta.url);
const sources = JSON.parse(fs.readFileSync(new URL('skills/common/plugin-runtime/foundation/config/browser-native-profile-sources.json', root), 'utf8'));
function native(kind: string, functions: string[], entry: string) {
  const source = fs.readFileSync(new URL(sources[kind].path, root), 'utf8');
  const ast = ts.createSourceFile('native.ts', source, ts.ScriptTarget.Latest, true);
  const cuts = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name && functions.includes(node.name.text));
  assert.equal(cuts.length, functions.length);
  const js = ts.transpileModule(cuts.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2024 } }).outputText;
  // TEST ONLY: execute selected real pure source functions, not the module,
  // Browser/Playwright process, file/API/network imports or a native host shim.
  return vm.runInNewContext(js + '\n' + entry, {}, { timeout: 1000 });
}
const accepts = (run: () => unknown) => { try { run(); return true; } catch { return false; } };
const browser = { browser: 'chromium', viewport: { width: 640, height: 480 }, locale: 'en-US', deviceScaleFactor: 1 };
const lighthouse = { formFactor: 'desktop', screen: { width: 640, height: 480, deviceScaleFactor: 1, mobile: false },
  throttling: { rttMs: 0, throughputKbps: 100000, cpuSlowdownMultiplier: 1 } };

test('native profile source provenance remains exact and productive modules unmodified', () => {
  for (const record of Object.values(sources) as any[]) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(record.path, root))).digest('hex'), record.sha256);
});
for (const kind of ['axe', 'visual'] as const) test(`${kind} parser parity with actual pure native function, including distinct viewport minimum`, () => {
  const parse = kind === 'axe' ? native(kind, ['object','positiveInteger','profileOptions'], 'profileOptions') : native(kind, ['object','integer','profile'], 'profile');
  const rows = [browser, { ...browser, viewport: { width: 1, height: 1 } }, { ...browser, viewport: { width: 239, height: 240 } },
    { ...browser, viewport: { width: 3841, height: 480 } }, { ...browser, viewport: { width: 640.5, height: 480 } },
    { ...browser, browser: 'unknown' }, { ...browser, deviceScaleFactor: 0.49 }, { ...browser, deviceScaleFactor: 4 },
    { ...browser, locale: '' }, { ...browser, locale: 'x'.repeat(129) }, { ...browser, colorScheme: 'unsupported' },
    { ...browser, reducedMotion: 'reduce' }, { ...browser, hasTouch: 'true' }];
  for (const row of rows) assert.equal(accepts(() => validate(kind, 'authored-profile', row)), accepts(() => parse({ ...row, name: 'authored-profile' })));
  assert.equal(accepts(() => validate(kind, 'invalid name', browser)), false);
});
test('Lighthouse parser parity covers fractional throughput schema/native discrepancy and screen/throttle bounds', () => {
  const parse = native('lighthouse', ['object','integer','finite','profile'], 'profile');
  const rows = [lighthouse, ...[0, 0.5, 1, 1000000, 1000001].map(throughputKbps => ({ ...lighthouse, throttling: { ...lighthouse.throttling, throughputKbps } })),
    { ...lighthouse, screen: { ...lighthouse.screen, width: 239 } }, { ...lighthouse, screen: { ...lighthouse.screen, width: 3840 } },
    { ...lighthouse, throttling: { ...lighthouse.throttling, rttMs: -1 } }, { ...lighthouse, throttling: { ...lighthouse.throttling, cpuSlowdownMultiplier: 32.1 } }];
  for (const row of rows) assert.equal(accepts(() => validate('lighthouse', 'authored-profile', row)), accepts(() => parse({ ...row, name: 'authored-profile' })));
});
test('Playwright intrinsic integer domains retain raw clamp input instead of adding host-ceiling rejection', () => {
  const integer = native('playwright', ['integer'], 'integer');
  for (const workers of [0, 1, 4, 64, 65, 1.5]) for (const timeoutMs of [999, 1000, 3600000, 3600001]) {
    assert.equal(accepts(() => validatePlaywrightNativePolicy({ workers, timeoutMs })), accepts(() => {
      integer(workers, 'INVALID', 1, 64); integer(timeoutMs, 'INVALID', 1000, 3600000);
    }));
  }
});
