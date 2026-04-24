import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/generator-result.js');
const summaryPath = path.join(sourceRoot, 'skills/nova/pipeline/services/summary.js');
const caseStudyPath = path.join(sourceRoot, 'skills/nova/pipeline/services/case-study.js');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const summarySource = fs.readFileSync(summaryPath, 'utf8');
const caseStudySource = fs.readFileSync(caseStudyPath, 'utf8');

assert.equal(helperSource.includes('export function buildGeneratorArtifactRef('), true, 'shared generator helper should export buildGeneratorArtifactRef');
assert.equal(helperSource.includes('export function buildGeneratorResult('), true, 'shared generator helper should export buildGeneratorResult');
assert.equal(helperSource.includes("producerKind: 'generator'"), true, 'shared generator helper should own the canonical generator producerKind');

for (const [name, source] of [['summary', summarySource], ['case-study', caseStudySource]]) {
  assert.equal(source.includes("from './generator-result.js'"), true, `${name} service should import the shared generator helper`);
  assert.equal(source.includes('function buildGeneratorArtifactRef('), false, `${name} service must not keep a local buildGeneratorArtifactRef helper`);
  assert.equal(source.includes('function buildGeneratorResult('), false, `${name} service must not keep a local buildGeneratorResult helper`);
}

const helperMod = await import(pathToFileURL(helperPath).href);
assert.equal(typeof helperMod.buildGeneratorArtifactRef, 'function', 'shared generator helper should expose buildGeneratorArtifactRef');
assert.equal(typeof helperMod.buildGeneratorResult, 'function', 'shared generator helper should expose buildGeneratorResult');

console.log(JSON.stringify({ ok: true, checked: 9 }));
