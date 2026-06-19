import fs from 'fs';
import path from 'path';
import assert from 'assert';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function relPath(sourceRoot, filePath) {
  return path.relative(sourceRoot, filePath).replace(/\\/g, '/');
}

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, predicate, out);
    else if (entry.isFile() && predicate(abs, entry.name)) out.push(abs);
  }
  return out;
}

function lineHits(sourceRoot, filePath, re, label) {
  const source = fs.readFileSync(filePath, 'utf8');
  return sourceLineHits(sourceRoot, filePath, source, re, label);
}

function sourceLineHits(sourceRoot, filePath, source, re, label) {
  return source
    .split('\n')
    .flatMap((line, index) => (re.test(line)
      ? [{ label, path: relPath(sourceRoot, filePath), line: index + 1, text: line.trim() }]
      : []));
}

const canonicalApprovalStateDocMarkers = [
  {
    rel: 'docs/pipeline/modules-and-gates.md',
    text: 'persist approval state in `.swarm/<gate_id>-gate-status.json`',
  },
  {
    rel: 'docs/reference/status-and-artifacts.md',
    text: '- `.swarm/<gate_id>-gate-status.json`',
  },
];

function sourceForActiveDocDebtScan(sourceRoot, filePath) {
  const rel = relPath(sourceRoot, filePath);
  const source = fs.readFileSync(filePath, 'utf8');
  return canonicalApprovalStateDocMarkers
    .filter((marker) => marker.rel === rel)
    .reduce((updated, marker) => {
      assert.equal(
        updated.includes(marker.text),
        true,
        `canonical approval gate state doc marker missing in ${rel}: ${marker.text}`,
      );
      return updated.replace(marker.text, '<canonical approval gate state artifact>');
    }, source);
}

const { sourceRoot } = parseArgs();

const runtimeRoots = [
  'skills/nova/pipeline',
  'skills/common/pipeline',
  'skills/buster/pipeline',
];

const runtimeFiles = runtimeRoots
  .flatMap((root) => walk(path.join(sourceRoot, root), (_abs, name) => /\.(?:js|mjs|cjs|ts)$/.test(name)))
  .sort();

const acceptedCommonShimFiles = new Set(runtimeFiles.filter((filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  return /export \* from ['"].*common\/pipeline/.test(source);
}).map((filePath) => relPath(sourceRoot, filePath)));

for (const rel of acceptedCommonShimFiles) {
  const source = fs.readFileSync(path.join(sourceRoot, rel), 'utf8');
  const nonCommentLines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('//'));
  assert(nonCommentLines.length > 0, `${rel} should not be empty`);
  for (const line of nonCommentLines) {
    assert(
      /^export \* from ['"].*common\/pipeline\/.*['"];?$/.test(line),
      `${rel} must stay a pure common-pipeline re-export shim; unexpected line: ${line}`,
    );
  }
}

const runtimeDebt = [
  {
    label: 'status-store compatibility',
    re: /status-store-compat|readGateStatusJson|legacy_gate_status|legacy_evidence_source|legacy_status:|status_json/,
  },
  {
    label: 'task transport alias',
    re: /\bsendTask\b/,
  },
  {
    label: 'legacy gateway env alias',
    re: /(^|[^A-Z0-9_])GATEWAY_URL\b|(^|[^A-Z0-9_])GATEWAY_TOKEN\b/,
  },
  {
    label: 'telemetry stream key config alias',
    re: /telemetry\.stream_key/,
  },
  {
    label: 'agent observability legacy comparison',
    re: /legacyRecords|normalizeLegacy|legacy_counts|missing_legacy/,
  },
  {
    label: 'diagnostic identity fallback',
    re: /resolveFallbackField|WithDiagnosticFallback|family:\s*'fallback'|path:\s*`fallback\./,
  },
  {
    label: 'agent-side git completion inference',
    re: /gitPullForPolling|syncRepoForPolling|POST_CHANGE_GRACE_MS|legacy agent-side commit\/push|HEAD movement as completion signal|catch any legacy remote update/,
  },
  {
    label: 'replay/operator compatibility shape',
    re: /backward compat|migration diagnostics|Agent-side forge-completion\.json remains readable|SWARM_CONFIG fallback/,
  },
];

const activeDocFiles = [
  ...walk(path.join(sourceRoot, 'docs'), (abs, name) => {
    const rel = relPath(sourceRoot, abs);
    return name.endsWith('.md') && !rel.startsWith('docs/archive/');
  }),
  path.join(sourceRoot, 'skills/nova/pipeline/README.md'),
  path.join(sourceRoot, 'skills/nova/pipeline/services/contracts/README.md'),
].filter((filePath) => fs.existsSync(filePath));

const activeDocDebt = [
  {
    label: 'active docs compatibility guidance',
    re: /compatibility projections|(^|[^A-Z0-9_])GATEWAY_URL\b|(^|[^A-Z0-9_])GATEWAY_TOKEN\b|env fallback: `SWARM_CONFIG`|telemetry\.stream_key|\bstream_key\b|sendTask|legacy status files|compatibility\s+shims?|\bgate-status\.json\b|\bstatus\.json\b/,
  },
];

const hits = [];
for (const filePath of runtimeFiles) {
  const rel = relPath(sourceRoot, filePath);
  if (acceptedCommonShimFiles.has(rel)) continue;
  for (const debt of runtimeDebt) hits.push(...lineHits(sourceRoot, filePath, debt.re, debt.label));
}
for (const filePath of activeDocFiles) {
  const source = sourceForActiveDocDebtScan(sourceRoot, filePath);
  for (const debt of activeDocDebt) {
    hits.push(...sourceLineHits(sourceRoot, filePath, source, debt.re, debt.label));
  }
}

if (hits.length > 0) {
  const preview = hits
    .slice(0, 80)
    .map((hit) => `${hit.label}: ${hit.path}:${hit.line}: ${hit.text}`)
    .join('\n');
  assert.fail(`canonical pipeline compatibility debt remains (${hits.length} hits):\n${preview}`);
}

console.log(JSON.stringify({
  ok: true,
  checked: 'canonical-pipeline-compat-debt-free',
  runtime_files: runtimeFiles.length,
  accepted_common_shims: acceptedCommonShimFiles.size,
}));
