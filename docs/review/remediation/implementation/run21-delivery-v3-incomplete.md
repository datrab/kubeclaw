# Delivery-manifest v3 implementation checkpoint

Status: INCOMPLETE SOURCE CHECKPOINT. This is not implementation acceptance,
PCR-SDK-001 closure, a register change or an all-47 completion claim.

Run `20260910t042633`; source base
`15f6a808ed1666c3b7a2a3909749e3d4ee377904`, whose complete tree
`9c0e967294c2000a6ac2ac8264e4f01ea568c22b` was read from the current remote
semantic-author checkpoint. Fresh MAIN was
`e644a79fddd4d4d686fbd351b6edaec5575caf57`. The frozen baseline extraction
again produced exactly 47 IDs, equal to `partial-47-scope.json`, with unchanged
original finding text.

The complete accepted design `569454a94ef4e3d77cde1628e868a2fd15b22ba7`
and independent acceptance `90dd3b25c9c30a6a487600bc60ba844f200cefb6`
were read before source work. The registered RED sources and evidence at
`f3ddec16b5a1c2787e956b5bc9d1556281660831` and independent acceptance
`45fff05281c253dd27ffc52cca207c73104ae36d` were inspected. This work does not
retry, rephrase or reroute the prohibited semantic helper action.

This first coherent slice adds the public workspace contract package and its
closed v3 schema, finite constants/types, no-trap create/parse entrypoints,
portable semantic digest, v3 semantic/evidence ownership checks, the shared
version-aware read boundary, workspace membership, plugin dependency
declarations and lockfile entries. The contract TypeScript gate passed; raw
output is `docs/review/evidence/run21-delivery-v3-contract-typecheck.txt`.

Still required before the package is reviewable as a complete implementation:

- wire the original Summary builder/stage to the explicit finite selector while
  preserving the v2 branch and effect ordinal exactly;
- switch the original evidence adapter to the public reader without narrowing
  the v2 corpus;
- add compiler and recovery ownership as the fifth/sixth independent mode;
- add contract/no-trap/legacy/registered Core and disk-store tests, native
  durability/recovery tests, consumer negatives, graph combinations and all
  repository gates from the accepted design;
- obtain independent source review. No MAIN or register update is permitted
  from this checkpoint.

Next action: implement the producer and consumer against this public contract,
run their bounded original and v3 tests, then preserve a new remote checkpoint
for independent review before broader matrices.
