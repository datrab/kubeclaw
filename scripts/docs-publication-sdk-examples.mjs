import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import * as sdk from '../skills/common/plugin-runtime/sdk/src/index.ts';
import { validateContractValue, validateReferencedSchema } from '../skills/common/plugin-runtime/foundation/registry/schema.ts';
import { publicationExampleBlocks } from './lib/docs-publication-example-coverage.mjs';
import { sdkExampleBindings } from './lib/docs-publication-sdk-example-bindings.mjs';

const constants = new Map(['PORTABLE_JSON_ENCODING', 'PLUGIN_API_VERSION',
  'CURRENT_REVIEW_CACHE_PROFILE', 'CURRENT_RUNTIME_DISPATCH_PROFILE'].map(name => [name, sdk[name]]));

// This is a bounded literal reader, not JavaScript evaluation or a replacement
// contract. All acceptance below belongs to the actual native owner validators.
export function sdkExampleLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node) && constants.has(node.text)) {
    assert.notEqual(constants.get(node.text), undefined, `SDK constant absent: ${node.text}`);
    return constants.get(node.text);
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(sdkExampleLiteral);
  if (ts.isObjectLiteralExpression(node)) {
    const value = Object.create(null);
    for (const property of node.properties) {
      assert(ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)),
        'SDK example has an unsupported nonliteral object member');
      const key = property.name.text;
      assert(!Object.hasOwn(value, key), `duplicate SDK example member: ${key}`);
      value[key] = sdkExampleLiteral(property.initializer);
    }
    return value;
  }
  throw new Error(`SDK_EXAMPLE_NONLITERAL_EXPRESSION:${ts.SyntaxKind[node.kind]}`);
}

export function validateSdkLiteralExamples(markdown) {
  const blocks = publicationExampleBlocks(markdown);
  return sdkExampleBindings.map(binding => {
    const block = blocks[binding.ordinal - 1];
    assert(block && ['ts', 'typescript'].includes(block.info), `SDK consumer block missing: ${binding.symbol}`);
    const source = ts.createSourceFile(`docs-sdk-${binding.symbol}.ts`, block.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    assert.equal(source.parseDiagnostics.length, 0, `SDK example syntax invalid: ${binding.symbol}`);
    assert.equal(source.statements.length, 1, `SDK example changed declaration shape: ${binding.symbol}`);
    const statement = source.statements[0];
    assert(ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1,
      `SDK example not a single value selection: ${binding.symbol}`);
    const node = statement.declarationList.declarations[0].initializer;
    assert(node, `SDK example has no value: ${binding.symbol}`);
    const value = sdkExampleLiteral(node);
    if (binding.definition) validateContractValue(binding.definition, value);
    else {
      assert(binding.schemaPointers.length > 0);
      const refs = binding.schemaPointers.map(pointer => ({ $ref: `${binding.schemaAuthority}${pointer}` }));
      validateReferencedSchema(JSON.stringify(refs.length === 1 ? refs[0] : { anyOf: refs }),
        `docs-example:${binding.symbol}:field`).validate(value);
    }
    return { symbol: binding.symbol, nativeValidation: binding.definition ? 'complete-definition' : 'field-domain-only',
      runtimeExecutionOrProvenance: false };
  });
}

export function validateCanonicalSdkProgram(root, content) {
  // Only this independently classified complete, pure codec exercise may run.
  // A different authored program is not admitted by its language or heading.
  assert.equal(crypto.createHash('sha256').update(content).digest('hex'),
    '3b469c7378d8326593e646659b8e5a215ded75a842f5c4f2051fbd45fa9b6856',
    'canonical SDK program changed; reassess its complete execution responsibility');
  const parent = path.join(root, '.tmp');
  fs.mkdirSync(parent, { recursive: true });
  assert(fs.lstatSync(parent).isDirectory() && !fs.lstatSync(parent).isSymbolicLink(),
    'SDK example scratch parent must be an owned repository directory');
  const directory = fs.mkdtempSync(path.join(parent, 'docs-sdk-example-'));
  try {
    const file = path.join(directory, 'sdk-json-example.ts');
    fs.writeFileSync(file, content, { flag: 'wx' });
    const output = execFileSync(process.execPath, [file], { cwd: root, encoding: 'utf8', timeout: 30000,
      maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC' } });
    return { actualCodecProgramExecution: true, exactPortableAssertions: true,
      legacyBytesLocaleDependent: true, output, runtimeCapabilityOrServiceExecution: false };
  } finally { fs.rmSync(directory, { recursive: true, force: false }); }
}
