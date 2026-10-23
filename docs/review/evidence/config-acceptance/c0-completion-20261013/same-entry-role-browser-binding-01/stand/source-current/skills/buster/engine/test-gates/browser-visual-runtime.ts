/// <reference path="./pngjs.d.ts" />
import { fixtureOrigins, fixtureAuthoritySignal } from './fixture-authority.ts';
import crypto from 'node:crypto';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { chromium, firefox, webkit, type Browser, type BrowserContextOptions } from 'playwright';
import type { ResolvedInputV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { TestProviderCapabilityInvoker } from './runner.ts';

type BrowserName = 'chromium' | 'firefox' | 'webkit';
type JsonObject = Record<string, unknown>;

export interface BrowserVisualCapabilityInvokerOptions {
  readonly allowedOrigins: readonly string[];
  readonly allowedBrowsers: readonly BrowserName[];
  readonly browserExecutables?: Partial<Readonly<Record<BrowserName, string>>>;
  readonly maximumCombinations: number;
  readonly maximumConcurrency: number;
  readonly maximumExecutionMs: number;
  readonly maximumResultBytes: number;
  readonly maximumScreenshotBytes: number;
  readonly maximumMasksPerCombination: number;
}

function object(value: unknown, code: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as JsonObject;
}
function integer(value: unknown, code: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error(code);
  return Number(value);
}
function base64(value: string, code: string): Buffer {
  if (!value.length || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error(code);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error(code);
  return bytes;
}
function pngDimensions(bytes: Buffer, maximumDecodedBytes: number, code: string): { width: number; height: number } {
  if (bytes.byteLength < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(code);
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (!width || !height || width > 16_384 || height > 16_384
    || width * height > Math.floor(maximumDecodedBytes / 4)) throw new Error('BROWSER_VISUAL_DECODED_IMAGE_LIMIT_EXCEEDED');
  return { width, height };
}
function paddedPixels(png: PNG, width: number, height: number): Buffer {
  const result = Buffer.alloc(width * height * 4);
  for (let row = 0; row < png.height; row += 1) {
    png.data.copy(result, row * width * 4, row * png.width * 4, (row + 1) * png.width * 4);
  }
  return result;
}
function canonicalOrigin(value: string, code: string): string {
  let url: URL; try { url = new URL(value); } catch { throw new Error(code); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/'
    || url.search || url.hash) throw new Error(code);
  return url.origin;
}

function profile(raw: unknown): { name: string; browser: BrowserName; context: BrowserContextOptions } {
  const value = object(raw, 'BROWSER_VISUAL_PROFILE_INVALID');
  if (typeof value.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value.name)
    || !['chromium', 'firefox', 'webkit'].includes(String(value.browser))) throw new Error('BROWSER_VISUAL_PROFILE_INVALID');
  const viewport = object(value.viewport, 'BROWSER_VISUAL_PROFILE_INVALID');
  const context: BrowserContextOptions = {
    viewport: { width: integer(viewport.width, 'BROWSER_VISUAL_PROFILE_INVALID', 240, 3840),
      height: integer(viewport.height, 'BROWSER_VISUAL_PROFILE_INVALID', 240, 2160) },
    serviceWorkers: 'block',
  };
  if (value.colorScheme !== undefined) {
    const colorScheme = String(value.colorScheme);
    if (!['light', 'dark', 'no-preference'].includes(colorScheme)) throw new Error('BROWSER_VISUAL_PROFILE_INVALID');
    context.colorScheme = colorScheme as 'light' | 'dark' | 'no-preference';
  }
  if (value.reducedMotion !== undefined) {
    const reducedMotion = String(value.reducedMotion);
    if (!['reduce', 'no-preference'].includes(reducedMotion)) throw new Error('BROWSER_VISUAL_PROFILE_INVALID');
    context.reducedMotion = reducedMotion as 'reduce' | 'no-preference';
  }
  for (const name of ['locale', 'timezoneId'] as const) if (value[name] !== undefined) {
    if (typeof value[name] !== 'string' || value[name].length === 0 || value[name].length > 128) throw new Error('BROWSER_VISUAL_PROFILE_INVALID');
    context[name] = value[name] as string;
  }
  if (value.deviceScaleFactor !== undefined) {
    if (typeof value.deviceScaleFactor !== 'number' || !Number.isFinite(value.deviceScaleFactor)
      || value.deviceScaleFactor < 0.5 || value.deviceScaleFactor > 4) throw new Error('BROWSER_VISUAL_PROFILE_INVALID');
    context.deviceScaleFactor = value.deviceScaleFactor;
  }
  for (const name of ['hasTouch', 'isMobile'] as const) if (value[name] !== undefined) {
    if (typeof value[name] !== 'boolean') throw new Error('BROWSER_VISUAL_PROFILE_INVALID');
    context[name] = value[name];
  }
  return { name: value.name, browser: value.browser as BrowserName, context };
}
async function boundedMap<T, R>(items: readonly T[], concurrency: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next; next += 1; results[index] = await run(items[index]!); }
  }));
  return results;
}

export class BrowserVisualCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #options: BrowserVisualCapabilityInvokerOptions;
  readonly #origins: ReadonlySet<string>;
  constructor(options: BrowserVisualCapabilityInvokerOptions) {
    this.#options = options;
    this.#origins = new Set(options.allowedOrigins.map((value) => canonicalOrigin(value, 'BROWSER_VISUAL_ORIGIN_INVALID')));
    if (!options.allowedBrowsers.length || options.allowedBrowsers.some((value) => !['chromium', 'firefox', 'webkit'].includes(value))) {
      throw new Error('BROWSER_VISUAL_BROWSER_POLICY_INVALID');
    }
    integer(options.maximumCombinations, 'BROWSER_VISUAL_COMBINATION_LIMIT_INVALID', 1, 256);
    integer(options.maximumConcurrency, 'BROWSER_VISUAL_CONCURRENCY_INVALID', 1, 16);
    integer(options.maximumExecutionMs, 'BROWSER_VISUAL_TIMEOUT_INVALID', 1000, 3_600_000);
    integer(options.maximumResultBytes, 'BROWSER_VISUAL_RESULT_LIMIT_INVALID', 1024, 256 * 1024 * 1024);
    integer(options.maximumScreenshotBytes, 'BROWSER_VISUAL_SCREENSHOT_LIMIT_INVALID', 1024, 64 * 1024 * 1024);
    integer(options.maximumMasksPerCombination, 'BROWSER_VISUAL_MASK_LIMIT_INVALID', 1, 128);
  }

  async invoke(capability: string, request: TestProviderCapabilityRequest, signal: AbortSignal,
    inputs: readonly ResolvedInputV1[] = []): Promise<Readonly<Record<string, unknown>>> {
    signal = fixtureAuthoritySignal(inputs, signal);
    if (capability !== 'browser.visual') throw new Error('BROWSER_VISUAL_OPERATION_DENIED');
    if (request.operation === 'compare') {
      if (signal.aborted) throw new Error('BROWSER_VISUAL_CANCELLED');
      if (request.resource.type !== 'visual.comparison' || request.resource.canonicalId !== 'pixelmatch-v1') throw new Error('BROWSER_VISUAL_RESOURCE_INVALID');
      const payload = object(request.payload, 'BROWSER_VISUAL_COMPARE_INVALID');
      if (typeof payload.baseline !== 'string' || typeof payload.current !== 'string'
        || typeof payload.pixelThreshold !== 'number' || !Number.isFinite(payload.pixelThreshold)
        || payload.pixelThreshold < 0 || payload.pixelThreshold > 1) throw new Error('BROWSER_VISUAL_COMPARE_INVALID');
      const baselineBytes = base64(payload.baseline, 'BROWSER_VISUAL_COMPARE_INVALID');
      const currentBytes = base64(payload.current, 'BROWSER_VISUAL_COMPARE_INVALID');
      if (!baselineBytes.length || !currentBytes.length || baselineBytes.byteLength > this.#options.maximumScreenshotBytes
        || currentBytes.byteLength > this.#options.maximumScreenshotBytes) throw new Error('BROWSER_VISUAL_SCREENSHOT_BYTES_EXCEEDED');
      pngDimensions(baselineBytes, this.#options.maximumResultBytes, 'BROWSER_VISUAL_COMPARE_INVALID');
      pngDimensions(currentBytes, this.#options.maximumResultBytes, 'BROWSER_VISUAL_COMPARE_INVALID');
      const baseline = PNG.sync.read(baselineBytes); const current = PNG.sync.read(currentBytes);
      if (baseline.width !== current.width || baseline.height !== current.height) {
        const width = Math.max(baseline.width, current.width); const height = Math.max(baseline.height, current.height);
        if (width * height > Math.floor(this.#options.maximumResultBytes / 4)) throw new Error('BROWSER_VISUAL_DECODED_IMAGE_LIMIT_EXCEEDED');
        const difference = new PNG({ width, height });
        pixelmatch(paddedPixels(baseline, width, height), paddedPixels(current, width, height), difference.data, width, height,
          { threshold: payload.pixelThreshold, includeAA: true });
        const response = { schemaVersion: 'browser-visual-comparison.v1',
        width, height, diffCount: width * height, diffPercent: 100,
        difference: PNG.sync.write(difference).toString('base64') };
        if (Buffer.byteLength(JSON.stringify(response)) > this.#options.maximumResultBytes) throw new Error('BROWSER_VISUAL_RESULT_BYTES_EXCEEDED');
        return response;
      }
      const difference = new PNG({ width: baseline.width, height: baseline.height });
      const diffCount = pixelmatch(baseline.data, current.data, difference.data, baseline.width, baseline.height,
        { threshold: payload.pixelThreshold, includeAA: true });
      const response = { schemaVersion: 'browser-visual-comparison.v1', width: current.width, height: current.height, diffCount,
        diffPercent: (diffCount / Math.max(1, current.width * current.height)) * 100,
        difference: PNG.sync.write(difference).toString('base64') };
      if (Buffer.byteLength(JSON.stringify(response)) > this.#options.maximumResultBytes) throw new Error('BROWSER_VISUAL_RESULT_BYTES_EXCEEDED');
      return response;
    }
    if (request.operation !== 'capture') throw new Error('BROWSER_VISUAL_OPERATION_DENIED');
    if (signal.aborted) throw new Error('BROWSER_VISUAL_CANCELLED');
    if (request.resource.type !== 'network.url') throw new Error('BROWSER_VISUAL_RESOURCE_INVALID');
    const target = new URL(request.resource.canonicalId); const allowed = new Set([...this.#origins, ...fixtureOrigins(inputs)]);
    if (!allowed.has(target.origin) || target.username || target.password) throw new Error('BROWSER_VISUAL_ORIGIN_DENIED');
    const payload = object(request.payload, 'BROWSER_VISUAL_REQUEST_INVALID');
    if (!Array.isArray(payload.combinations) || !payload.combinations.length
      || payload.combinations.length > this.#options.maximumCombinations) throw new Error('BROWSER_VISUAL_COMBINATION_LIMIT_EXCEEDED');
    const timeoutMs = integer(payload.timeoutMs, 'BROWSER_VISUAL_TIMEOUT_INVALID', 1000, this.#options.maximumExecutionMs);
    const combinations = payload.combinations.map((raw) => {
      const item = object(raw, 'BROWSER_VISUAL_COMBINATION_INVALID');
      if (typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(item.id)
        || typeof item.route !== 'string' || !item.route.startsWith('/') || item.route.startsWith('//')
        || item.route.length > 1024 || /[?#\r\n]/u.test(item.route)) throw new Error('BROWSER_VISUAL_COMBINATION_INVALID');
      if (!Array.isArray(item.masks) || item.masks.length > this.#options.maximumMasksPerCombination
        || item.masks.some((mask) => typeof mask !== 'string' || mask.length === 0 || mask.length > 512)) {
        throw new Error('BROWSER_VISUAL_MASK_INVALID');
      }
      const resolved = profile(item.profile);
      if (!this.#options.allowedBrowsers.includes(resolved.browser)) throw new Error('BROWSER_VISUAL_BROWSER_DENIED');
      return { id: item.id, route: item.route, masks: [...new Set(item.masks as string[])], ...resolved };
    });
    const browserTypes = { chromium, firefox, webkit } as const; const browsers = new Map<BrowserName, Browser>();
    const deadlineAt = Date.now() + timeoutMs; let deadlineExceeded = false;
    const abort = () => { for (const browser of browsers.values()) void browser.close().catch(() => undefined); };
    signal.addEventListener('abort', abort, { once: true });
    const deadline = setTimeout(() => { deadlineExceeded = true; abort(); }, timeoutMs);
    try {
      for (const name of new Set(combinations.map((item) => item.browser))) {
        const executablePath = this.#options.browserExecutables?.[name];
        browsers.set(name, await browserTypes[name].launch({ headless: true, ...(executablePath ? { executablePath } : {}) }));
      }
      let accumulatedResultBytes = 0;
      const results = await boundedMap(combinations, this.#options.maximumConcurrency, async (item) => {
        if (signal.aborted) throw new Error('BROWSER_VISUAL_CANCELLED');
        const browser = browsers.get(item.browser)!; const context = await browser.newContext(item.context);
        try {
          const blocked = new Set<string>();
          await context.addInitScript(() => {
            for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection']) {
              Object.defineProperty(globalThis, name, { configurable: false, value: undefined, writable: false });
            }
          });
          await context.route('**/*', async (route) => {
            const url = route.request().url();
            if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') return route.continue();
            try { if (new URL(url).origin !== target.origin) throw new Error('denied'); }
            catch { blocked.add(url); return route.abort('blockedbyclient'); }
            return route.continue();
          });
          await context.routeWebSocket('**/*', async (socket) => { blocked.add(socket.url()); await socket.close({ code: 1008, reason: 'denied' }); });
          const page = await context.newPage(); const url = new URL(item.route, `${target.origin}/`);
          const navigationMs = deadlineAt - Date.now(); if (navigationMs <= 0) throw new Error('BROWSER_VISUAL_TIMEOUT_EXCEEDED');
          try { await page.goto(url.href, { waitUntil: 'networkidle', timeout: navigationMs }); }
          catch (error) { if (blocked.size) throw new Error('BROWSER_VISUAL_SUBRESOURCE_ORIGIN_DENIED'); throw error; }
          if (blocked.size) throw new Error('BROWSER_VISUAL_SUBRESOURCE_ORIGIN_DENIED');
          await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}' });
          const mask = item.masks.map((selector) => page.locator(selector));
          const extent = await page.evaluate(() => ({
            width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
            height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
          }));
          const scale = item.context.deviceScaleFactor ?? 1;
          const captureWidth = Math.ceil(extent.width * scale); const captureHeight = Math.ceil(extent.height * scale);
          if (!Number.isSafeInteger(captureWidth) || !Number.isSafeInteger(captureHeight) || captureWidth <= 0 || captureHeight <= 0
            || captureWidth > 16_384 || captureHeight > 16_384
            || captureWidth * captureHeight > Math.floor(this.#options.maximumResultBytes / 4)) {
            throw new Error('BROWSER_VISUAL_DECODED_IMAGE_LIMIT_EXCEEDED');
          }
          const screenshotMs = deadlineAt - Date.now(); if (screenshotMs <= 0) throw new Error('BROWSER_VISUAL_TIMEOUT_EXCEEDED');
          const bytes = await page.screenshot({ type: 'png', fullPage: true, animations: 'disabled', caret: 'hide', mask, timeout: screenshotMs });
          if (bytes.byteLength > this.#options.maximumScreenshotBytes) throw new Error('BROWSER_VISUAL_SCREENSHOT_BYTES_EXCEEDED');
          pngDimensions(bytes, this.#options.maximumResultBytes, 'BROWSER_VISUAL_CAPTURE_INVALID');
          const data = bytes.toString('base64');
          const reservedBytes = Buffer.byteLength(data) + 4096;
          if (accumulatedResultBytes + reservedBytes > this.#options.maximumResultBytes) {
            abort(); throw new Error('BROWSER_VISUAL_RESULT_BYTES_EXCEEDED');
          }
          accumulatedResultBytes += reservedBytes;
          return { id: item.id, route: item.route, profile: item.name, browser: item.browser, browserVersion: browser.version(),
            viewport: item.context.viewport, pageConditions: { colorScheme: item.context.colorScheme ?? null,
              reducedMotion: item.context.reducedMotion ?? null, locale: item.context.locale ?? null,
              timezoneId: item.context.timezoneId ?? null, deviceScaleFactor: item.context.deviceScaleFactor ?? 1,
              hasTouch: item.context.hasTouch ?? false, isMobile: item.context.isMobile ?? false, fullPage: true },
            masks: item.masks, sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, data };
        } finally { await context.close().catch(() => undefined); }
      });
      const response = { schemaVersion: 'browser-visual-result.v1', results };
      if (Buffer.byteLength(JSON.stringify(response)) > this.#options.maximumResultBytes) throw new Error('BROWSER_VISUAL_RESULT_BYTES_EXCEEDED');
      return response;
    } catch (error) {
      if (deadlineExceeded) throw new Error('BROWSER_VISUAL_TIMEOUT_EXCEEDED');
      if (signal.aborted) throw new Error('BROWSER_VISUAL_CANCELLED');
      throw error;
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener('abort', abort);
      await Promise.all([...browsers.values()].map((browser) => browser.close().catch(() => undefined)));
    }
  }
}
