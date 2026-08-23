#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(root, 'docs', 'site');
const catalogueRoot = path.join(siteRoot, 'extend', 'plugin-catalogue');
const command = process.argv[2] ?? 'check';
const errors = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.isFile() ? [target] : [];
  });
}

function rel(target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function remoteBase() {
  const remote = git('remote', 'get-url', 'origin');
  const ssh = remote.match(/^git@github\.com:(.+)\.git$/u);
  const https = remote.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/u);
  const repository = ssh?.[1] ?? https?.[1];
  if (!repository) throw new Error(`Unsupported origin URL: ${remote}`);
  return `https://github.com/${repository}`;
}

const extensionKeys = [
  ['stage', 'stages'],
  ['observer', 'observers'],
  ['capability adapter', 'adapters'],
  ['test provider', 'testProviders'],
  ['report adapter', 'reportAdapters'],
];
const extensionKinds = [...extensionKeys.map(([kind]) => kind), 'OpenClaw extension'];

const pluginFiles = walk(path.join(root, 'skills'))
  .filter((target) => ['plugin.json', 'openclaw.plugin.json'].includes(path.basename(target)))
  .sort();

const plugins = pluginFiles.map((file) => {
  const sourceManifest = readJson(file);
  const directory = path.dirname(file);
  const packageFile = path.join(directory, 'package.json');
  const packageValue = fs.existsSync(packageFile) ? readJson(packageFile) : {};
  const pipeline = path.basename(file) === 'plugin.json';
  const manifest = pipeline ? sourceManifest : {
    ...sourceManifest,
    apiVersion: 'openclaw-plugin',
    packageVersion: sourceManifest.version,
  };
  const registrations = pipeline
    ? extensionKeys.flatMap(([kind, key]) =>
      (manifest[key] ?? []).map((registration) => ({ ...registration, kind })))
    : (packageValue.openclaw?.extensions ?? []).map((module, index) => ({
      kind: 'OpenClaw extension',
      id: index === 0 ? manifest.id : `${manifest.id}-${index + 1}`,
      module,
      requiredCapabilities: [],
    }));
  const tests = walk(directory).filter((target) => /(?:^|\/)(?:tests?|__tests__)(?:\/|$)/u.test(target));
  const readme = path.join(directory, 'README.md');
  return { manifest, file, directory, registrations, packageValue, tests, readme, pipeline };
});

function list(values) {
  return values?.length ? values.map((value) => `\`${value}\``).join(', ') : 'None.';
}

function registrationName(registration) {
  return registration.type ?? registration.contractId ?? registration.id;
}

function useText(kinds) {
  if (kinds.has('stage')) return 'Use this package when a pipeline graph needs one of its declared stage types.';
  if (kinds.has('test provider')) return 'Use this package when a test plan needs one of its declared provider contracts.';
  if (kinds.has('report adapter')) return 'Use this package when a test plan must normalize one of its declared report formats.';
  if (kinds.has('observer')) return 'Use this package when an immutable lifecycle record must reach one of its declared observer targets.';
  if (kinds.has('OpenClaw extension')) return 'Use this package when OpenClaw agent hooks must enter the KubeClaw observability boundary.';
  return 'Use this package when a granted capability needs one of its declared adapters.';
}

function pluginPage(plugin) {
  const { manifest, file, directory, registrations, packageValue, tests, readme, pipeline } = plugin;
  const kinds = new Set(registrations.map((item) => item.kind));
  const sourceRoot = rel(directory);
  const verification = packageValue.scripts?.test
    ? `npm test --prefix ${sourceRoot}`
    : 'npm run verify:plugin-system-v2';
  const lines = [
    `# ${manifest.id}`,
    '',
    'Status: implemented',
    'Audience: plugin author, operator, maintainer',
    `Owner: ${manifest.id}`,
    `Evidence: ${rel(file)}`,
    `Applies to: ${manifest.apiVersion}; package ${manifest.packageVersion}`,
    'Last verified: generated during publication',
    '',
    '## Purpose',
    '',
    `This package provides ${registrations.length} registered extension${registrations.length === 1 ? '' : 's'} through the canonical plugin runtime.`,
    '',
    '## When To Use It',
    '',
    useText(kinds),
    '',
    '## Boundaries',
    '',
    ...(pipeline ? [
      '- The manifest declares extension identity and requested authority.',
      '- Platform policy grants authority separately.',
      '- Core validates lifecycle effects and owns canonical pipeline state.',
      '- The package cannot use undeclared capabilities.',
    ] : [
      '- OpenClaw owns hook registration and plugin activation.',
      '- The plugin writes only the configured observability streams.',
      '- The plugin does not own pipeline scheduling or lifecycle state.',
    ]),
    '',
    '## Registration Summary',
    '',
    '| Kind | ID | Public contract or type | Module | Export |',
    '| --- | --- | --- | --- | --- |',
    ...registrations.map((item) => `| ${item.kind} | \`${item.id}\` | \`${registrationName(item)}\` | \`${item.module}\` | ${item.export ? `\`${item.export}\`` : 'Runtime registration'} |`),
  ];
  for (const registration of registrations) {
    lines.push(
      '',
      `## ${registration.kind}: ${registration.id}`,
      '',
      `Public identifier: \`${registrationName(registration)}\`.`,
      '',
      `Required capabilities: ${list(registration.requiredCapabilities)}`,
      '',
      `Provided capabilities: ${list(registration.providesCapabilities)}`,
      '',
      `Configuration schema: ${registration.configSchema ? `\`${registration.configSchema}\`` : 'None.'}`,
      '',
      `Input schema: ${registration.inputSchema ? `\`${registration.inputSchema}\`` : 'None.'}`,
      '',
      `Result schema: ${registration.resultSchema ? `\`${registration.resultSchema}\`` : 'None.'}`,
    );
    if (registration.inputs?.length) {
      lines.push('', 'Inputs:', '', ...registration.inputs.map((item) => `- \`${item.name}\`: ${item.kind}; ${item.required ? 'required' : 'optional'}.`));
    }
    if (registration.outputs?.length) {
      lines.push('', 'Outputs:', '', ...registration.outputs.map((item) => `- \`${item.name}\`: ${item.kind}; ${item.required ? 'required' : 'optional'}.`));
    }
  }
  lines.push(
    '',
    '## Failure Behavior',
    '',
    'Registry validation rejects a missing module, export, schema, or capability declaration.',
    'Runtime policy rejects authority that the operator did not grant.',
    'Core records a validated failure without giving the plugin lifecycle authority.',
    '',
    '## Verification',
    '',
    'Run:',
    '',
    '```bash',
    verification,
    '```',
    '',
    `Package tests found: ${tests.length}.`,
    '',
    '## Source Evidence',
    '',
    `- Manifest: \`${rel(file)}\``,
    `- Package root: \`${sourceRoot}\``,
    `- Authored package guide: \`${rel(readme)}\``,
    ...tests.map((target) => `- Test: \`${rel(target)}\``),
  );
  return `${lines.join('\n')}\n`;
}

function catalogueIndex() {
  const groups = new Map(extensionKinds.map((kind) => [kind, []]));
  for (const plugin of plugins) {
    for (const kind of new Set(plugin.registrations.map((item) => item.kind))) groups.get(kind).push(plugin);
  }
  const lines = [
    '# Plugin Catalogue', '',
    'Status: implemented',
    'Audience: plugin author, operator, maintainer',
    'Owner: plugin-foundation',
    'Evidence: scripts/docs-publication.mjs',
    'Applies to: pipeline-plugin-v2',
    'Last verified: generated during publication', '',
    '## Purpose', '',
    'Use this catalogue to find every installed plugin package and its declared extension surfaces.', '',
    `The catalogue contains ${plugins.length} packages.`,
  ];
  for (const [kind, entries] of groups) {
    lines.push('', `## ${kind[0].toUpperCase()}${kind.slice(1)} Packages`, '');
    if (!entries.length) lines.push('No package declares this extension surface.');
    else lines.push(...entries.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id)).map((plugin) => `- [${plugin.manifest.id}](${plugin.manifest.id}.md)`));
  }
  return `${lines.join('\n')}\n`;
}

function capabilityPage() {
  const vocabulary = fs.readFileSync(path.join(root, 'skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts'), 'utf8');
  const capabilities = [...vocabulary.matchAll(/^\s{2}'([^']+)': definition\(/gmu)].map((match) => match[1]);
  const users = new Map(capabilities.map((id) => [id, []]));
  for (const plugin of plugins) {
    for (const registration of plugin.registrations) {
      for (const id of [...(registration.requiredCapabilities ?? []), ...(registration.providesCapabilities ?? [])]) {
        if (!users.has(id)) users.set(id, []);
        users.get(id).push(`${plugin.manifest.id}:${registration.id}`);
      }
    }
  }
  return `${[
    '# Capability Catalogue', '',
    'Status: implemented',
    'Audience: plugin author, operator, security reviewer',
    'Owner: plugin-foundation',
    'Evidence: skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts',
    'Applies to: pipeline-plugin-v2',
    'Last verified: generated during publication', '',
    '## Purpose', '',
    'This catalogue lists each grantable capability and every registration that declares it.', '',
    '| Capability | Declared by |',
    '| --- | --- |',
    ...[...users].sort(([a], [b]) => a.localeCompare(b)).map(([id, registrations]) => `| \`${id}\` | ${[...new Set(registrations)].map((item) => `\`${item}\``).join('<br>') || 'No installed registration.'} |`),
  ].join('\n')}\n`;
}

const generated = new Map([
  [path.join(catalogueRoot, 'README.md'), catalogueIndex()],
  [path.join(siteRoot, 'reference', 'capabilities.md'), capabilityPage()],
  ...plugins.map((plugin) => [path.join(catalogueRoot, `${plugin.manifest.id}.md`), pluginPage(plugin)]),
]);

function generate() {
  for (const [target, content] of generated) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function compareGenerated() {
  for (const [target, content] of generated) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) errors.push(`${rel(target)} is stale or missing`);
  }
  const expected = new Set([...generated].map(([target]) => target));
  for (const target of walk(catalogueRoot).filter((file) => file.endsWith('.md'))) {
    if (!expected.has(target)) errors.push(`${rel(target)} has no installed plugin`);
  }
}

const metadataFields = ['Status', 'Audience', 'Owner', 'Evidence', 'Applies to', 'Last verified'];
const vague = /\b(simply|obviously|appropriate|properly|normally|just|easy|easily|somehow|various)\b/iu;
const passive = /\b(?:is|are|was|were|be|been)\s+(?:performed|handled|processed|executed|validated|generated|created|written|provided|configured|managed|implemented|defined|recorded|resolved|accepted|granted)\b/iu;
const legacyTerms = /\b(?:needs_nova|action_required)\b/u;

function stripMarkdown(line) {
  return line.replace(/\[[^\]]+\]\([^)]+\)/gu, 'LINK').replace(/`[^`]+`/gu, 'TERM').replace(/^[-*]\s+/u, '');
}

function checkLanguage(file, text) {
  let inCode = false;
  const prose = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```')) { inCode = !inCode; continue; }
    if (inCode || !line || line.startsWith('#') || line.startsWith('|') || metadataFields.some((field) => line.startsWith(`${field}:`))) continue;
    const cleaned = stripMarkdown(line);
    if (vague.test(cleaned)) errors.push(`${rel(file)} contains vague term: ${vague.exec(cleaned)?.[0]}`);
    if (passive.test(cleaned)) errors.push(`${rel(file)} contains avoidable passive voice: ${passive.exec(cleaned)?.[0]}`);
    if (legacyTerms.test(cleaned)) errors.push(`${rel(file)} contains a removed contract term: ${legacyTerms.exec(cleaned)?.[0]}`);
    if (/^\d+[.)]\s+/u.test(line) && /\b(?:and then|then also)\b/iu.test(cleaned)) errors.push(`${rel(file)} has more than one action in a numbered step: ${line}`);
    prose.push({ line, procedural: /^\d+[.)]\s+/u.test(line) });
  }
  for (const item of prose) {
    for (const sentence of item.line.split(/(?<=[.!?])\s+/u)) {
      const words = sentence.match(/[A-Za-z0-9][A-Za-z0-9@._/-]*/gu) ?? [];
      const limit = item.procedural ? 20 : 25;
      if (words.length > limit) errors.push(`${rel(file)} has a ${words.length}-word sentence; limit is ${limit}: ${sentence.slice(0, 110)}`);
    }
  }
}

function checkSite() {
  compareGenerated();
  const pages = walk(siteRoot).filter((file) => file.endsWith('.md')).sort();
  for (const file of pages) {
    const text = fs.readFileSync(file, 'utf8');
    for (const field of metadataFields) if (!new RegExp(`^${field}: .+`, 'mu').test(text)) errors.push(`${rel(file)} has no ${field} metadata`);
    const evidence = text.match(/^Evidence: (.+)$/mu)?.[1];
    for (const item of evidence?.split(';').map((value) => value.trim()) ?? []) {
      if (!fs.existsSync(path.join(root, item))) errors.push(`${rel(file)} cites missing evidence: ${item}`);
    }
    checkLanguage(file, text);
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
      const target = match[1];
      if (target.startsWith('http') || target.startsWith('#')) continue;
      const local = path.resolve(path.dirname(file), target.split('#')[0]);
      if (!fs.existsSync(local)) errors.push(`${rel(file)} links to missing page: ${target}`);
    }
  }
  for (const plugin of plugins) if (!fs.existsSync(plugin.readme)) errors.push(`${rel(plugin.directory)} has no authored README.md`);
  const requiredPages = [
    'docs/site/README.md',
    'docs/site/understand/README.md',
    'docs/site/understand/request-to-result.md',
    'docs/site/use/README.md',
    'docs/site/use/quickstart.md',
    'docs/site/use/recovery.md',
    'docs/site/extend/README.md',
    'docs/site/extend/first-plugin.md',
    'docs/site/extend/testing.md',
    'docs/site/status/current.md',
  ];
  for (const page of requiredPages) if (!fs.existsSync(path.join(root, page))) errors.push(`${page} is required by a reader journey`);
  const taskSections = ['## Objective', '## Prerequisites', '## Procedure', '## Expected Result', '## Verification', '## Common Failures', '## Recovery'];
  for (const relative of ['docs/site/use/quickstart.md', 'docs/site/use/recovery.md', 'docs/site/extend/first-plugin.md']) {
    if (!fs.existsSync(path.join(root, relative))) continue;
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const section of taskSections) if (!text.includes(section)) errors.push(`${relative} lacks journey section ${section}`);
    if (!/```(?:bash|json)\n[\s\S]+?\n```/u.test(text)) errors.push(`${relative} has no executable or schema-valid example`);
    const packageScripts = readJson(path.join(root, 'package.json')).scripts ?? {};
    for (const block of text.matchAll(/```bash\n([\s\S]+?)\n```/gu)) {
      for (const match of block[1].matchAll(/^npm run ([a-z0-9:_-]+)/gmu)) {
        if (!packageScripts[match[1]]) errors.push(`${relative} cites unknown package command: npm run ${match[1]}`);
      }
    }
  }
  const schema = readJson(path.join(root, 'skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json'));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(schema);
  const validateManifest = ajv.compile({ $ref: `${schema.$id}#/$defs/pluginManifest` });
  const tutorial = fs.readFileSync(path.join(root, 'docs/site/extend/first-plugin.md'), 'utf8');
  for (const [index, block] of [...tutorial.matchAll(/```json\n([\s\S]+?)\n```/gu)].entries()) {
    try {
      const value = JSON.parse(block[1]);
      if (!validateManifest(value)) errors.push(`first-plugin JSON block ${index + 1} fails the canonical schema: ${ajv.errorsText(validateManifest.errors)}`);
    } catch (error) {
      errors.push(`first-plugin JSON block ${index + 1} is invalid JSON: ${error.message}`);
    }
  }
  if (pages.some((file) => /(?:phase|audit|implementation-plan|roadmap)/u.test(path.basename(file)))) errors.push('Published site contains an internal planning page');
  if (plugins.length !== walk(catalogueRoot).filter((file) => file.endsWith('.md') && path.basename(file) !== 'README.md').length) errors.push('Plugin catalogue coverage is incomplete');
  return pages;
}

function build() {
  const pages = checkSite();
  if (errors.length) return;
  const revision = git('rev-parse', 'HEAD');
  const base = `${remoteBase()}/blob/${revision}`;
  const outputRoot = path.join(root, '.tmp', 'docs-publication');
  fs.rmSync(outputRoot, { recursive: true, force: true });
  for (const file of pages) {
    const relative = path.relative(siteRoot, file);
    const target = path.join(outputRoot, relative);
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(/^Evidence: (.+)$/gmu, (_all, evidence) => {
      if (evidence.includes('**')) return `Evidence: ${evidence}`;
      const links = evidence.split(';').map((item) => item.trim()).map((item) => item.includes(' every ') || item.startsWith('every ')
        ? item
        : `[${item}](${base}/${item})`);
      return `Evidence: ${links.join('; ')}`;
    });
    text = text.replace(/^Last verified: generated during publication$/mu, `Last verified: ${revision}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  const report = {
    schemaVersion: 'kubeclaw-docs-publication.v1',
    revision,
    pageCount: pages.length,
    pluginCount: plugins.length,
    pageDigest: crypto.createHash('sha256').update(pages.map((file) => fs.readFileSync(file)).join('')).digest('hex'),
    checks: ['metadata', 'controlled-language', 'links', 'reader-journeys', 'plugin-coverage', 'release-pinned-evidence'],
  };
  fs.writeFileSync(path.join(outputRoot, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`built ${pages.length} publication pages for ${revision}`);
}

if (command === 'generate') generate();
else if (command === 'check') checkSite();
else if (command === 'build') build();
else errors.push(`Unknown command: ${command}`);

if (errors.length) {
  console.error('documentation publication failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
if (command === 'check') console.log(`documentation publication passed (${walk(siteRoot).filter((file) => file.endsWith('.md')).length} pages, ${plugins.length} plugins)`);
