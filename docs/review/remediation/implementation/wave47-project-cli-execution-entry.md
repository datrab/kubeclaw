# T01-F01: original Project CLI execution entry

The previously missing execution-entry evidence now passes independently of
compile validation. Tested the original Product source at `ba999e2`; unrelated
Prism product-controller WIP was present but no Nova/compiler source was changed.

The existing compiler fixture creates fresh real Git/project/platform files and
resolves actual module and cumulative provider plans. An additional reviewer hook
starts its complete 13-stage project through the original `pipeline.ts --platform
... --project ...`, without `--compile`. No stages or dependencies are removed.
The existing compiler and legacy-import assertions remain enabled and pass.

The original engine publishes a durable run snapshot containing all 13 compiled
stage IDs. The original Source-preflight stage succeeds with its bound artifact;
the original Blueprint-sync stage succeeds with its own artifact. The first
`implement-library` stage is admitted and completes actual Git workspace creation.
It then blocks at the original runtime-dispatch secret resolution boundary:
`implementation.effect_reconciliation_required`, with
`EFFECT_OUTCOME_UNRESOLVED:effect:…:SECRET_UNAVAILABLE:worker`.
The fixture deliberately supplies no external agent token. No HTTP endpoint,
model response, receipt, provider result or sandbox executor is substituted.

Assertions require both preceding stage statuses to be `succeeded`, their actual
attempt outcomes to be `passed`, their artifacts to exist as published references,
the full graph snapshot, first-module attempt, actual workspace path, and the
specific external-configuration failure. An arbitrary CLI or startup error cannot
satisfy this gate. Final-test remains pending and the original CLI exits 1.

This closes the identified T01-F01 verification gap between compile and entering
the first module via the documented Project CLI. It does not establish completed
application execution, native providers, deployed demonstrations or acceptance
(T01-F02). The execution input here is freshly authored; previously reviewed
legacy import/compile evidence remains separate. No remediation register changed.

## Reproduction and raw evidence

Run `node docs/review/evidence/wave47-project-cli-execution-probe.mjs <product-tree>`
from a tree containing this reviewer script. It writes a temporary adjacent copy
of the original compiler fixture with only the additional hook, runs it, and removes
the temporary copy. Original assertions and imports are retained. The final
fixture's `executedStages: 0` output still describes its original compile/import
checks; the additional execution hook reports its own distinct scope.

- `docs/review/evidence/wave47-project-cli-execution.txt`: passing raw output,
  including original CLI result and relevant original journal entries.
- `docs/review/evidence/wave47-project-cli-execution-initial.txt`: retained first
  review run. Its only failed assertion confused stage status `succeeded` with
  attempt outcome `passed`; the productive execution already met the intended
  boundary. Corrected assertions verify both separately.
- `docs/review/evidence/wave47-project-cli-execution-probe.mjs`: exact probe source.

Source SHA-256 values:

| Source | SHA-256 |
| --- | --- |
| `tests/verification/contracts/check-project-compiler.mts` | `f43245243462e6e02e4c07c368883ac114796a0a8c8d0bcf4f32846d82b1d739` |
| `skills/nova/project/cli.ts` | `0415a84628567152cb8f067edc38881459ebb66e8c03c73b8426ac42989e1de0` |
| `skills/nova/project/compiler.ts` | `6dfd903c5802f53d69d93aed8366ef1e774a05d8af72987df9170dd4b177f54d` |
| `skills/nova/project/source.ts` | `c6817af987740b406d5226b124ac3b7611a5c36128d2198ca3dd03c49a079762` |

The later SDK Subject/Snapshot version cutover must retain this consumer boundary
and receives a separate review; this evidence does not pre-approve that WIP.
