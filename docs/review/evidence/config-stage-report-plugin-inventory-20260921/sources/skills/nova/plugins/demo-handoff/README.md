# Demo acceptance handoff

This opt-in Nova plugin creates a candidate from the original current-run qualified `test.plan.evidence` manifest, sends the full tested HTTPS URL and generated demo username/password through the configured private Discord webhook, and requests Ready-for-Acceptance from the internal Buster controller. Ready is not human acceptance.

The project compiler's optional `demo` declaration contains `authNodeId`, `protocol: "json-session.v1"`, `operatorTarget` and optional whole `retentionSeconds` (default 604800). This normalized policy is part of the immutable source contract and approval digest. The final resolved plan must link a blocking, coverage-required authentication test to the same deployment, generated credentials and retained exposure, with actual source-image build and checked-manifest inputs. Missing links block compilation. Runtime imports and qualified evidence remain mandatory; declarations alone cannot establish Ready.

Without `demo`, project completion is technical-only. The project CLI reports `completionScope: "technical-only"` and `acceptanceReadiness: "not-established"`; no Ready or Accepted claim is implied.

Activation requires explicit platform configuration. Select `kubeclaw.demo-handoff:handoff` for `demo.handoff`, the original `kubeclaw.remote-test-gate:evidence` for `test.plan.evidence`, and the same original operator adapter for `operator.request` and `operator.receipt`. Configure the handoff adapter with:

```json
{
  "candidateStageId": "demo-candidate",
  "deliveryStageId": "demo-delivery",
  "readyStageId": "demo-ready",
  "manifestStageId": "project-summary",
  "operatorTarget": "operators",
  "endpoint": "https://CONTROLLER.INTERNAL:PORT/v1/demo-ready",
  "tokenPath": "/var/run/demo-ready/token",
  "caPath": "/var/run/demo-ready/ca.crt",
  "stateRoot": "/durable/demo-ready",
  "timeoutMs": 15000
}
```

Replace the endpoint with the canonical URL actually configured for the controller. Its certificate must validate against the configured CA. The projected service-account token must have the controller's configured audience and match its configured producer identity. Controller TokenReview authenticates the whole configured runtime/service account, not an individual plugin. Explicit endpoint, token mounting and adapter activation opt into that trust boundary; sharing a container does not isolate the token from other code in it. Platform, service-account and webhook tokens must remain confidential. Pipeline-generated demo credentials are intentionally unredacted in the private delivery and durable pipeline artifacts/logs, per the operator decision.

Grant candidate `test.plan.evidence` only for `kubeclaw.project-summary` and artifact writes only for `kubeclaw.demo-handoff`. Grant delivery/ready `demo.handoff` and artifact writes only for that handoff namespace. Grant the adapter artifact reads for those two namespaces, evidence for the summary namespace, and operator request/receipt only for the configured private target. The evidence adapter retains its existing original gate-artifact read grants and import-store configuration. Configure the original Discord target, secret resolver and network grants; the receipt lookup does not send HTTP.

A stable delivery ID binds run, candidate digest and target. Cross-stage lookup verifies the original durable request's run/stage owner, exact transport bytes and completed Discord message receipt. Foreign owners, changed payloads and legacy unbound records cannot authorize readiness. Neither a supplied receipt-shaped object nor a stage result alone is authority.

The handoff adapter re-reads candidate, qualified manifest, verified import and original delivery records on every readiness attempt. It persists the exact request JSON bytes before the first POST. After a lost response or resumed attempt it only queries controller status; it never refreshes timestamps, renews retention or resends the readiness POST. An unresolved status remains unresolved. The controller rechecks live lease, exposure, Secret and source bindings before its durable CAS.

Initial retention is configurable from 1 through 9223372036 whole seconds (the controller's technical duration bound), default seven days. The controller also rejects timestamp overflow. Replay does not renew the deadline. An authenticated human extension workflow is not implemented in this slice.

The tests execute original local TLS authentication, Nova stages/effects/import/artifact stores, private delivery HTTP, and the original Go controller over TLS including a deliberately lost post-commit response. Build/deployment results and Kubernetes/TokenReview objects are explicitly contract vectors. Native cluster deployment, real tailnet exposure, real Discord delivery and deployed service-account permissions remain separate unproven gates.
