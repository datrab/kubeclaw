// Final-preview delivery is artifact-driven: Buster owns live verification and
// records URLs in k8s verdict metadata; Nova only announces completed previews.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { discord as defaultDiscord } from '../integrations/discord.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from './discord-fields.ts';

type AnyRecord = Record<string, any>;

export type FinalPreviewDelivery = {
  module_id: string;
  title: string | null;
  preview_url: string | null;
  service_url: string | null;
  namespace: string | null;
  exposure_phase: string | null;
  exposure_hostname: string | null;
  credentials_ref: string | null;
  credentials_available: boolean;
  credentials_command: string | null;
  credentials: AnyRecord | string | null;
  cleanup_policy: string | null;
};

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath: string): AnyRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function existingDir(...segments: string[]): string | null {
  const dir = path.join(...segments);
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? dir : null;
}

function moduleTestDirs(config: AnyRecord = {}, moduleDir: string): string[] {
  const candidates = [
    config?.paths?.modules_dir ? existingDir(config.paths.modules_dir, moduleDir, 'tests') : null,
    config?.paths?.modules_dir ? existingDir(config.paths.modules_dir, moduleDir, 'test-results') : null,
    config?.paths?.swarm_dir ? existingDir(config.paths.swarm_dir, 'modules', moduleDir, 'tests') : null,
    config?.paths?.swarm_dir ? existingDir(config.paths.swarm_dir, 'modules', moduleDir, 'test-results') : null,
  ];
  return [...new Set(candidates.filter(Boolean) as string[])];
}

function newestVerdictFile(dir: string): string | null {
  const entries = fs.readdirSync(dir)
    .filter((name) => /^(?:runner-verdict|verdict|k8s-verdict)(?:-attempt-\d+)?\.json$/.test(name))
    .map((name) => {
      const filePath = path.join(dir, name);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries[0]?.filePath || null;
}

function k8sVerdictFromFile(filePath: string): AnyRecord | null {
  const parsed = readJson(filePath);
  if (!parsed) return null;
  if (parsed.suite === 'k8s') return parsed;
  if (isRecord(parsed.suites?.k8s)) return parsed.suites.k8s;
  return null;
}

function previewCredentialLabel(key: string): string {
  const normalized = String(key || '').toLowerCase();
  if (/(?:user|login|email)/.test(normalized)) return 'Login ID';
  if (/(?:pass|token|secret|api[_-]?key|key|code)/.test(normalized)) return 'Access Code';
  return String(key || 'Value')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncateDiscordFieldValue(value: string, max = 950): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function formatPreviewCredentialsForDiscord(credentials: AnyRecord | string | null | undefined): string | null {
  if (!credentials) return null;
  if (typeof credentials === 'string') {
    const trimmed = credentials.trim();
    return trimmed ? truncateDiscordFieldValue(trimmed) : null;
  }
  if (!isRecord(credentials)) return null;
  const lines = Object.entries(credentials)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${previewCredentialLabel(key)}: ${String(value)}`);
  return lines.length ? truncateDiscordFieldValue(lines.join('\n')) : null;
}

export function formatPreviewCredentialCommandForDiscord(command: string | null | undefined): string | null {
  if (typeof command !== 'string') return null;
  const trimmed = command.trim();
  return trimmed ? truncateDiscordFieldValue(`\`\`\`bash\n${trimmed}\n\`\`\``) : null;
}

function deliveryFromVerdict(moduleId: string, moduleConfig: AnyRecord, verdict: AnyRecord): FinalPreviewDelivery | null {
  const metadata = isRecord(verdict.metadata) ? verdict.metadata : {};
  const rawCredentials = metadata.preview_credentials;
  if (metadata.purpose !== 'final-preview' && !metadata.preview_url) return null;
  return {
    module_id: moduleId,
    title: typeof moduleConfig?.title === 'string' ? moduleConfig.title : null,
    preview_url: typeof metadata.preview_url === 'string' && metadata.preview_url ? metadata.preview_url : null,
    service_url: typeof metadata.service_url === 'string' && metadata.service_url ? metadata.service_url : null,
    namespace: typeof metadata.test_namespace === 'string' ? metadata.test_namespace : null,
    exposure_phase: typeof metadata.preview_exposure_phase === 'string' ? metadata.preview_exposure_phase : null,
    exposure_hostname: typeof metadata.preview_exposure_hostname === 'string' ? metadata.preview_exposure_hostname : null,
    credentials_ref: typeof metadata.preview_credentials_ref === 'string' ? metadata.preview_credentials_ref : null,
    credentials_available: metadata.preview_credentials_available === true,
    credentials_command: typeof metadata.preview_credentials_command === 'string' ? metadata.preview_credentials_command : null,
    credentials: typeof rawCredentials === 'string' || isRecord(rawCredentials) ? rawCredentials : null,
    cleanup_policy: typeof metadata.cleanup_policy === 'string' ? metadata.cleanup_policy : null,
  };
}

export function collectFinalPreviewDeliveries(config: AnyRecord = {}, progress: AnyRecord = {}): FinalPreviewDelivery[] {
  const deliveries: FinalPreviewDelivery[] = [];
  for (const [moduleId, moduleConfig] of Object.entries(progress?.modules || {}) as [string, AnyRecord][]) {
    const moduleDir = typeof moduleConfig?.dir === 'string' && moduleConfig.dir ? moduleConfig.dir : moduleId;
    for (const testsDir of moduleTestDirs(config, moduleDir)) {
      const verdictPath = newestVerdictFile(testsDir);
      if (!verdictPath) continue;
      const verdict = k8sVerdictFromFile(verdictPath);
      if (!verdict) continue;
      const delivery = deliveryFromVerdict(moduleId, moduleConfig, verdict);
      if (delivery) deliveries.push(delivery);
      break;
    }
  }
  return deliveries;
}

export async function deliverFinalPreviews(config: AnyRecord = {}, progress: AnyRecord = {}, opts: AnyRecord = {}): Promise<FinalPreviewDelivery[]> {
  const deliveries = collectFinalPreviewDeliveries(config, progress);
  if (!deliveries.length) return deliveries;

  const sendDiscord = opts.discord || opts.deps?.pipelineRunner?.discord || defaultDiscord;
  for (const delivery of deliveries) {
    const previewCredentials = formatPreviewCredentialsForDiscord(delivery.credentials);
    const credentialCommand = formatPreviewCredentialCommandForDiscord(delivery.credentials_command);
    const fields = [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, {
        run_id: config?._runId ?? config?.run_id ?? 'unknown',
        module_id: delivery.module_id,
      }),
      { name: 'Module', value: delivery.title ? `${delivery.module_id} — ${delivery.title}` : delivery.module_id, inline: false },
      { name: 'Preview URL', value: delivery.preview_url || 'pending', inline: false },
      ...(previewCredentials ? [{ name: 'Preview Login', value: previewCredentials, inline: false }] : []),
      ...(credentialCommand ? [{ name: 'Credential Command', value: credentialCommand, inline: false }] : []),
      { name: 'Exposure', value: delivery.exposure_phase || 'unknown', inline: true },
      { name: 'Namespace', value: delivery.namespace || 'unknown', inline: true },
      { name: 'Cleanup', value: delivery.cleanup_policy || 'unknown', inline: true },
      ...(delivery.credentials_available && !credentialCommand ? [{ name: 'Credentials', value: 'Available in Kubernetes Secret', inline: false }] : []),
      ...(delivery.credentials_ref ? [{ name: 'Credential Ref', value: delivery.credentials_ref, inline: false }] : []),
    ];
    await sendDiscord(
      config,
      delivery.preview_url ? 'OK' : 'WARN',
      `Final Preview Ready: ${config.project ?? delivery.module_id}`,
      delivery.preview_url
        ? 'The final deployment is still running and is available on your tailnet.'
        : 'The final deployment is still running, but the tailnet URL is not ready yet.',
      fields,
      { correlation: { run_id: config?._runId ?? config?.run_id ?? null, module_id: delivery.module_id } },
    );
  }
  return deliveries;
}
