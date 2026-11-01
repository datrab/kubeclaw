# READER-PIPELINE-04 execution report

Participant: new isolated model, pipeline-author; not human. Source: `3696f84fd876bd6a02cfee41e4ce04eef05f1ac2`. Initial registered fixture SHA-256 matched `d2ae14634ed7061e257a50cf52ff4d5830a18993955a71da599864448bb0ab14`.

## Actual execution

Started at the central documentation entry, followed the workflow index to uncertain-effect.md and its diagnosis/recovery and developer setup prerequisites. Read no package README or implementation source outside docs/site. Used the prepared checkout and registered owned npm cache. Locked development install, resolution, sandbox build and all handbook baseline checks exited zero. Commands, timestamps and full captured outputs are in commands.jsonl and the associated logs. Initial documentation reads preceded the recorder; their route is retained in reasoning.md.

Ran the documented helper once. Facilitator command exited zero; its real Core child exited 1 with no signal and no prior kill. The original request and acceptance use key `run:reader-uncertain-effect:mutate:1:1`, resource `runtime.agent/mutation-service`, payload append/one bounded local mutation, and one attempt. Receiver observation matches the identity and payload and records one commit. That external observation is not an authoritative Core receipt.

The original local transport receipt remains failed (`adapter.effect_failed`, fetch failed); canonical run terminal remains blocked. These are not an assertion that the external operation failed. The authorized receiver lookup actually returned HTTP 501, RECEIVER_RECEIPT_LOOKUP_UNAVAILABLE. External outcome is therefore **unknown** through the supported reconciliation contract. I chose safe-stop-no-replay: no retry, new identity, recover, result import, or journal edit. The separate preflight identity and refused new-key control are not replays of the uncertain operation.

## Outcomes and retained five-part evidence

All four registered outcomes were observed PASS (paths in outcomes.json). The complete exported case-evidence directory retains the original effect request/effects journal, local event/effect journal heads and raw state, receiver observation/ledger, lookup result, and operator decision together. inspect verified strict journals and unchanged copied/current digests before stop. Export used cp -R and diff -qr with zero exits before documented cleanup.

No unexpected failure or first nonzero prerequisite occurred. The expected Core exit 1 is preserved in process.json, run.stdout and run.stderr; it was not treated as pipeline success. No gate, human/AT acceptance or deployed reconciliation is claimed.

## Cleanup

Documented case cleanup completed after export; the exact temporary parent was removed. cleanup-inspection.json records no readable cwd/fd users of owned checkout/cache/case and no listener on the fixture port; unreadable/raced proc references are explicitly counted, not claimed absent. The helper separately established child/listener quiescence. npm logs were retained before deleting only the owned checkout and npm cache. Final tracked Source status was clean. No delivered documentation, code, fixture or shared main checkout was modified.
