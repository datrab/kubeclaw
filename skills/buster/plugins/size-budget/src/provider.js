import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const MAXIMUM_INPUT_BYTES = 512 * 1024 * 1024;
const MAXIMUM_EXPANDED_BYTES = 2 * 1024 * 1024 * 1024;
const MAXIMUM_FILES = 100_000;
const MAXIMUM_BASELINE_BYTES = 1024 * 1024;
const ZERO_BLOCK = Buffer.alloc(512);
const MEDIA_FORMATS = new Map([
  ['application/octet-stream', 'file'],
  ['application/x-tar', 'tar'],
  ['application/vnd.kubeclaw.build-output.tar', 'tar'],
  ['application/gzip', 'tar-gzip'],
]);
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`SIZE_BUDGET_CONFIG_INVALID:${label}`);
  return value;
}

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`SIZE_BUDGET_LIMIT_INVALID:${label}`);
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`SIZE_BUDGET_LIMIT_INVALID:${label}`);
  return value;
}

function cancelled(signal) {
  if (signal?.aborted) throw new Error('SIZE_BUDGET_CANCELLED');
}

function configuration(invocation) {
  const value = object(invocation.configuration.values, 'root');
  const matchingFiles = value.matchingFiles ?? [];
  if (!Array.isArray(matchingFiles) || matchingFiles.length > 32) throw new Error('SIZE_BUDGET_MATCHING_FILES_INVALID');
  const ids = new Set();
  const rules = matchingFiles.map((raw, index) => {
    const rule = object(raw, `matchingFiles.${index}`);
    if (typeof rule.id !== 'string' || !NAME.test(rule.id) || ids.has(rule.id)) throw new Error(`SIZE_BUDGET_RULE_ID_INVALID:${String(rule.id)}`);
    ids.add(rule.id);
    if (typeof rule.pattern !== 'string' || rule.pattern.length < 1 || rule.pattern.length > 512 || rule.pattern.includes('\0')) {
      throw new Error(`SIZE_BUDGET_PATTERN_INVALID:${rule.id}`);
    }
    return { id: rule.id, pattern: rule.pattern, matcher: glob(rule.pattern),
      maximumBytes: safeInteger(rule.maximumBytes, `matchingFiles.${rule.id}.maximumBytes`), requireMatch: rule.requireMatch !== false };
  });
  const config = {
    format: value.format ?? 'auto',
    maximumTotalBytes: value.maximumTotalBytes === undefined ? null : safeInteger(value.maximumTotalBytes, 'maximumTotalBytes'),
    maximumFileCount: value.maximumFileCount === undefined ? null : safeInteger(value.maximumFileCount, 'maximumFileCount'),
    matchingFiles: rules,
    maximumGrowthBytes: value.maximumGrowthBytes === undefined ? null : safeInteger(value.maximumGrowthBytes, 'maximumGrowthBytes'),
    maximumGrowthPercent: value.maximumGrowthPercent === undefined ? null : finite(value.maximumGrowthPercent, 'maximumGrowthPercent'),
    largestFiles: value.largestFiles === undefined ? 10 : safeInteger(value.largestFiles, 'largestFiles'),
  };
  if (!['auto', 'file', 'tar', 'tar-gzip'].includes(config.format) || config.largestFiles < 1 || config.largestFiles > 100) {
    throw new Error('SIZE_BUDGET_CONFIG_INVALID:format-or-largestFiles');
  }
  const hasLimit = config.maximumTotalBytes !== null || config.maximumFileCount !== null || config.matchingFiles.length > 0
    || config.maximumGrowthBytes !== null || config.maximumGrowthPercent !== null;
  if (invocation.mode === 'blocking' && !hasLimit) throw new Error('SIZE_BUDGET_BLOCKING_LIMIT_REQUIRED');
  return { ...config, hasLimit };
}

function glob(pattern) {
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        if (pattern[index + 2] === '/') { expression += '(?:.*/)?'; index += 2; }
        else { expression += '.*'; index += 1; }
      }
      else expression += '[^/]*';
    } else if (character === '?') expression += '[^/]';
    else expression += character.replace(/[|\\{}()[\]^$+?.]/gu, '\\$&');
  }
  try { return new RegExp(`${expression}$`, 'u'); }
  catch { throw new Error('SIZE_BUDGET_PATTERN_INVALID'); }
}

function input(invocation, name, required) {
  const matches = invocation.inputs.filter((item) => item.name === name);
  if (matches.length > 1) throw new Error(`SIZE_BUDGET_INPUT_DUPLICATE:${name}`);
  if (required && matches.length === 0) throw new Error(`SIZE_BUDGET_INPUT_REQUIRED:${name}`);
  const selected = matches[0];
  if (!selected) return null;
  if (selected.kind !== 'artifact' || !selected.artifact || typeof selected.artifact !== 'object') {
    throw new Error(`SIZE_BUDGET_INPUT_INVALID:${name}`);
  }
  return selected.artifact;
}

async function verifiedFile(artifact, label, maximumBytes, signal) {
  cancelled(signal);
  if (typeof artifact.storageUrl !== 'string' || !artifact.storageUrl.startsWith('file:')) throw new Error(`SIZE_BUDGET_INPUT_URL_INVALID:${label}`);
  if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 0 || artifact.sizeBytes > maximumBytes) {
    throw new Error(`SIZE_BUDGET_INPUT_SIZE_INVALID:${label}`);
  }
  const candidate = fs.realpathSync(fileURLToPath(artifact.storageUrl));
  const handle = await fs.promises.open(candidate, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size !== artifact.sizeBytes) throw new Error(`SIZE_BUDGET_INPUT_SIZE_MISMATCH:${label}`);
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    for (;;) {
      cancelled(signal);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
      if (position > maximumBytes) throw new Error(`SIZE_BUDGET_INPUT_SIZE_INVALID:${label}`);
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || position !== artifact.sizeBytes) {
      throw new Error(`SIZE_BUDGET_INPUT_SIZE_MISMATCH:${label}`);
    }
    if (`sha256:${hash.digest('hex')}` !== artifact.contentDigest) throw new Error(`SIZE_BUDGET_INPUT_DIGEST_MISMATCH:${label}`);
    return candidate;
  } finally { await handle.close(); }
}

function tarString(block, start, length) {
  const bytes = block.subarray(start, start + length);
  const zero = bytes.indexOf(0);
  return bytes.subarray(0, zero < 0 ? bytes.length : zero).toString('utf8');
}

function tarNumber(block, start, length, label) {
  const raw = tarString(block, start, length).trim();
  if (!/^[0-7]+$/u.test(raw)) throw new Error(`SIZE_BUDGET_ARCHIVE_INVALID:${label}`);
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`SIZE_BUDGET_ARCHIVE_INVALID:${label}`);
  return value;
}

function tarPath(block) {
  const name = tarString(block, 0, 100);
  const prefix = tarString(block, 345, 155);
  const value = prefix ? `${prefix}/${name}` : name;
  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  if (!normalized || Buffer.byteLength(normalized) > 512 || normalized.includes('\0') || path.posix.isAbsolute(normalized)
    || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) throw new Error('SIZE_BUDGET_ARCHIVE_PATH_INVALID');
  return normalized;
}

function checksum(block) {
  const declared = tarNumber(block, 148, 8, 'checksum');
  let measured = 0;
  for (let index = 0; index < 512; index += 1) measured += index >= 148 && index < 156 ? 32 : block[index];
  if (declared !== measured) throw new Error('SIZE_BUDGET_ARCHIVE_CHECKSUM_INVALID');
}

async function scanTar(file, compressed, signal) {
  const source = fs.createReadStream(file, { highWaterMark: 64 * 1024 });
  const stream = compressed ? source.pipe(createGunzip()) : source;
  const files = [];
  const names = new Set();
  let pending = Buffer.alloc(0);
  let skip = 0;
  let expandedBytes = 0;
  let zeroBlocks = 0;
  let ended = false;
  const abort = () => stream.destroy(new Error('SIZE_BUDGET_CANCELLED'));
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for await (const raw of stream) {
      if (signal?.aborted) throw new Error('SIZE_BUDGET_CANCELLED');
      const chunk = Buffer.from(raw);
      expandedBytes += chunk.byteLength;
      if (expandedBytes > MAXIMUM_EXPANDED_BYTES) throw new Error('SIZE_BUDGET_ARCHIVE_EXPANDED_LIMIT');
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      for (;;) {
        if (skip > 0) {
          const consumed = Math.min(skip, pending.length);
          pending = pending.subarray(consumed); skip -= consumed;
          if (skip > 0) break;
        }
        if (pending.length < 512) break;
        const block = pending.subarray(0, 512); pending = pending.subarray(512);
        if (block.equals(ZERO_BLOCK)) {
          zeroBlocks += 1;
          if (zeroBlocks === 2) ended = true;
          continue;
        }
        if (ended || zeroBlocks > 0) throw new Error('SIZE_BUDGET_ARCHIVE_TRAILING_DATA');
        checksum(block);
        const type = tarString(block, 156, 1) || '0';
        const size = tarNumber(block, 124, 12, 'size');
        const name = tarPath(block);
        if (names.has(name)) throw new Error(`SIZE_BUDGET_ARCHIVE_DUPLICATE:${name}`);
        names.add(name);
        if (type === '5') { if (size !== 0) throw new Error('SIZE_BUDGET_ARCHIVE_INVALID:directory-size'); continue; }
        if (type !== '0') throw new Error(`SIZE_BUDGET_ARCHIVE_ENTRY_DENIED:${type}`);
        files.push({ path: name, bytes: size });
        if (files.length > MAXIMUM_FILES) throw new Error('SIZE_BUDGET_ARCHIVE_FILE_LIMIT');
        skip = Math.ceil(size / 512) * 512;
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort);
  }
  if (!ended || skip !== 0 || pending.some((byte) => byte !== 0)) throw new Error('SIZE_BUDGET_ARCHIVE_TRUNCATED');
  return files;
}

function formatFor(config, artifact) {
  const inferred = MEDIA_FORMATS.get(artifact.mediaType);
  if (!inferred) throw new Error(`SIZE_BUDGET_INPUT_MEDIA_TYPE_INVALID:${String(artifact.mediaType)}`);
  if (config.format === 'auto') return inferred;
  if (config.format !== inferred && !(config.format === 'file' && artifact.mediaType === 'application/octet-stream')) {
    throw new Error('SIZE_BUDGET_FORMAT_MISMATCH');
  }
  return config.format;
}

async function measurements(config, artifact, file, signal) {
  cancelled(signal);
  const format = formatFor(config, artifact);
  const files = format === 'file'
    ? [{ path: String(artifact.artifactId ?? 'build-output'), bytes: artifact.sizeBytes }]
    : await scanTar(file, format === 'tar-gzip', signal);
  const totalBytes = files.reduce((sum, item) => {
    const next = sum + item.bytes;
    if (!Number.isSafeInteger(next) || next > MAXIMUM_EXPANDED_BYTES) throw new Error('SIZE_BUDGET_TOTAL_LIMIT');
    return next;
  }, 0);
  const largest = [...files].sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))
    .slice(0, config.largestFiles);
  return { format, files, totalBytes, storedBytes: artifact.sizeBytes,
    compressedBytes: format === 'tar-gzip' ? artifact.sizeBytes : null, largest };
}

async function baseline(artifact, signal) {
  if (!artifact) return null;
  if (artifact.mediaType !== 'application/vnd.kubeclaw.size-budget-baseline+json') throw new Error('SIZE_BUDGET_BASELINE_MEDIA_TYPE_INVALID');
  const source = await verifiedFile(artifact, 'baseline', MAXIMUM_BASELINE_BYTES, signal);
  cancelled(signal);
  let value;
  try { value = JSON.parse(fs.readFileSync(source, 'utf8')); } catch { throw new Error('SIZE_BUDGET_BASELINE_INVALID'); }
  if (!value || value.schemaVersion !== 'size-budget-baseline.v1' || !Number.isSafeInteger(value.totalBytes)
    || value.totalBytes < 0 || typeof value.sourceDigest !== 'string') throw new Error('SIZE_BUDGET_BASELINE_INVALID');
  return value;
}

function growth(current, previous) {
  const bytes = current - previous;
  const percent = previous === 0 ? (current === 0 ? 0 : null) : bytes / previous * 100;
  return { bytes, percent };
}

function baselineEvidence(invocation, context, measurement, artifact) {
  const workspace = fs.realpathSync(context.workspaceRoot);
  const evidence = fs.realpathSync(path.resolve(workspace, invocation.workspace.evidence));
  if (evidence !== workspace && !evidence.startsWith(`${workspace}${path.sep}`)) throw new Error('SIZE_BUDGET_EVIDENCE_PATH_DENIED');
  const value = {
    schemaVersion: 'size-budget-baseline.v1',
    sourceDigest: artifact.contentDigest,
    sourceMediaType: artifact.mediaType,
    format: measurement.format,
    totalBytes: measurement.totalBytes,
    storedBytes: measurement.storedBytes,
    compressedBytes: measurement.compressedBytes,
    fileCount: measurement.files.length,
  };
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  if (bytes.byteLength > MAXIMUM_BASELINE_BYTES) throw new Error('SIZE_BUDGET_BASELINE_OUTPUT_LIMIT');
  const file = 'size-budget-baseline.json';
  fs.writeFileSync(path.join(evidence, file), bytes, { flag: 'wx', mode: 0o600 });
  return { value, file };
}

function details(values) {
  const schemaId = 'kubeclaw.size-budget-details.v1';
  return { schemaId, schemaDigest: `sha256:${crypto.createHash('sha256').update(schemaId).digest('hex')}`, values };
}

export function provider() {
  return { async execute(invocation, context) {
    cancelled(context.signal);
    const config = configuration(invocation);
    if (invocation.inputs.some((item) => !['build-output', 'baseline'].includes(item.name))) throw new Error('SIZE_BUDGET_INPUT_UNKNOWN');
    const artifact = input(invocation, 'build-output', true);
    const baselineArtifact = input(invocation, 'baseline', false);
    const source = await verifiedFile(artifact, 'build-output', MAXIMUM_INPUT_BYTES, context.signal);
    const previous = await baseline(baselineArtifact, context.signal);
    if ((config.maximumGrowthBytes !== null || config.maximumGrowthPercent !== null) && !previous) {
      throw new Error('SIZE_BUDGET_BASELINE_REQUIRED');
    }
    const measured = await measurements(config, artifact, source, context.signal);
    const change = previous ? growth(measured.totalBytes, previous.totalBytes) : null;
    const checks = [];
    if (config.maximumTotalBytes !== null) checks.push({ id: 'total', passed: measured.totalBytes <= config.maximumTotalBytes,
      message: `${measured.totalBytes} total bytes; maximum ${config.maximumTotalBytes}.` });
    if (config.maximumFileCount !== null) checks.push({ id: 'file-count', passed: measured.files.length <= config.maximumFileCount,
      message: `${measured.files.length} files; maximum ${config.maximumFileCount}.` });
    const matches = config.matchingFiles.map((rule) => {
      const selected = measured.files.filter((file) => rule.matcher.test(file.path));
      const bytes = selected.reduce((sum, file) => sum + file.bytes, 0);
      const passed = (!rule.requireMatch || selected.length > 0) && bytes <= rule.maximumBytes;
      checks.push({ id: `files:${rule.id}`, passed,
        message: `${selected.length} files and ${bytes} bytes match ${rule.pattern}; maximum ${rule.maximumBytes}.` });
      return { id: rule.id, pattern: rule.pattern, bytes, fileCount: selected.length, maximumBytes: rule.maximumBytes,
        requireMatch: rule.requireMatch, passed };
    });
    if (config.maximumGrowthBytes !== null) checks.push({ id: 'growth-bytes', passed: change.bytes <= config.maximumGrowthBytes,
      message: `Growth is ${change.bytes} bytes; maximum ${config.maximumGrowthBytes}.` });
    if (config.maximumGrowthPercent !== null) checks.push({ id: 'growth-percent',
      passed: change.percent !== null ? change.percent <= config.maximumGrowthPercent : false,
      message: change.percent === null ? 'Growth percent is unbounded because the baseline is zero bytes.'
        : `Growth is ${change.percent.toFixed(2)}%; maximum ${config.maximumGrowthPercent}%.` });
    const failures = checks.filter((check) => !check.passed);
    const passed = failures.length === 0;
    const output = baselineEvidence(invocation, context, measured, artifact);
    context.log('stdout', `Measured ${measured.totalBytes} bytes in ${measured.files.length} files from ${artifact.contentDigest}.\n`);
    return {
      schemaVersion: 'provider-result.v1', outcome: passed ? 'passed' : 'failed',
      summary: passed ? `Size budget passed for ${measured.totalBytes} bytes.` : `${failures.length} size budget check${failures.length === 1 ? '' : 's'} failed.`,
      counts: { total: Math.max(1, checks.length), passed: Math.max(1, checks.length) - failures.length,
        failed: failures.length, skipped: 0 },
      findings: failures.map((failure) => ({ id: `size-budget:${failure.id}`, severity: 'medium',
        rule: `size-budget.${failure.id}`, message: failure.message })),
      metrics: [
        { name: 'size_budget.total_bytes', value: measured.totalBytes, unit: 'bytes' },
        { name: 'size_budget.stored_bytes', value: measured.storedBytes, unit: 'bytes' },
        { name: 'size_budget.file_count', value: measured.files.length, unit: 'files' },
        ...(measured.compressedBytes === null ? [] : [{ name: 'size_budget.compressed_bytes', value: measured.compressedBytes, unit: 'bytes' }]),
        ...(change ? [{ name: 'size_budget.growth_bytes', value: change.bytes, unit: 'bytes' }] : []),
        ...(change?.percent === null || change === null ? [] : [{ name: 'size_budget.growth_percent', value: change.percent, unit: 'percent' }]),
      ],
      evidenceFiles: [{ evidenceId: 'baseline', type: 'size-budget-baseline', file: output.file,
        mediaType: 'application/vnd.kubeclaw.size-budget-baseline+json' }],
      reports: [], outputs: [{ name: 'baseline', kind: 'artifact', evidenceId: 'baseline' }], exitCode: null, signal: null,
      providerDetails: details({ sourceDigest: artifact.contentDigest, format: measured.format,
        totalBytes: measured.totalBytes, storedBytes: measured.storedBytes, compressedBytes: measured.compressedBytes,
        fileCount: measured.files.length, largestFiles: measured.largest, matchingFiles: matches, growth: change,
        limits: { maximumTotalBytes: config.maximumTotalBytes, maximumFileCount: config.maximumFileCount,
          maximumGrowthBytes: config.maximumGrowthBytes,
          maximumGrowthPercent: config.maximumGrowthPercent } }),
    };
  } };
}
