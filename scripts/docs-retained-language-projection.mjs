#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRetainedLanguageBundle } from './lib/docs-retained-language-bundle.mjs';
import { storeRetainedLanguageBundle } from './lib/docs-retained-source.mjs';

function argumentsFor(args) {
  const options = {};
  const names = new Map([['--root', 'root'], ['--artifact-revision', 'artifactRevision'],
    ['--source-revision', 'sourceRevision'], ['--semantic-owner-revision', 'semanticOwnerRevision'], ['--editorial-revision', 'editorialRevision'], ['--output', 'output']]);
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option === '--check') {
      assert(!options.checkOnly, 'RETAINED_LANGUAGE_DUPLICATE_OPTION');
      options.checkOnly = true;
      continue;
    }
    assert(names.has(option), `RETAINED_LANGUAGE_UNKNOWN_OPTION: ${option}`);
    const key = names.get(option);
    assert(!Object.hasOwn(options, key), 'RETAINED_LANGUAGE_DUPLICATE_OPTION');
    const value = args[++i];
    assert(value && !value.startsWith('--'), `RETAINED_LANGUAGE_OPTION_VALUE_REQUIRED: ${option}`);
    options[key] = value;
  }
  assert(options.editorialRevision && options.output, 'RETAINED_LANGUAGE_EDITORIAL_REVISION_AND_OUTPUT_REQUIRED');
  options.root = path.resolve(options.root ?? process.cwd());
  return options;
}

export function runRetainedLanguageProjection(args) {
  const options = argumentsFor(args);
  const bundle = buildRetainedLanguageBundle(options);
  const result = storeRetainedLanguageBundle({ ...options, bundle });
  return { ...result, artifactRevision: bundle.artifactRevision, sourceRevision: bundle.sourceRevision,
    editorialRevision: bundle.editorialRevision, changes: bundle.changes.length,
    preservation: bundle.preservation, limits: bundle.limits };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(runRetainedLanguageProjection(process.argv.slice(2))));
}
