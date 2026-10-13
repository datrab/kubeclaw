# URUNTIME-001: bounded C0 row-history provenance correction

The historical `standalone-remote-19` integration inserted an empty
`sourceDefinitionHistory` before hashing the prior row. The 17 `oldRowSHA256`
values now authenticate the exact original rows in the untouched historical
`changed-rows-before.json.gz`, independently compared with commit
`21bf51bc2075abec1191fdc091952492b6cb484e`.

Each corrected history has explicit `oldRowSHA256Correction` provenance retaining
the previous incorrect digest, correct digest, snapshot file identity, original
row ID, canonicalization, baseline commit and correction evidence link.
`corrections.json` additionally retains the complete previous history records.
`inventory-before.json.gz` preserves the pre-repair fragment bytes;
`integrate-before.py.snapshot` preserves the historical author script.

Only the runtime fragment's 17 history records and the historical author script's
hash-before-mutation ordering changed. No historical report, source snapshot,
case body, disposition, raw log or original failure was rewritten. This does not
claim global C0, runtime/native acceptance, finding closure or C1 authorization.
Root integration and independent recheck belong to the parent task.

## Commands and results

Run from repository root; Python standard library only:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 docs/review/evidence/config-acceptance/four-findings-fix-20261013/runtime/verify.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/review/evidence/config-acceptance/four-findings-fix-20261013/runtime/check-negatives.py
```

`repair.py` was run once (see `repair.stdout`/`repair.stderr`) and refuses a second
repair when `corrections.json` exists. It never invokes `integrate.py`.

`verification.json` and `recovery-verification.json`: PASS for all 17 original-row
digests, 17 retained incorrect histories, complete non-provenance fragment
conservation, exact original checkpoint row equality, and 248 untouched
historical artifact hashes. The real `integrate.py` history-capture AST prefix
is executed for each original row in memory only; all 17 now hash before the
history insertion. The remainder of integration is not executed.

`negative-verification.json`: three persisted isolated compressed candidate
inputs reject at intended boundaries: restored incorrect digest, missing
correction provenance, and unrelated row modification. Each input, command,
exit code, expected reason and stdout/stderr path is recorded. Final positive
recovery verifies the real fragment remains intact. These are provenance
integrity controls, not productive runtime behavior or F-MUT acceptance claims.

`input-digests.json` records the original snapshot, pre-repair fragment bytes,
script identities and all protected historical inputs. `output-digests.json`
records final new-evidence file identities, execution environment and checkout.
