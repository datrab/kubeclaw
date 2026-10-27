import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadRetainedConfigurationSnapshot } from '../../scripts/lib/docs-retained-source.mjs';
import { buildHistoricalOwners } from '../../scripts/lib/docs-retained-configuration-owners.mjs';
import { projectRetainedInventoryLanguage } from '../../scripts/lib/docs-retained-configuration-projection.mjs';
import { renderRetainedConfigurationReferences } from '../../scripts/lib/docs-retained-configuration-renderer.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifactRevision = '145da1d0b30fb3b636c4b03fb3d3252819ee2bf5';
const sourceRevision = '6fa4830a48244d29655104a5be58957d5fa87d2f';
test('full historical renderer reproduces original pages and preserves all rows and upstream quotations after editorial projection', () => {
  const snapshot = loadRetainedConfigurationSnapshot({ root, artifactRevision, sourceRevision });
  const original = snapshot.inventories;
  const owners = buildHistoricalOwners({ ...original, readSourceText: snapshot.readSourceText,
    readArtifactJson: snapshot.readArtifactJson });
  const projected = projectRetainedInventoryLanguage({ ...original, historicalOwners: owners });
  const args = { ...original, secrets: original.secretSetup, readSourceText: snapshot.readSourceText,
    artifactRevision, sourceRevision };
  const baseline = renderRetainedConfigurationReferences(args);
  const next = renderRetainedConfigurationReferences({ ...args, ...projected, banner: true,
    editorialRevision: 'ae67b6204435bb104e00d85091969da53ede415c',
    editorialSourcePath: 'scripts/lib/docs-configuration-editorial-language.mjs' });
  const rows = text => text.split('\n').filter(line => line.startsWith('| ')).length;
  for (const [relative, text] of baseline) {
    const expected = execFileSync('git', ['show', `${artifactRevision}:${relative}`],
      { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    assert.equal(text, expected, `historical baseline differs: ${relative}`);
    assert.equal(rows(next.get(relative)), rows(text), `rows lost: ${relative}`);
    assert(next.get(relative).includes('This view does not perform current discovery'));
  }
  const helm = baseline.get('docs/site/reference/helm-values.md');
  const changed = next.get('docs/site/reference/helm-values.md');
  const anchors = [...helm.matchAll(/<a id="api-collection-[a-f0-9]+"><\/a>/gu)];
  assert.equal(anchors.length, 170);
  for (const { index } of anchors) {
    const end = helm.indexOf('\n## ', index);
    assert(changed.includes(helm.slice(index, end < 0 ? helm.length : end)), 'upstream quotation changed');
  }
  const countFields = text => [...text.matchAll(/— (\d+) discovered fields, including lists and maps/gu)]
    .reduce((sum, match) => sum + Number(match[1]), 0);
  assert.equal(countFields(changed), 3813);
  assert.equal(projected.runtimeInputs.environment.length, 435);
  assert.equal(projected.changes.length, 106);
  assert(projected.preservation.allNonEditorialPointersEqual);
  assert(projected.preservation.secretsEqual);
  assert.throws(() => renderRetainedConfigurationReferences({ ...args, sourceRevision: artifactRevision }),
    /UNSUPPORTED_RETAINED_RENDERER_SOURCE_VERSION/);
});
