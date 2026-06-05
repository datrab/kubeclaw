// pipeline/services/base-images.ts — typed base image reference validation and pre-pull orchestration
// Keeps podman image cache warmup outside the Buster task/queue orchestrator.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFile } from 'child_process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { promisify } from 'util';
import { safeErrorMessage } from './runtime-diagnostics.ts';
import { BUSTER_CAPABILITIES, assertBusterCapabilities, parseCapabilitiesEnv } from './capabilities.ts';
import { buildSubprocessEnv } from '../security.ts';

declare const process: {
  env: Record<string, string | undefined>;
};

interface ExecError extends Error {
  code?: number | string;
  stdout?: string;
  stderr?: string;
}

type ExecFileAsync = (command: string, args: string[], options?: Record<string, unknown>) => Promise<unknown>;

interface BaseImageValidationFailure {
  ok: false;
  reason: string;
}

interface BaseImageValidationSuccess {
  ok: true;
  value: string;
}

export type BaseImageValidationResult = BaseImageValidationSuccess | BaseImageValidationFailure;

export type BaseImagePrepullStatus = 'cached' | 'pulled' | 'skipped' | 'failed';

export interface BaseImagePrepullResult {
  image: string;
  status: BaseImagePrepullStatus;
  reason: string | null;
  detail: string | null;
}

export interface EnsureBaseImagesResult {
  ok: boolean;
  blocked: boolean;
  reason?: string;
  degraded: boolean;
  image_results: BaseImagePrepullResult[];
  failures: BaseImagePrepullResult[];
}

interface EnsureBaseImagesOptions {
  capabilities?: readonly string[];
  alertContext?: Record<string, unknown>;
  execFileAsync?: ExecFileAsync;
}

export const BASE_IMAGES_STATIC = Object.freeze([
  'docker.io/library/python:3.12-slim',
  'docker.io/library/python:3.11-slim',
  'docker.io/library/node:20-slim',
]);

const BASE_IMAGES = new Set<string>(BASE_IMAGES_STATIC);

const IMAGE_REF_RE = /^[a-z0-9]+(?:(?:[._-][a-z0-9]+)+|[a-z0-9]*)(?::[0-9]+)?(?:\/[a-z0-9]+(?:(?:[._-][a-z0-9]+)+|[a-z0-9]*))*?(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/;

const execFileAsyncDefault = promisify(execFile) as ExecFileAsync;

function hasExplicitRegistryComponent(imageRef: string): boolean {
  const registry = imageRef.split('/')[0] || '';
  return registry === 'localhost' || registry.includes('.') || registry.includes(':');
}

// DELETE_LEGACY: bare image names are no longer normalized to docker.io/library.
// Base-image inputs must already be fully qualified typed image references.
export function validateBaseImageRef(imageRef: unknown): BaseImageValidationResult {
  if (typeof imageRef !== 'string') return { ok: false, reason: 'not_string' };
  const value = imageRef.trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (value !== imageRef) return { ok: false, reason: 'surrounding_whitespace' };
  if (value.length > 255) return { ok: false, reason: 'too_long' };
  if (!IMAGE_REF_RE.test(value)) return { ok: false, reason: 'invalid_image_reference' };
  if (!value.includes('/')) return { ok: false, reason: 'not_fully_qualified' };
  if (!hasExplicitRegistryComponent(value)) return { ok: false, reason: 'not_fully_qualified' };
  return { ok: true, value };
}

function imageResult(image: string, status: BaseImagePrepullStatus, reason: string | null = null, detail: string | null = null): BaseImagePrepullResult {
  return { image, status, reason, detail };
}

function isExecError(error: unknown): error is ExecError {
  return Boolean(error) && typeof error === 'object';
}

function errorCode(error: unknown): number | string | null {
  return isExecError(error) && error.code !== undefined ? error.code : null;
}

function shouldSkipLocalImage(imageRef: string): boolean {
  return imageRef.startsWith('localhost/');
}

/**
 * Pre-pull missing base images at startup.
 *
 * KEEP_TYPED_POLICY: invalid and local-only image references are skipped during
 * cache warmup, and missing image-prepull capability is explicit/nonfatal.
 *
 * STRICTIFY_TS_SLICE: podman inspect/pull failures remain nonblocking but are
 * returned as typed degraded image-level failures instead of overall success.
 */
export async function ensureBaseImages(images: Iterable<unknown> = BASE_IMAGES, options: EnsureBaseImagesOptions = {}): Promise<EnsureBaseImagesResult> {
  const capabilities = options.capabilities ?? parseCapabilitiesEnv(process.env.BUSTER_PLATFORM_CAPABILITIES || '');
  try {
    assertBusterCapabilities({ ...(options.alertContext || {}), capabilities }, {
      suite: 'base-images',
      action: 'pre-pull Buster base images',
      required: [BUSTER_CAPABILITIES.IMAGE_PREPULL],
    });
  } catch (error: unknown) {
    console.warn(`[BASE_IMAGES] Capability denied: ${safeErrorMessage(error)}`);
    return {
      ok: false,
      blocked: true,
      reason: 'buster_capability_denied',
      degraded: false,
      image_results: [],
      failures: [],
    };
  }

  const runExecFile = options.execFileAsync || execFileAsyncDefault;
  const imageResults: BaseImagePrepullResult[] = [];

  console.log('[BASE_IMAGES] Ensuring base images are cached...');
  for (const img of images) {
    const validation = validateBaseImageRef(img);
    if (!validation.ok) {
      console.warn(`[BASE_IMAGES] Ignoring invalid image ${JSON.stringify(img)}: ${validation.reason}`);
      imageResults.push(imageResult(String(img ?? ''), 'skipped', validation.reason));
      continue;
    }
    const imageRef = validation.value;
    if (shouldSkipLocalImage(imageRef)) {
      imageResults.push(imageResult(imageRef, 'skipped', 'local_image_reference'));
      continue;
    }
    try {
      await runExecFile('podman', ['image', 'exists', imageRef], { timeout: 5000, env: buildSubprocessEnv() });
      console.log(`[BASE_IMAGES] ✅ ${imageRef} (cached)`);
      imageResults.push(imageResult(imageRef, 'cached'));
    } catch (existsError: unknown) {
      if (errorCode(existsError) !== 1) {
        const detail = safeErrorMessage(existsError);
        console.error(`[BASE_IMAGES] ❌ Failed to inspect ${imageRef}: ${detail}`);
        imageResults.push(imageResult(imageRef, 'failed', 'podman_inspect_failed', detail));
        continue;
      }
      console.log(`[BASE_IMAGES] ⬇️  Pulling ${imageRef}...`);
      try {
        await runExecFile('podman', ['pull', imageRef], { timeout: 300000, encoding: 'utf8', env: buildSubprocessEnv() });
        console.log(`[BASE_IMAGES] ✅ ${imageRef} (pulled)`);
        imageResults.push(imageResult(imageRef, 'pulled'));
      } catch (pullError: unknown) {
        const detail = safeErrorMessage(pullError);
        console.error(`[BASE_IMAGES] ❌ Failed to pull ${imageRef}: ${detail}`);
        imageResults.push(imageResult(imageRef, 'failed', 'podman_pull_failed', detail));
      }
    }
  }

  const failures = imageResults.filter((result) => result.status === 'failed');
  const degraded = failures.length > 0;
  console.log(degraded ? '[BASE_IMAGES] ⚠️ Pre-pull complete with degraded image cache.' : '[BASE_IMAGES] ✅ Pre-pull complete.');
  return {
    ok: !degraded,
    blocked: false,
    degraded,
    image_results: imageResults,
    failures,
  };
}
