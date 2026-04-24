import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

export const SHARED_PIPELINE_HELPER_PATHS = [
  'pipeline/agents/runtime.js',
  'pipeline/integrations/gateway.js',
  'pipeline/agents/lifecycle.js',
  'pipeline/agents/acp-monitor.js',
  'pipeline/lifecycle-state.js',
];

export const DEFAULT_TELEMETRY_CONTRACT_REL_PATH = 'docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md';

export function expectedPackagedRuntimeOwners(image) {
  const owners = Object.fromEntries(
    SHARED_PIPELINE_HELPER_PATHS.map((relPath) => [
      `/app/skills/${relPath}`,
      `skills/common/${relPath}`,
    ]),
  );

  if (image === 'sandbox') {
    owners['/app/skills/redis.js'] = 'skills/buster/redis.js';
  }

  return owners;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

export function resolveRoots(args = {}) {
  const cwd = process.cwd();
  return {
    sourceRoot: path.resolve(args['source-root'] || cwd),
    overlayRoot: args['overlay-root'] ? path.resolve(args['overlay-root']) : null,
    contractPath: args.contract ? path.resolve(args.contract) : null,
  };
}

export function resolveTelemetryContractPath(args = {}, sourceRoot = process.cwd()) {
  const contractPath = args.contract
    ? path.resolve(args.contract)
    : path.join(path.resolve(sourceRoot), DEFAULT_TELEMETRY_CONTRACT_REL_PATH);

  const normalizedContractPath = path.normalize(contractPath);
  const normalizedDefaultPath = path.normalize(path.join(path.resolve(sourceRoot), DEFAULT_TELEMETRY_CONTRACT_REL_PATH));

  if (/\.(?:mjs|cjs|js)$/i.test(contractPath)) {
    throw new Error(
      `--contract must point to the canonical telemetry contract markdown document (${normalizedDefaultPath}), not a verifier script (${normalizedContractPath})`,
    );
  }

  if (!/\.md$/i.test(contractPath)) {
    throw new Error(
      `--contract must point to a markdown contract document. Expected ${normalizedDefaultPath}, got ${normalizedContractPath}`,
    );
  }

  if (!fs.existsSync(contractPath)) {
    throw new Error(
      `Telemetry contract not found at ${normalizedContractPath}. Expected the canonical contract at ${normalizedDefaultPath}`,
    );
  }

  return contractPath;
}

export function readOverlayText(sourceRoot, overlayRoot, relPath) {
  const overlayPath = overlayRoot ? path.join(overlayRoot, relPath) : null;
  if (overlayPath && fs.existsSync(overlayPath)) return fs.readFileSync(overlayPath, 'utf8');
  return fs.readFileSync(path.join(sourceRoot, relPath), 'utf8');
}

function walkFiles(dir, prefix = '', out = new Map()) {
  if (!dir || !fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absPath, relPath, out);
    } else if (entry.isFile()) {
      out.set(relPath, absPath);
    }
  }
  return out;
}

export function effectiveFiles(sourceRoot, overlayRoot, relDir) {
  const base = walkFiles(path.join(sourceRoot, relDir));
  const overlay = overlayRoot ? walkFiles(path.join(overlayRoot, relDir)) : new Map();
  const merged = new Map(base);
  for (const [relPath, absPath] of overlay.entries()) merged.set(relPath, absPath);
  return merged;
}

export function loadPackagingRules(sourceRoot, overlayRoot) {
  const generalDockerfile = readOverlayText(sourceRoot, overlayRoot, 'docker/Dockerfile.general');
  const sandboxDockerfile = readOverlayText(sourceRoot, overlayRoot, 'docker/Dockerfile.sandbox');
  const deploymentTemplate = readOverlayText(sourceRoot, overlayRoot, 'charts/kubeclaw/templates/deployment.yaml');

  const requiredGeneral = [
    "COPY skills/common/ /tmp/kubeclaw-skills/common/",
    "COPY skills/nova/ /tmp/kubeclaw-skills/nova/",
    "cp -r /tmp/kubeclaw-skills/common/. /app/common/",
    'tar -C /tmp/kubeclaw-skills/common',
    'tar -C /tmp/kubeclaw-skills/nova',
    ...SHARED_PIPELINE_HELPER_PATHS.map((relPath) => `--exclude='${relPath}'`),
  ];
  const requiredSandbox = [
    "COPY skills/common/ /tmp/kubeclaw-skills/common/",
    "COPY skills/buster/ /tmp/kubeclaw-skills/buster/",
    "cp -r /tmp/kubeclaw-skills/common/. /app/common/",
    'tar -C /tmp/kubeclaw-skills/common',
    'tar -C /tmp/kubeclaw-skills/buster',
    ...SHARED_PIPELINE_HELPER_PATHS.map((relPath) => `--exclude='${relPath}'`),
  ];
  const requiredDeployment = [
    'cp -r /app/skills/. /skills-merged/',
    'cp -r /init-skills/. /skills-merged/',
    'mountPath: /app/skills',
  ];

  for (const needle of requiredGeneral) {
    if (!generalDockerfile.includes(needle)) throw new Error(`docker/Dockerfile.general missing expected packaging rule: ${needle}`);
  }
  for (const needle of requiredSandbox) {
    if (!sandboxDockerfile.includes(needle)) throw new Error(`docker/Dockerfile.sandbox missing expected packaging rule: ${needle}`);
  }
  for (const needle of requiredDeployment) {
    if (!deploymentTemplate.includes(needle)) throw new Error(`charts/kubeclaw/templates/deployment.yaml missing expected merge rule: ${needle}`);
  }

  return {
    general: {
      layers: [
        { sourceDir: 'skills/common', destDir: '/app/common', excludes: new Set() },
        { sourceDir: 'skills/common', destDir: '/app/skills', excludes: new Set() },
        { sourceDir: 'skills/nova', destDir: '/app/skills', excludes: new Set(SHARED_PIPELINE_HELPER_PATHS) },
      ],
    },
    sandbox: {
      layers: [
        { sourceDir: 'skills/common', destDir: '/app/common', excludes: new Set() },
        { sourceDir: 'skills/common', destDir: '/app/skills', excludes: new Set() },
        { sourceDir: 'skills/buster', destDir: '/app/skills', excludes: new Set(SHARED_PIPELINE_HELPER_PATHS) },
      ],
    },
  };
}

export function buildManifest(sourceRoot, overlayRoot, image) {
  const rules = loadPackagingRules(sourceRoot, overlayRoot);
  const imageRules = rules[image];
  if (!imageRules) throw new Error(`Unknown image: ${image}`);

  const manifest = new Map();
  const owners = new Map();

  for (const layer of imageRules.layers) {
    const files = effectiveFiles(sourceRoot, overlayRoot, layer.sourceDir);
    for (const [relPath, absPath] of files.entries()) {
      if (layer.excludes.has(relPath)) continue;
      const destPath = path.posix.join(layer.destDir, relPath.replace(/\\/g, '/'));
      const owner = {
        sourceDir: layer.sourceDir,
        relativePath: relPath,
        absPath,
      };
      manifest.set(destPath, owner);
      if (!owners.has(destPath)) owners.set(destPath, []);
      owners.get(destPath).push(owner);
    }
  }

  return { manifest, owners };
}

export function findCollisions(sourceRoot, overlayRoot, image) {
  const { owners } = buildManifest(sourceRoot, overlayRoot, image);
  return [...owners.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([destPath, entries]) => ({ destPath, entries }));
}

export function materializeRuntimeTree(sourceRoot, overlayRoot, image, outDir = null) {
  const { manifest } = buildManifest(sourceRoot, overlayRoot, image);
  const runtimeRoot = outDir || fs.mkdtempSync(path.join(os.tmpdir(), `kubeclaw-${image}-`));

  for (const [destPath, owner] of manifest.entries()) {
    const targetPath = path.join(runtimeRoot, destPath.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(owner.absPath, targetPath);
  }

  return { runtimeRoot, manifest };
}

export function importRuntimeModule(runtimeRoot, runtimePath) {
  return import(pathToFileURL(path.join(runtimeRoot, runtimePath.replace(/^\//, ''))).href);
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function writeExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

export function extractContractEventNames(contractPath) {
  const text = fs.readFileSync(contractPath, 'utf8');
  const names = new Set();

  const inventorySection = text.match(/##\s+3\.\s+Canonical event inventory([\s\S]*?)(?=^##\s+4\.|\Z)/m)?.[1] || '';
  for (const match of inventorySection.matchAll(/^-\s+`([a-z0-9_.-]+)`/gim)) {
    names.add(match[1]);
  }

  for (const match of text.matchAll(/^###\s+([a-z0-9_.-]+)\s*$/gim)) {
    names.add(match[1]);
  }

  return names;
}

export function extractTelemetrySchemaEventNames(schemaPath) {
  const text = fs.readFileSync(schemaPath, 'utf8');
  const names = new Set();

  for (const match of text.matchAll(/^###\s+([a-z0-9_.-]+)\s*$/gim)) {
    names.add(match[1]);
  }

  return names;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractMarkdownSection(textOrPath, heading) {
  const text = fs.existsSync(textOrPath) ? fs.readFileSync(textOrPath, 'utf8') : String(textOrPath);
  const headingMatch = new RegExp(`^###\\s+${escapeRegExp(heading)}\\s*$`, 'm').exec(text);
  if (!headingMatch) return null;
  const afterHeading = text.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingOffset = afterHeading.search(/^###\s+/m);
  const section = nextHeadingOffset === -1 ? afterHeading : afterHeading.slice(0, nextHeadingOffset);
  return section.trim();
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

export function extractMarkdownTables(sectionText) {
  const tables = [];
  const lines = String(sectionText).split('\n');
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim().startsWith('|')) {
      index += 1;
      continue;
    }

    const block = [];
    while (index < lines.length && lines[index].trim().startsWith('|')) {
      block.push(lines[index]);
      index += 1;
    }
    if (block.length >= 2) tables.push(block.join('\n'));
  }

  return tables;
}

export function extractMarkdownFieldTable(sectionText) {
  const firstTable = extractMarkdownTables(sectionText)[0];
  if (!firstTable) return new Map();

  const lines = firstTable.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) return new Map();

  const rows = lines.slice(2);
  const fieldMap = new Map();
  for (const row of rows) {
    const [field, type, description] = splitMarkdownRow(row);
    if (!field) continue;
    fieldMap.set(field, { type: type || '', description: description || '' });
  }
  return fieldMap;
}

export const TELEMETRY_SCHEMA_HOTSPOT_AUTHORITY_NOTE = 'For the high-value lifecycle and observability events below, the field table is the authoritative payload surface. Examples and prose illustrate common combinations, but the field table owns the canonical payload field list and meanings.';

export const TELEMETRY_SCHEMA_HOTSPOT_FIELD_ROWS = {
  'pipeline.halted': [
    { field: 'exit_code', type: 'number', description: 'Pipeline exit code responsible for the halt' },
    { field: 'reason', type: 'string', description: 'Terminal halt label such as `BLOCKED`, `NEEDS_NOVA`, or `ARCH_VALIDATION_BLOCKED`' },
    { field: 'dispatch_id', type: 'string|null', description: 'Owning retry or gate dispatch correlation key when known' },
    { field: 'gateway_label', type: 'string|null', description: 'Operator-facing session/dispatch label preserved across halt, retry, and Discord surfaces when known' },
    { field: 'step_type', type: 'string|null', description: 'Pipeline-owned non-module/non-gate stop category such as `arch_validation`' },
  ],
  'retry.scheduled': [
    { field: 'max_attempts', type: 'number|null', description: 'Canonical retry budget for the work' },
    { field: 'max_fails', type: 'number|null', description: 'Compatibility alias for the same retry budget still emitted today' },
    { field: 'delay_seconds', type: 'number|null', description: 'Delay before retry starts' },
    { field: 'gateway_label', type: 'string|null', description: 'Operator-facing session/dispatch label when the retry already owns one' },
  ],
  'retry.exhausted': [
    { field: 'gate_type', type: 'string|null', description: 'Canonical gate type when `gate_id` is present and known' },
    { field: 'dispatch_id', type: 'string|null', description: 'Owning dispatch correlation key when known' },
    { field: 'gateway_label', type: 'string|null', description: 'Operator-facing session/dispatch label when known' },
    { field: 'max_fails', type: 'number|null', description: 'Compatibility alias for the same retry budget still emitted today' },
  ],
  'module.status_changed': [
    { field: 'new_status', type: 'string|null', description: 'New canonical module status, including `RATE_LIMITED` for cooldown transitions' },
    { field: 'dispatch_id', type: 'string|null', description: 'Owning dispatch correlation key when the transition is retry- or gate-backed' },
    { field: 'session_key', type: 'string|null', description: 'Session correlation key when known' },
    { field: 'reason', type: 'string|null', description: 'Material explanation for FAIL, BLOCKED, or RATE_LIMITED transitions when present' },
  ],
  'agent.spawned': [
    { field: 'dispatch', type: 'string|null', description: 'Runtime dispatch kind such as `acp` or `subagent`' },
    { field: 'dispatch_id', type: 'string|null', description: 'Owning dispatch correlation key when known' },
    { field: 'session_key', type: 'string|null', description: 'Canonical session identity for the spawned ACP/subagent work' },
    { field: 'thinking_level', type: 'string|null', description: 'Requested reasoning or thinking level when tracked' },
  ],
  'agent.killed': [
    { field: 'dispatch_id', type: 'string|null', description: 'Owning dispatch correlation key when known' },
    { field: 'has_changes', type: 'boolean|null', description: 'Whether the session produced tracked file changes when known' },
    { field: 'files_changed', type: 'string[]|null', description: 'Tracked changed files when known' },
    { field: 'reason', type: 'string|null', description: 'Termination reason such as `completed`, `timeout`, or `killed`' },
  ],
  'rate_limit.detected': [
    { field: 'gateway_label', type: 'string|null', description: 'Operator-facing session/dispatch label when the paused work already owns one' },
    { field: 'dispatch_id', type: 'string|null', description: 'Owning dispatch correlation key when the paused work already has one' },
    { field: 'retry_after_seconds', type: 'number|null', description: 'Cooldown in seconds' },
    { field: 'cooldown_ms', type: 'number|null', description: 'Cooldown in milliseconds' },
  ],
  'observability.degraded': [
    { field: 'gateway_label', type: 'string|null', description: 'Tracked gateway/session label when the runtime already knows it' },
    { field: 'dispatch_id', type: 'string|null', description: 'Owning dispatch correlation key when the degraded surface belongs to dispatched work' },
    { field: 'impacted_event_type', type: 'string|null', description: 'Event type whose delivery failed, when the incident is tied to one blocked emit' },
    { field: 'degraded_at', type: 'string|null', description: 'When degraded visibility began' },
  ],
  'observability.restored': [
    { field: 'gateway_label', type: 'string|null', description: 'Tracked gateway/session label when the runtime already knows it' },
    { field: 'dispatch_id', type: 'string|null', description: 'Owning dispatch correlation key when the recovered surface belongs to dispatched work' },
    { field: 'restored_at', type: 'string|null', description: 'When visibility recovered' },
    { field: 'restored_after_ms', type: 'number|null', description: 'Duration of the degraded period in ms' },
  ],
  'error.escalation': [
    { field: 'gateway_label', type: 'string|null', description: 'Operator-facing session/dispatch label when known' },
    { field: 'fail_count', type: 'number|null', description: 'Total failed attempts or retries counted at escalation time' },
    { field: 'last_failure', type: 'string|null', description: 'Last failure summary carried into the escalation' },
    { field: 'step_type', type: 'string|null', description: 'Pipeline-owned non-module/non-gate escalation category such as `arch_validation`' },
  ],
};

export function assertTelemetrySchemaHotspotAuthority(schemaPath) {
  const text = fs.readFileSync(schemaPath, 'utf8');
  if (!text.includes(TELEMETRY_SCHEMA_HOTSPOT_AUTHORITY_NOTE)) {
    throw new Error('telemetry schema must explicitly declare the hotspot field tables as the authoritative payload surface');
  }

  for (const [eventName, expectedRows] of Object.entries(TELEMETRY_SCHEMA_HOTSPOT_FIELD_ROWS)) {
    const section = extractMarkdownSection(text, eventName);
    if (!section) throw new Error(`telemetry schema missing section for authoritative hotspot event ${eventName}`);
    const fieldTable = extractMarkdownFieldTable(section);
    if (fieldTable.size === 0) throw new Error(`telemetry schema section ${eventName} is missing an authoritative field table`);

    for (const expected of expectedRows) {
      const actual = fieldTable.get(expected.field);
      if (!actual) throw new Error(`telemetry schema section ${eventName} is missing authoritative field row ${expected.field}`);
      if (actual.type !== expected.type) {
        throw new Error(`telemetry schema section ${eventName} field ${expected.field} expected type ${expected.type} but found ${actual.type}`);
      }
      if (!actual.description.includes(expected.description)) {
        throw new Error(`telemetry schema section ${eventName} field ${expected.field} missing authoritative description snippet: ${expected.description}`);
      }
    }
  }
}

export function collectEmitEventNames(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const names = new Set();

  for (const match of text.matchAll(/emitEvent(?:NonBlocking)?\([^,]+,\s*['\"]([^'\"]+)['\"]/g)) {
    names.add(match[1]);
  }

  for (const match of text.matchAll(/emitLegacyEventDirect\([^,]+,\s*['\"]([^'\"]+)['\"]/g)) {
    names.add(match[1]);
  }

  for (const match of text.matchAll(/emitNotificationCompatibilityEvent\([^,]+,\s*['\"][^'\"]+['\"]\s*,\s*['\"]([^'\"]+)['\"]/g)) {
    names.add(match[1]);
  }

  for (const match of text.matchAll(/emitTelemetryStreamEvent\([^,]+,\s*['\"]([^'\"]+)['\"]/g)) {
    names.add(match[1]);
  }

  return names;
}
