#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const pluginRoot = path.resolve(import.meta.dirname, '..');
const contractSource = path.resolve(
  pluginRoot,
  '../../../../contracts/agent-observability/v1/src',
);
const generatedTarget = path.join(
  pluginRoot,
  'src/generated/agent-observability',
);

if (!fs.existsSync(path.join(contractSource, 'index.ts'))) {
  throw new Error(`Agent observability contract source is missing: ${contractSource}`);
}

fs.rmSync(generatedTarget, { recursive: true, force: true });
fs.mkdirSync(generatedTarget, { recursive: true });
fs.cpSync(contractSource, generatedTarget, { recursive: true });
