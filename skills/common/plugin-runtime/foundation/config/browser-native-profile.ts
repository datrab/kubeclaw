type Json = Record<string, any>;
function requireValue(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`PIPELINE_V10_BROWSER_NATIVE_INVALID:${reason}`);
}
function object(value: unknown): Json {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'OBJECT'); return value as Json;
}
function finite(value: unknown, minimum: number, maximum: number) {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum, 'NUMBER');
}
function integer(value: unknown, minimum: number, maximum: number) {
  requireValue(Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum, 'INTEGER');
}

/** Intrinsic native profile parser domain ported from the recorded real source.
 * Does not invoke browser/runtime or authenticate host/source/caller grants.
 * The real provider constructs { ...authoredProfile, name: authoredKey }.
 */
export function validateBrowserNativeProfile(kind: 'axe' | 'visual' | 'lighthouse', name: string, raw: unknown): void {
  const p = object(raw);
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(name), 'NAME');
  if (kind === 'lighthouse') {
    requireValue(['mobile', 'desktop'].includes(String(p.formFactor)), 'FORM_FACTOR');
    const screen = object(p.screen), throttling = object(p.throttling);
    integer(screen.width, 240, 3840); integer(screen.height, 240, 2160);
    finite(screen.deviceScaleFactor, 0.5, 4); requireValue(typeof screen.mobile === 'boolean', 'MOBILE');
    finite(throttling.rttMs, 0, 5000); finite(throttling.throughputKbps, 1, 1_000_000);
    finite(throttling.cpuSlowdownMultiplier, 1, 32);
    return;
  }
  requireValue(['chromium', 'firefox', 'webkit'].includes(String(p.browser)), 'BROWSER');
  const viewport = object(p.viewport), minimum = kind === 'axe' ? 1 : 240;
  integer(viewport.width, minimum, 3840); integer(viewport.height, minimum, 2160);
  if (p.colorScheme !== undefined) requireValue(['light', 'dark', 'no-preference'].includes(String(p.colorScheme)), 'COLOR_SCHEME');
  if (p.reducedMotion !== undefined) requireValue(['reduce', 'no-preference'].includes(String(p.reducedMotion)), 'REDUCED_MOTION');
  for (const field of ['locale', 'timezoneId']) if (p[field] !== undefined) {
    requireValue(typeof p[field] === 'string' && p[field].length > 0 && p[field].length <= 128, 'LOCALE_TIMEZONE');
  }
  for (const field of ['hasTouch', 'isMobile']) if (p[field] !== undefined) requireValue(typeof p[field] === 'boolean', 'BOOLEAN');
  if (p.deviceScaleFactor !== undefined) finite(p.deviceScaleFactor, 0.5, 4);
}

/** Playwright's raw domain is deliberately NOT compared against H limits:
 * actual provider/invoker clamps workers and timeout with original ceilings.
 */
export function validatePlaywrightNativePolicy(raw: unknown): void {
  const p = object(raw); integer(p.workers, 1, 64); integer(p.timeoutMs, 1000, 3_600_000);
}
