// Explicit preparation of native validator inputs, never called by --check.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareEmbeddedYamlSchemas} from './docs-publication-embedded-yaml.mjs';
assert.equal(process.argv.length,2,'Usage: node scripts/docs-prepare-publication-schemas.mjs');
prepareEmbeddedYamlSchemas(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
