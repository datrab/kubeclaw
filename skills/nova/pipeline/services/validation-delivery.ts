import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { resolveRepoRelativePath, resolveRepoRealPath } from '../core/paths.ts';
import { VALIDATION_CODES, validationFailure } from './validation-contract.ts';

function normalizeDirPath(value: any) {
  return typeof value === 'string' ? value.replace(/\/$/, '') : '';
}

function parseDockerfileCopies(content: string) {
  return content.split('\n').flatMap((line) => {
    const match = line.trim().match(/^COPY(?:\s+--\S+)*\s+(\S+)\s+(\S+)/i);
    return match ? [{ src: match[1], dest: match[2] }] : [];
  });
}

function invalidDockerfilePath(serveDockerfile: any, error: any) {
  return validationFailure(
    'delivery_lint',
    VALIDATION_CODES.SERVE_DOCKERFILE_PATH_INVALID,
    `test_config.serve.dockerfile references '${serveDockerfile}' but it is not a repository-root-relative file path: ${error.message}`,
    'Set test_config.serve.dockerfile to a path relative to the repository root that resolves inside the repository, with no symlink escape.',
  );
}

function validateStaticPath(config: any, staticPath: any) {
  if (staticPath === undefined || staticPath === null || staticPath === '') return null;
  if (typeof staticPath !== 'string' || !staticPath.trim()) {
    throw new Error('test_config.serve.static_path must be a non-empty string when set');
  }
  if (staticPath.includes('\0')) throw new Error('test_config.serve.static_path contains a null byte');
  if (/[\r\n]/.test(staticPath)) throw new Error('test_config.serve.static_path contains a newline');
  if (path.isAbsolute(staticPath)) throw new Error('test_config.serve.static_path must not be absolute');
  if (staticPath.split(/[\\/]+/).filter(Boolean).includes('..')) {
    throw new Error('test_config.serve.static_path must not contain parent traversal');
  }
  const candidatePath = resolveRepoRelativePath(config, staticPath, 'test_config.serve.static_path');
  if (fs.existsSync(candidatePath)) resolveRepoRealPath(config, staticPath, 'test_config.serve.static_path');
  return staticPath.replace(/\\/g, '/');
}

function readDockerfile(config: any, serveDockerfile: string) {
  let candidatePath: string;
  try {
    candidatePath = resolveRepoRelativePath(config, serveDockerfile, 'test_config.serve.dockerfile');
  } catch (error: any) {
    return { failure: invalidDockerfilePath(serveDockerfile, error) };
  }
  if (!fs.existsSync(candidatePath)) {
    return { failure: validationFailure(
      'delivery_lint',
      VALIDATION_CODES.SERVE_DOCKERFILE_MISSING,
      `test_config.serve.dockerfile references '${serveDockerfile}' but the file was not produced at '${candidatePath}' after Forge completed.`,
      `Ensure Forge creates the Dockerfile at '${serveDockerfile}' relative to the repository root.`,
    ) };
  }
  try {
    const realPath = resolveRepoRealPath(config, serveDockerfile, 'test_config.serve.dockerfile');
    return { content: fs.readFileSync(realPath, 'utf8') };
  } catch (error: any) {
    const pathFailure = error?.code === 'EACCES' || error?.code === 'EISDIR'
      ? validationFailure(
        'delivery_lint',
        VALIDATION_CODES.SERVE_DOCKERFILE_READ_FAILED,
        `test_config.serve.dockerfile references '${serveDockerfile}' but the file could not be read: ${error.message}`,
        'Make the declared Dockerfile a readable regular file inside the repository root before retrying.',
      )
      : invalidDockerfilePath(serveDockerfile, error);
    return { failure: pathFailure };
  }
}

function staticPathFailures(config: any, staticPath: any, dockerfileContent: string) {
  let normalized: string | null;
  try {
    normalized = validateStaticPath(config, staticPath);
  } catch (error: any) {
    return [validationFailure(
      'delivery_lint',
      VALIDATION_CODES.STATIC_PATH_INVALID,
      error.message,
      'Set test_config.serve.static_path to a relative, traversal-free COPY destination or remove it.',
    )];
  }
  if (!normalized) return [];
  const copies = parseDockerfileCopies(dockerfileContent);
  if (copies.length === 0 || copies.some((copy) => normalizeDirPath(copy.dest) === normalizeDirPath(normalized))) return [];
  const destinations = copies.map((copy) => copy.dest).join(', ');
  return [validationFailure(
    'delivery_lint',
    VALIDATION_CODES.STATIC_PATH_MISMATCH,
    `test_config.serve.static_path is '${staticPath}' but no Dockerfile COPY destination matches. COPY destinations found: ${destinations}.`,
    `Align the Dockerfile COPY destination with '${staticPath}', or correct test_config.serve.static_path in progress.json to match what the Dockerfile actually copies.`,
  )];
}

export function runDeliveryLintValidation(mod: any, moduleDir: any, config: any) {
  const testConfig = mod?.test_config ?? {};
  const serveDockerfile = testConfig.serve?.dockerfile;
  if (!serveDockerfile) {
    log('INFO', `Delivery lint: no serve.dockerfile for ${moduleDir} — checks skipped`);
    return { passed: true, failures: [] };
  }
  const dockerfile = readDockerfile(config, serveDockerfile);
  if (dockerfile.failure) {
    log('WARN', `Delivery lint: ${dockerfile.failure.code} — ${dockerfile.failure.explanation}`);
    return { passed: false, failures: [dockerfile.failure] };
  }
  const failures = staticPathFailures(config, testConfig.serve?.static_path, dockerfile.content as string);
  log(
    failures.length > 0 ? 'WARN' : 'INFO',
    failures.length > 0
      ? `Delivery lint validation failed for ${moduleDir}: ${failures.map((failure) => failure.code).join(', ')}`
      : `Delivery lint validation passed for ${moduleDir}`,
  );
  return { passed: failures.length === 0, failures };
}
