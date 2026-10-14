# Narrow author-local commands

Run from repository root. Inspected imports and pure slices are recorded in check-definition.mjs. No provider.execute, native construction/invocation, CLI/scanner/npm security tool, endpoint/network/API/browser/credentials/Eval is run.

Definition recreation (only02 destination; does not recreate01):

```sh
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/security-provider-contracts-02/define-correction.py
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/security-provider-contracts-02/complete-receiving-closure.py
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/security-provider-contracts-02/extend-checks.py
```

Pure replay (script writes02 observations only; reads frozen01/source):

```sh
node docs/review/evidence/config-acceptance/c0-completion-20261013/security-provider-contracts-02/check-definition.mjs
```

Conservation and author artifact freeze:

```sh
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/security-provider-contracts-02/freeze-correction.py
```

Exact firstfailed and final commands/exits/tool references are in commands-and-exits.json. Replay success is source-definition evidence only; all original productive cases remain not-run. Frozen manifest excludes itself and its own stdout to avoid a circular hash; final stdout is raw bookkeeping, not another test claim.
