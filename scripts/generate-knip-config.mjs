#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(repoRoot, 'charts/kubeclaw/files/config/knip.json');
const checkOnly = process.argv.includes('--check');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
}

function relativeModule(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/^\.\//u, '');
  return /\.(?:[cm]?[jt]sx?)$/u.test(normalized) && !normalized.startsWith('dist/')
    ? normalized
    : null;
}

function packageEntrypoints(packageJson) {
  const entries = [];
  const visit = (value) => {
    if (typeof value === 'string') {
      const entry = relativeModule(value);
      if (entry) entries.push(entry);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(packageJson.main);
  visit(packageJson.bin);
  visit(packageJson.exports);
  visit(packageJson.openclaw?.extensions);
  return entries;
}

function pluginEntrypoints(pluginJson) {
  return ['stages', 'observers', 'adapters', 'testProviders', 'reportAdapters']
    .flatMap((kind) => Array.isArray(pluginJson?.[kind]) ? pluginJson[kind] : [])
    .map((registration) => relativeModule(registration?.module))
    .filter(Boolean);
}

function childDirectories(parent) {
  const absolute = path.join(repoRoot, parent);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.posix.join(parent, entry.name))
    .sort();
}

function pluginWorkspace(directory) {
  const packageJson = readJson(path.posix.join(directory, 'package.json'));
  const manifestPath = path.posix.join(directory, 'plugin.json');
  const manifestEntries = fs.existsSync(path.join(repoRoot, manifestPath))
    ? pluginEntrypoints(readJson(manifestPath))
    : [];
  const overrides = {
    'skills/common/plugins/openclaw-agent-observer': ['src/index.ts'],
  }[directory] ?? [];
  const entry = [...new Set([
    ...manifestEntries,
    ...packageEntrypoints(packageJson),
    ...overrides,
    'tests/**/*.{mjs,mts,ts}',
  ])].sort();
  if (entry.length === 1) throw new Error(`No production entrypoint discovered for ${directory}`);
  return {
    entry,
    project: [
      'src/**/*.{ts,mjs}',
      'common/**/*.{ts,mjs}',
      'contracts/**/*.{ts,mjs}',
      'tests/**/*.{ts,mts,mjs}',
    ],
  };
}

const pluginDirectories = [
  ...childDirectories('skills/common/plugins'),
  ...childDirectories('skills/nova/plugins'),
  ...childDirectories('skills/buster/plugins'),
].filter((directory) => fs.existsSync(path.join(repoRoot, directory, 'package.json')));

const workspaces = {
  '.': {
    entry: [
      'scripts/**/*.mjs',
      'skills/nova/pipeline.ts',
      'skills/nova/project_setup/**/*.ts',
      'tests/**/*.{mjs,mts,ts}',
    ],
    project: [
      'scripts/**/*.{js,mjs,cjs}',
      'skills/nova/pipeline.ts',
      'skills/nova/project_setup/**/*.{ts,mjs}',
      'tests/**/*.{js,mjs,mts,cjs,ts}',
    ],
  },
  'contracts/agent-observability/v1': {
    entry: ['src/index.ts'],
    project: ['src/**/*.ts'],
  },
  'skills/common/plugin-runtime/foundation': {
    entry: ['isolation/child.mjs'],
    project: ['**/*.{ts,mjs}'],
  },
  'skills/nova/core': {
    entry: ['src/index.ts', 'cli.ts'],
    project: ['**/*.{ts,mjs}'],
  },
  'skills/worker/core': {
    entry: ['src/index.ts'],
    project: ['**/*.{ts,mjs}'],
  },
  'skills/buster/engine': {
    entry: ['src/index.ts', 'test-gates/provider-child.mjs', 'test-gates/report-adapter-child.mjs'],
    project: ['**/*.{ts,mjs}'],
  },
  'skills/common/plugin-runtime/sdk': {
    entry: ['src/index.ts', 'src/testing/index.ts'],
    project: ['src/**/*.ts'],
  },
};

for (const directory of pluginDirectories) workspaces[directory] = pluginWorkspace(directory);

const config = {
  $schema: 'https://unpkg.com/knip@6/schema.json',
  // Internal helpers are allowed to remain exported for package-local tests and
  // diagnostics; only symbols unused even inside their defining module matter.
  ignoreExportsUsedInFile: true,
  // These are host/runtime executables invoked intentionally through bounded
  // subprocess adapters and verification harnesses, not npm dependencies.
  ignoreBinaries: [
    'buildctl',
    'cc',
    'eslint',
    'gofmt',
    'helm',
    'kubeconform',
    'kubectl',
    'tsc',
    'which',
  ],
  ignore: [
    '**/dist/**',
    '**/generated/**',
    '**/node_modules/**',
    'Projects/**',
    'charts/kubeclaw/files/config/eslint.config.mjs',
    'charts/kubeclaw/files/config/eslint-type-evidence-config.mjs',
    'charts/kubeclaw/files/config/eslint-type-evidence-tests-config.mjs',
    'charts/kubeclaw/files/config/eslint-type-evidence-generated-config.mjs',
    'charts/kubeclaw/files/config/type-evidence-eslint-plugin.mjs',
    'contracts/telemetry/v1/{bundle-types,telemetry-types}.ts',
  ],
  ignoreDependencies: [
    '@axe-core/playwright',
    '@types/node',
    'file',
    'ioredis',
    'js-yaml',
    'openclaw',
    'pixelmatch',
    'playwright',
    'pg',
    'pngjs',
    'ws',
  ],
  workspaces: Object.fromEntries(Object.entries(workspaces).sort(([left], [right]) => left.localeCompare(right))),
};

const rendered = `${JSON.stringify(config, null, 2)}\n`;
if (checkOnly) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== rendered) {
    console.error(`Generated Knip configuration is stale: ${path.relative(repoRoot, outputPath)}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, plugins: pluginDirectories.length, output: path.relative(repoRoot, outputPath) }));
} else {
  fs.writeFileSync(outputPath, rendered);
  console.log(JSON.stringify({ ok: true, plugins: pluginDirectories.length, output: path.relative(repoRoot, outputPath) }));
}
