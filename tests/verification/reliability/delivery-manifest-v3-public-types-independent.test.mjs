import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = process.env.KUBECLAW_REVIEW_SOURCE_ROOT;
assert(sourceRoot && path.isAbsolute(sourceRoot), 'KUBECLAW_REVIEW_SOURCE_ROOT must be absolute');

test('public unsigned v3 type rejects every impossible Review optional-field combination', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-v3-public-types-'));
  try {
    let contract = path.relative(
      temporary,
      path.join(sourceRoot, 'contracts/delivery-manifest/v3/src/index.ts'),
    ).replaceAll(path.sep, '/');
    if (!contract.startsWith('.')) contract = `./${contract}`;
    const fixture = path.join(temporary, 'contract.ts');
    fs.writeFileSync(fixture, `
      import type { DeliveryManifestV3Unsigned } from '${contract}';
      type Final = DeliveryManifestV3Unsigned['final'];
      const core = {
        sourceStageId: 'forge', lintStageId: 'lint', testStageId: 'test',
        expectedCoverage: null as never, sourceRevision: '${'a'.repeat(40)}',
        decisionDigest: 'sha256:${'b'.repeat(64)}', resultDigest: 'sha256:${'c'.repeat(64)}',
        coverage: null as never,
      } as const;
      const noReview: Final = core;
      const reviewOnly: Final = { ...core, reviewStageId: 'review' };
      const reviewArtifact: Final = { ...core, reviewStageId: 'review', reviewArtifactEncoding: 'kubeclaw-json.utf16.v1' };
      const reviewSemantic: Final = { ...core, reviewStageId: 'review', reviewArtifactEncoding: 'kubeclaw-json.utf16.v1', reviewSemanticEncoding: 'review-semantics.utf16-v1' };
      // @ts-expect-error semantic encoding requires both Review stage and artifact encoding
      const semanticAlone: Final = { ...core, reviewSemanticEncoding: 'review-semantics.utf16-v1' };
      // @ts-expect-error semantic encoding requires artifact encoding
      const semanticWithoutArtifact: Final = { ...core, reviewStageId: 'review', reviewSemanticEncoding: 'review-semantics.utf16-v1' };
      // @ts-expect-error artifact encoding requires a Review stage
      const artifactWithoutReview: Final = { ...core, reviewArtifactEncoding: 'kubeclaw-json.utf16.v1' };
      void [noReview, reviewOnly, reviewArtifact, reviewSemantic, semanticAlone, semanticWithoutArtifact, artifactWithoutReview];
    `, 'utf8');
    const compiler = path.join(process.cwd(), 'node_modules/.bin/tsc');
    const result = spawnSync(compiler, [
      '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022',
      '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
      '--allowImportingTsExtensions', '--types', 'node',
      '--typeRoots', path.join(process.cwd(), 'node_modules/@types'), fixture,
    ], { cwd: temporary, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
