import { setImmediate as yieldTask } from 'node:timers/promises';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAXIMUM_LCOV_BYTES = 64 * 1024 * 1024;
const MAXIMUM_LINES = 2_000_000;

function* lcovLines(text) {
  let start=0;
  while(start<=text.length){
    const newline=text.indexOf('\n',start),end=newline<0?text.length:newline;
    const contentEnd=newline>=0&&end>start&&text[end-1]==='\r'?end-1:end;
    yield text.slice(start,contentEnd);
    start=end+1;
  }
}

async function parseLcov(bytes, id, signal) {
  signal?.throwIfAborted();
  if (bytes.byteLength > MAXIMUM_LCOV_BYTES) throw new Error(`COVERAGE_LCOV_TOO_LARGE:${id}`);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const files = new Map();
  let current = null;
  let records = 0;
  let visited = 0;
  for (const raw of lcovLines(text)) {
    if ((++visited & 4095) === 0) {await yieldTask(); signal?.throwIfAborted();}
    if (!raw) continue;
    if (raw.startsWith('SF:')) {
      const file = raw.slice(3);
      if (!file || file.includes('\0')) throw new Error(`COVERAGE_LCOV_INVALID:${id}`);
      current = file;
      if (!files.has(file)) files.set(file, new Map());
    } else if (raw.startsWith('DA:')) {
      if (!current) throw new Error(`COVERAGE_LCOV_INVALID:${id}`);
      const match = /^DA:(\d+),(\d+)(?:,[^\r\n]*)?$/u.exec(raw);
      if (!match) throw new Error(`COVERAGE_LCOV_INVALID:${id}`);
      const line = Number(match[1]); const hits = Number(match[2]);
      if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(hits) || hits < 0) {
        throw new Error(`COVERAGE_LCOV_INVALID:${id}`);
      }
      const lines = files.get(current);
      lines.set(line, Math.max(lines.get(line) ?? 0, hits));
      records += 1;
      if (records > MAXIMUM_LINES) throw new Error(`COVERAGE_LCOV_LINE_LIMIT:${id}`);
    } else if (raw === 'end_of_record') current = null;
    else if (!/^(?:TN:|FN:|FNDA:|FNF:|FNH:|BRDA:|BRF:|BRH:|LF:|LH:)/u.test(raw)) {
      throw new Error(`COVERAGE_LCOV_INVALID:${id}`);
    }
  }
  if (files.size === 0 || records === 0) throw new Error(`COVERAGE_LCOV_EMPTY:${id}`);
  let total = 0; let covered = 0;
  for (const lines of files.values()) for (const hits of lines.values()) {
    if ((++visited & 4095) === 0) {await yieldTask(); signal?.throwIfAborted();}
    total += 1; if (hits > 0) covered += 1;
  }
  return { id, files, total, covered, percent: total === 0 ? 0 : covered / total * 100 };
}


function sameSnapshot(a, b) {
  return ['dev','ino','size','mtimeNs'].every(key => a[key] === b[key]);
}

/** Retain one bounded byte snapshot; do not read the whole file before its cap. */
async function readLcov(artifact, id, signal) {
  signal?.throwIfAborted();
  const handle = await fs.promises.open(fileURLToPath(artifact.storageUrl), fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    const before = await handle.stat({bigint:true});
    signal?.throwIfAborted();
    if (!before.isFile() || Number(before.size) !== artifact.sizeBytes) throw new Error(`COVERAGE_INPUT_SIZE_MISMATCH:${id}`);
    if (before.size > BigInt(MAXIMUM_LCOV_BYTES)) throw new Error(`COVERAGE_LCOV_TOO_LARGE:${id}`);
    const bytes = Buffer.alloc(Number(before.size));
    let position = 0;
    while (position < bytes.length) {
      signal?.throwIfAborted();
      const {bytesRead} = await handle.read(bytes, position, Math.min(65536,bytes.length-position),position);
      if (!bytesRead) throw new Error(`COVERAGE_INPUT_SIZE_MISMATCH:${id}`);
      position += bytesRead;
    }
    signal?.throwIfAborted();
    const after = await handle.stat({bigint:true});
    signal?.throwIfAborted();
    if (!sameSnapshot(before,after)) throw new Error(`COVERAGE_INPUT_CHANGED:${id}`);
    const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (digest !== artifact.contentDigest) throw new Error(`COVERAGE_INPUT_DIGEST_MISMATCH:${id}`);
    return bytes;
  } finally {await handle.close();}
}

function details(values) {
  const schemaId = 'kubeclaw.coverage-budget-details.v1';
  return { schemaId, schemaDigest: `sha256:${crypto.createHash('sha256').update(schemaId).digest('hex')}`, values };
}

export function provider() {
  return { async execute(invocation, context = {}) {
    context.signal?.throwIfAborted();
    const captured = invocation.configuration;
    if (captured.schemaVersion === 'provider-configuration.v2' &&
      (!captured.values || typeof captured.values !== 'object' || Array.isArray(captured.values) || Object.keys(captured.values).length !== 0 || captured.contractId !== 'kubeclaw.coverage-budget@1'
        || captured.selectedPolicy?.schemaVersion !== 'selected-registration-policy.v1')) throw new Error('QUALITY_TASK_POLICY_OVERRIDE');
    const config = captured.schemaVersion === 'provider-configuration.v2'
      ? captured.selectedPolicy.processing : captured.values;
    if (captured.schemaVersion === 'provider-configuration.v2' && (!config || typeof config !== 'object' || Array.isArray(config)
      || Object.keys(config).sort().join(',') !== 'combine,minimumLinePercent' || typeof config.combine !== 'boolean'
      || !Number.isFinite(config.minimumLinePercent))) throw new Error('COVERAGE_BUDGET_V2_PROCESSING_REQUIRED');
    const minimum = config.minimumLinePercent;
    if (minimum !== undefined && (typeof minimum !== 'number' || !Number.isFinite(minimum) || minimum < 0 || minimum > 100)) {
      throw new Error('COVERAGE_BUDGET_MINIMUM_INVALID');
    }
    const inputs = invocation.inputs.filter((input) => input.kind === 'artifact').sort((a, b) => a.name.localeCompare(b.name));
    if (inputs.length === 0) throw new Error('COVERAGE_INPUT_REQUIRED');
    const digests = new Set();
    const parsed = [];
    for (const input of inputs) {
      if (input.artifact.mediaType !== 'text/lcov' || !input.artifact.storageUrl.startsWith('file:')) {
        throw new Error(`COVERAGE_INPUT_INVALID:${input.name}`);
      }
      if (digests.has(input.artifact.contentDigest)) throw new Error(`COVERAGE_INPUT_DUPLICATE:${input.name}`);
      digests.add(input.artifact.contentDigest);
      const bytes = await readLcov(input.artifact,input.name,context.signal);
      parsed.push(await parseLcov(bytes,input.name,context.signal));
    }
    const combinedFiles = new Map();
    let visited = 0;
    for (const item of parsed) for (const [file, lines] of item.files) {
      const target = combinedFiles.get(file) ?? new Map(); combinedFiles.set(file, target);
      for (const [line, hits] of lines) {
        if ((++visited & 4095) === 0) {await yieldTask(); context.signal?.throwIfAborted();}
        target.set(line, Math.max(target.get(line) ?? 0, hits));
      }
    }
    let combinedTotal = 0; let combinedCovered = 0;
    for (const lines of combinedFiles.values()) for (const hits of lines.values()) {
      if ((++visited & 4095) === 0) {await yieldTask(); context.signal?.throwIfAborted();}
      combinedTotal += 1; if (hits > 0) combinedCovered += 1;
    }
    const combinedPercent = combinedTotal === 0 ? 0 : combinedCovered / combinedTotal * 100;
    const useCombined = config.combine !== false;
    const measured = useCombined ? combinedPercent : Math.min(...parsed.map((item) => item.percent));
    context.signal?.throwIfAborted();
    const passed = minimum === undefined || measured >= minimum;
    return {
      schemaVersion: 'provider-result.v1', outcome: passed ? 'passed' : 'failed',
      summary: passed ? `Line coverage is ${measured.toFixed(2)}%.`
        : `Line coverage ${measured.toFixed(2)}% is below the ${minimum.toFixed(2)}% minimum.`,
      counts: { total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1, skipped: 0 },
      findings: passed ? [] : [{ id: `coverage:${invocation.testIdentity}`, severity: 'medium',
        message: `Line coverage ${measured.toFixed(2)}% is below ${minimum.toFixed(2)}%.`, rule: 'coverage.minimum-lines' }],
      metrics: [
        { name: 'coverage.lines.percent', value: measured, unit: 'percent' },
        { name: 'coverage.lines.covered', value: useCombined ? combinedCovered : parsed.reduce((sum, item) => sum + item.covered, 0), unit: 'lines' },
        { name: 'coverage.lines.total', value: useCombined ? combinedTotal : parsed.reduce((sum, item) => sum + item.total, 0), unit: 'lines' }
      ], evidenceFiles: [], reports: [], outputs: [], exitCode: 0, signal: null,
      providerDetails: details({ minimumLinePercent: minimum ?? null, combine: useCombined,
        inputs: parsed.map((item) => ({ id: item.id, total: item.total, covered: item.covered, percent: item.percent })) })
    };
  } };
}
