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
  const commands = [];
  const lines = scriptText.split('\n');
  const invocationForms = [
    'nova-production-preflights <image>',
    'image <name>',
    'code <target>',
    'image',
    'smoke-agent <name>',
    'teardown-agents',
    'teardown-all',
    'agent <name>',
    'setup',
    'secrets',
    'infra',
    'tailscale',
    'agents',
    'smoke',
    'all',
    'status',
    'teardown',
  ];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^#\s+\.\/deploy\.sh\s+(.+)$/);
    if (match) {
      const body = match[1].trim();
      const form = invocationForms.find((candidate) => body === candidate || body.startsWith(`${candidate} `));
      if (!form) continue;
      let description = body.slice(form.length).trim();
      const next = lines[i + 1] || '';
      const continuation = next.match(/^#\s{10,}([A-Z].*)$/);
      if (continuation) {
        description = `${description} ${continuation[1].trim()}`.trim();
        i += 1;
      }
      commands.push({
        invocation: `./scripts/deploy.sh ${form}`.trim(),
        description,
      });
    }
  }
  return commands;
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

function buildDeployScriptInventory() {
  const scriptPath = 'scripts/deploy.sh';
  const text = read(scriptPath);
  const envNames = parseHeaderEnv(text).map((item) => item.name);
  return {
    generatedFrom: [scriptPath],
    commands: parseHeaderUsage(text),
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
