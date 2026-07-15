// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFile } from 'child_process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { promisify } from 'util';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import os from 'os';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { buildSubprocessEnv } from '../security.ts';

type SuiteLog = (msg: string) => void;

export type ImagePromotionEvidence = {
  sourceImageId: string | null;
  registryDigest: string | null;
};

const execFileAsync = promisify(execFile) as any;

function parseImageDigest(output: string): string | null {
  const match = String(output || '').match(/(?:digest:\s*)?(sha256:[a-f0-9]{64})/i);
  return match ? match[1] : null;
}

async function inspectImageId(image: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('podman', ['image', 'inspect', '--format', '{{.Id}}', image], { timeout: 10000, encoding: 'utf8', env: buildSubprocessEnv() });
    const value = String(stdout || '').trim();
    return value || null;
  } catch {
    return null;
  }
}

export async function pushImage(localTag: string, registryTag: string, timeoutMs: number, log: SuiteLog): Promise<void> {
  log(`Tagging: ${localTag} → ${registryTag}`);
  await execFileAsync('podman', ['tag', localTag, registryTag], { timeout: 10000, encoding: 'utf8', env: buildSubprocessEnv() });
  log(`Pushing: ${registryTag}`);
  const { stdout, stderr } = await execFileAsync('podman', ['push', '--tls-verify=false', registryTag], { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, env: buildSubprocessEnv() });
  log(`Push: ${`${stdout}${stderr}`.trim().split('\n').slice(-3).join(' | ')}`);
}

async function pushImageWithDigest(localTag: string, registryTag: string, timeoutMs: number, log: SuiteLog): Promise<{ registryDigest: string | null }> {
  log(`Tagging: ${localTag} → ${registryTag}`);
  await execFileAsync('podman', ['tag', localTag, registryTag], { timeout: 10000, encoding: 'utf8', env: buildSubprocessEnv() });
  log(`Pushing: ${registryTag}`);
  const digestFile = path.join(os.tmpdir(), `buster-push-digest-${process.pid}-${Date.now()}.txt`);
  try {
    const { stdout, stderr } = await execFileAsync('podman', ['push', '--tls-verify=false', '--digestfile', digestFile, registryTag], { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, env: buildSubprocessEnv() });
    const digestText = fs.existsSync(digestFile) ? fs.readFileSync(digestFile, 'utf8') : '';
    const output = `${stdout}${stderr}\n${digestText}`;
    log(`Push: ${output.trim().split('\n').slice(-3).join(' | ')}`);
    return { registryDigest: parseImageDigest(output) };
  } finally {
    try { fs.rmSync(digestFile, { force: true }); } catch {}
  }
}

export async function promoteSourceImage(sourceImage: string, registryTag: string, timeoutMs: number, log: SuiteLog): Promise<ImagePromotionEvidence> {
  log(`Promoting source image: ${sourceImage} → ${registryTag}`);
  await execFileAsync('podman', ['image', 'exists', sourceImage], { timeout: 10000, encoding: 'utf8', env: buildSubprocessEnv() });
  const sourceImageId = await inspectImageId(sourceImage);
  const { registryDigest } = await pushImageWithDigest(sourceImage, registryTag, timeoutMs, log);
  return { sourceImageId, registryDigest };
}
