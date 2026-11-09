# Verification commands

Status: current documentation and selected product check entrypoints
Audience: operator, developer, documentation maintainer
Owner: documentation
Evidence: package.json; scripts/docs-reader/build.mjs; scripts/docs-reader/check-artifact.mjs
Applies to: the selected current checkout; product tests retain their own prerequisites
Last verified: 2026-11-02; command declaration and documentation-layout review

## Claim-to-test map

| Command | Purpose | Does not prove |
| --- | --- | --- |
| `npm run docs:check` | Page and asset destinations, page owners, diagram sources | Runtime behavior or reference freshness |
| `npm run docs:test` | Reader behavior and root-layout regressions | Deployed operation |
| `npm run docs:build` | HTML, navigation, search, examples and diagrams | Successful application deployment |
| `node scripts/docs-reader/check-artifact.mjs` | Rendered local links, anchors and output bytes | Full accessibility certification |
| `npm run docs:serve` | Loopback reader preview on port 4173 | Public hosting |
| `npm run docs:status:check` | Current open-issue view matches its small register | Closure of live acceptance |

Follow [Maintain the documentation](../extend/documentation-maintenance.md)
for installation and build order. Read the changed task in the browser.
Do not use migration ledgers, source-custody repinning or universal runtime-output
analysis as prerequisites for this reader build.

## Product checks

Select the check at the changed product boundary in the
[developer handbook](../extend/developer-handbook.md). Inspect the current
`package.json` declaration and the component's prerequisites before execution.
For example, `npm run verify:plugin-system-v2` requires the prepared isolation
host described by [extension testing](../extend/testing.md); it is not a portable
reader check. `npm run verify:prism:contracts` checks Prism contracts and types.
Neither proves a live Studio journey or a deployed cluster.

## Retired documentation commands

The old AP, parity, blueprint, raw-inventory and custody-check campaigns are no
longer the documentation publication chain. Earlier source-pinned examples and
reports describe their historical revisions, not additional steps to run now.
Existing public reference pages are retained snapshots; update actual changed
facts from their owning declarations rather than declaring them fresh because
HTML rendered successfully.
