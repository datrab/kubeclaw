# KubeClaw documentation handoff

Use this file as the complete starting context for a new Codex session with
model 6.1.

## Mission

Continue the complete KubeClaw documentation work on pull request 13.

Work autonomously from the current code, contracts, schemas, configuration,
and tests. Ask the user only if the repository contains a material
contradiction that cannot be resolved from authoritative sources.

The target is not merely acceptable documentation. The target is technically
correct, detailed, understandable, interesting, and maintainable
documentation of at least very good quality.

## Repository and pull request

- Repository: <https://github.com/datrab/kubeclaw>
- Pull request: <https://github.com/datrab/kubeclaw/pull/13>
- Local repository:
  `/home/node/Documents/Codex/2026-09-15-ich-arbeite-an-pr13-ap01-ap04`
- Branch: `docs/documentation-overhaul`
- Local HEAD at handoff:
  `c8987b18b450bc27571d5037cb6ce3fb26e0cbd0`
- Remote branch HEAD at handoff:
  `c8987b18b450bc27571d5037cb6ce3fb26e0cbd0`
- The worktree was clean before this uncommitted handoff file was created.
- This handoff file is a temporary session artifact. Do not add it to pull
  request 13 or move it below `docs/site/`.

Verify the authoritative state before work starts:

```sh
git status --short
git branch --show-current
git rev-parse HEAD
git ls-remote origin refs/heads/docs/documentation-overhaul
```

Continue on the existing branch. Do not create a new branch.

## Active overall goal

Finish all remaining documentation packages.

For each package from AP09.7 onward:

1. Implement and correct the complete scope.
2. Verify the content against current code and current contracts.
3. Ask fresh-context Sol subagents to review the work independently.
4. Correct every material finding.
5. Repeat the Sol reviews until an honest `OK` is returned.
6. Then ask one Astra-medium subagent to perform the final acceptance review.
7. Do not close the package until Astra considers it absolutely high quality
   and valuable in good conscience.

The overall goal is complete only after the final Astra reviewer accepts the
complete documentation to that standard.

## Mandatory authorities

Read these files completely before changing documentation content:

- `docs/blueprint/07-documentation-quality-standard.md`
- `docs/blueprint/AP09-acceptance-contract.md`
- `docs/blueprint/AP09-execution-plan.md`
- `docs/blueprint/generated/ap09-catalogue.json`
- `docs/blueprint/documentation-parity-contract.md`

Important requirements:

- Published documentation below `docs/site/` is English only.
- The English is for technical readers. It must be clear without removing
  technical depth.
- Explain each important decision through its problem, selected approach,
  reasons, costs, limits, and conditions for reconsideration.
- Do not invent historical reasons. Clearly distinguish a current technical
  inference from recorded historical evidence.
- Architecture pages must explain mechanisms, responsibilities,
  communication, state, concurrency, failures, recovery, security,
  configuration, and extension points in depth.
- Operator procedures must include prerequisites, authority, execution
  location, effects, stop conditions, ordered steps, observations, diagnosis,
  recovery, cleanup, and evidence to retain.
- A product limitation does not block documentation completion when the real
  boundary and its consequences are explained fully and honestly.
- Never present an unexecuted live path as successfully executed.
- Current code, contracts, schemas, configuration, and tests are the authority
  for current behavior.
- Put narrow, revision-bound source links beside the claim they support.
- File existence, word count, link count, and a green structure check do not
  prove content completeness.
- Automate every inventory, drift check, and maintenance path that can be
  automated usefully.
- Avoid manually maintained duplicates of machine-readable facts.

## Forbidden language in the final site

Do not expose internal work or review language below `docs/site/`.

Forbidden examples include:

- `AP09`, `AP9.8`, or another work-package label;
- `review said`;
- `as per review`;
- `review finding`;
- `point C18`;
- `migration finding`;
- `remediation`;
- internal review rounds;
- reviewer names or review history; and
- statements about what an earlier review reported.

The site must be reader-centric and product-centric. Keep review, acceptance,
and migration artifacts outside `docs/site/`.

## Current state

The execution plan describes AP09.0 through AP09.7 as internally complete.
This is not automatically final acceptance. The plan says that independent
acceptance remains open. Verify whether AP09.7 already has a recorded final
Astra-medium acceptance. If it does not, do not call AP09.7 finally accepted.

The current content work starts at AP09.8.

## AP09.8 scope

AP09.8 contains 30 catalogue requirements:

- `OPR-001` through `OPR-009`;
- `OPL-001` through `OPL-005`;
- `CFG-001` through `CFG-005`;
- `CFG-007` through `CFG-015`;
- `CFG-017`; and
- `CFG-018`.

The binding acceptance contract contains 14 non-compensating points:

- `A98-01` through `A98-14`.

Every applicable point must pass individually.

### Main AP09.8 operator pages

- `docs/site/use/README.md`
- `docs/site/use/install.md`
- `docs/site/use/operate.md`
- `docs/site/use/diagnose.md`
- `docs/site/use/recovery.md`
- `docs/site/use/maintenance.md`
- `docs/site/use/capacity.md`
- `docs/site/use/plugins.md`
- `docs/site/use/prism-studio.md`
- `docs/site/use/demo-delivery.md`

### Main AP09.8 configuration pages

- `docs/site/reference/README.md`
- `docs/site/reference/pipeline-platform.md`
- `docs/site/reference/nova-project.md`
- `docs/site/reference/pipeline-definition.md`
- `docs/site/reference/pipeline-json.md`
- `docs/site/reference/plugin-configuration.md`
- `docs/site/reference/worker-profiles-and-roles.md`
- `docs/site/reference/helm-values.md`
- `docs/site/reference/host-and-prism-configuration.md`
- `docs/site/reference/environment-variables.md`
- `docs/site/reference/endpoints.md`
- `docs/site/reference/configuration-precedence.md`
- `docs/site/reference/configuration-change-impact.md`
- `docs/site/reference/configuration-errors.md`
- `docs/site/reference/project-pipeline-publication.md`
- `docs/site/reference/configuration-compatibility.md`

These pages exist. Their existence is not evidence of content acceptance.

## Current parity state

The current parity status contains 249 extraction sources:

```json
{
  "missing-decision": 242,
  "untriaged-decision": 0,
  "invalid-decision": 7,
  "missing-review": 0,
  "invalid-review": 0,
  "source-valid": 0
}
```

All seven existing operator parity decisions are currently
`invalid-decision`:

- `docs/config/documentation-parity/operators/README.md.json`
- `docs/config/documentation-parity/operators/external-pipeline-plugins.md.json`
- `docs/config/documentation-parity/operators/final-preview-tailscale.md.json`
- `docs/config/documentation-parity/operators/plugin-observers.md.json`
- `docs/config/documentation-parity/operators/plugin-pipeline-lifecycle.md.json`
- `docs/config/documentation-parity/operators/recovery-runbook.md.json`
- `docs/config/documentation-parity/operators/running-the-pipeline.md.json`

The immediate error for each file is a stale `extractionDigest`. The Markdown
extractor became more precise and now creates stricter atomic segments.

Do not only replace the digests. For each source:

1. Inspect all newly extracted atomic units.
2. Verify that claim spans, structural spans, target excerpts, and evidence
   remain semantically correct.
3. Update author decisions only after that inspection.
4. Ask a fresh-context reviewer to review each changed decision independently.
5. Bind the reviewer record to the exact revision and decision content.

The other 242 sources also require decisions and independent reviews later.
The complete parity transition is mandatory between AP09.8 and AP09.9. Do not
finally accept AP09.9 before that transition passes.

## Recent completed corrections

The last two commits are:

- `81676a8f` — `docs: close parity review gaps`
- `c8987b18` — `docs: refresh revision-bound references`

They include these corrections:

- YAML frontmatter rejects `%YAML` directives and orphan indentation
  fail-closed.
- Evidence assertions require a real explanatory statement and cannot consist
  only of nouns or locator words.
- Deletion approval requires exactly these structured manual methods:
  - `complete-content-inspection`;
  - `consumer-reference-search`.
- Each method detail must name the concrete reviewed path.
- Each evidence detail must name its concrete evidence path.
- The AP09 contract and checker agree that these tasks are later product
  validation and do not block documentation acceptance:
  - `EXEC-PRISM-JOURNEY`;
  - `EXEC-DEMO-JOURNEY`;
  - `READER-OPERATOR-01` through `READER-OPERATOR-04`.
- Those tasks must never be reported as passed unless they were executed
  successfully.
- CI and generators were hardened for revision-bound generated documentation.

A fresh-context Sol reviewer independently reproduced the four prior findings
and returned `OK` after these corrections.

## Tests already observed as passing

At the handed-off revision, the previous session observed:

- 109 of 109 focused parity-checker, extractor, transition, and workflow
  trust-split tests passing;
- the AP09 contract check passing with:
  - 89 acceptance points;
  - 261 catalogue requirements;
- the independent reproducer review returning `OK`; and
- the operator-task registry reporting:
  - 13 unique tasks;
  - 14 required lifecycle capabilities.

Use these results as context, not as a replacement for verification of the
current state.

## Incomplete test

The complete configuration mutation test was stopped for the requested model
switch. Every mutation observed before the stop passed, but no complete PASS
exists.

Run the complete test again and observe it to terminal status:

```sh
npm run docs:drift:config:mutations
```

The test is slow. Do not restart it because output is temporarily quiet. Keep
polling the same live process handle.

## Immediate work plan

### 1. Load and map the requirements

Read all five mandatory authority files completely.

Create an internal AP09.8 matrix with:

- catalogue ID;
- canonical target;
- acceptance point;
- current source authorities;
- owner and generator;
- required automated check;
- required manual review;
- current state; and
- concrete open findings.

Do not place this work artifact below `docs/site/`.

### 2. Run three fresh-context Sol audits

Use separate read-only reviewers.

#### Audit A: operator procedures

Review `A98-01` through `A98-09`, `A98-12`, and `A98-13`.

Check:

- complete lifecycle;
- supported starting state and versions;
- execution location and authority;
- prerequisites;
- impact and safe stop conditions;
- expected observations;
- differentiated diagnosis;
- retry and recovery boundaries;
- cleanup and retained evidence;
- honest product limitations; and
- absence of invented live results.

#### Audit B: configuration and drift

Review `A98-10`, `A98-11`, and `A98-14`.

Check:

- recursive completeness;
- type and required state;
- defaults and empty-value semantics;
- constraints, owner, and runtime consumer;
- authored input and complete precedence;
- effective values;
- secrets and errors;
- compatibility and change impact;
- drift detection for new public fields; and
- absence of fixed-count false completeness claims.

#### Audit C: reader quality and evidence

Review all 30 AP09.8 targets for:

- English-only content;
- absence of AP, review, and migration language;
- unique and descriptive titles;
- technical depth and readable sentences;
- defined terms;
- reasons, costs, and consequences;
- direct revision-bound source links;
- correct line ranges;
- self-contained navigation;
- no dependency on legacy or review files;
- a clean generated/authored boundary; and
- maintenance owners and source-to-page dependencies.

The reviewers must work read-only first and return concrete findings with
path, line, authority, and required correction.

### 3. Correct every material finding

Verify each corrected claim against current code, contracts, schemas,
configuration, and tests. Do not use a legacy page as authority for current
behavior.

### 4. Run AP09.8 gates

Run checks in bounded groups:

```sh
npm run docs:operator-tasks:check
npm run docs:inventory:config:check
npm run docs:inventory:local-helm:check
npm run docs:drift:cli:check
npm run docs:drift:config:mutations
npm run docs:generate:check
npm run docs:check:refs
npm run docs:site-boundary:check
npm run docs:publication:check
npm run docs:publication:build
```

Then run:

```sh
npm run docs:check:generated
```

Also run:

```sh
npm run docs:parity:extract:check
npm run docs:parity:status:check
npm run docs:parity:test
```

`docs:parity:content:check` cannot pass completely before the 249 parity
decisions are complete. Use its result diagnostically and do not claim a
global PASS prematurely.

### 5. Repeat Sol review until `OK`

After each correction round, ask a new fresh-context Sol reviewer to inspect
the complete AP09.8 scope. The reviewer must look for new defects, not only
confirm that earlier findings disappeared.

Repeat:

```text
audit -> findings -> correction -> tests -> new fresh-context audit
```

until an independent Sol reviewer gives an honest `OK`.

### 6. Run the Astra-medium final acceptance

Only after Sol returns `OK`, ask a fresh-context Astra-medium subagent to
review:

- the quality standard;
- all 14 A98 points;
- all 30 AP09.8 catalogue requirements;
- every AP09.8 site target;
- current implementation and configuration authorities; and
- all test and drift evidence.

The Astra reviewer must perform an independent critical review and must not
infer quality from green checks alone. AP09.8 is complete only if Astra calls
it absolutely high quality and valuable in good conscience.

## Mandatory parity transition after AP09.8

After AP09.8 content acceptance, complete the tree and parity transition:

- `docs/site/` is the only canonical reader documentation.
- Every other file below `docs/` is classified exactly as an internal input,
  temporary extraction source, or deletable remainder.
- Every still-correct atomic statement from all 249 extraction sources maps to
  a specific `docs/site/` section.
- Each omission has current evidence and an allowed reason.
- Every decision has an independent review.
- No unit remains unknown or unreviewed.
- Site navigation, search, and reader tasks do not require a legacy source.

Old sources are deleted only in AP10 after the complete parity and deletion
contract passes.

## Commit and push rules

- Commit regularly and push directly to `docs/documentation-overhaul`.
- Commit after each logically complete and verified section.
- Do not commit temporary review or handoff files below `docs/site/`.
- Preserve unrelated user changes.
- Before each commit, run:

```sh
git diff --check
git status --short
```

- After each push, run:

```sh
git rev-parse HEAD
git ls-remote origin refs/heads/docs/documentation-overhaul
git status --short
```

- Local HEAD and remote HEAD must match.
- Leave a clean worktree at each checkpoint.

### Revision-bound generated outputs

When source, generator, workflow, or maintained documentation files change,
use two logical commits:

1. source commit;
2. generated follow-up commit bound to the source commit.

After the source commit:

```sh
SOURCE_SHA="$(git rev-parse HEAD)"
npm run docs:generate -- --revision "$SOURCE_SHA" --update-source-revision
```

Run all affected inventory generators and checks, then commit the generated
outputs separately.

## Status updates

For long work, report:

- current state;
- completed items;
- open findings;
- next steps;
- realistic remaining duration; and
- latest commit and push state.

Do not claim `complete`, `perfect`, or `100%` unless evidence proves every
applicable acceptance point. If a check did not finish, state explicitly that
no complete PASS exists.

## First action in the new session

Do not start mass parity work immediately.

First:

1. verify Git and remote state;
2. read the mandatory authorities;
3. audit the complete AP09.8 scope;
4. run the three fresh-context Sol audits;
5. correct all material AP09.8 findings;
6. complete the configuration mutation test;
7. obtain Sol `OK`;
8. obtain Astra-medium final acceptance for AP09.8; and
9. only then begin the structured 249-source parity transition.

The previous thread goal was paused for the model switch. Explicitly resume
the existing goal in the new session.
