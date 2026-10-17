import assert from 'node:assert/strict';

// The committed map is a known-route boundary, not a claim that every route
// was externally served. Earlier unknown routes must not be fabricated.
export function assertRouteContinuity(baseline, pages, registry) {
  assert.equal(baseline.schemaVersion, 'kubeclaw-published-route-baseline.v1', 'Invalid published-route baseline');
  assert(Array.isArray(baseline.pages), 'Published-route baseline needs pages');
  assert.equal(registry.schemaVersion, 'kubeclaw-documentation-routes.v1', 'Invalid route registry');
  assert(Array.isArray(registry.redirects), 'Route registry needs redirects');
  const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
  const active = new Map();
  for (const page of pages) {
    assert(nonempty(page.page) && nonempty(page.route) && nonempty(page.owner), 'Current route needs a page and owner');
    assert(!active.has(page.route), `Duplicate active route: ${page.route}`);
    active.set(page.route, page);
  }
  const redirects = new Map();
  for (const redirect of registry.redirects) {
    assert(nonempty(redirect.from) && nonempty(redirect.to) && nonempty(redirect.reason), 'Redirect needs from, to, and reason');
    assert(!redirects.has(redirect.from), `Duplicate redirect source: ${redirect.from}`);
    assert(!active.has(redirect.from), `Redirect source is still an active route: ${redirect.from}`);
    assert(active.has(redirect.to), `Redirect target is not an active route: ${redirect.to}`);
    redirects.set(redirect.from, redirect);
  }
  const seen = new Set();
  for (const page of baseline.pages) {
    assert(nonempty(page.page) && nonempty(page.route) && nonempty(page.owner), 'Baseline route needs a page and owner');
    assert(!seen.has(page.route), `Duplicate baseline route: ${page.route}`);
    seen.add(page.route);
    assert(active.has(page.route) || redirects.has(page.route),
      `Published route disappeared without a redirect: ${page.route} (${page.page}, previous owner: ${page.owner})`);
  }
}
