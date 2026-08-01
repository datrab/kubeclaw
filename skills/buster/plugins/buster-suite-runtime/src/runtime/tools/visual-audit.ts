#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'process';
import { parseCliArgs } from '../cli-args.js';
import { BUSTER_CAPABILITIES, assertBusterCapabilities, parseCapabilitiesFromEnv } from '../services/capabilities.js';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { busterEnvironmentSnapshot, readBusterEnvironment } from '../buster-environment.js';
// KEEP_TYPED_POLICY: injectable browser/fetch/output/capabilities stay as direct
// caller adapter surface, CLI defaults to image while rejecting unknown modes,
// capture warnings converge on canonical missing-file errors, Bot auth header
// normalization is retained, and temp media dirs are cleaned on all exits.

type AnyRecord = Record<string, any>;
type AuditMode = 'image' | 'video';

interface VisualAuditOptions {
  chromiumImpl?: AnyRecord | null;
  fetchImpl?: typeof fetch;
  outputRoot?: string;
  capabilities?: string[];
  alertContext?: AnyRecord;
}

interface VisualAuditResult {
  status: 'success';
  target_url: string;
  mode: AuditMode;
  size_mb: string;
}

interface CapturedMedia {
  filePath: string;
  fileName: string;
  mimeType: string;
  message: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(selectTruthyValue(() => (error), () => ('missing_error_detail')));
}

async function loadChromium(): Promise<AnyRecord> {
  try {
    const mod = await import('playwright');
    return mod.chromium;
  } catch (_error) {
    throw new Error('playwright is not available in this environment');
  }
}

async function captureWithContext(context: AnyRecord, page: AnyRecord, url: string, mode: AuditMode, outputDir: string): Promise<CapturedMedia> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    if (mode === 'video') {
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight || 1000));
      await page.waitForTimeout(3000);
      await context.close();
      const videoFile = (fs.readdirSync(outputDir) as string[]).find((file) => file.endsWith('.webm'));
      if (!videoFile) throw new Error('Video could not be generated.');
      return { filePath: path.join(outputDir, videoFile), fileName: 'audit.webm', mimeType: 'video/webm', message: `🎥 **Visual Audit Video Report**\n**Target:** \`${url}\`` };
    }
    const filePath = path.join(outputDir, 'screenshot.png');
    await page.screenshot({ path: filePath, fullPage: true });
    await context.close();
    return { filePath, fileName: 'screenshot.png', mimeType: 'image/png', message: `📸 **Visual Audit Image Report**\n**Target:** \`${url}\`` };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

async function capturePageMedia(chromium: AnyRecord, url: string, mode: AuditMode, outputDir: string): Promise<CapturedMedia> {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const context = await browser.newContext(mode === 'video' ? { recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } } } : {});
    return await captureWithContext(context, await context.newPage(), url, mode, outputDir);
  } finally {
    if (browser.isConnected()) await browser.close();
  }
}

async function uploadAuditMedia(fetchImpl: typeof fetch, channelId: string, botToken: string, media: CapturedMedia): Promise<string> {
  if (!fs.existsSync(media.filePath)) throw new Error('Audit file was not created.');
  const sizeMb = fs.statSync(media.filePath).size / (1024 * 1024);
  if (sizeMb > 25) throw new Error(`File is ${sizeMb.toFixed(2)} MB — too large for Discord (max 25 MB).`);
  const formData = new FormData();
  formData.append('files[0]', new Blob([fs.readFileSync(media.filePath)], { type: media.mimeType }), media.fileName);
  formData.append('payload_json', JSON.stringify({ content: media.message }));
  const authHeader = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`;
  const response = await fetchImpl(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST', headers: { Authorization: authHeader }, body: formData,
  });
  if (!response.ok) throw new Error(`Discord API Fehler: ${response.status} ${await response.text()}`);
  return sizeMb.toFixed(2);
}

async function visualAudit(
  url: string,
  channelId: string,
  botToken: string,
  mode: AuditMode = 'image',
  {
    chromiumImpl = null,
    fetchImpl = globalThis.fetch,
    outputRoot = '/tmp',
    capabilities = parseCapabilitiesFromEnv(busterEnvironmentSnapshot(), 'BUSTER_CAPABILITIES'),
    alertContext = {},
  }: VisualAuditOptions = {},
): Promise<VisualAuditResult> {
  assertBusterCapabilities({ ...alertContext, capabilities }, {
    suite: 'visual-audit',
    action: 'capture and upload visual audit media',
    required: [BUSTER_CAPABILITIES.BROWSER_AUTOMATION, BUSTER_CAPABILITIES.DISCORD_MEDIA],
  });
  const chromiumRuntime = await chromiumRuntimeAuthority(chromiumImpl);
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputDir = fs.mkdtempSync(path.join(outputRoot, 'audit-'));

  console.error(`[Audit] 📸 Starting headless audit (${mode}) of ${url}...`);

  try {
    let media: CapturedMedia;
    try {
      media = await capturePageMedia(chromiumRuntime, url, mode, outputDir);
    } catch (error) {
      console.error(`[Audit] Warning while loading page: ${errorMessage(error)}`);
      throw new Error(`Audit file (${mode}) was not created.`);
    }
    const sizeMb = await uploadAuditMedia(fetchImpl, channelId, botToken, media);
    console.error(`[Audit] ✅ ${mode} sent successfully.`);
    return { status: 'success', target_url: url, mode, size_mb: sizeMb };
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

async function chromiumRuntimeAuthority(chromiumImpl: unknown): Promise<any> {
  if (chromiumImpl) return chromiumImpl;
  return loadChromium();
}

const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (currentPath === entryPath) {
  const { values: flags, positionals } = parseCliArgs(process.argv.slice(2), {
    allowPositionals: true,
    maxPositionals: 1,
    flags: {
      mode: { type: 'string', default: 'image' },
    },
  });
  const url = positionals[0];
  const mode = String(flags.mode);

  const channel = readBusterEnvironment('DISCORD_CHANNEL');
  const token = readBusterEnvironment('DISCORD_TOKEN');

  if (!url) {
    console.log(JSON.stringify({ status: 'error', error: 'URL required as parameter.' }));
    process.exit(1);
  }
  if (selectTruthyValue(() => (!channel), () => (!token))) {
    console.log(JSON.stringify({ status: 'error', error: 'DISCORD_TOKEN and DISCORD_CHANNEL are missing.' }));
    process.exit(1);
  }
  if (mode !== 'image' && mode !== 'video') {
    console.log(JSON.stringify({ status: 'error', error: "--mode must be 'image' or 'video'." }));
    process.exit(1);
  }

  visualAudit(String(url), String(channel), String(token), mode as AuditMode).then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  }).catch((error: unknown) => {
    console.log(JSON.stringify({ status: 'error', error: errorMessage(error) }));
    process.exit(1);
  });
}

export default visualAudit;
