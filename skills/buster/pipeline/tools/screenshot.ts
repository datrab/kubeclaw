#!/usr/bin/env node
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { fileURLToPath } from 'url';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import process from 'process';
import { parseCliArgs } from '../cli-args.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// KEEP_TYPED_POLICY: Docker and runtime-installed Playwright browser layouts are
// both supported, local HTML previews are valid screenshot inputs, missing
// Playwright becomes a clear tool error, browser close failures are nonblocking,
// and batch result shape remains deterministic.
// DELETE_LEGACY: Prism/setup route special-casing is removed. Page JavaScript
// errors during screenshot/baseline capture now fail the capture instead of
// producing blessed broken baselines.

const processEnv = process.env;
if (!processEnv.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/ms-playwright')) {
  processEnv.PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright';
}

const DEFAULTS = {
  viewport: { width: 1280, height: 720 },
  fullPage: true,
  waitUntil: 'networkidle',
  timeout: 15000,
  settleMs: 400,
};

type AnyRecord = Record<string, any>;

export interface ScreenshotViewport {
  width: number;
  height: number;
}

export interface ScreenshotOptions {
  viewport?: ScreenshotViewport;
  fullPage?: boolean;
  waitUntil?: string;
  timeout?: number;
}

interface ResolvedScreenshotOptions {
  viewport: ScreenshotViewport;
  fullPage: boolean;
  waitUntil: string;
  timeout: number;
}

export interface ScreenshotResult {
  name?: string;
  ok: boolean;
  path?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface ScreenshotBatchTarget {
  name: string;
  url: string;
  outputPath: string;
}

interface BaselineRoute {
  name: string;
  nav: string;
  path: string;
}

interface BaselineRouteResult extends BaselineRoute {
  ok: boolean;
  width?: number;
  height?: number;
  error?: string;
}

export interface BaselineGenerationResult {
  ok: boolean;
  routes: BaselineRouteResult[];
  error?: string;
  pathsJsonPath?: string;
  generated?: number;
  failed?: number;
}

function log(msg: string): void {
  console.log(`[SCREENSHOT] ${msg}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(selectTruthyValue(() => (error), () => ('missing_error_detail')));
}

function requireViewport(value: unknown, label: string): ScreenshotViewport {
  const record = value as AnyRecord;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!record), () => (typeof record !== 'object'))), () => (Array.isArray(record)))) {
    throw new Error(`${label}.viewport is required`);
  }
  const width = Number(record.width);
  const height = Number(record.height);
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!Number.isInteger(width)), () => (width <= 0))), () => (!Number.isInteger(height)))), () => (height <= 0))) {
    throw new Error(`${label}.viewport requires positive integer width and height`);
  }
  return { width, height };
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} is required`);
  return value;
}

function requirePositiveNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(parsed)), () => (parsed <= 0))) throw new Error(`${label} is required`);
  return parsed;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) throw new Error(`${label} is required`);
  return value;
}

function resolveScreenshotOptions(opts: ScreenshotOptions, label: string): ResolvedScreenshotOptions {
  return {
    viewport: requireViewport(opts.viewport, label),
    fullPage: requireBoolean(opts.fullPage, `${label}.fullPage`),
    waitUntil: requireNonEmptyString(opts.waitUntil, `${label}.waitUntil`),
    timeout: requirePositiveNumber(opts.timeout, `${label}.timeout`),
  };
}

function resolveBaselineOptions(opts: ScreenshotOptions & { settleMs?: number }): ResolvedScreenshotOptions & { settleMs: number } {
  return {
    ...resolveScreenshotOptions(opts, 'generateBaselines options'),
    settleMs: requirePositiveNumber(opts.settleMs, 'generateBaselines options.settleMs'),
  };
}

function childFilePath(dir: string, fileName: string, label = 'screenshot output'): string {
  const raw = String(selectDefinedValue(() => (fileName), () => ('')));
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!raw), () => (raw.includes('/')))), () => (raw.includes('\\')))), () => (raw.includes('\0')))) {
    throw new Error(`${label} must be a file name inside ${dir}`);
  }
  const resolvedDir = path.resolve(dir);
  const resolved = path.resolve(resolvedDir, raw);
  const relative = path.relative(resolvedDir, resolved);
  if (selectTruthyValue(() => (relative.startsWith('..')), () => (path.isAbsolute(relative)))) {
    throw new Error(`${label} escapes output directory: ${raw}`);
  }
  return resolved;
}

function resolveUrl(input: string): string {
  if (/^https?:\/\//.test(input)) return input;

  const abs = path.isAbsolute(input) ? input : path.resolve(input);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  return `file://${abs}`;
}

async function launchBrowser(): Promise<AnyRecord> {
  try {
    // @ts-expect-error Optional runtime dependency declaration is not installed for this migration island.
    const mod = await import('playwright');
    return mod.chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  } catch (_error) {
    throw new Error('playwright is not available in this environment');
  }
}

async function getPageDimensions(page: AnyRecord): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
}

function attachFailOnPageError(page: AnyRecord): string[] {
  const pageErrors: string[] = [];
  page.on('pageerror', (err: unknown) => {
    const message = errorMessage(err);
    pageErrors.push(message);
    log(`PAGE JS ERROR: ${message}`);
  });
  return pageErrors;
}

function assertNoPageErrors(pageErrors: string[], label: string): void {
  if (pageErrors.length > 0) {
    throw new Error(`${label} produced ${pageErrors.length} page JavaScript error(s): ${pageErrors.slice(0, 3).join('; ')}`);
  }
}

export async function takeScreenshot(target: string, outputPath: string, opts: ScreenshotOptions = {}): Promise<ScreenshotResult> {
  const { viewport, fullPage, waitUntil, timeout } = resolveScreenshotOptions(opts, 'takeScreenshot options');

  let browser: AnyRecord | null = null;
  try {
    const url = resolveUrl(target);
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    browser = await launchBrowser();
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const pageErrors = attachFailOnPageError(page);

    await page.goto(url, { waitUntil, timeout });
    assertNoPageErrors(pageErrors, target);
    await page.screenshot({ path: outputPath, fullPage });
    assertNoPageErrors(pageErrors, target);

    const dimensions = await getPageDimensions(page);
    await context.close();

    log(`OK: ${target} → ${outputPath} (${dimensions.width}x${dimensions.height})`);
    return { ok: true, path: outputPath, width: dimensions.width, height: dimensions.height };
  } catch (error) {
    const message = errorMessage(error);
    log(`FAIL: ${target} → ${message}`);
    return { ok: false, error: message };
  } finally {
    if (browser) await browser.close().catch((error: unknown) => log(`non-blocking browser close failed: ${errorMessage(error)}`));
  }
}

export async function takeScreenshotBatch(targets: ScreenshotBatchTarget[], opts: ScreenshotOptions = {}): Promise<ScreenshotResult[]> {
  const { viewport, fullPage, waitUntil, timeout } = resolveScreenshotOptions(opts, 'takeScreenshotBatch options');

  if (selectTruthyValue(() => (!targets), () => (targets.length === 0))) return [];

  const results: ScreenshotResult[] = [];
  let browser: AnyRecord | null = null;

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport });

    for (const target of targets) {
      let page: AnyRecord | null = null;
      try {
        const outDir = path.dirname(target.outputPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const currentPage: AnyRecord = await context.newPage();
        page = currentPage;
        const pageErrors = attachFailOnPageError(currentPage);
        await currentPage.goto(target.url, { waitUntil, timeout });
        assertNoPageErrors(pageErrors, target.name);
        await currentPage.screenshot({ path: target.outputPath, fullPage });
        assertNoPageErrors(pageErrors, target.name);

        const dimensions = await getPageDimensions(currentPage);
        await currentPage.close();

        log(`OK: ${target.name} → ${target.outputPath} (${dimensions.width}x${dimensions.height})`);
        results.push({ name: target.name, ok: true, path: target.outputPath, width: dimensions.width, height: dimensions.height });
      } catch (error) {
        const message = errorMessage(error);
        log(`FAIL: ${target.name} (${target.url}) → ${message}`);
        results.push({ name: target.name, ok: false, error: message });
        if (page) await page.close().catch(() => {});
      }
    }

    await context.close();
  } catch (error) {
    const message = errorMessage(error);
    log(`Browser-level error: ${message}`);
    for (const target of targets) {
      if (!results.find((r) => r.name === target.name)) {
        results.push({ name: target.name, ok: false, error: `Browser error: ${message}` });
      }
    }
  } finally {
    if (browser) await browser.close().catch((error: unknown) => log(`non-blocking browser close failed: ${errorMessage(error)}`));
  }

  return results;
}

export function parseBaselineRoutes(htmlPath: string): BaselineRoute[] {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script\s+type="application\/json"\s+data-routes\s*>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('No <script data-routes> manifest found in HTML');
  const parsed = JSON.parse(match[1]);
  if (selectTruthyValue(() => (!Array.isArray(parsed)), () => (parsed.length === 0))) throw new Error('data-routes manifest is empty or not an array');

  return parsed.map((route: unknown, index: number) => {
    const record = route as AnyRecord;
    if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!record), () => (typeof record.name !== 'string'))), () => (typeof record.nav !== 'string'))), () => (typeof record.path !== 'string'))) {
      throw new Error(`Invalid route entry at index ${index}: name, nav, and path are required`);
    }
    if (!record.path.startsWith('/')) {
      throw new Error(`Invalid route entry at index ${index}: path must start with /`);
    }
    return { name: record.name, nav: record.nav, path: record.path };
  });
}

export async function generateBaselines(htmlPath: string, outputDir: string, opts: ScreenshotOptions & { settleMs?: number } = {}): Promise<BaselineGenerationResult> {
  const { viewport, fullPage, waitUntil, timeout, settleMs } = resolveBaselineOptions(opts);

  let routes: BaselineRoute[];
  try {
    routes = parseBaselineRoutes(htmlPath);
  } catch (error) {
    return { ok: false, routes: [], error: `Failed to parse data-routes: ${errorMessage(error)}` };
  }

  log(`Found ${routes.length} routes in data-routes manifest`);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  let browser: AnyRecord | null = null;
  const results: BaselineRouteResult[] = [];

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const pageErrors = attachFailOnPageError(page);
    const url = `file://${htmlPath}?baselines=true`;

    await page.goto(url, { waitUntil, timeout });
    assertNoPageErrors(pageErrors, 'baseline preview load');
    log('Preview loaded with ?baselines=true');

    for (const route of routes) {
      try {
        const errorsBeforeClick = pageErrors.length;
        const navSelector = `text="${route.nav}"`;
        await page.waitForSelector(navSelector, { state: 'visible', timeout: 5000 });
        await page.click(navSelector);
        await page.waitForTimeout(settleMs);
        if (pageErrors.length > errorsBeforeClick) {
          throw new Error(`JS error after clicking "${route.nav}": ${pageErrors[pageErrors.length - 1]}`);
        }

        const pngPath = childFilePath(outputDir, `${route.name}-baseline.png`, 'visual-reg baseline file');
        await page.screenshot({ path: pngPath, fullPage });
        assertNoPageErrors(pageErrors, route.name);
        const dims = await getPageDimensions(page);

        log(`OK: ${route.name} ("${route.nav}") → ${pngPath}`);
        results.push({ name: route.name, nav: route.nav, path: route.path, ok: true, width: dims.width, height: dims.height });
      } catch (error) {
        const message = errorMessage(error);
        log(`FAIL: ${route.name} ("${route.nav}") → ${message}`);
        results.push({ name: route.name, nav: route.nav, path: route.path, ok: false, error: message });
      }
    }

    await context.close();
  } catch (error) {
    return { ok: false, routes: results, error: `Browser error: ${errorMessage(error)}` };
  } finally {
    if (browser) await browser.close().catch((error: unknown) => log(`non-blocking browser close failed: ${errorMessage(error)}`));
  }

  const pathsJson = routes.map((route) => ({ name: route.name, nav: route.nav, path: route.path }));
  const pathsJsonPath = path.join(outputDir, 'paths.json');
  fs.writeFileSync(pathsJsonPath, JSON.stringify(pathsJson, null, 2));
  log(`paths.json written: ${pathsJsonPath} (${pathsJson.length} routes)`);

  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;
  log(`Baselines complete: ${successCount} OK, ${failCount} failed out of ${routes.length}`);

  return { ok: failCount === 0, routes: results, pathsJsonPath, generated: successCount, failed: failCount };
}

const __currentFile = fs.realpathSync(fileURLToPath(import.meta.url));
const __entryFile = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (__currentFile === __entryFile) {
  const { values: flags, positionals } = parseCliArgs(process.argv.slice(2), {
    allowPositionals: true,
    maxPositionals: 2,
    flags: {
      'generate-baselines': { type: 'boolean', default: false },
      width: { type: 'string', default: String(DEFAULTS.viewport.width) },
      height: { type: 'string', default: String(DEFAULTS.viewport.height) },
      'no-fullpage': { type: 'boolean', default: false },
    },
  });

  if (flags['generate-baselines']) {
    const htmlPath = positionals[0];
    const outputDir = positionals[1];

    if (selectTruthyValue(() => (!htmlPath), () => (!outputDir))) {
      console.error('Usage: node screenshot.ts --generate-baselines <preview.html> <output-dir/>');
      process.exit(2);
    }

    const absHtml = path.isAbsolute(String(htmlPath)) ? String(htmlPath) : path.resolve(String(htmlPath));
    const absDir = path.isAbsolute(String(outputDir)) ? String(outputDir) : path.resolve(String(outputDir));
    const width = Number.parseInt(String(flags.width), 10);
    const height = Number.parseInt(String(flags.height), 10);

    generateBaselines(absHtml, absDir, {
      viewport: { width, height },
      fullPage: !flags['no-fullpage'],
      waitUntil: DEFAULTS.waitUntil,
      timeout: DEFAULTS.timeout,
      settleMs: DEFAULTS.settleMs,
    }).then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    }).catch((error: unknown) => {
      console.error(`Fatal: ${errorMessage(error)}`);
      process.exit(2);
    });
  } else {
    const target = positionals[0];
    const outputPath = positionals[1];

    if (selectTruthyValue(() => (!target), () => (!outputPath))) {
      console.error('Usage: node screenshot.ts <target> <output.png> [--width N] [--height N] [--no-fullpage]');
      console.error('       node screenshot.ts --generate-baselines <preview.html> <output-dir/>');
      process.exit(2);
    }

    const width = Number.parseInt(String(flags.width), 10);
    const height = Number.parseInt(String(flags.height), 10);
    const fullPage = !flags['no-fullpage'];

    takeScreenshot(String(target), String(outputPath), {
      viewport: { width, height },
      fullPage,
      waitUntil: DEFAULTS.waitUntil,
      timeout: DEFAULTS.timeout,
    }).then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    }).catch((error: unknown) => {
      console.error(`Fatal: ${errorMessage(error)}`);
      process.exit(2);
    });
  }
}
