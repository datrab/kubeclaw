import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { selectedCode, validateCodeReceipt } from './code-release.mjs';

const families = {
  runtime: ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime', 'namespace-controller', 'archviewer', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'],
  ops: ['codex-ops', 'ops-mcp'],
};

// Provenance is authenticated by promotion/PR acceptance. This local boundary
// validates that persisted selection, source configuration and deployment agree.
export function validateReleaseReceipt(receipt, family) {
  const names = families[family];
  if (!names) throw new Error('Unknown release family');
  if (receipt.schemaVersion !== 1 || !/^[a-f0-9]{40}$/u.test(receipt.commit)
    || !Number.isSafeInteger(receipt.sourceRunId) || receipt.sourceRunId < 1
    || !Number.isSafeInteger(receipt.sourceRunAttempt) || receipt.sourceRunAttempt < 1
    || !receipt.images || JSON.stringify(Object.keys(receipt.images).sort()) !== JSON.stringify([...names].sort())) {
    throw new Error('Invalid complete release receipt or source run identity');
  }
  for (const name of names) {
    if (typeof receipt.images[name] !== 'string'
      || !new RegExp(`^ghcr\\.io/[a-z0-9_-]+/kubeclaw-${name}@sha256:[a-f0-9]{64}$`, 'u').test(receipt.images[name])) {
      throw new Error(`Invalid selected image slot: ${name}`);
    }
  }
  if (receipt.code) validateCodeReceipt(receipt.code);
  return receipt;
}

export function selectedRelease(root, family) {
  const names = families[family];
  if (!names) throw new Error('Unknown release family');
  const file = path.join(root, `releases/${family}-images.json`);
  if (!fs.existsSync(file)) throw new Error(`No selected ${family} release. Merge the Promote image release selection PR, then run node scripts/updates/materialize-release.mjs --family=${family}; no latest fallback is available.`);
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateReleaseReceipt(receipt, family);
  execFileSync(process.execPath, [path.join(import.meta.dirname, 'materialize-release.mjs'), `--family=${family}`, '--check'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const code = family === 'runtime' ? selectedCode(root, receipt) : undefined;
  return code ? { ...receipt, code } : receipt;
}

function containerSlots(manifest) {
  const slots = new Map();
  const visit = (value, key) => {
    if (!value || typeof value !== 'object') return;
    for (const field of ['containers', 'initContainers']) {
      for (const container of value[field] ?? []) {
        const id = `${key}/${field}/${container.name}`;
        if (slots.has(id)) throw new Error(`Duplicate image slot: ${id}`);
        slots.set(id, container);
      }
    }
    for (const [field, child] of Object.entries(value)) {
      if (!['containers', 'initContainers'].includes(field)) visit(child, key);
    }
  };
  yaml.loadAll(manifest, document => {
    if (document) visit(document, `${document.kind}/${document.metadata?.name}`);
  });
  return slots;
}

function bundleVariables(container) {
  const variables = new Map();
  for (const variable of container?.env ?? []) {
    if (!/^(?:KUBECLAW_)?CODE_BUNDLE_/u.test(variable.name)) continue;
    if (variables.has(variable.name)) throw new Error(`Duplicate reserved bundle control: ${variable.name}`);
    variables.set(variable.name, variable);
  }
  return variables;
}

function validateBundleVariableShape(actual, expected, slot) {
  for (const [name, variable] of actual) {
    // Authentication can introduce the chart's conditional Secret reference.
    if (name.endsWith('_AUTH_TOKEN')) continue;
    if (!expected.has(name)) throw new Error(`Unexpected reserved bundle control: ${slot}/${name}`);
    if (variable.valueFrom || typeof variable.value !== 'string') throw new Error(`Indirect reserved bundle control: ${slot}/${name}`);
  }
  for (const name of expected.keys()) {
    if (!name.endsWith('_AUTH_TOKEN') && !actual.has(name)) throw new Error(`Missing reserved bundle control: ${slot}/${name}`);
  }
}

function validateBundle(container, baseline, slot, receipt, requireBundle) {
  const actual = bundleVariables(container);
  const expected = bundleVariables(baseline);
  validateBundleVariableShape(actual, expected, slot);
  let consumers = 0;
  for (const name of ['CODE_BUNDLE_ENABLED', 'KUBECLAW_CODE_BUNDLE_ENABLED']) {
    if (!expected.has(name)) continue;
    const enabled = actual.get(name)?.value;
    if (!['true', 'false'].includes(enabled) || ((requireBundle || receipt.code) && enabled !== 'true')) throw new Error(`Canonical bundle consumer disabled: ${slot}/${name}`);
    const prefix = name.slice(0, -'ENABLED'.length);
    const commit = receipt.code?.commit ?? receipt.commit;
    const revision = actual.get(`${prefix}EXPECTED_COMMIT`)?.value;
    if ((enabled === 'true' || revision !== '') && revision !== commit) throw new Error(`Bundle commit differs from selected runtime: ${slot}`);
    if (actual.get(`${prefix}CONTRACT_VERSION`)?.value !== 'v2') throw new Error(`Unsupported bundle contract: ${slot}`);
    if (enabled === 'true' && receipt.code && prefix === 'CODE_BUNDLE_') {
      const url = actual.get(`${prefix}ARCHIVE_URL`)?.value;
      const bundle = Object.values(receipt.code.bundles).find(item => item.url === url);
      if (!bundle || actual.get(`${prefix}SHA256`)?.value !== bundle.sha256) throw new Error(`Unselected code bundle: ${slot}`);
      const role = container.env?.find(item => item.name === 'AGENT_NAME')?.value;
      if (!receipt.code.bundles[role] || receipt.code.bundles[role].url !== url) throw new Error(`Wrong code bundle role: ${slot}`);
    }
    consumers += 1;
  }
  return consumers;
}

export function validateRenderedRelease(baseline, rendered, receipt, requireBundle = false) {
  const expected = containerSlots(baseline);
  const actual = containerSlots(rendered);
  const refs = new Set(Object.values(receipt.images));
  for (const [slot, container] of expected) {
    if (refs.has(container.image) && actual.get(slot)?.image !== container.image) {
      throw new Error(`Selected release image slot changed or missing: ${slot}`);
    }
  }
  let bundleConsumers = 0;
  for (const [slot, container] of actual) {
    if (/\/kubeclaw-[^/]+(?:@|:)/u.test(container.image ?? '') && !refs.has(container.image)) {
      throw new Error(`Unselected first-party image: ${slot}`);
    }
    bundleConsumers += validateBundle(container, expected.get(slot), slot, receipt, requireBundle);
  }
  if (requireBundle && bundleConsumers === 0) throw new Error('Selected code bundle is missing from rendered workload');
}

// Private registry connectivity and the native host binding are needed even to
// render a valid baseline. Never import images or bundle controls from overlays.
function withDeploymentContext(args, role, run) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'release-registry-context-'));
  const context = [];
  try {
    for (let index = 0; index < args.length - 1; index += 1) {
      if (!['-f', '--values'].includes(args[index])) continue;
      const values = yaml.load(fs.readFileSync(args[++index], 'utf8'));
      const registry = values?.runtimeInfrastructure?.registry;
      const native = role === 'prism' ? values?.worker?.native : undefined;
      const binding = native && Object.fromEntries(['nodeName', 'namespace', 'policyDigest']
        .filter(key => native[key] !== undefined).map(key => [key, native[key]]));
      if (registry === undefined && (!binding || !Object.keys(binding).length)) continue;
      const file = path.join(temporary, `${index}.yaml`);
      fs.writeFileSync(file, yaml.dump({ ...(registry === undefined ? {} : { runtimeInfrastructure: { registry } }),
        ...(binding && Object.keys(binding).length ? { worker: { native: binding } } : {}) }), { mode: 0o600 });
      context.push('-f', file);
    }
    return run(context);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

function validateOverlays(args, root, role, baseline, render, receipt) {
  // Validate each explicit values overlay before a later override can conceal
  // a conflicting image or bundle choice. Helm performs the actual merge.
  let selectedSeen = false;
  for (let index = 0; index < args.length - 1; index += 1) {
    if (!['-f', '--values'].includes(args[index])) continue;
    const file = args[index + 1];
    const values = yaml.load(fs.readFileSync(file, 'utf8'));
    const commit = values?.codeBundle?.expectedCommit;
    if (commit && commit !== (receipt.code?.commit ?? receipt.commit)) throw new Error('Overlay bundle commit differs from selected runtime');
    if (selectedSeen) validateRenderedRelease(baseline, render(args.slice(0, index + 2)), receipt);
    selectedSeen ||= path.resolve(file) === path.join(root, `releases/values/${role}.yaml`);
    index += 1;
  }
  if (!selectedSeen) throw new Error('Selected release values are required');
}

if (process.argv[1] === import.meta.filename) {
  const [command, root, family, role, release, namespace, ...options] = process.argv.slice(2);
  const receipt = selectedRelease(root, family);
  if (command === 'verify') process.stdout.write(`${receipt.code?.commit ?? receipt.commit}\n`);
  else if (command === 'render') {
    const separator = options.indexOf('--');
    if (separator < 0) throw new Error('Helm values argument separator required');
    const control = options.slice(0, separator);
    const args = options.slice(separator + 1);
    if (!(family === 'ops' ? ['ops'] : ['nova', 'buster', 'prism-agent', 'prism']).includes(role)) throw new Error('Invalid release role');
    const chart = path.join(root, 'charts', role === 'ops' ? 'ops-pod' : role === 'prism' ? 'prism' : 'kubeclaw');
    const common = ['template', release, chart, '--namespace', namespace];
    const discovery = control.find(arg => arg.startsWith('--discovery='))?.slice('--discovery='.length);
    const baselineArgs = discovery ? ['-f', discovery] : [];
    baselineArgs.push('-f', path.join(root, `releases/values/${role}.yaml`));
    const render = values => execFileSync('helm', [...common, ...values], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    withDeploymentContext(args, role, context => {
      const baseline = render([...baselineArgs, ...context]);
      validateOverlays(args, root, role, baseline, values => render([...context, ...values]), receipt);
      const rendered = render(args);
      validateRenderedRelease(baseline, rendered, receipt, control.includes('--bundle'));
      process.stdout.write(rendered);
    });
  } else throw new Error('Unknown deployment release command');
}
