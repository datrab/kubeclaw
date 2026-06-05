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
import { BUSTER_CAPABILITIES, assertBusterCapabilities, parseCapabilitiesEnv } from '../services/capabilities.ts';

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

async function loadChromium(): Promise<AnyRecord> {
  try {
    // @ts-expect-error Optional runtime dependency declaration is not installed for this migration island.
    const mod = await import('playwright');
    return mod.chromium;
  } catch (_error) {
    throw new Error('playwright is not available in this environment');
  }
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
    capabilities = parseCapabilitiesEnv(process.env.BUSTER_CAPABILITIES || ''),
    alertContext = {},
  }: VisualAuditOptions = {},
): Promise<VisualAuditResult> {
  assertBusterCapabilities({ ...alertContext, capabilities }, {
    suite: 'visual-audit',
    action: 'capture and upload visual audit media',
    required: [BUSTER_CAPABILITIES.BROWSER_AUTOMATION, BUSTER_CAPABILITIES.DISCORD_MEDIA],
  });
  const chromiumRuntime = chromiumImpl || await loadChromium();
  const isVideo = mode === 'video';
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputDir = fs.mkdtempSync(path.join(outputRoot, 'audit-'));

  console.error(`[Audit] 📸 Starting headless audit (${mode}) of ${url}...`);

  try {
    const browser = await chromiumRuntime.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    let fileToSend: string | null = null;
    let fileName = '';
    let mimeType = '';
    let messageContent = '';

    try {
      const contextOptions = isVideo ? { recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } } } : {};
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

        if (isVideo) {
          await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight || 1000));
          await page.waitForTimeout(3000);
          await context.close();

          const files: string[] = fs.readdirSync(outputDir);
          const videoFile = files.find((file) => file.endsWith('.webm'));
          if (!videoFile) throw new Error('Video could not be generated.');

          fileToSend = path.join(outputDir, videoFile);
          fileName = 'audit.webm';
          mimeType = 'video/webm';
          messageContent = `🎥 **Visual Audit Video Report**\n**Target:** \`${url}\``;
        } else {
          fileToSend = path.join(outputDir, 'screenshot.png');
          await page.screenshot({ path: fileToSend, fullPage: true });
          await context.close();

          fileName = 'screenshot.png';
          mimeType = 'image/png';
          messageContent = `📸 **Visual Audit Image Report**\n**Target:** \`${url}\``;
        }
      } catch (error) {
        console.error(`[Audit] Warning while loading page: ${errorMessage(error)}`);
      }
    } finally {
      if (browser.isConnected()) await browser.close();
    }

    if (!fileToSend || !fs.existsSync(fileToSend)) {
      throw new Error(`Audit file (${mode}) was not created.`);
    }

    const stats = fs.statSync(fileToSend);
    const fileSizeMB = stats.size / (1024 * 1024);

    console.error(`[Audit] 🚀 File generated (${fileSizeMB.toFixed(2)} MB). Sending to Discord...`);

    if (fileSizeMB > 25) {
      throw new Error(`File is ${fileSizeMB.toFixed(2)} MB — too large for Discord (max 25 MB).`);
    }

    const fileBuffer = fs.readFileSync(fileToSend);
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('files[0]', blob, fileName);
    formData.append('payload_json', JSON.stringify({ content: messageContent }));

    const authHeader = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`;
    const res = await fetchImpl(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: formData,
    });

    if (!res.ok) throw new Error(`Discord API Fehler: ${res.status} ${await res.text()}`);

    console.error(`[Audit] ✅ ${mode} sent successfully.`);
    return { status: 'success', target_url: url, mode, size_mb: fileSizeMB.toFixed(2) };
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
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

  const channel = process.env.DISCORD_CHANNEL;
  const token = process.env.DISCORD_TOKEN;

  if (!url) {
    console.log(JSON.stringify({ status: 'error', error: 'URL required as parameter.' }));
    process.exit(1);
  }
  if (!channel || !token) {
    console.log(JSON.stringify({ status: 'error', error: 'DISCORD_TOKEN and DISCORD_CHANNEL are missing.' }));
    process.exit(1);
  }
  if (mode !== 'image' && mode !== 'video') {
    console.log(JSON.stringify({ status: 'error', error: "--mode must be 'image' or 'video'." }));
    process.exit(1);
  }

  visualAudit(String(url), channel, token, mode as AuditMode).then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  }).catch((error: unknown) => {
    console.log(JSON.stringify({ status: 'error', error: errorMessage(error) }));
    process.exit(1);
  });
}

export default visualAudit;
