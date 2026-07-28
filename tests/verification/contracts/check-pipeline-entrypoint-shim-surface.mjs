import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-pipeline-entrypoint-shim-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';


const { sourceRoot } = parseSourceRootArgs();
const entryPath = path.join(sourceRoot, 'skills/nova/pipeline.ts');
const indexPath = path.join(sourceRoot, 'skills/nova/pipeline/index.ts');
const verificationReadmePath = path.join(sourceRoot, 'tests/verification/README.md');

const entrySource = fs.readFileSync(entryPath, 'utf8');
const verificationReadme = fs.readFileSync(verificationReadmePath, 'utf8');

assert.equal(entrySource.startsWith('#!/usr/bin/env node'), true, 'pipeline entrypoint should stay executable');
assert.equal(entrySource.includes('Root Nova entrypoint'), true, 'pipeline entrypoint should declare itself a bounded root entrypoint');
assert.equal(entrySource.includes("export * from './pipeline/index.ts';"), true, 'pipeline entrypoint should re-export the modular pipeline index');
assert.equal(entrySource.includes("export { default } from './pipeline/index.ts';"), true, 'pipeline entrypoint should keep the modular default export');
assert.equal(entrySource.includes("const { main } = await import('./skills/common/plugin-runtime/cli.ts');"), true, 'pipeline entrypoint should dispatch CLI execution through skills/common/plugin-runtime/cli.ts');
assert.equal(entrySource.includes('./pipeline/runners/'), false, 'pipeline entrypoint must not import runner logic directly');
assert.equal(entrySource.includes('./pipeline/services/'), false, 'pipeline entrypoint must not import service logic directly');
assert.equal(entrySource.split('\n').length <= 30, true, 'pipeline entrypoint should remain a thin shim, not regrow into a large wrapper');

assert.equal(verificationReadme.includes('remaining large wrapper'), false, 'verification README should stop describing pipeline.ts as a large wrapper');
assert.equal(verificationReadme.includes('bounded compatibility entrypoint'), true, 'verification README should describe pipeline.ts as a bounded compatibility entrypoint');
assert.equal(verificationReadme.includes('thin compatibility entrypoint shim'), true, 'verification README should describe pipeline.ts as a thin compatibility entrypoint shim');

const entryMod = await import(pathToFileURL(entryPath).href);
const indexMod = await import(pathToFileURL(indexPath).href);
assert.equal(entryMod.default, indexMod.default, 'pipeline entrypoint default export should come directly from pipeline/index.ts');
assert.equal(entryMod.runPipeline, indexMod.runPipeline, 'pipeline entrypoint runPipeline export should come directly from pipeline/index.ts');
assert.equal(Object.prototype.hasOwnProperty.call(entryMod, 'main'), false, 'pipeline entrypoint should not expose CLI-only main as a public export');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 14 }));
