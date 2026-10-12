# Independent Studio operator-document correction review

Review scope is the root-authored correction to the central operator guide, configuration ownership README and discovery inventory, checked against current production code. It is not a new Studio behavior, image or whole CONFIG acceptance. The reviewer authored the earlier Studio implementation but did not author this documentation correction.

The original central guide still described Studio PORT as an authority and omitted the three central settings. The discovery inventory also retained a stale current count and pending-review status. The earlier bounded source/service review did not catch those documents and cannot be used to claim that they were already correct. This correction and that review limitation remain explicit.

Current code/schema/Helm comparisons confirm:

- `operator.prism.studio` has exactly port, controlTimeoutMs and controlUrl, with authored values 8080, 30000 milliseconds and http://prism-control:8080. Port/timer bounds and rejection of old environment keys, even empty/equal values, match the loader/schema.
- The proxy reads the incoming request body before creating its timer. The timer covers upstream fetch and streamed response consumption, not incoming-body receipt or completion/cancellation of a Control job. The documented already-started-response limitation is appropriate.
- The standalone loader accepts valid HTTP(S) origins; only Helm narrows this to the existing in-cluster Control Service on port 8080, including its two namespace-qualified forms. Studio Service port 80 remains distinct from its authored target/listener port. Control Service discovery port remains 8080.
- STUDIO_ROOT is an installation asset-path input and the ingress secret is external secret material. Neither competes with the three operator settings. Missing secret produces the documented proxy-not-configured failure.
- The 27-setting current Prism count matches the stated six worker, two transport, three resource, nine supervisor, four Control and three Studio settings. Historical intermediate counts remain historical rather than being overwritten. Full CONFIG and real image build/run remain open.

The additional built-image role wording was corrected and independently re-read: all three roles are now named, with Control/Studio rejecting PORT and Worker retaining its existing authority. The bounded documentation correction is accepted at the [recorded current hashes](../../evidence/studio-doc-correction-independent-20260921/identities.json), before subsequent Buster admission configuration work. Relative repository links in the three corrected documents resolve. This is not acceptance of later changes to shared files.

No behavior tests or Docker build were run for this documentation-only review. Links and source binding are recorded with the final correction; they do not establish image execution.
