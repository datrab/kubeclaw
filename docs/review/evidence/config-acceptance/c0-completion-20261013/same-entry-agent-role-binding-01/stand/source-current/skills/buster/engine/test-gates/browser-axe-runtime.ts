import { fixtureOrigins, fixtureAuthoritySignal } from './fixture-authority.ts';
import { AxeBuilder } from '@axe-core/playwright';
import { chromium, firefox, webkit, type Browser, type BrowserContextOptions } from 'playwright';
import type { ResolvedInputV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { TestProviderCapabilityInvoker } from './runner.ts';

type BrowserName = 'chromium' | 'firefox' | 'webkit';
type JsonObject = Record<string, unknown>;

export interface BrowserAxeCapabilityInvokerOptions {
  readonly allowedOrigins: readonly string[];
  readonly allowedBrowsers: readonly BrowserName[];
  readonly browserExecutables?: Partial<Readonly<Record<BrowserName, string>>>;
  readonly maximumCombinations: number;
  readonly maximumConcurrency: number;
  readonly maximumExecutionMs: number;
  readonly maximumResultBytes: number;
  readonly maximumScreenshots: number;
  readonly maximumScreenshotBytes: number;
}

function object(value: unknown, code: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as JsonObject;
}

function positiveInteger(value: unknown, code: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) throw new Error(code);
  return Number(value);
}

function canonicalOrigin(value: string, code: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(code); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/'
    || url.search || url.hash) throw new Error(code);
  return url.origin;
}

function webSocketMatchesOrigin(value: string, origin: string): boolean {
  try {
    const socket = new URL(value); const page = new URL(origin);
    return socket.protocol === (page.protocol === 'https:' ? 'wss:' : 'ws:') && socket.host === page.host;
  } catch { return false; }
}

function disableWebRtc(): void {
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection']) {
    Object.defineProperty(globalThis, name, {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false,
    });
  }
}



function stringArray(value: unknown, code: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum
    || value.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 512)) throw new Error(code);
  return [...new Set(value)];
}

function profileOptions(raw: unknown): { browser: BrowserName; context: BrowserContextOptions; name: string } {
  const profile = object(raw, 'BROWSER_AXE_PROFILE_INVALID');
  if (typeof profile.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(profile.name)) {
    throw new Error('BROWSER_AXE_PROFILE_INVALID');
  }
  if (!['chromium', 'firefox', 'webkit'].includes(String(profile.browser))) throw new Error('BROWSER_AXE_BROWSER_INVALID');
  const viewport = object(profile.viewport, 'BROWSER_AXE_VIEWPORT_INVALID');
  const width = positiveInteger(viewport.width, 'BROWSER_AXE_VIEWPORT_INVALID', 3840);
  const height = positiveInteger(viewport.height, 'BROWSER_AXE_VIEWPORT_INVALID', 2160);
  const context: BrowserContextOptions = { viewport: { width, height }, serviceWorkers: 'block' };
  if (profile.colorScheme !== undefined) {
    if (!['light', 'dark', 'no-preference'].includes(String(profile.colorScheme))) throw new Error('BROWSER_AXE_PROFILE_INVALID');
    context.colorScheme = profile.colorScheme as NonNullable<BrowserContextOptions['colorScheme']>;
  }
  if (profile.reducedMotion !== undefined) {
    if (!['reduce', 'no-preference'].includes(String(profile.reducedMotion))) throw new Error('BROWSER_AXE_PROFILE_INVALID');
    context.reducedMotion = profile.reducedMotion as NonNullable<BrowserContextOptions['reducedMotion']>;
  }
  for (const field of ['locale', 'timezoneId'] as const) if (profile[field] !== undefined) {
    if (typeof profile[field] !== 'string' || profile[field].length === 0 || profile[field].length > 128) {
      throw new Error('BROWSER_AXE_PROFILE_INVALID');
    }
    context[field] = profile[field] as string;
  }
  for (const field of ['hasTouch', 'isMobile'] as const) if (profile[field] !== undefined) {
    if (typeof profile[field] !== 'boolean') throw new Error('BROWSER_AXE_PROFILE_INVALID');
    context[field] = profile[field] as boolean;
  }
  if (profile.deviceScaleFactor !== undefined) {
    if (typeof profile.deviceScaleFactor !== 'number' || !Number.isFinite(profile.deviceScaleFactor)
      || profile.deviceScaleFactor < 0.5 || profile.deviceScaleFactor > 4) throw new Error('BROWSER_AXE_PROFILE_INVALID');
    context.deviceScaleFactor = profile.deviceScaleFactor;
  }
  return { browser: profile.browser as BrowserName, context, name: profile.name };
}

async function mapBounded<T, R>(items: readonly T[], concurrency: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next; next += 1; results[index] = await run(items[index]!); }
  }));
  return results;
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(code)), milliseconds);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

export class BrowserAxeCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #options: BrowserAxeCapabilityInvokerOptions;
  readonly #origins: ReadonlySet<string>;

  constructor(options: BrowserAxeCapabilityInvokerOptions) {
    this.#options = options;
    this.#origins = new Set(options.allowedOrigins.map((origin) => canonicalOrigin(origin, 'BROWSER_AXE_ORIGIN_INVALID')));
    if (options.allowedBrowsers.length === 0 || options.allowedBrowsers.some((name) => !['chromium', 'firefox', 'webkit'].includes(name))) {
      throw new Error('BROWSER_AXE_BROWSER_POLICY_INVALID');
    }
    for (const [value, code, maximum] of [
      [options.maximumCombinations, 'BROWSER_AXE_COMBINATION_LIMIT_INVALID', 256],
      [options.maximumConcurrency, 'BROWSER_AXE_CONCURRENCY_INVALID', 16],
      [options.maximumExecutionMs, 'BROWSER_AXE_TIMEOUT_INVALID', 3_600_000],
      [options.maximumResultBytes, 'BROWSER_AXE_RESULT_LIMIT_INVALID', 64 * 1024 * 1024],
      [options.maximumScreenshots, 'BROWSER_AXE_SCREENSHOT_LIMIT_INVALID', 128],
      [options.maximumScreenshotBytes, 'BROWSER_AXE_SCREENSHOT_BYTES_INVALID', 16 * 1024 * 1024],
    ] as const) positiveInteger(value, code, maximum);
  }

  async invoke(capability: string, request: TestProviderCapabilityRequest, signal: AbortSignal,
    inputs: readonly ResolvedInputV1[] = []): Promise<Readonly<Record<string, unknown>>> {
    signal = fixtureAuthoritySignal(inputs, signal);
    if (capability !== 'browser.axe' || request.operation !== 'scan') throw new Error('BROWSER_AXE_OPERATION_DENIED');
    if (request.resource.type !== 'network.url') throw new Error('BROWSER_AXE_RESOURCE_INVALID');
    const target = new URL(request.resource.canonicalId); const allowed = new Set([...this.#origins, ...fixtureOrigins(inputs)]);
    if (!allowed.has(target.origin) || target.username || target.password) throw new Error('BROWSER_AXE_ORIGIN_DENIED');
    const payload = object(request.payload, 'BROWSER_AXE_REQUEST_INVALID');
    if (!Array.isArray(payload.combinations) || payload.combinations.length === 0
      || payload.combinations.length > this.#options.maximumCombinations) throw new Error('BROWSER_AXE_COMBINATION_LIMIT_EXCEEDED');
    const tags = stringArray(payload.tags, 'BROWSER_AXE_TAGS_INVALID', 32);
    const exclude = stringArray(payload.exclude ?? [], 'BROWSER_AXE_EXCLUDE_INVALID', 64);
    const timeoutMs = positiveInteger(payload.timeoutMs, 'BROWSER_AXE_TIMEOUT_INVALID', this.#options.maximumExecutionMs);
    const profiles = payload.combinations.map((raw) => {
      const combination = object(raw, 'BROWSER_AXE_COMBINATION_INVALID');
      if (typeof combination.route !== 'string' || !combination.route.startsWith('/')
        || combination.route.startsWith('//') || /[?#\r\n]/u.test(combination.route)) throw new Error('BROWSER_AXE_ROUTE_INVALID');
      const profile = profileOptions(combination.profile);
      if (!this.#options.allowedBrowsers.includes(profile.browser)) throw new Error('BROWSER_AXE_BROWSER_DENIED');
      return { route: combination.route, ...profile };
    });
    const browserTypes = { chromium, firefox, webkit } as const;
    const browsers = new Map<BrowserName, Browser>();
    const abort = () => { for (const browser of browsers.values()) void browser.close().catch(() => undefined); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      for (const name of new Set(profiles.map((profile) => profile.browser))) {
        const executablePath = this.#options.browserExecutables?.[name];
        browsers.set(name, await browserTypes[name].launch({
          headless: true,
          ...(name === 'firefox' ? { firefoxUserPrefs: { 'media.peerconnection.enabled': false } } : {}),
          ...(executablePath ? { executablePath } : {}),
        }));
      }
      let screenshotCount = 0; let screenshotBytes = 0;
      const results = await mapBounded(profiles, this.#options.maximumConcurrency, async (combination) => {
        if (signal.aborted) throw new Error('BROWSER_AXE_CANCELLED');
        const deadline = Date.now() + timeoutMs;
        const remaining = () => {
          const value = deadline - Date.now();
          if (value < 1) throw new Error('BROWSER_AXE_TIMEOUT_EXCEEDED');
          return value;
        };
        const browser = browsers.get(combination.browser)!; const context = await browser.newContext(combination.context);
        try {
          const blocked = new Set<string>();
          await context.addInitScript(disableWebRtc);
          await context.route('**/*', async (route) => {
            let url = route.request().url();
            if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') return route.continue();
            try { if (new URL(url).origin !== target.origin) throw new Error('origin denied'); }
            catch { blocked.add(url); return route.abort('blockedbyclient'); }
            for (let redirects = 0; redirects <= 10; redirects += 1) {
              const response = await route.fetch({ url, maxRedirects: 0 });
              const location = response.headers().location;
              if (response.status() < 300 || response.status() > 399 || !location) return route.fulfill({ response });
              const next = new URL(location, url);
              if (next.origin !== target.origin) {
                blocked.add(next.href); return route.abort('blockedbyclient');
              }
              url = next.href;
            }
            blocked.add(url); return route.abort('blockedbyclient');
          });
          await context.routeWebSocket('**/*', async (socket) => {
            if (webSocketMatchesOrigin(socket.url(), target.origin)) { socket.connectToServer(); return; }
            blocked.add(socket.url()); await socket.close({ code: 1008, reason: 'origin denied' });
          });
          const page = await context.newPage();
          const url = new URL(combination.route, `${target.origin}/`);
          try { await page.goto(url.href, { waitUntil: 'networkidle', timeout: remaining() }); }
          catch (error) {
            if (blocked.size) throw new Error('BROWSER_AXE_SUBRESOURCE_ORIGIN_DENIED');
            throw error;
          }
          if (blocked.size) throw new Error('BROWSER_AXE_SUBRESOURCE_ORIGIN_DENIED');
          let builder = new AxeBuilder({ page }).withTags(tags);
          for (const selector of exclude) builder = builder.exclude(selector);
          const axe = await withTimeout(builder.analyze(), remaining(), 'BROWSER_AXE_TIMEOUT_EXCEEDED');
          if (blocked.size) throw new Error('BROWSER_AXE_SUBRESOURCE_ORIGIN_DENIED');
          const screenshots: { selector: string; data: string }[] = [];
          for (const violation of axe.violations) for (const node of violation.nodes) {
            if (screenshotCount >= this.#options.maximumScreenshots) break;
            screenshotCount += 1;
            const selector = node.target?.[0]; if (typeof selector !== 'string') continue;
            try {
              const bytes = await page.locator(selector).first().screenshot({ type: 'png', timeout: Math.min(remaining(), 5000) });
              screenshotBytes += bytes.byteLength; if (screenshotBytes > this.#options.maximumScreenshotBytes) {
                throw new Error('BROWSER_AXE_SCREENSHOT_BYTES_EXCEEDED');
              }
              screenshots.push({ selector, data: bytes.toString('base64') });
            } catch (error) {
              if (error instanceof Error && error.message === 'BROWSER_AXE_SCREENSHOT_BYTES_EXCEEDED') throw error;
            }
          }
          return { route: combination.route, profile: combination.name, browser: combination.browser,
            browserVersion: browser.version(), context: combination.context, axe, screenshots };
        } finally { await context.close(); }
      });
      const response = { schemaVersion: 'browser-axe-result.v1', results };
      if (Buffer.byteLength(JSON.stringify(response)) > this.#options.maximumResultBytes) throw new Error('BROWSER_AXE_RESULT_BYTES_EXCEEDED');
      return response;
    } finally {
      signal.removeEventListener('abort', abort);
      await Promise.all([...browsers.values()].map((browser) => browser.close().catch(() => undefined)));
    }
  }
}
