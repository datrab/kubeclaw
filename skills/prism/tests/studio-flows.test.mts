import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrism, type PrismDocument } from '@kubeclaw/prism-contracts-v1';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { studioFlows, previewActionTarget, previewSelection } from '../studio/flows.ts';

function documentWithFlow(): PrismDocument {
  const document = validatePrism<PrismDocument>('designDocument', structuredClone(fixture));
  document.views.home!.initialState = 'ready';
  document.views.home!.states.ready = { patches: {} };
  document.flows.review = { title: 'Review', goal: 'Confirm selection', start: { view: 'home', state: 'ready' },
    success: { view: 'home', state: 'default' }, recovery: [], transitions: [{ id: 'confirm',
      from: { view: 'home', state: 'ready' }, to: { view: 'home', state: 'default' }, trigger: { actor: 'user', action: 'confirm', node: 'confirm-button' },
    }] };
  return document;
}

test('actual schema initialState and validated flow action preserve source, action and optional node matching', () => {
  const document = documentWithFlow();
  validatePrism('designDocument', document);
  assert.equal(document.views.home!.initialState, 'ready');
  const flows = studioFlows(document);
  assert.deepEqual(flows[0]!.start, { view: 'home', state: 'ready' });
  const from = { view: 'home', state: 'ready' };
  const message = { schema: 'prism.action.v1', action: 'confirm', nodeId: 'confirm-button' };
  assert.deepEqual(previewActionTarget(flows, from, message), { view: 'home', state: 'default' });
  assert.equal(previewActionTarget(flows, { ...from, state: 'default' }, message), undefined);
  assert.equal(previewActionTarget(flows, from, { ...message, nodeId: 'other-node' }), undefined);
  assert.equal(previewActionTarget(flows, from, { ...message, action: 'other-action' }), undefined);
  assert.equal(previewActionTarget(flows, from, { ...message, nodeId: 1 }), undefined);
  assert.equal(previewSelection({ schema: 'prism.selection.v1', nodeId: 'selection' }), 'selection');
  assert.equal(previewSelection({ schema: 'prism.selection.v1', nodeId: {} }), undefined);
});

test('malformed unknown flows fail actual contract validation before Studio navigation', () => {
  for (const flow of [null, { transitions: [] }, { title: 'Bad', transitions: [null] }]) {
    const document = documentWithFlow(); document.flows.review = flow;
    assert.throws(() => studioFlows(document), /PRISM_INPUT_INVALID/u);
  }
});
