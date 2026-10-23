import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { build } from 'esbuild';
const root = new URL('../', import.meta.url);
const schema = JSON.parse(fs.readFileSync(new URL('../contracts/plugin-system/v2/plugin-system-v2.schema.json', root), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, code: { source: true, esm: true } });
addFormats(ajv);
ajv.addSchema(schema);
const result = await build({stdin: {contents: standaloneCode(ajv, {validateArtifactRefSchema: `${schema.$id}#/$defs/artifactRef`}),
 resolveDir: fileURLToPath(root), loader: 'js'}, bundle: true, platform: 'neutral', format: 'esm', write: false, legalComments: 'inline'});
const generated = result.outputFiles[0].text.replace(/^\s*(?:ucs2length|equal)\.code = [^\n]+;$/gmu, '');
if (/\b(?:eval|Function|require)\s*\(/u.test(generated)) throw new Error('Artifact validator must be static and CSP-safe');
fs.writeFileSync(new URL('src/artifact-validator.generated.mjs', root), '// Generated from canonical plugin-system v2 schema; do not edit.\n' + generated);
fs.writeFileSync(new URL('src/artifact-validator.generated.d.mts', root), 'export const validateArtifactRefSchema: ((value: unknown) => boolean) & { errors?: unknown[] | null };\n');
