#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildSecretSetupInventory as buildSecretInventory } from './docs-secret-inventory.mjs';
import { yamlFileInventory } from './docs-yaml-inventory.mjs';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const outDir = path.join(root, 'docs/generated/inventory');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function lineNumber(text, needle) {
  const index = text.indexOf(needle);
  if (index === -1) return null;
  return text.slice(0, index).split('\n').length;
}

function parseHeaderUsage(scriptText) {
  // Explicit public invocation contracts, checked against every main dispatch case.
  // The header omits commands and sometimes their positional arguments; bare case
  // names are not a usable reader reference. Do not discover internal functions.
  const forms = [
    [
        "render <nova|buster> [image|code]",
        "Render the selected release without applying it; image is the default mode. Requires the selected runtime release."
    ],
    [
        "render prism",
        "Render the dedicated Prism release without applying it. Requires the selected runtime release."
    ],
    [
        "setup",
        "Create namespace, required Secrets and Helm repositories."
    ],
    [
        "secrets",
        "Create/copy/prompt required Kubernetes Secrets, including enabled Prism inputs."
    ],
    [
        "infra",
        "Deploy required infrastructure and enabled optional components."
    ],
    [
        "tailscale",
        "Deploy the Tailscale Kubernetes Operator."
    ],
    [
        "buildkit-preflight [image] [pull-secret]",
        "Check rootless BuildKit with a temporary cluster Pod; image defaults to BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE and must be digest-pinned."
    ],
    [
        "native-node-render OUT [POLICY]",
        "Generate a new reviewable host-pool setup directory; policy defaults to my-values/infra/native-worker-pools.yaml. Does not apply host setup."
    ],
    [
        "native-node-preflight [POLICY]",
        "Read-only native capacity check on the selected host; policy defaults to my-values/infra/native-worker-pools.yaml."
    ],
    [
        "buster-buildkit-smoke",
        "Deprecated alias for nova-buildkit-preflight."
    ],
    [
        "nova-buildkit-preflight",
        "Build, publish, deploy and verify through the Nova/Buster production capability graph."
    ],
    [
        "nova-unit-preflight",
        "Run a real unit process through Nova and Buster."
    ],
    [
        "nova-kubernetes-fixture-preflight [image] [secret-name]",
        "Exercise a retained Kubernetes fixture; image falls back to KUBECLAW_KUBERNETES_PREFLIGHT_IMAGE; Secret to KUBECLAW_KUBERNETES_PREFLIGHT_SECRET then kubeclaw-fixture-preflight."
    ],
    [
        "nova-http-preflight [image]",
        "Exercise the real HTTP provider path through Nova and Buster; select a digest-pinned workload image or its command-specific environment input."
    ],
    [
        "nova-a11y-preflight [image]",
        "Exercise the real browser accessibility provider path through Nova and Buster; select a digest-pinned workload image or its command-specific environment input."
    ],
    [
        "nova-api-preflight [image]",
        "Exercise the real API provider path through Nova and Buster; select a digest-pinned workload image or its command-specific environment input."
    ],
    [
        "nova-lighthouse-preflight [image]",
        "Exercise the real Lighthouse provider path through Nova and Buster; select a digest-pinned workload image or its command-specific environment input."
    ],
    [
        "nova-visual-preflight [image]",
        "Exercise the real visual comparison provider path through Nova and Buster; select a digest-pinned workload image or its command-specific environment input."
    ],
    [
        "nova-e2e-preflight [image]",
        "Exercise the real browser end-to-end provider path through Nova and Buster; select a digest-pinned workload image or its command-specific environment input."
    ],
    [
        "nova-security-preflight [image]",
        "Exercise the real security provider path through Nova and Buster; select a digest-pinned workload image or its command-specific environment input."
    ],
    [
        "nova-tailscale-preflight [image]",
        "Exercise the real Kubernetes/Tailscale provider path through Nova and Buster; select a digest-pinned workload image or its command-specific environment input."
    ],
    [
        "nova-production-preflights [image] [secret-name]",
        "Run production-required suite preflights; image falls back to KUBECLAW_PRODUCTION_PREFLIGHT_IMAGE; Secret to KUBECLAW_KUBERNETES_PREFLIGHT_SECRET then kubeclaw-fixture-preflight."
    ],
    [
        "worker-trust-e2e",
        "Exercise cluster SPIRE identity, mTLS, authorization and source attestation."
    ],
    [
        "buster-infra-smoke",
        "Publish through Redis and exercise deployed Buster, BuildKit and deployment."
    ],
    [
        "agents",
        "Deploy Nova and Buster from selected runtime values."
    ],
    [
        "agent <nova|buster> [--with-code]",
        "Deploy one agent; --with-code additionally preflights, deploys and smoke-checks its code bundle."
    ],
    [
        "agent prism",
        "Deploy the dedicated Prism release; --with-code is not supported for Prism."
    ],
    [
        "image [nova|buster|both]",
        "Deploy selected agent images; omitted target means both."
    ],
    [
        "code [nova|buster|both]",
        "Deploy selected code bundles; omitted target means both."
    ],
    [
        "all",
        "Create prerequisites, infrastructure and enabled Prism release, then deploy agents."
    ],
    [
        "smoke",
        "Run Nova/Buster Pod-level smoke checks."
    ],
    [
        "smoke-agent <nova|buster>",
        "Run Pod-level smoke checks for one named agent."
    ],
    [
        "status",
        "Show agents/infrastructure and enabled Prism status."
    ],
    [
        "prism",
        "Deploy the dedicated multi-workload Prism release."
    ],
    [
        "prism-smoke",
        "Run Prism smoke checks."
    ],
    [
        "prism-e2e",
        "Run the Prism end-to-end check."
    ],
    [
        "prism-status",
        "Show Prism status."
    ],
    [
        "teardown-prism",
        "Remove the Prism release using its scoped teardown procedure."
    ],
    [
        "teardown",
        "After confirmation, remove agents and infrastructure; preserve namespace and Secrets. PVC cleanup can delete data."
    ],
    [
        "teardown-agents",
        "Remove agents only; preserve infrastructure."
    ],
    [
        "teardown-all",
        "After destroy confirmation, remove the namespace and its contents, including Secrets and PVCs."
    ]
];
  const cases = parseCaseCommands(scriptText);
  const covered = new Set(forms.map(([form]) => form.split(' ')[0]));
  const missing = cases.filter(command => !covered.has(command));
  const extra = [...covered].filter(command => !cases.includes(command));
  if (missing.length || extra.length) throw new Error(`Deployment invocation coverage drift: missing=${missing} extra=${extra}`);
  return forms.map(([form, description]) => ({ invocation: `./scripts/deploy.sh ${form}`, description }));
}

function parseHeaderEnv(scriptText) {
  const vars = [];
  for (const line of scriptText.split('\n')) {
    const match = line.match(/^#\s{3}([A-Z0-9_]+)\s{2,}(.*)$/);
    if (match) {
      vars.push({
        name: match[1],
        description: match[2].trim(),
      });
    }
  }
  return vars;
}

function parseCaseCommands(scriptText) {
  const commands = [];
  const caseStart = scriptText.indexOf('case "${1:-}" in');
  const text = caseStart === -1 ? scriptText : scriptText.slice(caseStart);
  for (const match of text.matchAll(/^\s{2}([a-z0-9-]+)\)/gm)) {
    commands.push(match[1]);
  }
  return commands;
}

function parseFunctions(scriptText) {
  return [...scriptText.matchAll(/^([a-zA-Z0-9_]+)\(\) \{/gm)].map((match) => match[1]);
}

function parseDefaultAssignments(scriptText, names) {
  const defaults = {};
  for (const name of names) {
    const pattern = new RegExp(`[A-Z0-9_]+="\\$\\{${name}:-(.*?)\\}"`);
    const match = scriptText.match(pattern);
    defaults[name] = match ? match[1] : null;
  }
  return defaults;
}

function fileInventory(relPath) {
  return yamlFileInventory(relPath, read);
}

function publicMapCliContracts() {
  const sourcePath = 'scripts/run-lint-report.mjs';
  const text = read(sourcePath);
  const options = [
    ['--policy', 'PATH', 'required', 'Lint policy file, resolved against the invoking current directory.'],
    ['--policy-project', 'ID', 'required', 'Project ID selected within the lint policy.'],
    ['--output', 'PATH', 'required', 'Validated JSON report destination, atomically replaced; parent directories are created.'],
    ['--working-directory', 'PATH', 'current directory', 'Repository to inspect; resolved to an absolute path.'],
    ['--project', 'NAME', 'omitted', 'Project name recorded in the report.'],
    ['--module-path', 'PATH', 'omitted', 'Restrict tools to one repository-relative module.'],
    ['--tier', 'pre-check|full', 'full', 'Select lint tier; any other value is rejected.'],
    ['--changed-file', 'PATH', 'empty list; repeatable', 'Append a changed file restriction in argument order.'],
    ['--raw-manifest', 'PATH', 'empty list; repeatable', 'Append a Kubernetes raw input override.'],
    ['--helm-chart', 'PATH', 'empty list; repeatable', 'Append a Kubernetes chart input override.'],
  ];
  const maps = [...text.matchAll(/const (?:valueOptions|listOptions) = new Map\(\[([\s\S]*?)\]\);/g)];
  if (maps.length !== 2) throw new Error('Lint report public option-map shape drift');
  const names = maps.flatMap(match => [...match[1].matchAll(/\['(--[a-z-]+)', '[a-zA-Z]+'\]/g)].map(row => row[1]));
  if (JSON.stringify(names) !== JSON.stringify(options.map(row => row[0]))) throw new Error('Lint report public option-map contract drift');
  return [{
    sourcePath,
    invocation: 'npm run lint:report -- --policy PATH --policy-project ID --output PATH [options]',
    behavior: 'Every listed option takes one following nonempty value that must not start with --. Repeated scalar options use the last value; repeated list options append. Unknown options and missing required values fail with exit 2. --help returns help before required checks; --include-debt and --include-experimental are no-value booleans documented in Defined Flags. Runtime failure or failed tools use exit 1; blocking findings use exit 3; a successful unblocked report uses exit 0. Kubernetes overrides are passed only when at least one raw-manifest or helm-chart entry exists.',
    options: options.map(([name, value, defaultValue, meaning]) => ({ name, value, default: defaultValue, meaning, line: lineNumber(text, `['${name}',`) })),
  }, ...[
    ['scripts/generate-buster-error-reference.mjs', 'Existing buster-error-codes.md Evidence revision; no fallback when absent.', 'Requires a full 40-character lowercase hex revision.'],
    ['scripts/generate-buster-provider-reference.mjs', 'Existing provider reference Evidence revision, then 3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f.', 'Requires a full 40-character lowercase hex revision identifying an existing commit; pinned inputs must match current inputs.'],
  ].map(([sourcePath, fallback, validation]) => ({
    sourcePath,
    invocation: `node ${sourcePath} [--revision=SHA] [--write]`,
    behavior: `${validation} The revision value uses equals syntax, not a separate following argument. The first --revision= occurrence wins. Without --write, compare generated bytes with the current reader reference; --write replaces it. Other command-line tokens are not used as option definitions by these parsers.`,
    options: [{ name: '--revision=SHA', value: '40 lowercase hexadecimal characters', default: fallback, meaning: 'Select source citation revision for the generated reference.', line: lineNumber(read(sourcePath), 'process.argv.find') }],
  }))];
}

function buildDeployScriptInventory() {
  const scriptPath = 'scripts/deploy.sh';
  const text = read(scriptPath);
  const envNames = parseHeaderEnv(text).map((item) => item.name);
  const sources = [scriptPath, 'scripts/run-lint-report.mjs', 'scripts/generate-buster-error-reference.mjs', 'scripts/generate-buster-provider-reference.mjs'];
  return {
    generatedFrom: sources,
    discoveryScope: {
      family: 'CLI',
      owner: 'documentation automation',
      generator: 'scripts/docs-inventory.mjs:buildDeployScriptInventory',
      searchSpace: { sources, recursive: false },
      parser: {
        implementation: 'parseHeaderUsage, parseHeaderEnv, parseCaseCommands, parseFunctions, parseDefaultAssignments, publicMapCliContracts',
        rule: 'Reviewed deploy invocation forms checked against main dispatch cases; source-shaped shell header/default/function patterns; fixed lint option-map contract and two explicit reference-generator revision-option contracts.',
      },
      exclusions: [
        'Other CLI sources are outside this fixed deploy/supplemental boundary; configuration-runtime-inputs.json supplies a separate bounded runtime scan.',
        'No shell execution, general shell AST, arbitrary argument-parser discovery or proof of runtime success.',
      ],
    },
    commands: parseHeaderUsage(text),
    supplementalCliCommands: publicMapCliContracts(),
    commandCases: parseCaseCommands(text),
    environment: parseHeaderEnv(text),
    defaults: parseDefaultAssignments(text, envNames),
    functions: parseFunctions(text),
    componentFlags: [
      'KUBECLAW_DEPLOY_POSTGRESQL',
      'KUBECLAW_DEPLOY_LITELLM',
      'TAILSCALE_OPERATOR_ENABLED',
      'ALLOW_PARTIAL_INFRA',
    ],
    sourceAnchors: {
      setup: lineNumber(text, 'cmd_setup()'),
      secrets: lineNumber(text, 'cmd_secrets()'),
      tailscale: lineNumber(text, 'deploy_tailscale_operator()'),
      infra: lineNumber(text, 'cmd_infra()'),
      agents: lineNumber(text, 'cmd_agents()'),
      smoke: lineNumber(text, 'cmd_smoke()'),
      teardown: lineNumber(text, 'cmd_teardown()'),
    },
  };
}

function buildSecretSetupInventory() {
  return buildSecretInventory({
    read,
    parseHeaderEnv,
    parseDefaultAssignments,
    lineNumber,
  });
}

function buildHelmValuesInventory() {
  const files = [
    'charts/kubeclaw/values.yaml',
    'my-values/nova-values.yaml',
    'my-values/buster-values.yaml',
    'my-values/infra/redis-values.yaml',
    'my-values/infra/postgresql-values.yaml',
    'my-values/infra/litellm-values.yaml',
    'my-values/infra/litellm-config.yaml',
    'my-values/infra/litellm-deployment.yaml',
    'my-values/infra/tailscale-operator-values.yaml',
    'my-values/infra/registry-mirror.yaml',
    'my-values/infra/registry-local.yaml',
    'my-values/infra/network-policies.yaml',
    'my-values/infra/buster-namespace-fence.yaml',
  ];

  return {
    generatedFrom: files,
    files: files.map(fileInventory),
  };
}

function parseWorkflowTriggers(text) {
  const triggers = [];
  const onIndex = text.search(/^on:/m);
  if (onIndex === -1) return triggers;
  const afterOn = text.slice(onIndex).split('\n').slice(1);
  for (const line of afterOn) {
    if (/^\S/.test(line) && line.trim() !== '') break;
    const match = line.match(/^ {2}([A-Za-z0-9_-]+):/);
    if (match) triggers.push(match[1]);
  }
  return triggers;
}

function parseWorkflowPathFilters(text) {
  const paths = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s+paths:\s*$/.test(lines[i])) continue;
    const indent = lines[i].match(/^(\s*)/)[1].length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (!line.trim()) continue;
      const nextIndent = line.match(/^(\s*)/)[1].length;
      if (nextIndent <= indent) break;
      const match = line.match(/^\s+-\s+['"]?([^'"]+)['"]?\s*$/);
      if (match) paths.push(match[1]);
    }
  }
  return [...new Set(paths)];
}

function parseWorkflowJobs(text) {
  const jobsIndex = text.search(/^jobs:/m);
  if (jobsIndex === -1) return [];
  const jobsText = text.slice(jobsIndex).split('\n').slice(1);
  const jobs = [];
  for (const line of jobsText) {
    if (/^\S/.test(line) && line.trim() !== '') break;
    const match = line.match(/^ {2}([A-Za-z0-9_-]+):/);
    if (match) jobs.push(match[1]);
  }
  return jobs;
}

function parseWorkflowCommands(text) {
  const commands = new Set();
  for (const match of text.matchAll(/run:\s*(.+)$/gm)) {
    const command = match[1].trim();
    if (command && command !== '|' && command !== '>') {
      commands.add(command.replace(/^['"]|['"]$/g, ''));
    }
  }
  for (const match of text.matchAll(/^\s+(npm run [A-Za-z0-9:_-]+)/gm)) {
    commands.add(match[1]);
  }
  for (const match of text.matchAll(/uses:\s*([^\s]+)/g)) {
    commands.add(`uses: ${match[1]}`);
  }
  return [...commands].sort();
}

function buildWorkflowInventory() {
  const workflowDir = path.join(root, '.github/workflows');
  const files = fs.readdirSync(workflowDir)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .sort();
  return {
    generatedMarker: 'Generated by scripts/docs-inventory.mjs. Do not edit by hand.',
    generatedFrom: files.map((file) => `.github/workflows/${file}`),
    discoveryScope: {
      family: 'Workflow',
      owner: 'documentation automation',
      generator: 'scripts/docs-inventory.mjs:buildWorkflowInventory',
      searchSpace: { root: '.github/workflows', recursive: false, extensions: ['.yaml', '.yml'] },
      parser: {
        implementation: 'parseWorkflowTriggers, parseWorkflowPathFilters, parseWorkflowJobs, parseWorkflowCommands; name and cron source patterns',
        rule: 'Source-shaped text extraction: top-level on/jobs blocks with two-space keys, indented paths lists, quoted cron values, single-line run/uses and indented npm run references.',
      },
      exclusions: [
        'Nested directory contents and names not ending .yaml or .yml are not selected. Immediate matching names are read without file-type or alias filtering; read failures, including matching directory names, propagate.',
        'No general YAML evaluation, alias/expression resolution, complete multiline shell interpretation or traversal of referenced action/reusable-workflow internals.',
        'Product project-compiler workflows have a separate authority in scripts/docs-product-pipeline-reference.mjs; this inventory describes CI workflow files only.',
      ],
    },
    workflows: files.map((file) => {
      const relPath = `.github/workflows/${file}`;
      const text = read(relPath);
      const nameMatch = text.match(/^name:\s*(.+)$/m);
      const schedule = [...text.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
      return {
        path: relPath,
        name: nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, '') : file,
        triggers: parseWorkflowTriggers(text),
        pathFilters: parseWorkflowPathFilters(text),
        schedules: schedule,
        jobs: parseWorkflowJobs(text),
        commandAndActionRefs: parseWorkflowCommands(text),
      };
    }),
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function outputs() {
  return new Map([
    ['deploy-script.json', buildDeployScriptInventory()],
    ['secret-setup.json', buildSecretSetupInventory()],
    ['helm-values.json', buildHelmValuesInventory()],
    ['workflows.json', buildWorkflowInventory()],
  ]);
}

const stale = [];
const generated = outputs();

if (!checkOnly) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const [fileName, value] of generated) {
  const target = path.join(outDir, fileName);
  const expected = stableJson(value);
  if (checkOnly) {
    const actual = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (actual !== expected) stale.push(path.relative(root, target));
  } else {
    fs.writeFileSync(target, expected);
    console.log(`wrote ${path.relative(root, target)}`);
  }
}

if (checkOnly) {
  if (stale.length) {
    console.error('Generated docs inventory is stale. Run: npm run docs:inventory');
    for (const file of stale) console.error(`stale: ${file}`);
    process.exit(1);
  }
  console.log('docs inventory is current');
}
