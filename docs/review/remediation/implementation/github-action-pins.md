# Immutable GitHub action sources

This continues IFR-22-001 across all ten active workflow entrypoints and their
local reusable calls, including the privileged image-receipt preservation job.
All 68 external `uses` references now name a full official commit SHA. Five
local reusable calls retain their original references. No repository-owned
`action.yml`/`action.yaml` manifests currently exist. All sixteen resolved
repository/tag combinations use JavaScript action entrypoints (node20/node24);
their verified manifests contain no nested composite `uses` chain.

Existing version selections are preserved in adjacent comments. Each original
tag was resolved through the official repository commit endpoint, including
annotated-tag dereference. The actual `action.yml` at the resolved SHA was read,
its returned bytes independently rehashed as a Git blob, and its SHA-256 recorded
in `.github/action-pins.json`. That provenance contains source tag, immutable
commit URL, manifest path/URL, Git blob identity, content SHA-256 and lookup date.
These checks bind the selected official source; they do not audit every line of
third-party action code or pin tools downloaded by those actions.

The workflow files retain their original bytes except action-reference tokens,
original-version comments and two commands in the existing update-policy job:
the new repository guard and its regression test. Event/branch permissions,
secrets, checkout settings, image build/scanning, attestations, digest smoke
checks, receipt creation and release/promotion sequencing are unchanged. No
workflow YAML serializer/reformatting was used. Previously pinned Ops/Docs
entrypoints only gain comments identifying their original version selections.

## Continuing enforcement and updates

`scripts/check-action-pins.mjs` discovers actual Git source files, including
untracked source files not ignored by Git, and checks every active workflow and
repository-owned action manifest. YAML duplicate keys reject. It walks all
`uses` keys, permits repository-local references to existing paths, requires
external GitHub references to use full commit SHAs with corresponding manifest
provenance, and permits Docker action references only with a SHA-256 digest.
The existing pull-request/reusable update-policy workflow runs this guard. The
check does not rely on a frozen list of workflow filenames or references.

For an intentional update:

1. Review the desired action version in its official repository. Resolve that
   exact tag through the official commit endpoint; do not copy an unrelated
   SHA or leave the floating tag in executable YAML.
2. Read the actual action manifest at that commit/path. Recompute the Git blob
   hash and SHA-256 from the returned bytes. Inspect its runtime and any nested
   composite/reusable references before accepting the source.
3. Update `.github/action-pins.json`, the affected `uses` SHA and adjacent version
   comment together in a reviewed change. A provenance entry alone does not
   authenticate a future change; its source lookup/review remains mandatory.
4. Run the guard, original workflow trust tests, workflow YAML validation and
   relevant existing source checks. A live runner trust/token test is separate.

The native GitHub token/isolated-PR permission gate remains open. No Actions run,
CI trigger, image build, registry publication, deployment or external message
was performed. The prior trust-split note's remaining floating-callee observation
is historical; this continuation pins that callee without changing permissions.

## Verification and exact scope

The new guard reports ten actual source files, 68 external references and five
local calls. Two genuine parser/source tests cover the current repository and a
real temporary Git source tree: unchanged original receipt workflow passes;
floating download action, unknown commit provenance and an added nested local
composite with a floating action reject; local references remain allowed;
duplicate YAML keys reject. The five original workflow-trust tests still pass.
These are static source checks, not simulated GitHub execution.

All ten workflow YAML validators and canonical guard/test ESLint pass. The
existing release-configuration tests also pass. Two earlier generator integration
failures found by the original versions tests are repaired in the separate
`version-generator-integration.md` scope; those tests and actual generation check
now pass as well. Native workflow execution is
not claimed. Evidence is in `docs/review/evidence/github-action-pins.txt`.

Owned paths: the ten `.github/workflows/*.yaml` files, `.github/action-pins.json`,
`scripts/check-action-pins.mjs`,
`tests/verification/contracts/action-pins.test.mjs`, this note and its evidence.
No commits or staging by this author.
