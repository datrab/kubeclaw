import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRouteContinuity } from '../lib/docs-route-continuity.mjs';
const old = { page: 'docs/site/old.md', route: '/old/', owner: 'old owner' };
const next = { page: 'docs/site/new.md', route: '/new/', owner: 'new owner' };
const baseline = { schemaVersion: 'kubeclaw-published-route-baseline.v1', pages: [old] };
const registry = (redirects = []) => ({ schemaVersion: 'kubeclaw-documentation-routes.v1', redirects });
const redirect = { from: '/old/', to: '/new/', reason: 'Renamed; successor owns the maintained content.' };
test('unchanged route and new additions retain known routes', () => {
  assert.doesNotThrow(() => assertRouteContinuity(baseline, [old, next], registry()));
});
test('rename cannot erase the known route even with a regenerated map', () => {
  assert.throws(() => assertRouteContinuity(baseline, [next], registry()), /Published route disappeared/);
});
test('removal cannot erase the last known route', () => {
  assert.throws(() => assertRouteContinuity(baseline, [], registry()), /Published route disappeared/);
});
test('rename or removal with an owned active successor and reason is allowed', () => {
  assert.doesNotThrow(() => assertRouteContinuity(baseline, [next], registry([redirect])));
});
test('retained old owner cannot substitute for successor ownership', () => {
  assert.throws(() => assertRouteContinuity(baseline, [{ ...next, owner: '  ' }], registry([redirect])), /needs a page and owner/);
});
test('dangling redirect, chain, and loop are refused', () => {
  for (const redirects of [[redirect], [redirect, { from: '/new/', to: '/old/', reason: 'cycle' }]]) {
    assert.throws(() => assertRouteContinuity(baseline, [], registry(redirects)), /Redirect target/);
  }
});
test('redirect cannot leave the old route active as a second authority', () => {
  assert.throws(() => assertRouteContinuity(baseline, [old, next], registry([redirect])), /still an active route/);
});
test('duplicate routes and redirects are refused', () => {
  assert.throws(() => assertRouteContinuity(baseline, [old, old], registry()), /Duplicate active route/);
  assert.throws(() => assertRouteContinuity(baseline, [next], registry([redirect, redirect])), /Duplicate redirect/);
});
test('empty migration reasons cannot silently acknowledge historical loss', () => {
  assert.throws(() => assertRouteContinuity(baseline, [next], registry([{ ...redirect, reason: ' ' }])), /reason/);
});
test('unknown pre-registry routes are not invented', () => {
  assert.doesNotThrow(() => assertRouteContinuity(baseline, [old], registry()));
});
