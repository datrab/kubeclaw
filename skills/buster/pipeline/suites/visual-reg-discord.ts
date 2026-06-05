// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { Buffer } from 'buffer';
import { STATUS } from '../services/verdict-schema.ts';
import type { SuiteStatus } from '../services/verdict-schema.ts';
import { deliverDiscordWebhookRequest } from '../services/discord.ts';

// KEEP_TYPED_POLICY: Discord media upload is optional, noncritical, and bounded
// to Discord-friendly embed/file limits. Delivery failures must not replace the
// visual-reg verdict authority.

const DEFAULT_DISCORD_DIFF_THRESHOLD = 2;

type LogFn = (msg: string) => void;
type AnyRecord = Record<string, any>;

interface DeliveryContextOptions {
  deliveryContext?: AnyRecord | null;
  telemetryContext?: unknown;
}

interface DiscordOptions extends DeliveryContextOptions {
  webhookUrl?: string;
  discordDiffThreshold?: number;
  log?: LogFn;
}

export interface VisualDiscordDeliveryResult {
  status: 'skipped_no_webhook' | 'skipped_capability' | 'sent' | 'failed_noncritical';
  sent: boolean;
  error?: string;
}

interface VisualPageResult {
  name: string;
  status: SuiteStatus;
  diffPercent: number | null;
  diffPath?: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'discord delivery failed');
}

function deliverySkippedNoWebhook(): VisualDiscordDeliveryResult {
  return { status: 'skipped_no_webhook', sent: false };
}

export function deliverySkippedCapability(error: unknown): VisualDiscordDeliveryResult {
  return { status: 'skipped_capability', sent: false, error: errorMessage(error) };
}

function deliverySent(): VisualDiscordDeliveryResult {
  return { status: 'sent', sent: true };
}

function deliveryFailed(error: unknown): VisualDiscordDeliveryResult {
  return { status: 'failed_noncritical', sent: false, error: errorMessage(error) };
}

function buildDeliveryContext(moduleId: string, options: DeliveryContextOptions = {}): AnyRecord {
  const deliveryContext = options.deliveryContext || {};
  return {
    ...deliveryContext,
    module_id: deliveryContext.module_id ?? moduleId,
    telemetry_context: options.telemetryContext ?? deliveryContext.telemetry_context ?? null,
  };
}

export async function discordSummary(
  moduleId: string,
  pageResults: VisualPageResult[],
  overallStatus: SuiteStatus,
  enforced: boolean,
  { webhookUrl = '', discordDiffThreshold = DEFAULT_DISCORD_DIFF_THRESHOLD, log = () => {}, deliveryContext = null, telemetryContext = null }: DiscordOptions = {},
): Promise<VisualDiscordDeliveryResult> {
  if (!webhookUrl) return deliverySkippedNoWebhook();
  try {
    const icon = overallStatus === STATUS.PASS ? '✅' : '⚠️';
    const passCount = pageResults.filter((p) => p.status === STATUS.PASS).length;
    const failCount = pageResults.filter((p) => p.status === STATUS.FAIL).length;
    const skipCount = pageResults.filter((p) => p.status === STATUS.SKIP || p.status === STATUS.ERROR).length;

    const lines = pageResults.map((p) => {
      const si = p.status === STATUS.PASS ? '✅'
        : p.status === STATUS.FAIL ? '❌'
          : p.status === STATUS.SKIP ? '⏭️' : '⚠️';
      const diff = p.diffPercent != null ? `${p.diffPercent}%` : '—';
      return `${si} **${p.name}** — ${diff}`;
    });

    const embed: AnyRecord = {
      title: `${icon} Visual Regression: Module ${moduleId}`,
      color: overallStatus === STATUS.PASS ? 5763719 : 16776960,
      description: [
        `**${passCount}** pass · **${failCount}** fail · **${skipCount}** skip`,
        `Mode: ${enforced ? 'enforced' : 'evidence-only'}`,
        '',
        lines.join('\n'),
      ].join('\n'),
      footer: { text: `Buster Visual-Reg • ${pageResults.length} pages • ${new Date().toISOString()}` },
    };

    const attachments: Array<{ path: string; filename: string }> = [];
    pageResults.forEach((p) => {
      if ((p.diffPercent ?? 0) > discordDiffThreshold && p.diffPath && fs.existsSync(p.diffPath)) {
        attachments.push({ path: p.diffPath, filename: `diff-${p.name}.png` });
      }
    });

    if (attachments.length > 0 && attachments.length <= 4) {
      embed.image = { url: `attachment://${attachments[0]!.filename}` };
    }

    const boundary = `----VisRegSummary${Date.now()}`;
    const embedJson = JSON.stringify({ embeds: [embed] });
    const bodyParts = [Buffer.from(
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="payload_json"\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      embedJson,
      'utf8',
    )];

    const maxAttach = Math.min(attachments.length, 10);
    for (let i = 0; i < maxAttach; i += 1) {
      const att = attachments[i]!;
      bodyParts.push(Buffer.from(
        `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="files[${i}]"; filename="${att.filename}"\r\n` +
        'Content-Type: image/png\r\n\r\n',
        'utf8',
      ));
      bodyParts.push(fs.readFileSync(att.path));
    }

    bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));

    await deliverDiscordWebhookRequest({
      webhook_url: webhookUrl,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat(bodyParts),
    }, buildDeliveryContext(moduleId, { deliveryContext, telemetryContext }));

    log(`Discord: summary sent (${pageResults.length} pages, ${maxAttach} diff images attached)`);
    return deliverySent();
  } catch (error) {
    log(`Discord summary failed (non-critical): ${errorMessage(error)}`);
    return deliveryFailed(error);
  }
}

export async function discordSingle(
  moduleId: string,
  pageName: string,
  actualPath: string,
  diffPath: string | null,
  diffPercent: number,
  status: SuiteStatus | 'APP_SCREENSHOT' | 'NEW_BASELINE',
  { webhookUrl = '', log = () => {}, deliveryContext = null, telemetryContext = null }: DiscordOptions = {},
): Promise<VisualDiscordDeliveryResult> {
  if (!webhookUrl) return deliverySkippedNoWebhook();
  try {
    const boundary = `----VisRegBoundary${Date.now()}`;
    const icon = status === 'APP_SCREENSHOT' ? '📸'
      : status === 'NEW_BASELINE' ? '🆕'
        : status === STATUS.PASS ? '✅'
          : status === STATUS.FAIL ? '❌' : '📸';
    const isAppShot = status === 'APP_SCREENSHOT';
    const isBaseline = status === 'NEW_BASELINE';

    const embedJson = JSON.stringify({
      embeds: [{
        title: `${icon} ${isAppShot ? 'Live App' : 'Visual Regression'}: ${pageName} (${moduleId})`,
        color: isAppShot ? 5793266 : isBaseline ? 3447003 : (diffPercent === 0 ? 5763719 : (diffPercent > 5 ? 15548997 : 16776960)),
        description: isAppShot
          ? 'Current state of the running application.'
          : isBaseline
            ? 'New baseline generated from HTML design reference.'
            : diffPercent === 0
              ? 'Pixel-perfect match with baseline.'
              : `**${diffPercent}%** pixel difference detected.`,
        fields: [
          { name: 'Page', value: pageName, inline: true },
          { name: 'Status', value: isAppShot ? 'Live' : isBaseline ? 'Baseline' : status, inline: true },
          ...(!isAppShot && !isBaseline ? [{ name: 'Diff', value: `${diffPercent}%`, inline: true }] : []),
        ],
        image: { url: 'attachment://screenshot.png' },
        footer: { text: `Buster Visual-Reg • ${new Date().toISOString()}` },
      }],
    });

    const bodyParts = [
      Buffer.from(
        `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="payload_json"\r\n' +
        'Content-Type: application/json\r\n\r\n' +
        embedJson,
        'utf8',
      ),
      Buffer.from(
        `\r\n--${boundary}\r\n` +
        'Content-Disposition: form-data; name="files[0]"; filename="screenshot.png"\r\n' +
        'Content-Type: image/png\r\n\r\n',
        'utf8',
      ),
      fs.readFileSync(actualPath),
    ];

    if (diffPath && diffPercent > 0 && fs.existsSync(diffPath)) {
      bodyParts.push(Buffer.from(
        `\r\n--${boundary}\r\n` +
        'Content-Disposition: form-data; name="files[1]"; filename="diff.png"\r\n' +
        'Content-Type: image/png\r\n\r\n',
        'utf8',
      ));
      bodyParts.push(fs.readFileSync(diffPath));
    }

    bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));

    await deliverDiscordWebhookRequest({
      webhook_url: webhookUrl,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat(bodyParts),
    }, buildDeliveryContext(moduleId, { deliveryContext, telemetryContext }));

    log(`Discord: ${pageName} sent`);
    return deliverySent();
  } catch (error) {
    log(`Discord screenshot failed (non-critical): ${errorMessage(error)}`);
    return deliveryFailed(error);
  }
}
