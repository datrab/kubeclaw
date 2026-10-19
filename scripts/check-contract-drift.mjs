#!/usr/bin/env node
// Compose the actual SDK inventory and progress reference checks; never regenerate.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { semanticSourceBindings } from './docs-sdk-semantics.mjs';
import { checkSdkReference } from './docs-sdk-reference.mjs';
import { checkProductPipeline } from './docs-product-pipeline-reference.mjs';

const root = process.cwd();
const handbook = 'docs/site/extend/developer-handbook.md';
try {
  const failures = [];
  // The contributor procedure deliberately delegates the export/member list.
  // Only name it as affected while that real, explicit reader path exists.
  const text = fs.readFileSync(path.join(root, handbook), 'utf8');
  const section = text.split('## Change SDK or shared contracts\n')[1]?.split('\n## ')[0];
  if (!section || !section.includes('(../reference/sdk.md)') || !section.includes('(../reference/sdk-exports.md)')) {
    failures.push(`DOC_DRIFT_CONTRACT ${handbook}: SDK contributor procedure lost its canonical reference links`);
  }
  const revision = JSON.parse(fs.readFileSync(path.join(root, 'docs/generated/inventory/documentation-source-revision.json'), 'utf8')).revision;
  // Enforce the existing reviewed semantic source bindings before compilation.
  // A changed contract can break its consumers: that is still a documentation
  // review obligation, not evidence that a compiler diagnostic proved drift.
  // Malformed input is excluded before any source-binding rejection is issued.
  const changed = [];
  for (const [relative, expected] of Object.entries(semanticSourceBindings)) {
    const bytes = fs.readFileSync(path.join(root, relative));
    if (relative.endsWith('.ts')) {
      const parsed = ts.createSourceFile(relative, bytes.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      if (parsed.parseDiagnostics.length) throw new Error(`SDK_SOURCE_PARSE_ERROR:${relative}`);
    } else if (relative.endsWith('.json')) JSON.parse(bytes.toString());
    if (createHash('sha256').update(bytes).digest('hex') !== expected) changed.push(relative);
  }
  try {
    if (changed.length) throw new Error(`SDK_SEMANTIC_SOURCE_DRIFT:${changed.join(',')}:reviewed source binding changed; compiler not run, no compilation result claimed`);
    checkSdkReference({ root, revision,
      inventoryPath: path.join(root, 'docs/generated/inventory/sdk-reference.json'),
      markdownPath: path.join(root, 'docs/site/reference/sdk-exports.md') });
  } catch (error) {
    // Parser, compiler, filesystem and unsupported-shape errors are NOT drift proofs.
    if (!/^SDK_(?:SEMANTIC_COVERAGE_DRIFT|SEMANTIC_SOURCE_DRIFT|REFERENCE_OUTPUT_DRIFT):/u.test(error.message)) throw error;
    failures.push(`DOC_DRIFT_CONTRACT ${handbook}: delegated docs/site/reference/sdk.md and docs/site/reference/sdk-exports.md require review; ${error.message}`);
  }
  const progress = checkProductPipeline(root, 'contract');
  if (progress) failures.push(progress);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('Contract SDK inventory, handbook reader path and progress reference are current; no independent acceptance.');
} catch (error) {
  console.error(`CONTRACT_REFERENCE_INPUT_ERROR: ${error.message}`);
  process.exitCode = 2;
}
