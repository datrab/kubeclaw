// Canonical Buster image-build authority. BuildKit builds and publishes in one
// operation; callers receive the registry digest and deploy only that digest.
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { buildSubprocessEnv } from '../security.js';
import { validateImageReference } from './image-reference.js';
import { readBusterEnvironment } from '../buster-environment.js';

type SuiteLog = (message: string) => void;
type ExecFileAsync = (command: string, args: string[], options?: Record<string, unknown>) => Promise<{ stdout?: string; stderr?: string }>;

const execFileAsyncDefault = promisify(execFile) as ExecFileAsync;

export interface BuildKitImageResult {
  image: string;
  digest: string;
  immutableImage: string;
}

function requireImage(image: unknown): string {
  const result = validateImageReference(image);
  if (result.ok) return result.value;
  throw new Error(`BuildKit output image must be fully qualified (${result.reason})`);
}

function repositoryWithoutTag(image: string): string {
  const digestIndex = image.indexOf('@');
  const withoutDigest = digestIndex >= 0 ? image.slice(0, digestIndex) : image;
  const slash = withoutDigest.lastIndexOf('/');
  const colon = withoutDigest.lastIndexOf(':');
  return colon > slash ? withoutDigest.slice(0, colon) : withoutDigest;
}

function readDigest(metadataPath: string): string {
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Record<string, unknown>;
  const digest = metadata['containerimage.digest'];
  if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error('BuildKit did not return a canonical container image digest');
  }
  return digest;
}

export async function buildAndPushImage({
  dockerfile,
  contextDir,
  image,
  timeoutMs,
  log = () => {},
  execFileAsync = execFileAsyncDefault,
}: {
  dockerfile: string;
  contextDir: string;
  image: string;
  timeoutMs: number;
  log?: SuiteLog;
  execFileAsync?: ExecFileAsync;
}): Promise<BuildKitImageResult> {
  const outputImage = requireImage(image);
  const metadataPath = path.join(os.tmpdir(), `buster-buildkit-${process.pid}-${Date.now()}.json`);
  const args = [
    '--addr', readBusterEnvironment('BUILDKIT_HOST') || 'unix:///run/user/1000/buildkit/buildkitd.sock',
    'build',
    '--frontend', 'dockerfile.v0',
    '--local', `context=${contextDir}`,
    '--local', `dockerfile=${path.dirname(dockerfile)}`,
    '--opt', `filename=${path.basename(dockerfile)}`,
    '--output', `type=image,name=${outputImage},push=true,registry.insecure=true`,
    '--metadata-file', metadataPath,
  ];
  log(`BuildKit: ${outputImage}`);
  try {
    const result = await execFileAsync('buildctl', args, {
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      env: buildSubprocessEnv(),
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    if (output) log(output.split('\n').slice(-10).join('\n'));
    const digest = readDigest(metadataPath);
    return { image: outputImage, digest, immutableImage: `${repositoryWithoutTag(outputImage)}@${digest}` };
  } finally {
    fs.rmSync(metadataPath, { force: true });
  }
}

export async function copyAndPushImage({ sourceImage, ...options }: {
  sourceImage: string;
  contextDir?: never;
  dockerfile?: never;
  image: string;
  timeoutMs: number;
  log?: SuiteLog;
  execFileAsync?: ExecFileAsync;
}): Promise<BuildKitImageResult> {
  const source = requireImage(sourceImage);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-buildkit-copy-'));
  const dockerfile = path.join(tempDir, 'Dockerfile');
  fs.writeFileSync(dockerfile, `FROM ${source}\n`);
  try {
    return await buildAndPushImage({ ...options, dockerfile, contextDir: tempDir });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
