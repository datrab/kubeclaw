#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const commands = {build: 'build', check: 'check', generate: 'build'};
const command = commands[process.argv[2] ?? 'check'];
if (!command || process.argv.length > 3) throw new Error('Usage: docs-publication.mjs [build|check|generate]');
execFileSync(process.execPath, [fileURLToPath(new URL('./docs-reader/build.mjs', import.meta.url)), command], {stdio: 'inherit'});
