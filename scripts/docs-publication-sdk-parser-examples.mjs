import assert from 'node:assert/strict';
import ts from 'typescript';
import { parseReviewSource, parseSourceBinding, resolveSourceRevision, sha256Text } from '../skills/common/plugin-runtime/sdk/src/index.ts';
import { checkPipelineTestGateContract } from '../contracts/pipeline-test-gate/v1/src/validation.ts';
import { publicationExampleBlocks } from './lib/docs-publication-example-coverage.mjs';
import { sdkExampleLiteral } from './docs-publication-sdk-examples.mjs';

function sourceExpression(block, mode) {
  const file = ts.createSourceFile('docs-sdk-parser-example.ts', block, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(file.parseDiagnostics.length, 0);
  assert.equal(file.statements.length, 1);
  const [statement] = file.statements;
  if (mode === 'initializer') {
    assert(ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1);
    return statement.declarationList.declarations[0].initializer;
  }
  assert(ts.isExpressionStatement(statement));
  return statement.expression;
}

function parserLiteral(node) {
  if (ts.isCallExpression(node)) {
    assert(ts.isIdentifier(node.expression) && node.expression.text === 'sha256Text' && node.arguments.length === 1,
      'SDK parser example contains an unsupported call');
    assert(ts.isStringLiteral(node.arguments[0]));
    return sha256Text(node.arguments[0].text);
  }
  if (ts.isObjectLiteralExpression(node)) {
    const value = Object.create(null);
    for (const property of node.properties) {
      assert(ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)));
      assert(!Object.hasOwn(value, property.name.text));
      value[property.name.text] = parserLiteral(property.initializer);
    }
    return value;
  }
  return sdkExampleLiteral(node);
}

export async function validateSdkParserExamples(markdown) {
  const blocks = publicationExampleBlocks(markdown);
  const content = ordinal => {
    const block = blocks[ordinal - 1];
    assert(block && ['ts', 'typescript'].includes(block.info));
    return block.content;
  };
  const review = parserLiteral(sourceExpression(content(144), 'initializer'));
  const binding = parserLiteral(sourceExpression(content(160), 'initializer'));
  const callValue = (ordinal, name) => {
    const call = sourceExpression(content(ordinal), 'call');
    assert(ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === name && call.arguments.length === 1);
    return parserLiteral(call.arguments[0]);
  };
  assert.deepEqual(parseReviewSource(review), parseReviewSource(callValue(210, 'parseReviewSource')));
  assert.deepEqual(parseSourceBinding(binding), parseSourceBinding(callValue(218, 'parseSourceBinding')));
  assert.equal(parseReviewSource(review).projectId, 'project1');
  assert.equal(parseSourceBinding(binding).inputDigest, sha256Text('{}'));
  const callback = sourceExpression(content(124), 'initializer');
  assert(ts.isArrowFunction(callback) && ts.isParenthesizedExpression(callback.body)
    && ts.isObjectLiteralExpression(callback.body.expression));
  const output = parserLiteral(callback.body.expression);
  // This explicit validator envelope is a local harness context, not fabricated
  // report artifact provenance or a statement that the adapter executed.
  const result = checkPipelineTestGateContract('reportAdapterResult', { ...output,
    schemaVersion: 'report-adapter-result.v1', adapter: { adapterId: 'example.adapter', format: 'example.format',
      contractVersion: 1, package: { packageId: 'example.package', packageVersion: '1.0.0',
        contentDigest: `sha256:${'0'.repeat(64)}` } },
    sourceArtifact: { artifactId: 'source1', type: 'report', mediaType: 'application/xml',
      contentDigest: `sha256:${'0'.repeat(64)}`, sizeBytes: 0, storageUrl: 'fixture:source' } });
  assert.equal(result.ok, true); assert.deepEqual(result.errors, []);
  assert.deepEqual({ ...output.counts }, { passed: 0, failed: 0, skipped: 0, errored: 0, total: 0 });
  assert.equal(output.cases.length, 0); assert.equal(output.omittedCaseCount, 0);
  assert.equal(output.casesTruncated, false); assert.equal(output.omittedFindingCount, 0);
  assert.equal(output.findingsTruncated, false);
  // This particular documented branch returns before touching its context.
  assert.equal(content(228).trim(), "resolveSourceRevision({revision:'a'.repeat(40)}, context);");
  let contextReads = 0;
  const forbiddenContext = new Proxy({}, { get() { contextReads++; throw new Error('SDK_EXAMPLE_CONTEXT_ACCESS_FORBIDDEN'); } });
  const revision = await resolveSourceRevision({ revision: 'a'.repeat(40) }, forbiddenContext);
  assert.equal(revision, 'a'.repeat(40)); assert.equal(contextReads, 0);
  return { nativeReviewSourceAndSourceBinding: true, completeCallbackOutputSchemaAndCountConsistency: true,
    syntheticReportMetadata: true, sourceRevisionExplicitBranch: true, contextReads,
    callbackOrAdapterOrCapabilityExecution: false };
}
