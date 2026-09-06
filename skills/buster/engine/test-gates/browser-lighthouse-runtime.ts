import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import lighthouse from 'lighthouse';
import { Launcher } from 'chrome-launcher';
import type { ResolvedInputV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { TestProviderCapabilityInvoker } from './runner.ts';

type Purpose = 'performance' | 'seo' | 'best-practices';
type JsonObject = Record<string, unknown>;

export interface BrowserLighthouseCapabilityInvokerOptions {
  readonly allowedOrigins: readonly string[];
  readonly chromeExecutable: string;
  readonly maximumRuns: number;
  readonly maximumExecutionMs: number;
  readonly maximumResultBytes: number;
}

function object(value: unknown, code: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as JsonObject;
}

function integer(value: unknown, code: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error(code);
  return Number(value);
}

function finite(value: unknown, code: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function origin(value: string, code: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(code); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error(code);
  return parsed.origin;
}

function inputOrigins(inputs: readonly ResolvedInputV1[]): Set<string> {
  const result = new Set<string>();
  for (const input of inputs) {
    if (input.kind !== 'value' || !input.value || typeof input.value !== 'object' || Array.isArray(input.value)) continue;
    const value = input.value as JsonObject;
    if (input.schemaId === 'kubeclaw.public-endpoint-fixture@1' && typeof value.url === 'string') {
      try { result.add(new URL(value.url).origin); } catch { /* Invalid fixture data is not authority. */ }
    }
    if (input.schemaId === 'kubeclaw.kubernetes-deployment-fixture@1' && Array.isArray(value.endpoints)) {
      for (const endpoint of value.endpoints) if (endpoint && typeof endpoint === 'object'
        && typeof (endpoint as JsonObject).url === 'string') {
        try { result.add(new URL((endpoint as JsonObject).url as string).origin); } catch { /* Invalid fixture data is not authority. */ }
      }
    }
  }
  return result;
}

function profile(raw: unknown): { name: string; settings: JsonObject } {
  const value = object(raw, 'BROWSER_LIGHTHOUSE_PROFILE_INVALID');
  if (typeof value.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value.name)) {
    throw new Error('BROWSER_LIGHTHOUSE_PROFILE_INVALID');
  }
  if (!['mobile', 'desktop'].includes(String(value.formFactor))) throw new Error('BROWSER_LIGHTHOUSE_PROFILE_INVALID');
  const screen = object(value.screen, 'BROWSER_LIGHTHOUSE_PROFILE_INVALID');
  const throttling = object(value.throttling, 'BROWSER_LIGHTHOUSE_PROFILE_INVALID');
  const width = integer(screen.width, 'BROWSER_LIGHTHOUSE_PROFILE_INVALID', 240, 3840);
  const height = integer(screen.height, 'BROWSER_LIGHTHOUSE_PROFILE_INVALID', 240, 2160);
  const deviceScaleFactor = finite(screen.deviceScaleFactor, 'BROWSER_LIGHTHOUSE_PROFILE_INVALID', 0.5, 4);
  const mobile = screen.mobile;
  if (typeof mobile !== 'boolean') throw new Error('BROWSER_LIGHTHOUSE_PROFILE_INVALID');
  return { name: value.name, settings: {
    formFactor: value.formFactor,
    screenEmulation: { width, height, deviceScaleFactor, mobile, disabled: false },
    throttlingMethod: 'simulate',
    throttling: {
      rttMs: finite(throttling.rttMs, 'BROWSER_LIGHTHOUSE_PROFILE_INVALID', 0, 5000),
      throughputKbps: finite(throttling.throughputKbps, 'BROWSER_LIGHTHOUSE_PROFILE_INVALID', 1, 1_000_000),
      cpuSlowdownMultiplier: finite(throttling.cpuSlowdownMultiplier, 'BROWSER_LIGHTHOUSE_PROFILE_INVALID', 1, 32),
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    },
  } };
}

async function exactOriginProxy(targetOrigin: string): Promise<{
  readonly port: number;
  readonly denied: Set<string>;
  close(): Promise<void>;
}> {
  const target = new URL(targetOrigin); const denied = new Set<string>();
  const connectAuthority = lighthouseConnectAuthority(target);
  const server = http.createServer((request, response) => {
    let destination: URL;
    try { destination = new URL(request.url ?? '/', targetOrigin); } catch {
      response.writeHead(400).end(); return;
    }
    if (destination.origin !== targetOrigin) {
      denied.add(destination.href); response.writeHead(403).end(); return;
    }
    const transport = destination.protocol === 'https:' ? https : http;
    const upstream = transport.request(destination, {
      method: request.method,
      headers: Object.fromEntries(Object.entries(request.headers).filter(([name]) => name.toLowerCase() !== 'proxy-connection')),
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });
  server.on('connect', (request, socket, head) => {
    if (request.url !== connectAuthority) {
      denied.add(`connect://${request.url}`); socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
    }
    const upstream = net.connect(Number(target.port || 443), target.hostname, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
  });
  server.on('upgrade', (request, socket) => {
    denied.add(request.url ?? '<websocket>'); socket.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('BROWSER_LIGHTHOUSE_PROXY_FAILED');
  return { port: address.port, denied, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

export function lighthouseConnectAuthority(target: URL): string {
  const defaultPort = target.protocol === 'https:' ? '443' : '80';
  return `${target.hostname}:${target.port || defaultPort}`;
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('BROWSER_LIGHTHOUSE_TIMEOUT_EXCEEDED')), milliseconds);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

export class BrowserLighthouseCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #options: BrowserLighthouseCapabilityInvokerOptions;
  readonly #origins: ReadonlySet<string>;

  constructor(options: BrowserLighthouseCapabilityInvokerOptions) {
    this.#options = options;
    this.#origins = new Set(options.allowedOrigins.map((value) => origin(value, 'BROWSER_LIGHTHOUSE_ORIGIN_INVALID')));
    if (!fs.existsSync(options.chromeExecutable) || !pathIsExecutable(options.chromeExecutable)) {
      throw new Error('BROWSER_LIGHTHOUSE_EXECUTABLE_INVALID');
    }
    integer(options.maximumRuns, 'BROWSER_LIGHTHOUSE_RUN_LIMIT_INVALID', 1, 256);
    integer(options.maximumExecutionMs, 'BROWSER_LIGHTHOUSE_TIMEOUT_INVALID', 1000, 3_600_000);
    integer(options.maximumResultBytes, 'BROWSER_LIGHTHOUSE_RESULT_LIMIT_INVALID', 1024, 256 * 1024 * 1024);
  }

  async invoke(capability: string, request: TestProviderCapabilityRequest, signal: AbortSignal,
    inputs: readonly ResolvedInputV1[] = []): Promise<Readonly<Record<string, unknown>>> {
    if (capability !== 'browser.lighthouse' || request.operation !== 'audit') throw new Error('BROWSER_LIGHTHOUSE_OPERATION_DENIED');
    if (request.resource.type !== 'network.url') throw new Error('BROWSER_LIGHTHOUSE_RESOURCE_INVALID');
    const target = new URL(request.resource.canonicalId); const allowed = new Set([...this.#origins, ...inputOrigins(inputs)]);
    if (!allowed.has(target.origin) || target.username || target.password) throw new Error('BROWSER_LIGHTHOUSE_ORIGIN_DENIED');
    const payload = object(request.payload, 'BROWSER_LIGHTHOUSE_REQUEST_INVALID');
    if (!Array.isArray(payload.runs) || payload.runs.length === 0 || payload.runs.length > this.#options.maximumRuns) {
      throw new Error('BROWSER_LIGHTHOUSE_RUN_LIMIT_EXCEEDED');
    }
    const timeoutMs = integer(payload.timeoutMs, 'BROWSER_LIGHTHOUSE_TIMEOUT_INVALID', 1000, this.#options.maximumExecutionMs);
    const runs = payload.runs.map((raw) => {
      const run = object(raw, 'BROWSER_LIGHTHOUSE_RUN_INVALID');
      if (typeof run.route !== 'string' || !run.route.startsWith('/') || run.route.startsWith('//')
        || /[?#\r\n]/u.test(run.route)) throw new Error('BROWSER_LIGHTHOUSE_ROUTE_INVALID');
      if (!['performance', 'seo', 'best-practices'].includes(String(run.purpose))) throw new Error('BROWSER_LIGHTHOUSE_PURPOSE_INVALID');
      return { route: run.route, purpose: run.purpose as Purpose, profile: profile(run.profile) };
    });
    const proxy = await exactOriginProxy(target.origin); let chrome: Launcher | undefined;
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-lighthouse-'));
    const abort = () => { try { chrome?.kill(); } catch { /* Best-effort abort cleanup. */ } };
    signal.addEventListener('abort', abort, { once: true });
    try {
      chrome = new Launcher({ userDataDir: profileDirectory, chromePath: this.#options.chromeExecutable, chromeFlags: [
        '--headless=new', '--disable-gpu', '--disable-dev-shm-usage',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        `--proxy-server=http://127.0.0.1:${proxy.port}`, '--proxy-bypass-list=<-loopback>',
        ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      ] });
      try { await chrome.launch(); }
      catch (error) {
        const log = path.join(profileDirectory, 'chrome-err.log');
        let diagnostic = '';
        if (fs.existsSync(log)) {
          const descriptor = fs.openSync(log, 'r');
          try { const bytes = Buffer.alloc(16384); diagnostic = bytes.subarray(0, fs.readSync(descriptor, bytes, 0, bytes.length, 0)).toString('utf8'); }
          finally { fs.closeSync(descriptor); }
        }
        throw new Error(`BROWSER_LIGHTHOUSE_LAUNCH_FAILED:${error instanceof Error ? error.message : String(error)}:${diagnostic}`);
      }
      const results = [];
      for (const run of runs) {
        if (signal.aborted) throw new Error('BROWSER_LIGHTHOUSE_CANCELLED');
        const url = new URL(run.route, `${target.origin}/`);
        const startedAt = Date.now();
        const output = await withTimeout(lighthouse(url.href, {
          port: chrome.port, output: 'json', logLevel: 'silent', onlyCategories: [run.purpose],
        }, { extends: 'lighthouse:default', settings: run.profile.settings }), timeoutMs);
        if (!output) throw new Error('BROWSER_LIGHTHOUSE_RESULT_INVALID');
        if (proxy.denied.size) throw new Error('BROWSER_LIGHTHOUSE_SUBRESOURCE_ORIGIN_DENIED');
        results.push({ route: run.route, purpose: run.purpose, profile: run.profile.name,
          durationMs: Date.now() - startedAt, report: output.lhr });
      }
      const response = { schemaVersion: 'browser-lighthouse-result.v1', results };
      if (Buffer.byteLength(JSON.stringify(response)) > this.#options.maximumResultBytes) {
        throw new Error('BROWSER_LIGHTHOUSE_RESULT_BYTES_EXCEEDED');
      }
      return response;
    } finally {
      signal.removeEventListener('abort', abort);
      try { chrome?.kill(); } catch { /* Best-effort final cleanup. */ }
      await proxy.close();
      fs.rmSync(profileDirectory, { recursive: true, force: true });
    }
  }
}

function pathIsExecutable(file: string): boolean {
  try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
}
