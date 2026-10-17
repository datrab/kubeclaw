# Narrow definition replay

Repository root cwd. Scripts write only this new package. Definition recreation order:

```sh
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01/define.py
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01/extend-definition.py
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01/fixture-contracts.py
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01/preserve-axe-merged-domain.py
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01/extend-definition.py
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01/c3-projection-definition.py
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01/caller-contracts.py
```

Current final frozen pure replay:

```sh
node docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01/check-definition.mjs
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01/freeze-definition.py
```

The checker writes local observations and fills actual package source digests in proposed views; never imports provider/native runtime/browser modules or executes provider/config/project/browser/evidence-staging bodies. Readonly actual source fixture realpath/stat/JSON/image-header helpers and isolated exact functions/guard slices only. TypeScript parsing/erasure, Ajv and pure package digest are tool/source bookkeeping, not a native effect harness. Old browser04 full mock/native-compare checker is NOT invoked.

commands-and-exits.json references exact tool outputs and saved raw successful/failed receipts. Saved syntax failure replay fails at parsing before any body executes. Manifest excludes itself and its own freeze stdout to avoid circular hash.
