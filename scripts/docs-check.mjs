#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(root, 'docs');

const errors = [];

function rel(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function walk(dir, predicate = () => true) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(filePath, predicate));
    else if (entry.isFile() && predicate(filePath)) out.push(filePath);
  }
  return out;
}

function activeMarkdownFiles() {
  return walk(docsRoot, (filePath) => filePath.endsWith('.md'))
    .filter((filePath) => !rel(filePath).startsWith('docs/archive/'));
}

function markdownLinkTargets(text) {
  // Match actual Markdown links, not escaped schema syntax such as
  // `\[a-z\](?:...)` emitted by generated configuration references.
  const linkRe = /(?<!\\)\[(?:\\.|[^\]\\])*(?<!\\)]\(([^)]+)\)/g;
  return [...text.matchAll(linkRe)].map((match) => match[1]);
}

function checkLocalLinks(files) {
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8').replace(/`[^`\n]*`/gu, 'code');
    for (const rawTarget of markdownLinkTargets(text)) {
      let target = rawTarget.trim();
      if (
        !target ||
        target.startsWith('#') ||
        target.startsWith('http:') ||
        target.startsWith('https:') ||
        target.startsWith('mailto:')
      ) continue;
      if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
      target = target.split('#')[0];
      if (!target) continue;
      const resolved = path.resolve(path.dirname(file), decodeURI(target));
      if (rel(resolved).startsWith('docs/archive/')) continue;
      if (!fs.existsSync(resolved)) errors.push(`${rel(file)} links to missing path: ${rawTarget}`);
    }
  }
}

if (JSON.stringify(markdownLinkTargets('[valid](target.md) and \\[a-z\\](?:not-a-link)'))
  !== JSON.stringify(['target.md'])) {
  throw new Error('Markdown link parser must retain valid links and ignore escaped schema regex syntax');
}

function checkGeneratedMarkers() {
  const generatedPages = [
    'docs/reference/cli.md',
    'docs/reference/environment-variables.md',
    'docs/reference/helm-values.md',
    'docs/reference/secrets.md',
    'docs/reference/verification-commands.md',
    'docs/reference/workflows.md',
  ];
  for (const page of generatedPages) {
    const filePath = path.join(root, page);
    const text = fs.readFileSync(filePath, 'utf8');
    if (!text.includes('<!-- BEGIN GENERATED: source-backed reference -->')) {
      errors.push(`${page} is missing generated section start marker`);
    }
    if (!text.includes('<!-- END GENERATED -->')) {
      errors.push(`${page} is missing generated section end marker`);
    }
  }
}

function checkCoreOperatorSections() {
  const pages = [
    'docs/deployment/setup-flow.md',
    'docs/deployment/secrets.md',
    'docs/deployment/infrastructure.md',
    'docs/deployment/litellm.md',
    'docs/deployment/tailscale-operator.md',
    'docs/deployment/agent-deployments.md',
    'docs/deployment/deployment-verification.md',
    'docs/operators/running-the-pipeline.md',
    'docs/operators/recovery-runbook.md',
    'docs/operators/final-preview-tailscale.md',
  ];
  const requiredAny = [
    ['## Procedure', '## Deploy', '## Start A Run', '## Recovery Procedure'],
    ['## Verify', '## Verification', '## Check Status', '## Verify The Result'],
    ['## Common Failures', '## Troubleshooting', '## Recovery', '## Escalation'],
  ];
  for (const page of pages) {
    const filePath = path.join(root, page);
    if (!fs.existsSync(filePath)) {
      errors.push(`${page} is missing`);
      continue;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const lowerText = text.toLowerCase();
    for (const alternatives of requiredAny) {
      if (!alternatives.some((heading) => lowerText.includes(heading.toLowerCase()))) {
        errors.push(`${page} is missing one of required sections: ${alternatives.join(' | ')}`);
      }
    }
  }
}

function checkCurrentPagesDoNotContainTargetStateSections(files) {
  for (const file of files) {
    const relative = rel(file);
    if (
      relative === 'docs/ROADMAP.md' ||
      relative === 'docs/future-implementation-ideas.md' ||
      relative === 'docs/concepts/intent-driven-pipeline.md'
    ) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/^Status:\s*current\b/m.test(text) && /^##\s+Target State\b/m.test(text)) {
      errors.push(`${relative} is marked current but contains a Target State section`);
    }
  }
}

function checkDiagrams() {
  const diagramDir = path.join(docsRoot, 'diagrams');
  if (!fs.existsSync(diagramDir)) return;
  for (const file of walk(diagramDir, (filePath) => filePath.endsWith('.svg'))) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('<svg ')) errors.push(`${rel(file)} is missing <svg> root`);
    if (!text.includes('<title')) errors.push(`${rel(file)} is missing <title>`);
    if (!text.includes('<desc')) errors.push(`${rel(file)} is missing <desc>`);
  }
}

function sourceLineCount(revision, sourcePath) {
  const source = execFileSync('git', ['show', `${revision}:${sourcePath}`], {
    cwd: root,
    encoding: 'utf8',
  });
  return source.endsWith('\n') ? source.slice(0, -1).split('\n').length : source.split('\n').length;
}

function checkArchitecturePresentation() {
  const pages = [
    'docs/site/understand/README.md',
    'docs/site/understand/components-and-authority.md',
    'docs/site/understand/request-state-recovery.md',
    'docs/site/understand/deployment-and-trust.md',
    'docs/site/understand/pipeline-dependencies.md',
    'docs/site/understand/platform-and-operations.md',
  ];
  const sourceLink = /https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^\s)#]+)#L(\d+)(?:-L(\d+))?/gu;
  let diagrams = 0;
  let evidenceBoxes = 0;
  let codeLinks = 0;
  for (const page of pages) {
    const filePath = path.join(root, page);
    const text = fs.readFileSync(filePath, 'utf8');
    const pageDiagrams = [...text.matchAll(/^```mermaid\n[\s\S]*?^```$/gmu)];
    diagrams += pageDiagrams.length;
    for (const diagram of pageDiagrams) {
      const remainder = text.slice(diagram.index + diagram[0].length);
      if (!/^\n\nText version: /u.test(remainder)) {
        errors.push(`${page} has a Mermaid diagram without a direct Text version`);
      }
    }
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].startsWith('> **Source evidence')) continue;
      evidenceBoxes += 1;
      const box = [];
      for (let cursor = index; cursor < lines.length && lines[cursor].startsWith('>'); cursor += 1) box.push(lines[cursor]);
      if (!box.join('\n').includes('https://github.com/datrab/kubeclaw/blob/')) {
        errors.push(`${page} has a source-evidence box without a revision-bound code link`);
      }
    }
    for (const match of text.matchAll(sourceLink)) {
      codeLinks += 1;
      const revision = match[1];
      const sourcePath = decodeURIComponent(match[2]);
      const first = Number(match[3]);
      const last = Number(match[4] ?? match[3]);
      try {
        const lineCount = sourceLineCount(revision, sourcePath);
        if (first < 1 || last < first || last > lineCount) {
          errors.push(`${page} cites invalid source lines ${sourcePath}#L${first}-L${last}; file has ${lineCount} lines at ${revision}`);
        }
      } catch {
        errors.push(`${page} cannot resolve source ${sourcePath} at ${revision}`);
      }
    }
  }
  if (diagrams === 0) errors.push('architecture pages contain no Mermaid diagrams');
  if (evidenceBoxes === 0) errors.push('architecture pages contain no source-evidence boxes');
  if (codeLinks === 0) errors.push('architecture pages contain no revision-bound code links');
  return { diagrams, evidenceBoxes, codeLinks };
}

function checkOperationsEvidence() {
  const pages = new Map([
    ['docs/site/use/install.md', ['Supported Versions', 'Supported Topology and Limits', 'Prerequisites', 'Install in Dependency Order', 'Failed First Installation', 'Recovery and Rollback', 'Evidence to Retain']],
    ['docs/site/use/operate.md', ['Supported Versions', 'Configure the Platform', 'Start a Project Run', 'Inspect a Run', 'Approve or Resume a Wait', 'Recover After Interruption', 'Cancellation Boundary', 'Safe Retry Decision']],
    ['docs/site/use/diagnose.md', ['Supported Versions', 'Diagnosis Order', 'Durable Run Inspection', 'Capacity and Growth', 'Symptom Index', 'Lost Responses and Uncertain Effects', 'Escalation Conditions', 'Recovery and Cleanup']],
    ['docs/site/use/recovery.md', ['Supported Versions', 'State Inventory', 'Procedure', 'Recovery', 'Node or Cluster Loss', 'Recover Administrative Access', 'Verification', 'Rollback Boundary']],
    ['docs/site/use/maintenance.md', ['Supported Versions', 'Version Authorities', 'GitOps Operation', 'Upgrade Order', 'Stateful Service Upgrade', 'Rollback Decision', 'Credential Rotation', 'Controlled Retirement']],
  ]);
  const sourceLink = /https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^\s)#]+)#L(\d+)(?:-L(\d+))?/gu;
  let evidenceBoxes = 0;
  let codeLinks = 0;
  for (const [page, requiredSections] of pages) {
    const filePath = path.join(root, page);
    if (!fs.existsSync(filePath)) {
      errors.push(`${page} is missing from the operations journey`);
      continue;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    for (const section of requiredSections) {
      if (!text.includes(`## ${section}\n`)) errors.push(`${page} lacks required operations section: ${section}`);
    }
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].startsWith('> **Source evidence')) continue;
      evidenceBoxes += 1;
      const box = [];
      for (let cursor = index; cursor < lines.length && lines[cursor].startsWith('>'); cursor += 1) box.push(lines[cursor]);
      const evidence = box.join('\n');
      if (!evidence.includes('https://github.com/datrab/kubeclaw/blob/')) {
        errors.push(`${page} has a source-evidence box without a revision-bound code link`);
      }
      for (const field of ['Claim', 'Implementation', 'Contract or setting', 'Test evidence', 'Revision', 'Limit']) {
        if (!evidence.includes(`**${field}:**`)) errors.push(`${page} source-evidence box lacks required field: ${field}`);
      }
    }
    for (const match of text.matchAll(sourceLink)) {
      codeLinks += 1;
      const revision = match[1];
      const sourcePath = decodeURIComponent(match[2]);
      const first = Number(match[3]);
      const last = Number(match[4] ?? match[3]);
      try {
        const lineCount = sourceLineCount(revision, sourcePath);
        if (first < 1 || last < first || last > lineCount) {
          errors.push(`${page} cites invalid source lines ${sourcePath}#L${first}-L${last}; file has ${lineCount} lines at ${revision}`);
        }
      } catch {
        errors.push(`${page} cannot resolve source ${sourcePath} at ${revision}`);
      }
    }
  }
  if (evidenceBoxes === 0) errors.push('operations pages contain no source-evidence boxes');
  if (codeLinks === 0) errors.push('operations pages contain no revision-bound code links');

  const quickstart = fs.readFileSync(path.join(root, 'docs/site/use/quickstart.md'), 'utf8');
  if (quickstart.includes('npm run pipeline -- --help')) errors.push('operator quickstart must not present the unsupported pipeline --help form');
  if (!quickstart.includes('KUBECLAW_TEST_CGROUP_ROOT="<delegated-cgroup-v2-root>"')) errors.push('operator quickstart lacks the full-verifier cgroup prerequisite');
  if (!quickstart.includes('npm run plugin-system:inventory:check')) errors.push('operator quickstart lacks the portable plugin inventory check');

  const install = fs.readFileSync(path.join(root, 'docs/site/use/install.md'), 'utf8');
  if (!/KUBECLAW_RUN_SECRET_SETUP=true[\s\S]*KUBECLAW_SECRET_SETUP_MODE=noninteractive[\s\S]*(?:\.\/scripts\/deploy\.sh|bound_deploy) setup/u.test(install)) {
    errors.push('noninteractive installation does not run setup with secret setup enabled');
  }

  const operate = fs.readFileSync(path.join(root, 'docs/site/use/operate.md'), 'utf8');
  if (operate.includes('npm run pipeline -- --help')) errors.push('operate guide must not present the unsupported pipeline --help form');

  const maintenance = fs.readFileSync(path.join(root, 'docs/site/use/maintenance.md'), 'utf8');
  for (const statement of ['Do not run these commands as a sequence.', 'every PVC left in the application namespace', 'enumerates and deletes all remaining PVCs']) {
    if (!maintenance.includes(statement)) errors.push(`maintenance teardown warning lacks required statement: ${statement}`);
  }
  return { evidenceBoxes, codeLinks };
}

function main() {
  const files = activeMarkdownFiles();
  checkLocalLinks(files);
  checkGeneratedMarkers();
  checkCoreOperatorSections();
  checkCurrentPagesDoNotContainTargetStateSections(files);
  checkDiagrams();
  const presentation = checkArchitecturePresentation();
  const operations = checkOperationsEvidence();

  if (errors.length) {
    console.error('docs check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`architecture presentation check passed (${presentation.diagrams} diagrams, ${presentation.evidenceBoxes} evidence boxes, ${presentation.codeLinks} code links)`);
  console.log(`operations evidence check passed (${operations.evidenceBoxes} evidence boxes, ${operations.codeLinks} code links)`);
  console.log(`docs check passed (${files.length} active markdown files)`);
}

main();
