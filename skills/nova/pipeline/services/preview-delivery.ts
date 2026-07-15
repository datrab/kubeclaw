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
  source_type: 'gate';
  module_id: '';
  gate_id: string | null;
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
  credential_state: 'revealed' | 'command_available' | 'secret_ref_available' | 'not_configured' | 'configured_unavailable';
  cleanup_policy: string | null;
  unavailable_reason: string | null;
};

export class FinalPreviewDeliveryError extends Error {
  failure_class: string;
  details: AnyRecord;

  constructor(message: string, { failureClass, details = {}, cause = null }: { failureClass: string; details?: AnyRecord; cause?: unknown }) {
    super(message);
    this.name = 'FinalPreviewDeliveryError';
    this.failure_class = failureClass;
    this.details = details;
    if (cause !== null) {
      (this as AnyRecord).cause = cause;
    }
  }
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath: string): AnyRecord {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new FinalPreviewDeliveryError(`Final preview verdict JSON is invalid: ${filePath}`, {
      failureClass: 'final_preview_verdict_invalid',
      details: { verdict_path: filePath },
      cause: error,
    });
  }
}

function gateOutputFile(config: AnyRecord = {}, gateConfig: AnyRecord = {}): string | null {
  const outputFile = typeof gateConfig?.output_file === 'string' && gateConfig.output_file.trim()
    ? gateConfig.output_file.trim()
    : null;
  if (!outputFile) return null;
  if (path.isAbsolute(outputFile)) return fs.existsSync(outputFile) ? outputFile : null;
  const swarmDir = typeof config?.paths?.swarm_dir === 'string' && config.paths.swarm_dir.trim()
    ? config.paths.swarm_dir.trim()
    : null;
  if (!swarmDir) return null;
  const candidate = path.join(swarmDir, outputFile);
  return fs.existsSync(candidate) ? candidate : null;
}

function k8sVerdictFromFile(filePath: string): AnyRecord | null {
  const parsed = readJson(filePath);
  if (parsed.suite === 'k8s') return parsed;
  if (isRecord(parsed.suites?.k8s)) return parsed.suites.k8s;
  return null;
}

function previewCredentialLabel(key: string): string {
  const normalized = String(key == null ? '' : key).toLowerCase();
  if (/(?:user|login|email)/.test(normalized)) return 'Login ID';
  if (/(?:pass|token|secret|api[_-]?key|key|code)/.test(normalized)) return 'Access Code';
  const keyText = String(key == null ? '' : key).trim();
  const label = keyText ? keyText : 'Credential';
  return label
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasUsableCredentials(credentials: unknown): boolean {
  if (typeof credentials === 'string') return Boolean(credentials.trim());
  if (!isRecord(credentials)) return false;
  return Object.values(credentials).some((value) => value !== null && value !== undefined && value !== '');
}

function credentialState({ credentials, command, ref, available }: AnyRecord): FinalPreviewDelivery['credential_state'] {
  if (hasUsableCredentials(credentials)) return 'revealed';
  if (typeof command === 'string' && command.trim()) return 'command_available';
  if (available === true && typeof ref === 'string' && ref.trim()) return 'secret_ref_available';
  if (!ref && available !== true) return 'not_configured';
  return 'configured_unavailable';
}

function deliveryFromVerdict(gateId: string, sourceConfig: AnyRecord, verdict: AnyRecord): FinalPreviewDelivery {
  const metadata = isRecord(verdict.metadata) ? verdict.metadata : {};
  if (metadata.purpose !== 'final-preview') {
    throw new FinalPreviewDeliveryError('Final preview delivery requires a final-buster k8s verdict with metadata.purpose set to final-preview', {
      failureClass: 'final_preview_verdict_not_final_preview',
      details: { gate_id: gateId },
    });
  }
  const rawCredentials = metadata.preview_credentials;
  const credentialsRef = typeof metadata.preview_credentials_ref === 'string' && metadata.preview_credentials_ref.trim()
    ? metadata.preview_credentials_ref.trim()
    : null;
  const credentialsCommand = typeof metadata.preview_credentials_command === 'string' && metadata.preview_credentials_command.trim()
    ? metadata.preview_credentials_command.trim()
    : null;
  const credentialsAvailable = metadata.preview_credentials_available === true;
  const credentials = hasUsableCredentials(rawCredentials) ? rawCredentials : null;
  return {
    source_type: 'gate',
    module_id: '',
    gate_id: gateId,
    title: typeof sourceConfig?.title === 'string' ? sourceConfig.title : null,
    preview_url: typeof metadata.preview_url === 'string' && metadata.preview_url ? metadata.preview_url : null,
    service_url: typeof metadata.service_url === 'string' && metadata.service_url ? metadata.service_url : null,
    namespace: typeof metadata.test_namespace === 'string' ? metadata.test_namespace : null,
    exposure_phase: typeof metadata.preview_exposure_phase === 'string' ? metadata.preview_exposure_phase : null,
    exposure_hostname: typeof metadata.preview_exposure_hostname === 'string' ? metadata.preview_exposure_hostname : null,
    credentials_ref: credentialsRef,
    credentials_available: credentialsAvailable,
    credentials_command: credentialsCommand,
    credentials,
    credential_state: credentialState({
      credentials,
      command: credentialsCommand,
      ref: credentialsRef,
      available: credentialsAvailable,
    }),
    cleanup_policy: typeof metadata.cleanup_policy === 'string' ? metadata.cleanup_policy : null,
    unavailable_reason: null,
  };
}

function finalPreviewExpected(sourceConfig: AnyRecord): boolean {
  const k8s = isRecord(sourceConfig?.test_config?.k8s) ? sourceConfig.test_config.k8s : {};
  const preview = isRecord(k8s.preview) ? k8s.preview : {};
  return [
    k8s.purpose === 'final-preview',
    preview.provider === 'tailscale-ingress',
    k8s.preview_exposure_provider === 'tailscale-ingress',
  ].some(Boolean);
}

function missingDelivery(gateId: string, sourceConfig: AnyRecord, unavailableReason: string): FinalPreviewDelivery {
  return {
    source_type: 'gate',
    module_id: '',
    gate_id: gateId,
    title: typeof sourceConfig?.title === 'string' ? sourceConfig.title : null,
    preview_url: null,
    service_url: null,
    namespace: null,
    exposure_phase: 'not recorded',
    exposure_hostname: null,
    credentials_ref: null,
    credentials_available: false,
    credentials_command: null,
    credentials: null,
    credential_state: 'not_configured',
    cleanup_policy: null,
    unavailable_reason: unavailableReason,
  };
}

export function collectFinalPreviewDeliveries(config: AnyRecord = {}, progress: AnyRecord = {}): FinalPreviewDelivery[] {
  const gateId = 'final-buster';
  const gateConfig = isRecord(progress?.gates?.[gateId]) ? progress.gates[gateId] : null;
  if (!gateConfig) return [];
  if (!finalPreviewExpected(gateConfig)) return [];
  const outputFile = gateOutputFile(config, gateConfig);
  if (outputFile) {
    const verdict = k8sVerdictFromFile(outputFile);
    if (verdict) return [deliveryFromVerdict(gateId, gateConfig, verdict)];
  }
  return [missingDelivery(gateId, gateConfig, 'final-buster output_file verdict was not recorded')];
}

function requireRunId(config: AnyRecord): string {
  const runId = typeof config?._runId === 'string' && config._runId.trim()
    ? config._runId.trim()
    : typeof config?.run_id === 'string' && config.run_id.trim()
      ? config.run_id.trim()
      : null;
  if (!runId) {
    throw new FinalPreviewDeliveryError('Final preview delivery requires a run id', {
      failureClass: 'final_preview_run_id_missing',
    });
  }
  return runId;
}

function requirePreviewUrl(delivery: FinalPreviewDelivery): string {
  if (delivery.preview_url) return delivery.preview_url;
  throw new FinalPreviewDeliveryError('Final preview URL is missing from final-buster k8s verdict metadata', {
    failureClass: 'final_preview_url_missing',
    details: {
      gate_id: delivery.gate_id,
      reason: delivery.unavailable_reason,
    },
  });
}

function credentialStateLabel(delivery: FinalPreviewDelivery): string {
  switch (delivery.credential_state) {
    case 'revealed':
      return 'Credentials revealed below';
    case 'command_available':
      return 'Credential command available';
    case 'secret_ref_available':
      return 'Credentials available in Kubernetes Secret';
    case 'not_configured':
      return 'No credentials configured';
    case 'configured_unavailable':
      return 'Configured credentials unavailable';
    default:
      throw new FinalPreviewDeliveryError(`Unsupported final preview credential state: ${String(delivery.credential_state)}`, {
        failureClass: 'final_preview_credential_state_invalid',
        details: { credential_state: delivery.credential_state },
      });
  }
}

function gateLabel(delivery: FinalPreviewDelivery): string {
  if (!delivery.gate_id) {
    throw new FinalPreviewDeliveryError('Final preview delivery requires a gate id', {
      failureClass: 'final_preview_gate_id_missing',
    });
  }
  return delivery.title ? `${delivery.gate_id} - ${delivery.title}` : delivery.gate_id;
}

export async function deliverFinalPreviews(config: AnyRecord = {}, progress: AnyRecord = {}, opts: AnyRecord = {}): Promise<FinalPreviewDelivery[]> {
  const deliveries = collectFinalPreviewDeliveries(config, progress);
  if (!deliveries.length) return deliveries;

  let sendDiscord = defaultDiscord;
  if (typeof opts.deps?.pipelineRunner?.discord === 'function') {
    sendDiscord = opts.deps.pipelineRunner.discord;
  }
  if (typeof opts.discord === 'function') {
    sendDiscord = opts.discord;
  }
  const runId = requireRunId(config);
  for (const delivery of deliveries) {
    const previewUrl = requirePreviewUrl(delivery);
    const previewCredentials = formatPreviewCredentialsForDiscord(delivery.credentials);
    const credentialCommand = formatPreviewCredentialCommandForDiscord(delivery.credentials_command);
    const fields = [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, {
        run_id: runId,
        module_id: null,
        gate_id: delivery.gate_id,
      }),
      { name: 'Gate', value: gateLabel(delivery), inline: false },
      { name: 'Preview URL', value: previewUrl, inline: false },
      { name: 'Credential State', value: credentialStateLabel(delivery), inline: false },
      ...(previewCredentials ? [{ name: 'Preview Login', value: previewCredentials, inline: false }] : []),
      ...(credentialCommand ? [{ name: 'Credential Command', value: credentialCommand, inline: false }] : []),
      ...(delivery.exposure_phase ? [{ name: 'Exposure', value: delivery.exposure_phase, inline: true }] : []),
      ...(delivery.namespace ? [{ name: 'Namespace', value: delivery.namespace, inline: true }] : []),
      ...(delivery.cleanup_policy ? [{ name: 'Cleanup', value: delivery.cleanup_policy, inline: true }] : []),
      ...(delivery.credentials_ref ? [{ name: 'Credential Ref', value: delivery.credentials_ref, inline: false }] : []),
    ];
    try {
      await sendDiscord(
        config,
        'OK',
        `Final Preview Ready: ${typeof config.project === 'string' && config.project.trim() ? config.project.trim() : delivery.gate_id}`,
        'The final deployment is still running and is available on your tailnet.',
        fields,
        { correlation: { run_id: runId, gate_id: delivery.gate_id } },
      );
    } catch (error) {
      throw new FinalPreviewDeliveryError(`Final preview Discord delivery failed: ${errorMessage(error)}`, {
        failureClass: 'final_preview_delivery_failed',
        details: { gate_id: delivery.gate_id },
        cause: error,
      });
    }
  }
  return deliveries;
}
