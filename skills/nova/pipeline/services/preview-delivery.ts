// Final-preview delivery is artifact-driven: Buster owns live verification and
// records URLs in k8s verdict metadata; Nova only announces completed previews.

import fs from 'fs';
import path from 'path';

import { discord as defaultDiscord } from '../integrations/discord.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from './discord-fields.ts';
import {
  formatPreviewCredentialCommandForDiscord,
  formatPreviewCredentialsForDiscord,
} from './preview-credential-format.ts';
export {
  formatPreviewCredentialCommandForDiscord,
  formatPreviewCredentialsForDiscord,
} from './preview-credential-format.ts';

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
  } catch (error: any) {
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasUsableCredentials(credentials: unknown): boolean {
  if (typeof credentials === 'string') return Boolean(credentials.trim());
  if (!isRecord(credentials)) return false;
  return Object.values(credentials).some((value: any) => value !== null && value !== undefined && value !== '');
}

function credentialState({ credentials, command, ref, available }: AnyRecord): FinalPreviewDelivery['credential_state'] {
  if (hasUsableCredentials(credentials)) return 'revealed';
  if (typeof command === 'string' && command.trim()) return 'command_available';
  if (available === true && typeof ref === 'string' && ref.trim()) return 'secret_ref_available';
  if (!ref && available !== true) return 'not_configured';
  return 'configured_unavailable';
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
  const credentialsRef = optionalString(metadata.preview_credentials_ref);
  const credentialsCommand = optionalString(metadata.preview_credentials_command);
  const credentialsAvailable = metadata.preview_credentials_available === true;
  const credentials = hasUsableCredentials(rawCredentials) ? rawCredentials : null;
  return {
    source_type: 'gate',
    module_id: '',
    gate_id: gateId,
    title: optionalString(sourceConfig?.title),
    preview_url: optionalString(metadata.preview_url),
    service_url: optionalString(metadata.service_url),
    namespace: optionalString(metadata.test_namespace),
    exposure_phase: optionalString(metadata.preview_exposure_phase),
    exposure_hostname: optionalString(metadata.preview_exposure_hostname),
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
    cleanup_policy: optionalString(metadata.cleanup_policy),
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

function previewDiscordSender(opts: AnyRecord) {
  if (typeof opts.discord === 'function') return opts.discord;
  if (typeof opts.deps?.pipelineRunner?.discord === 'function') {
    return opts.deps.pipelineRunner.discord;
  }
  return defaultDiscord;
}

function previewDiscordFields(delivery: FinalPreviewDelivery, runId: string) {
  const previewCredentials = formatPreviewCredentialsForDiscord(delivery.credentials);
  const credentialCommand = formatPreviewCredentialCommandForDiscord(delivery.credentials_command);
  const optionalFields = [
    ['Preview Login', previewCredentials, false],
    ['Credential Command', credentialCommand, false],
    ['Exposure', delivery.exposure_phase, true],
    ['Namespace', delivery.namespace, true],
    ['Cleanup', delivery.cleanup_policy, true],
    ['Credential Ref', delivery.credentials_ref, false],
  ] as const;
  return [
    ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, {
      run_id: runId,
      module_id: null,
      gate_id: delivery.gate_id,
    }),
    { name: 'Gate', value: gateLabel(delivery), inline: false },
    { name: 'Preview URL', value: requirePreviewUrl(delivery), inline: false },
    { name: 'Credential State', value: credentialStateLabel(delivery), inline: false },
    ...optionalFields
      .filter(([, value]) => Boolean(value))
      .map(([name, value, inline]) => ({ name, value: value as string, inline })),
  ];
}

async function sendFinalPreview(
  sendDiscord: typeof defaultDiscord,
  config: AnyRecord,
  delivery: FinalPreviewDelivery,
  runId: string,
): Promise<void> {
  try {
    await sendDiscord(
      config,
      'OK',
      `Final Preview Ready: ${optionalString(config.project) ?? delivery.gate_id}`,
      'The final deployment is still running and is available on your tailnet.',
      previewDiscordFields(delivery, runId),
      { correlation: { run_id: runId, gate_id: delivery.gate_id } },
    );
  } catch (error: unknown) {
    if (error instanceof FinalPreviewDeliveryError) throw error;
    throw new FinalPreviewDeliveryError(`Final preview Discord delivery failed: ${errorMessage(error)}`, {
      failureClass: 'final_preview_delivery_failed',
      details: { gate_id: delivery.gate_id },
      cause: error,
    });
  }
}

export async function deliverFinalPreviews(config: AnyRecord = {}, progress: AnyRecord = {}, opts: AnyRecord = {}): Promise<FinalPreviewDelivery[]> {
  const deliveries = collectFinalPreviewDeliveries(config, progress);
  if (!deliveries.length) return deliveries;

  const sendDiscord = previewDiscordSender(opts);
  const runId = requireRunId(config);
  for (const delivery of deliveries) {
    await sendFinalPreview(sendDiscord, config, delivery, runId);
  }
  return deliveries;
}
