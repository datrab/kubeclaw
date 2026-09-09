# WP08 — Prism domain remediation

Status: implemented in the remediation worktree; independent review pending.
Historical component report remains unchanged. Scope: PCR-PRISM-DOMAIN-001,
PCR-PRISM-DOMAIN-002 and PCR-PRISM-DOMAIN-003.

## Original defects reproduced

The expanded domain tests were run against the unchanged `HEAD` domain reducer
and resolver, temporarily copied to the temporary, subsequently removed baseline-review.ts file.
Only the test import was redirected; no replacement reducer was implemented.
The temporary source/test copies were removed after the run.
Result: **12 tests, 5 passed, 7 failed**:

- Two direct/deep descendant moves returned successfully instead of throwing.
- Two nested duplication cases threw `duplicate node ID: child` (ordinary and
  maximum-length explicit root ID).
- Compact, regular and wide resolution all returned base `content: Deployments`
  instead of the disjoint state `content: State title` when a viewport supplied
  `hidden: true`.

Existing immutable revisions, stale revision rejection, batch rollback and
responsive-only behavior passed before and after. Self-move rejection and legal
sibling/cross-view moves also passed before and after.

The separately identified candidate branches were inspected by the coordinating
agent through remote comparisons: `49e8531407d41cabc24966822e16bf7026b96235`
changes the historical Puck spike domain/tests, while
`aa6b1826e24f1d6f5cf890848118671044c1d54e` changes the Studio Puck adapter/tests.
Neither changes `skills/prism/domain/index.ts`; neither was merged or copied.

## Root-cause changes

`skills/prism/domain/index.ts` checks the complete source subtree before detaching
a moved node. It rejects both self and descendant targets. Index validation uses
the target's post-removal length, preserving same-parent reorder semantics.
The existing immutable clone and final document/ID validation remain authoritative.

`skills/prism/domain/duplicate.ts` remaps every copied view-node ID. The existing
operation field `newNodeId` is the explicit deterministic seed: root keeps that
ID, descendants receive numeric suffixes in preorder, skipping occupied IDs from
all views and IDs allocated earlier in the same copy. Suffixing truncates the
seed to keep the schema's 80-character maximum. An occupied explicit root ID
still rejects the entire operation. No random identities or contract extension
are introduced.

State and responsive patches for copied nodes are cloned under their new IDs.
Node-scoped flow transitions originating in the containing view are copied with
new transition IDs and remapped `trigger.node`; their action, response and target
remain unchanged. Node-independent transitions are not duplicated. Action names,
component IDs and component-local override keys belong to separate identity
spaces and are preserved, rather than replacing arbitrary strings in props.
Original nodes, patches and transitions remain intact.

View resolution merges property maps per node in declared precedence:
base props, state props, viewport props. Later layers replace only matching
properties. Unknown states and empty patch groups retain prior behavior.

## Verification

Passed after implementation:

```bash
npm run verify:prism:domain
npm run verify:prism:engine
npm run verify:prism:storage
npm run typecheck --prefix skills/prism
node_modules/.bin/eslint --config charts/kubeclaw/files/config/eslint.config.mjs skills/prism/domain/index.ts skills/prism/domain/duplicate.ts skills/prism/tests/domain.test.mts skills/prism/tests/domain-storage.test.mts
git diff --check
```

- Domain: **13 passed**, including the real `RevisionRepository` with PGlite and
  actual migrations. Rejected descendant moves leave the current row and revision
  count unchanged. Nested duplicates persist and survive restoration of original
  and duplicate snapshots (revisions 3 and 4).
- Engine: **7 passed**. Storage/control: **6 passed**.
- Prism TypeScript checking and the canonical lint policy passed. A first lint
  run exposed reducer complexity 16; extracting the existing responsive mutation
  into a helper resolved it without suppressing rules.

`test:domain` explicitly includes the new transaction regression. PGlite is the
embedded PostgreSQL engine, not proof of deployed PostgreSQL or concurrent
multi-client behavior. No production service, browser, CI or deployment was run
for this scoped change. Renderer/Studio behavior and unrelated flow semantics
remain separate review work.
