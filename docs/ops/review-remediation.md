# PR review remediation and release evidence

This records the agreed fixes against reviewed heads PR #1 `82f0f3f` and PR #2
`a60d11de`. It is not evidence that a live cluster migration has already passed.
The external review report remains a historical assessment of those exact heads.

| Finding | Implementation / disposition | Remaining release evidence |
| --- | --- | --- |
| F01 | Numeric `USER 1000:1000`, non-root security retained | Actual Kubernetes image start |
| F02 | Separate Nova/Buster lease-client API CNP, existing controller selector retained | Real lease/pipeline run; SPIRE-owned policies added for API/webhook/agent/CSI/hook paths |
| F03 | Every install attempt checks one cordoned node and local CRI; no release-existence bypass; baseline before normal scheduling/Hubble wait; phased recovery documented | Host configuration, sandbox inventory, rehearsal and controlled cutover |
| F04 | UI backend explicitly uses Relay 4245 | Rendered chart and actual UI flows |
| F05 | URL exception guard restored; adapter rejection handled; live HTTP regression test | CI |
| F06 | API entity allows 443 and standard K3s backend 6443 only | Actual EndpointSlice/backend identity and Hubble test |
| F07 | Source-spec and realized revision verifier, traffic gate; retain legacy default deny through cleanup | Fresh negative probes and post-cleanup pipeline |
| F08 | Combined raw budget, streaming bounded summaries, 2 queries, absolute historical windows, exact pod filter and explicit continuation; no content redaction | Representative live Relay data |
| F09 | Lost events/status/stderr/exit/timeout are visible partial results | Multi-peer outage observation |
| F10 | UI ingress isolation, Relay node ports bounded | Authorized and unauthorized access probes |
| F11 | Argo chart 10.8.0 pinned | Helm render / installation |
| F12 | Digest-required renderer/bootstrap; no latest publication; candidate workflow documented | Publish selected candidate and commit rendered digest to its Argo-owned directory |
| F13 | Example has ingress and egress; Pod Security example added | Project onboarding probe |
| F14 | Reserved namespace-owner label CREATE/UPDATE VAP; controller UPDATE fence; custom namespace rendered; ownership/Pod Security contract explicit | Server dry-run and spoof tests; before untrusted delegation, dedicated namespaces/RBAC/AppProjects |
| F15 | Capacity/identity/IPAM limits documented; Argo list pagination exposed | Capacity testing before 1k/10k scale; no current scale guarantee |
| F16 | Ops-owned policy file and dependency-aware bootstrap; general infra/project apply stays independent of Ops | Recovery/bootstrap test |
| F17 | LiteLLM peers narrowed, registries use node identities; necessary agent/tunnel world contracts explicit | Verify actual tunnel endpoints and private NodePort firewall before narrowing/changing access |
| F18 | UTF-8 boundary-safe 64 KiB log text; limits and metadata scope documented | Regression tests |

## Explicit user decisions

- No automatic censorship, secret scanner or content redaction in diagnostic output.
- Limits are per request, not per investigation; continue when evidence is insufficient.
- Paperless alone is temporarily exempted by namespace name; verify it is `paperless`.
  It still experiences CNI downtime. Remove the exception after its own policies are tested.
- Website availability is not a cutover criterion. KubeClaw pipeline and Paperless are.
- Fix/review first, then Argo setup, then MCP functionality, then the Cilium cutover.
- Independent host access already exists. No second Tailscale operator.
- No deployment, branch merge or host mutation is performed by this remediation.

A source-code fix is not a release approval. Outstanding live checks above must be
recorded before the CNI cutover is called complete. Future Gateway API, Egress
Gateway, kube-proxy replacement and persistent flow storage remain separate work.

## Follow-up Codex review

Both September 5 follow-up findings were valid. Ops rendering now respects
`TAILSCALE_OPERATOR_NAMESPACE` without loosening parent-resource identity. General
infra and project policy apply no longer require the fixed Ops namespace. Cleanup
requires rendered Ops replacements only when it would remove existing Ops KNPs.
