# Prism single runtime cleanup

The production Control/worker path now uses V3 exclusively. The legacy dispatcher,
V1 executor, V1 producer/profile, shared-process resource measurement and separate
native CLI have been removed. `worker.ts` is the sole supervisor entrypoint.
Helm has no legacy/native activation switch; host/image preflight is mandatory.

Historical V1 results remain readable using the existing bound reader. Two genuine
receipts and their evidence were captured with the original executor at commit
`0ad3a952f1bda57069e9165edef908cb73d88ae9`; executable V1 code was not copied into tests.
A real artifact server can hydrate a retained receipt, and invalid variants fail
before another evidence request.

User cancellation now gives the native host a bounded cooperative drain. Resource
violations and execution deadlines still force termination. Defaults are 105 seconds
for host close, 120 seconds for service shutdown and 150 seconds for Pod termination;
Helm validates their ordering. Live HTTP/process tests use the original native owner
and host, fail on missing prerequisites, and never substitute an execution object.

Evidence: `docs/review/evidence/pr6-prism-single-runtime/`.

- Broad Prism run: 197/199 passed, with zero skips, including actual PostgreSQL 17
  transport-failure identity and query-cancellation checks. The suite also contains
  embedded SQL/component tests; it is not a 199-test native service claim.
- The two broad-run failures were an invalid historical-schema fixture and a missing
  Helm PATH. Original pre-011 migrations now build the fixture; its five-test file
  passes. All nine actual Helm/NRI/deployment tests pass with the installed tools.
- Six specialist/artifact/historical receipt tests and fourteen process/channel/
  shutdown/startup tests pass. These overlap the broad run; counts are not additive.
- Production module lint and Prism/Core/Foundation/strict test typechecks pass.

The final positive native host/image/live gates remain for the operator. No
operational deployment or cleanup was performed. This checkpoint does not close
all original findings: Buster replacement needs the new launch-authority decision
in `pr6-buster-launch-authority-decision.md`; fixture integration, cross-store
retention and the other remaining findings are unfinished. The register remains
137 locally verified / 17 incomplete.
