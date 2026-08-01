import fs from 'fs';
import path from 'path';
import { selectDefinedValue } from '../optional-absence.js';
import { createFinding, SEVERITY, STATUS } from '../services/verdict-schema.js';
import type { Finding, SuiteStatus } from '../services/verdict-schema.js';
import { takeScreenshotBatch } from '../tools/screenshot.js';
import type { ScreenshotBatchTarget, ScreenshotResult } from '../tools/screenshot.js';
import { suiteErrorMessage as errorMessage, suiteNonEmptyString as nonEmptyString } from './support.js';
import { compareImages } from './visual-reg-image.js';

type AnyRecord = Record<string, any>;
type Log = (message: string) => void;
export interface VisualPathEntry { name: string; path: string; nav?: string }
export interface PageResult { name: string; status: SuiteStatus; diffPercent: number | null; diffCount?: number; diffPath?: string | null; actualPath?: string; baselinePath?: string; canvasSize?: string; error?: string }
export interface MultiPathResult { findings: Finding[]; pageResults: PageResult[]; checksTotal: number; checksPassed: number; checksFailed: number }
export interface MultiPathInput {
  context: AnyRecord; pathsJson: VisualPathEntry[]; baselineDir: string; artifactDir: string; baseUrl: string;
  pmThreshold: number; thresholds: AnyRecord | null; enforced: boolean; viewport: () => { width: number; height: number };
  fullPage: boolean; baselinePath: (name: string) => string; outputPath: (name: string, suffix: string) => string; log: Log;
}

function recordFailure(result: MultiPathResult, name: string, message: string, rule: string, severity: Finding['severity'] = SEVERITY.MODERATE): void {
  result.pageResults.push({ name, status: STATUS.ERROR, diffPercent: null, diffPath: null, error: message });
  result.findings.push(createFinding(severity, `${name}: ${message}`, { rule }));
  result.checksFailed += 1;
}

function screenshotTargets(input: MultiPathInput, result: MultiPathResult, unsafe: Set<string>): ScreenshotBatchTarget[] {
  const targets: ScreenshotBatchTarget[] = [];
  for (const entry of input.pathsJson) {
    try { targets.push({ name: entry.name, url: `${input.baseUrl}${entry.path}`, outputPath: input.outputPath(entry.name, 'actual') }); }
    catch (error) {
      unsafe.add(entry.name);
      recordFailure(result, entry.name, `unsafe visual-reg artifact name — ${errorMessage(error)}`, 'path-boundary');
      result.checksTotal += 1;
    }
  }
  return targets;
}

function copyArtifacts(context: AnyRecord, entry: VisualPathEntry, actualPath: string, diffPath: string, log: Log): void {
  if (!context.screenshotsDir) return;
  try {
    fs.mkdirSync(context.screenshotsDir, { recursive: true });
    const attempt = selectDefinedValue(() => context.attempt, () => 1);
    if (fs.existsSync(actualPath)) fs.copyFileSync(actualPath, path.join(context.screenshotsDir, `${entry.name}-actual-attempt-${attempt}.png`));
    if (fs.existsSync(diffPath)) fs.copyFileSync(diffPath, path.join(context.screenshotsDir, `${entry.name}-diff-attempt-${attempt}.png`));
  } catch (error) { log(`non-blocking visual artifact fan-out failed: ${errorMessage(error)}`); }
}

async function comparePage(input: MultiPathInput, entry: VisualPathEntry, shot: ScreenshotResult, result: MultiPathResult): Promise<void> {
  const baselinePath = input.baselinePath(entry.name);
  const actualPath = input.outputPath(entry.name, 'actual');
  const diffPath = input.outputPath(entry.name, 'diff');
  if (!fs.existsSync(baselinePath)) {
    recordFailure(result, entry.name, `missing explicit reviewed baseline at ${baselinePath}`, 'baseline-required', SEVERITY.SERIOUS);
    return;
  }
  let comparison;
  try { comparison = await compareImages(baselinePath, actualPath, diffPath, input.pmThreshold); }
  catch (error) { recordFailure(result, entry.name, `comparison failed — ${errorMessage(error)}`, 'compare-error'); return; }
  const maxDiff = selectDefinedValue(() => input.thresholds?.max_diff_percent, () => 0);
  const status = input.enforced && comparison.diffPercent > maxDiff ? STATUS.FAIL : STATUS.PASS;
  if (status === STATUS.PASS) result.checksPassed += 1; else result.checksFailed += 1;
  result.pageResults.push({ name: entry.name, status, diffPercent: comparison.diffPercent, diffCount: comparison.diffCount,
    diffPath: comparison.diffPercent > 0 ? diffPath : null, actualPath, baselinePath, canvasSize: `${comparison.width}x${comparison.height}` });
  if (comparison.diffPercent > 0) {
    const severity = comparison.diffPercent > 10 ? SEVERITY.SERIOUS : comparison.diffPercent > 2 ? SEVERITY.MODERATE : SEVERITY.MINOR;
    result.findings.push(createFinding(severity, `${entry.name}: ${comparison.diffPercent}% diff (${comparison.diffCount} pixels)`, { rule: 'pixel-diff', file: diffPath }));
    if (comparison.baselineWidth !== shot.width || comparison.baselineHeight !== shot.height) result.findings.push(createFinding(SEVERITY.MODERATE, `${entry.name}: size mismatch — baseline ${comparison.baselineWidth}x${comparison.baselineHeight}, actual ${shot.width}x${shot.height}`, { rule: 'size-mismatch' }));
  }
  copyArtifacts(input.context, entry, actualPath, diffPath, input.log);
}

async function processPage(input: MultiPathInput, entry: VisualPathEntry, screenshots: ScreenshotResult[], result: MultiPathResult): Promise<void> {
  result.checksTotal += 1;
  const shot = screenshots.find((candidate) => candidate.name === entry.name);
  if (!shot?.ok) {
    recordFailure(result, entry.name, `screenshot failed — ${nonEmptyString(shot?.error) ?? 'Screenshot not taken'}`, 'screenshot-error');
    return;
  }
  try { await comparePage(input, entry, shot, result); }
  catch (error) { recordFailure(result, entry.name, `unsafe visual-reg artifact name — ${errorMessage(error)}`, 'path-boundary'); }
}

export async function runMultiPath(input: MultiPathInput): Promise<MultiPathResult> {
  fs.mkdirSync(input.artifactDir, { recursive: true });
  const result: MultiPathResult = { findings: [], pageResults: [], checksTotal: 0, checksPassed: 0, checksFailed: 0 };
  const unsafe = new Set<string>();
  const targets = screenshotTargets(input, result, unsafe);
  const screenshots = targets.length === 0 ? [] : await takeScreenshotBatch(targets, { viewport: input.viewport(), fullPage: input.fullPage, waitUntil: 'networkidle', timeout: 15000 });
  for (const entry of input.pathsJson) if (!unsafe.has(entry.name)) await processPage(input, entry, screenshots, result);
  return result;
}
