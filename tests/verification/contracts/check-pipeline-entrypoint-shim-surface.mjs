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
const entryPath = path.join(sourceRoot, 'skills/nova/pipeline.js');
const indexPath = path.join(sourceRoot, 'skills/nova/pipeline/index.js');
const verificationReadmePath = path.join(sourceRoot, 'tests/verification/README.md');

const entrySource = fs.readFileSync(entryPath, 'utf8');
const verificationReadme = fs.readFileSync(verificationReadmePath, 'utf8');

assert.equal(entrySource.startsWith('#!/usr/bin/env node'), true, 'pipeline entrypoint should stay executable');
assert.equal(entrySource.includes('Thin compatibility shim'), true, 'pipeline entrypoint should declare itself a thin compatibility shim');
assert.equal(entrySource.includes("export * from './pipeline/index.js';"), true, 'pipeline entrypoint should re-export the modular pipeline index');
assert.equal(entrySource.includes("export { default } from './pipeline/index.js';"), true, 'pipeline entrypoint should keep the modular default export');
assert.equal(entrySource.includes("const { main } = await import('./pipeline/cli.js');"), true, 'pipeline entrypoint should dispatch CLI execution through pipeline/cli.js');
assert.equal(entrySource.includes('./pipeline/runners/'), false, 'pipeline entrypoint must not import runner logic directly');
assert.equal(entrySource.includes('./pipeline/services/'), false, 'pipeline entrypoint must not import service logic directly');
assert.equal(entrySource.split('\n').length <= 20, true, 'pipeline entrypoint should remain a thin shim, not regrow into a large wrapper');

assert.equal(verificationReadme.includes('remaining large wrapper'), false, 'verification README should stop describing pipeline.js as a large wrapper');
assert.equal(verificationReadme.includes('bounded compatibility entrypoint'), true, 'verification README should describe pipeline.js as a bounded compatibility entrypoint');
assert.equal(verificationReadme.includes('thin compatibility entrypoint shim'), true, 'verification README should describe pipeline.js as a thin compatibility entrypoint shim');

const entryMod = await import(pathToFileURL(entryPath).href);
const indexMod = await import(pathToFileURL(indexPath).href);
assert.equal(entryMod.default, indexMod.default, 'pipeline entrypoint default export should come directly from pipeline/index.js');
assert.equal(entryMod.runPipeline, indexMod.runPipeline, 'pipeline entrypoint runPipeline export should come directly from pipeline/index.js');
assert.equal(Object.prototype.hasOwnProperty.call(entryMod, 'main'), false, 'pipeline entrypoint should not expose CLI-only main as a public export');

console.log(JSON.stringify({ ok: true, checked: 14 }));
