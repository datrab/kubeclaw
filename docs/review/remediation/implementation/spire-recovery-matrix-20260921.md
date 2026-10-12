# SPIRE recovery acceptance matrix

Recorded before operator-document edits on 2026-09-21. Scope: IFR-06-001 S1,
S2 and S-DOC. No cluster mutation or runtime recovery is authorized/performed.

| Criterion | Prior gap | Required evidence and planned change |
| --- | --- | --- |
| S1 effective configuration | Upstream defaults cited without render; actual key path absent | Download chart 0.30.0 from deploy script repository; preserve archive hash, full production-values render, extracted config and persistence inventory |
| S1 coherent protected backup | Generic preserve-state instruction | Cold whole-volume boundary covering SQLite and disk key manager, protected snapshot/key references, restore to isolated matching version and no mixed generations |
| S1 TTL/renewal/peers | No effective times or peer conditions | Render TTL, registration overrides, agent bootstrap settings; explain SDS updates and exact URI SAN verification without deriving guaranteed outage from TTL |
| S2 component failures | Generic Helm restore | Separate server, agent/CSI, controller and CA loss procedures with observable readiness/handshake gates |
| S2 existing connections | Rotation paragraph implies uncomplicated continuity | Distinguish full handshakes from pooled/resumed sessions and absent connection eviction/revocation guarantee |
| S-DOC | Existing runbook insufficient | Replace generic recovery with linked focused operator procedure, correct review render status, preserve live gates |
| Live | No authorized cluster | Remains open: actual renewal, expiry, restart, coherent restore, wrong identities and measured recovery target |

Evidence directory: `docs/review/evidence/spire-effective-20260921/`.
Local rendering proves manifests only, not backing-volume existence or recovery.

## Implemented result

- Actual chart archive downloaded, SHA-256 recorded, production operator values
  rendered successfully. Full manifests and parsed server/agent configuration
  retained. Manifest consistency assertions passed; `git diff --check` passed
  for the edited operator/review documents.
- `docs/operations/spire-recovery.md` now owns the detailed procedure; the existing
  Worker Trust runbook links to it and preserves separate live acceptance.
- Existing infrastructure review corrected effective namespace exclusions and
  historical appVersion-versus-image mismatch. Archive appVersion 1.14.5 is not
  the rendered server/agent image 1.15.2; no upstream mutation is alleged.
- S1/S2/S-DOC implementation is submitted for independent review. No runtime
  recovery, provider snapshot operation, renewal timing or existing-session
  behavior is claimed proven. Live remains open.
