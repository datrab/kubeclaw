import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { table } from '../docs-generate-core.mjs';

export const verificationGuidancePath = 'docs/blueprint/verification-command-guidance.json';
const fields = ['purpose', 'scope', 'environment', 'effects', 'expected', 'owner', 'changeToCheck'];
const prohibitedAuthority = relative => relative === 'docs/blueprint/documentation-completion-matrix.json'
  || relative.startsWith('docs/blueprint/acceptance-evidence/');

function sameIdentities(actual, expected, label) {
  if (new Set(actual).size !== actual.length
      || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`verification guidance ${label} identities differ from the native owner`);
  }
}

// This is an authored interpretation of the existing command owners, not a
// command runner or a test verdict. A changed receiver requires requalification.
export function loadVerificationGuidance(root, deploy, revision, sourceGitRoot = root) {
  if (revision !== undefined && !/^[0-9a-f]{40}$/u.test(revision)) {
    throw new Error('verification source revision must be a full Git commit');
  }
  const guidance = JSON.parse(fs.readFileSync(path.join(root, verificationGuidancePath), 'utf8'));
  if (guidance.schemaVersion !== 'verification-command-guidance.v1') {
    throw new Error('unsupported verification guidance schema');
  }
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  sameIdentities(guidance.npm.map(row => row.id), Object.keys(scripts), 'npm');
  sameIdentities(guidance.deploy.map(row => row.id), deploy.commands.map(row => row.invocation), 'deployment');
  const workflows = fs.readdirSync(path.join(root, '.github/workflows'))
    .filter(name => /\.ya?ml$/u.test(name)).map(name => `.github/workflows/${name}`);
  sameIdentities(guidance.ci.map(row => row.id), workflows, 'CI');
  for (const family of ['guide', 'routes']) {
    if (!Array.isArray(guidance[family])
        || new Set(guidance[family].map(row => row.id)).size !== guidance[family].length) {
      throw new Error(`verification guidance requires unique ${family} forms`);
    }
  }
  const verified = new Map();
  const physicalRoot = fs.realpathSync(root);
  for (const [family, rows] of [['npm', guidance.npm], ['deploy', guidance.deploy], ['ci', guidance.ci], ['guide', guidance.guide], ['route', guidance.routes]]) {
    for (const row of rows) {
      for (const field of fields) {
        if (typeof row[field] !== 'string' || !row[field].trim()) {
          throw new Error(`verification guidance ${family}:${row.id} lacks ${field}`);
        }
      }
      if (family === 'npm' && row.command !== scripts[row.id]) {
        throw new Error(`verification guidance npm:${row.id} command changed`);
      }
      if (!Array.isArray(row.sources) || !row.sources.length) {
        throw new Error(`verification guidance ${family}:${row.id} lacks sources`);
      }
      for (const source of row.sources) {
        if (typeof source.path !== 'string' || path.isAbsolute(source.path)
            || source.path.split(/[\\/]/u).includes('..')
            || prohibitedAuthority(source.path)) {
          throw new Error(`verification guidance ${family}:${row.id} has an invalid source`);
        }
        const target = path.join(root, source.path);
        const physical = fs.realpathSync(target);
        if (!physical.startsWith(`${physicalRoot}${path.sep}`)) {
          throw new Error('verification guidance source escapes the repository');
        }
        if (prohibitedAuthority(path.relative(physicalRoot, physical).split(path.sep).join('/'))) {
          throw new Error(`verification guidance ${family}:${row.id} has an invalid source`);
        }
        if (!verified.has(source.path)) {
          const actual = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
          if (revision !== undefined) {
            // Guide-owned executable assets live below docs/site, which the
            // general generator guard treats as output. Bind these actual
            // meaning sources to their cited Git bytes explicitly as well.
            const object = `${revision}:${source.path}`;
            const size = Number(execFileSync('git', ['cat-file', '-s', object], { cwd: sourceGitRoot, encoding: 'utf8' }).trim());
            if (!Number.isSafeInteger(size) || size < 0) throw new Error('invalid verification source blob size');
            const pinned = execFileSync('git', ['cat-file', 'blob', object], {
              cwd: sourceGitRoot, maxBuffer: Math.max(1024 * 1024, size + 1),
            });
            if (createHash('sha256').update(pinned).digest('hex') !== actual) {
              throw new Error(`verification meaning source does not match committed revision: ${source.path}`);
            }
          }
          verified.set(source.path, actual);
        }
        if (source.sha256 !== verified.get(source.path)) {
          throw new Error(`verification guidance source changed: ${source.path}; requalify its command meanings`);
        }
      }
      if (row.scriptDefinitions !== undefined) {
        const definition = row.scriptDefinitions;
        if (!definition || !row.sources.some(source => source.path === definition.manifest)
            || !/(?:^|\/)package\.json$/u.test(definition.manifest)
            || typeof definition.selectedScript !== 'string'
            || !Array.isArray(definition.scriptNames) || !Array.isArray(definition.absentHooks)
            || !Array.isArray(definition.order)
            || [...definition.scriptNames, ...definition.absentHooks, ...definition.order]
              .some(name => typeof name !== 'string' || !name)) {
          throw new Error(`verification script definition source is invalid: ${row.id}`);
        }
        const declared = JSON.parse(fs.readFileSync(path.join(root, definition.manifest), 'utf8')).scripts;
        if (!declared || typeof declared !== 'object' || Array.isArray(declared)
            || !definition.scriptNames.includes(definition.selectedScript)
            || new Set(definition.scriptNames).size !== definition.scriptNames.length
            || new Set(definition.absentHooks).size !== definition.absentHooks.length
            || definition.scriptNames.some(name => !Object.hasOwn(declared, name) || typeof declared[name] !== 'string')
            || definition.absentHooks.some(name => ![`pre${definition.selectedScript}`, `post${definition.selectedScript}`].includes(name)
              || Object.hasOwn(declared, name))) {
          throw new Error(`verification script definition selection changed: ${row.id}`);
        }
        sameIdentities(definition.order, [...definition.scriptNames, ...definition.absentHooks], 'script definition');
        Object.defineProperty(row, 'resolvedScriptDefinitions', { value: JSON.stringify(Object.fromEntries(
          definition.order.map(name => [name, Object.hasOwn(declared, name) ? declared[name] : null])), null, 2) });
      }
    }
  }
  return guidance;
}

const literal = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('`', '&#96;').replaceAll('|', '&#124;');
const labels = {
  purpose: 'Purpose', scope: 'Scope', environment: 'Environment and execution place',
  effects: 'Authority, writes and remaining state', expected: 'Expected result and limits',
  owner: 'Owner', changeToCheck: 'When this changes',
};

function definitionBlock(value) {
  let width = 3;
  for (const match of String(value).matchAll(/`+/gu)) width = Math.max(width, match[0].length + 1);
  const fence = '`'.repeat(width);
  return `${fence}text\n${value}${String(value).endsWith('\n') ? '' : '\n'}${fence}`;
}

function renderEntry(row, family, index, revision) {
  const invocation = family === 'npm' ? `npm run ${row.id}` : row.id;
  const command = family === 'npm'
    ? `\n\nUnderlying command definition. This is source data, not an instruction to run it.\n\n${definitionBlock(row.command)}` : '';
  const sources = row.sources.map(source =>
    `[${literal(source.path)}](https://github.com/datrab/kubeclaw/blob/${revision}/${source.path})`).map(link => `- ${link}`).join('\n');
  const procedure = ['guide', 'route'].includes(family) && row.procedure
    ? `\n\nUse the [complete guide procedure](../${row.procedure.replace(/^docs\/site\//u, '')}).` : '';
  let declarations = '';
  if (row.scriptDefinitions !== undefined) {
    if (typeof row.resolvedScriptDefinitions !== 'string') throw new Error('script definitions require the authenticated loader');
    const cwd = path.posix.dirname(row.scriptDefinitions.manifest);
    declarations = `\n\nDeclared npm script definitions. The selected package cwd is <code>${literal(cwd)}</code>.\n`
      + 'These are literal source declarations, not configuration examples or successful execution. Null marks an absent selected lifecycle hook.\n\n'
      + definitionBlock(row.resolvedScriptDefinitions);
  }
  return `### ${family}-${index + 1}: ${literal(invocation)}${procedure}\n\n`
    + table(['Responsibility', 'Contract'], fields.map(field => [labels[field], row[field]]))
    + command + declarations
    + `\n\nImplementation evidence:\n\n${sources}\n`;
}

export function renderVerificationResponsibilities(guidance, revision) {
  return `## Read Before Running\n\n`
    + 'These are command contracts, not successful execution records. Run repository commands from the repository root unless the entry specifies another place. '
    + 'A command name containing `check`, `test`, `live`, `production` or `--check` does not establish its effects or proof level. '
    + 'Read the exact entry before supplying credentials, choosing a cluster or running an aggregate. '
    + 'Arguments after `npm run <name> --` belong to its receiver; required arguments are not supplied by the alias. '
    + 'Child npm lifecycle hooks and inherited environment/configuration can affect execution. '
    + 'For an aggregate, all ordered children must finish, and each child retains its own scope and prerequisites.\n\n'
    + 'After a failure or unknown external outcome, retain the run identity, original logs and partial state. '
    + 'The listed owner must reconcile those effects before retrying; exit zero can also mean an explicit skip, no-op or aborted confirmation. '
    + 'No reference entry grants a new live execution, promotion, deletion or human acceptance.\n\n'
    + 'Use the [CLI reference](cli.md), [workflow inventory](workflows.md), '
    + '[operator procedure](../use/operate.md) and [recovery procedure](../use/recovery.md) for the surrounding route.\n\n'
    + `## Root npm Commands\n\nAll ${guidance.npm.length} exact root package aliases are listed; aliases are not inferred from prefixes.\n\n`
    + guidance.npm.map((row, index) => renderEntry(row, 'npm', index, revision)).join('\n')
    + `\n## Guide-Owned Verification Routes\n\nThese ${guidance.guide.length} supported forms belong to the linked complete guides rather than root npm aliases. Preparation, execution, verification and cleanup remain separate duties. Delegated helpers are not independent public routes.\n\n`
    + guidance.guide.map((row, index) => renderEntry(row, 'guide', index, revision)).join('\n')
    + '\n## Package and Specialist Check Routes\n\nThese procedure routes complement the explicit commands above. They retain package-specific and focused native checks; root aliases do not replace their actual prerequisites, effects or proof limits. A route is not a claim that every private helper is an independent public command.\n\n'
    + guidance.routes.map((row, index) => renderEntry(row, 'route', index, revision)).join('\n')
    + `\n## Deployment Front Doors\n\nAll ${guidance.deploy.length} public deployment forms are listed. Select the intended context and namespace before a cluster-affecting command.\n\n`
    + guidance.deploy.map((row, index) => renderEntry(row, 'deploy', index, revision)).join('\n')
    + `\n## CI Workflow Responsibilities\n\nAll ${guidance.ci.length} checked-in workflow files are listed. The workflow inventory retains exact triggers, filters, jobs and action references; external actions keep their own contracts.\n\n`
    + guidance.ci.map((row, index) => renderEntry(row, 'ci', index, revision)).join('\n');
}
