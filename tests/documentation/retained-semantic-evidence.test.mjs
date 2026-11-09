import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticEvidenceLinks, retainedSemanticNotice } from '../../scripts/lib/docs-retained-semantic-evidence.mjs';
import { renderSecrets } from '../../scripts/docs-generate-core.mjs';

const revision = 'a'.repeat(40);
const context = { revision, inputs: [{ path: 'skills/prism/receiver.ts', revision, lines: 130 }] };
test('current meaning links use their own authenticated revision and complete bounded ranges', () => {
  const links = semanticEvidenceLinks(context, [{ path: 'skills/prism/receiver.ts', line: 1, endLine: 130 }]);
  assert.equal([...links.matchAll(/https:\/\//g)].length, 3);
  assert(links.includes('#L1-L60') && links.includes('#L61-L120') && links.includes('#L121-L130'));
  assert(links.includes('/blob/' + revision + '/'));
  assert.throws(() => semanticEvidenceLinks(context, [{ path: 'absent', line: 1 }]), /NOT_AUTHENTICATED/);
  assert.throws(() => semanticEvidenceLinks(context, [{ path: 'skills/prism/receiver.ts', line: 1, endLine: 131 }]), /RANGE_INVALID/);
  assert.throws(() => semanticEvidenceLinks(context, [{ path: 'skills/prism/receiver.ts', line: 0 }]), /RANGE_INVALID/);
  assert(retainedSemanticNotice(context).includes('not current discovery'));
});

test('Secrets retained mode replaces acquisition claims but preserves all command and recovery context', () => {
  const setup = { generatedFrom: ['synthetic-fixture'], resolutionOrder: ['keep resolution'],
    setupOrder: ['keep setup'], secrets: [] };
  const ordinary = renderSecrets(setup);
  const retained = renderSecrets(setup, { secrets: [] }, undefined,
    { artifactRevision: 'b'.repeat(40), sourceRevision: 'c'.repeat(40), semanticOwnerRevision: revision,
      notice: retainedSemanticNotice(context), meaningEvidence: () => '' });
  assert(ordinary.includes('Last verified: generated from current inventory'));
  assert(!retained.includes('Last verified: generated from current inventory'));
  assert(!retained.includes('The generator redacts Secret values'));
  assert(retained.includes('not a new recursive inspection or a current redaction run'));
  assert.equal(ordinary.slice(ordinary.indexOf('## Examples')), retained.slice(retained.indexOf('## Examples')));
  for (const heading of ['## Secret Resolution Order', '## Secret Setup Order', '## Secrets']) {
    const start = ordinary.indexOf(heading); const end = ordinary.indexOf('\n## ', start + 1);
    assert(retained.includes(ordinary.slice(start, end)));
  }
});
