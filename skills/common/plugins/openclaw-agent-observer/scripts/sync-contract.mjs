#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const pluginRoot = path.resolve(import.meta.dirname, '..');
const defaultContractSource = path.resolve(
  pluginRoot,
  '../../../../contracts/agent-observability/v1/src',
);
const generatedTarget = path.join(
  pluginRoot,
  'src/generated/agent-observability',
);

// Callers may supply a canonical source directory when the package is detached.
// Generated output is never accepted as an implicit substitute for that input.
export function syncContract(source = defaultContractSource) {
  const contractSource = path.resolve(source);
  if (contractSource === generatedTarget) throw new Error('Contract source must differ from generated output');
  if (!fs.existsSync(path.join(contractSource, 'index.ts'))) {
    throw new Error(`Agent observability contract source is missing: ${contractSource}`);
  }

  fs.rmSync(generatedTarget, { recursive: true, force: true });
  fs.mkdirSync(generatedTarget, { recursive: true });
  fs.cpSync(contractSource, generatedTarget, { recursive: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  syncContract();
}
