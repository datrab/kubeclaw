#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
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

function checkLocalLinks(files) {
  const linkRe = /\[[^\]]*]\(([^)]+)\)/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = linkRe.exec(text))) {
      let target = match[1].trim();
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
      if (!fs.existsSync(resolved)) errors.push(`${rel(file)} links to missing path: ${match[1]}`);
    }
  }
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

function main() {
  const files = activeMarkdownFiles();
  checkLocalLinks(files);
  checkGeneratedMarkers();
  checkCoreOperatorSections();
  checkCurrentPagesDoNotContainTargetStateSections(files);
  checkDiagrams();

  if (errors.length) {
    console.error('docs check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`docs check passed (${files.length} active markdown files)`);
}

main();
