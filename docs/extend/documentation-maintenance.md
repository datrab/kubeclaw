# Maintain the documentation

Status: current reader source layout
Audience: documentation contributor, maintainer
Owner: documentation
Evidence: scripts/docs-reader/build.mjs; scripts/docs-reader/renderer.mjs; .github/workflows/docs-checks.yaml
Applies to: the documentation directly under docs/
Last verified: 2026-11-02; layout and reader-build change, not runtime acceptance

## Edit the owning page

The documentation home is [`docs/README.md`](../README.md). Use `understand/`
for explanations, `use/` for tasks, `extend/` for development, and `reference/`
for exact names and contracts. There is no separate `docs/site/` tree.
Keep runnable examples next to the task that uses them. Use relative links
between pages. Keep expected results, important failures and cleanup with the task.

## Check and preview a change

Use Node.js 24 and the committed lockfiles. From the repository root:

```sh
npm ci --ignore-scripts --include=dev
npm ci --ignore-scripts --prefix scripts/docs-reader
npm run docs:check
npm run docs:test
npx --no-install playwright install --with-deps chromium
npm run docs:build
node scripts/docs-reader/check-artifact.mjs
npm run docs:serve
```

The reader opens at `http://127.0.0.1:4173/`. Stop the preview with Ctrl+C.
The disposable build is `.tmp/docs-publication/`; do not commit that directory.
`docs:check` checks page/asset destinations and registered diagram sources.
The artifact check validates rendered links, fragments and output bytes.
Then read the changed task in the browser, including its expected result and
failure path. These checks do not execute deployment or prove runtime readiness.

## Generate only owned facts, then check

Existing reference pages are retained documentation snapshots. When the owning
product declaration changes, update the affected explanation and reference
alongside it. The ordinary reader build does not regenerate every reference or
infer the behavior of arbitrary shell, Go or Node output. Do not claim that a
successful HTML build proves reference freshness.

The small open-issue source is
`scripts/docs-reader/data/open-issues.json`; `npm run docs:status:generate`
updates its reader page. Diagram registration lives in
`scripts/docs-reader/diagram-registry.json`. Existing route redirects stay in
[`the route registry`](../reference/documentation-route-registry.json).
Update a changed diagram's source digest and text alternative deliberately.
Keep old public routes working when a page moves.

Legacy documentation, migration plans, review corpora and acceptance ledgers are
not part of the current source tree. Use Git history when historical context is
needed. Do not restore those directories to make a reader build pass.
