# Independent review: F-T14-01/02 human extension reconciliation

Run `20260910t083841` reviewed the superseding author checkpoint
`2c2ec2afa30696fa364f87efea91402c5bab99a7` on
`fix/resume-47-20260910t080401-human-extension-author-final2`. The exact remote
commit has one parent,
`1ba445125fbacfa4f0344f8bf38e68f8f0686eff`, and tree
`eb0f70bccefaa2dc09279f33a967f5c02f6dbcb3`. GitHub compare reports one
commit ahead, zero behind and that same merge base; no workflow run exists for
the author commit.

The earlier `d17d84d49d2364fb5d18f5feafce3f0076a385e1` stacked transport and
`dbea8ed66d4d1212cd4c55a294fa2d06734b3606` whitespace-defective transport
are discarded and are not integration candidates.

## Verdict

The checkpoint is acceptable as a documentation and ledger reconciliation. It
contains 13 deltas, all under review evidence, the implementation report, or
the three remediation ledgers. It changes no Product, Control, controller, CRD,
chart, test, or other production source. The exact resulting author tree was
reconstructed locally from independently fetched remote blobs; it equals
`eb0f70bccefaa2dc09279f33a967f5c02f6dbcb3`. Both `git diff --check` and
the author's refreshed `SHA256SUMS` pass.

The corrected statement is technically supported: the finite authenticated
accept/extend writer is no longer a missing code item. The original Control
composition already requires the private-ingress assertion before issuing a
finite HMAC session, enforces the configured operator, exact Origin and CSRF,
signs a bounded Ed25519 decision subject, records the immutable intent/envelope
before bounded HTTPS transport, and recovers the identical bytes after an
uncertain result. The integrated controller authenticates its caller, verifies
the signed current-generation/Ready/resourceVersion/expiry subject, uses CAS,
preserves Ready, and bounds extension lifetime.

This conclusion is deliberately narrower than the phrase "app-auth-bound" could
suggest. The local Control session is not proof that a generated application
secret was bound to a deployed application's login. The author report and
ledgers explicitly retain that real application gate, so the wording is not
treated as a closure claim.

## Authority and scope

The mandatory resume files and current register were fetched fresh at the
reviewed commit. The baseline register was fetched from
`c38779c71bb92bc15c3fcb89930348e5417aa475`. Its 47 `implementiert` IDs
exactly equal both `partial-47-scope.json` and the 47 work-item IDs.
`source_finding_text` for F-T14-01 and F-T14-02 is byte-for-byte unchanged
between baseline and the reviewed tree.

The checkpoint leaves both findings at register status `implementiert`,
verification `teilweise / blockiert`, and work-item status
`implementiert / unvollständig`. `overall_complete` remains false and the
verified count remains 8.

## Independent execution

The unchanged original command was rerun:

`node --test --test-concurrency=1 skills/prism/tests/control-product-independent.test.mts skills/prism/tests/product-decisions.test.mts skills/prism/tests/product-controller.test.mts skills/prism/tests/studio-proxy.test.mts skills/prism/tests/control-product-composition.test.mts`

It exited 0 with 16 registered passes, no failures and no skips. There are 12
distinct test names: four composition cases are registered twice because the
independent suite imports the composition suite. The review does not overstate
these as 16 distinct regressions.

The Prism typecheck (`./node_modules/.bin/tsc -p skills/prism/tsconfig.json --noEmit`) exited 0. The exact focused ESLint argv
now documented by the author exited 0. The broader invocation that additionally
includes `skills/prism/server/control-server.ts` exited 1 with exactly the
same 25 whole-file complexity, length, depth and no-console errors. Every broad
error is in that pre-existing file; the failed broad result is retained and is
not relabelled as a passing gate.

The author's current source-hash manifest independently passes for the Control
and Product authority, durable storage, controller, CRD/chart templates,
original tests and cited run6 raw evidence. The historical comparison correctly
marks three later shared-composition hash changes rather than calling them
unchanged. The current original-component tests exercise their resulting
composition.

## Native evidence and remaining boundary

The cited run6 review/raw evidence records genuine Kubernetes 1.35
CRD/CEL/TokenReview/RBAC/CAS and signed-controller acceptance, replay,
changed-replay rejection, exact +60-second extension, immutable Ready and
stale-cleanup rejection. This review verified the cited raw-evidence hashes but
did not relabel archived output as a new run. Go and Helm are unavailable in
this isolated checkout, and no Product/controller/chart source changed, so the
unchanged native cluster gate was not repeated.

Neither finding is complete. Closure still requires one authorized original
full-pipeline run proving all of the following:

1. the delivery contract reaches a real application and its generated secret is
   actually bound to login;
2. the permitted Tailnet operator receives the private handoff, reaches and logs
   into the exact generation, and submits authenticated feedback;
3. another Tailnet user and an old generation are rejected;
4. the retained namespace and exposure remain reachable for the required
   operator period; and
5. explicit release or TTL removes exactly that generation after extension.

No application, Tailnet, recipient, human, deployment or production system was
contacted. Local identity headers, PGlite, local TLS and admission fixtures are
not substitutes for those original gates. The checkpoint may therefore be
integrated only as an incomplete-state metadata correction, never as F-T14
closure or overall completion.

Raw evidence is under
`docs/review/evidence/run-20260910t083841-human-extension-review/`.
