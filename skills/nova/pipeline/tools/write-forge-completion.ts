#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { publishAgentArtifact } from '../agent-artifact.ts';

const STATUSES = new Set(['READY_FOR_TESTING', 'BLOCKED']);

function requiredText(value: any, name: any) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

export function buildForgeCompletionPayload(values: any) {
  const status = requiredText(values.status, 'status');
  if (!STATUSES.has(status)) {
    throw new Error('status must be READY_FOR_TESTING or BLOCKED');
  }

  const inspectedFiles = (values.inspectedFiles ?? []).map((entry: any) => requiredText(entry, 'inspected-file'));
  const consultedContracts = (values.consultedContracts ?? []).map((entry: any) => requiredText(entry, 'consulted-contract'));
  if (inspectedFiles.length === 0) throw new Error('at least one inspected-file is required');
  if (consultedContracts.length === 0) throw new Error('at least one consulted-contract is required');

  return {
    status,
    summary: requiredText(values.summary, 'summary'),
    evidence: {
      inspected_files: inspectedFiles,
      consulted_contracts: consultedContracts,
      implementation_notes: requiredText(values.implementationNotes, 'implementation-notes'),
    },
  };
}

export function main(argv: any = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      context: { type: 'string' },
      status: { type: 'string' },
      summary: { type: 'string' },
      'inspected-file': { type: 'string', multiple: true },
      'consulted-contract': { type: 'string', multiple: true },
      'implementation-notes': { type: 'string' },
    },
  });

  const payload = buildForgeCompletionPayload({
    status: values.status,
    summary: values.summary,
    inspectedFiles: values['inspected-file'],
    consultedContracts: values['consulted-contract'],
    implementationNotes: values['implementation-notes'],
  });
  if (!values.context) throw new Error('Missing --context');
  publishAgentArtifact(values.context, payload);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error: any) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
