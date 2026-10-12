# Independent Kubernetes cleanup runtime checkpoint — 2026-09-21

Decision: **not accepted; runtime failures remain**. All jobs are terminal and HOLD applies. No semantic negative controls were run on the failed basis.

The twenty-file Cleanup V2 integration and subsequent independently reviewed provider configuration extraction were checked against their exact records. Initial Fast session73987 passed four type projects but failed the provider's existing complexity49 function. That raw failure remains. After the reviewed extraction, Fast60175 passed all four projects (Engine, common runtime/SDK, Nova, execution-policy scope) and the complete affected canonical lint list, including all new fixture/test targets. No target was removed and no rule weakened.

Runtime57949 completed the entire authorized thirteen-command sequence. The maintained cleanup command passed37/42 and failed all five new Runner scenarios. The remaining twelve commands all passed: broad execution suite193/193 (original190 plus three authority cases), original ProcessInput/lifecycle, Kubernetes/Tailscale implementation, local authority/manifests/handoff/generation, report-adapter/JUnit, lint delivery/boundaries, capabilities, complete original Runner/default real-provider, and Components649/649. These passing neighbors do not establish the new cleanup contract.

The five concrete failures are preserved in [raw output](../../evidence/independent-buster-runner-execution-child-20260921/cleanup-v2-runtime1/cleanup-runtime-1.txt):

- Both failed-preparation modes expose `TEST_PROVIDER_FAILED:KUBERNETES_FIXTURE_KUBECTL_FAILED:external delete fault` where the test expects the preparation-and-rollback aggregate marker.
- Both successful modes use the same actual process for execute/cleanup, failing the new unconditional replacement-process assertion. Static inspection shows that ordinary retained success can legitimately clean up the still-live session; that scenario must be distinguished from explicit recovery. This observation does not authorize deleting recovery coverage.
- The post-provider injected TERM denial escapes the run as `TEST_PROVIDER_SIGNAL_FAILED` with its EPERM cause. The failure goes through loader cleanup and repeated termination in `cleanupRetainedProvider`; no completed recovery/retry claim is possible from this run.

[Checkpoint details](../../evidence/independent-buster-runner-execution-child-20260921/cleanup-v2-runtime1/independent-failure-checkpoint.json) bind exact results and raw error hash. Each phase captured source/dependency/actual-tool identities before and after. No unexpected source drift occurred; the genuine maintained sandbox rebuild's output identity change is recorded separately. Provider README and relevant architecture/implementation documents were explicitly included. Their pending-runtime status remains appropriate. No cluster-writing script or real Kubernetes/Tailnet operation was performed; local plugin tests called modeled external APIs and actual provider children.

No production/test edit was made by this reviewer. All subsequent fixes must be separately integrated and bound; the four planned semantic controls remain unexecuted until a positive corrected basis. Prior44/Nova acceptances certify their earlier closures, not this failed new contract. No whole CONFIG/native/image/historical-snapshot cleanup acceptance follows.
