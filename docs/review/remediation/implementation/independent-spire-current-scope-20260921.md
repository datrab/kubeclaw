# IFR-06-001 current local/documentation acceptance audit

**S1, S2 and S-DOC are locally satisfied at the current checked sources. Under D12, IFR-06-001 can be recorded as locally verified for this remediation task, with its explicit live acceptance still open.** This reviewer made no register/status or operator-document edits and performed no cluster action.

This conclusion applies the actual [acceptance split](../acceptance-20260920.md#ifr-06-001--spire-recovery) and [D12](../decisions.md#d12--lokaler-abschluss-und-separate-live-abnahme). It does not create a new requirement for live restoration before local documentation closure. Conversely, local rendering does not prove a usable backup, recovery time or live security outcome.

## Current evidence and drift

All six identities from the earlier fresh review still match exactly: authenticated chart archive, production values, recovery runbook, Worker Trust runbook, infrastructure review and recovery matrix. A new actual Helm render using chart 0.30.0 and the current values is byte-identical to the prior render, SHA-256 `27ae94f759a0a0a42cb00d1cc6ab0b9c3f4b9b31aee73e122f9ff9a13cc4d8f3`. [Independent current assertions and identities](../../evidence/spire-current-audit-20260921/result.json) bind this result and the current peer templates.

The first new checker looked only for a container-level UID and correctly failed on undefined; effective UID 1000 is inherited from the actual pod security context. The corrected assertion checks that inheritance. The failed checker assumption is retained, with no chart/value alteration.

## Criterion findings

**S1:** Actual rendering confirms one server replica, SQLite database and disk signing keys on the same RWO 1 GiB PVC, no upstream CA plugin, CA TTL 24h and default workload X.509 TTL 4h. The agent has ephemeral state. Current templates still require certificates and explicit URI SAN matches. The runbook covers complete cold whole-volume backup, protected snapshot/key references, coherent generation restore, offline integrity checks, isolated signing/identity validation and provider-dependent operations that must be prepared before interruption. It does not substitute file existence for valid keys or permit mixed database/key generations.

The version-bound defaults were checked again: absent agent_ttl inherits the configured X.509 default, and agent/workload X.509 renewal normally starts around half lifetime. The runbook explicitly refuses to derive an outage guarantee from either value. [SPIRE 1.15.2 server reference](https://raw.githubusercontent.com/spiffe/spire/v1.15.2/doc/spire_server.md), [agent reference](https://raw.githubusercontent.com/spiffe/spire/v1.15.2/doc/spire_agent.md).

**S2:** Separate procedures address server, volume/CA, agent/CSI, controller and API/token failure. Fresh full handshakes, existing connections and session resumption are distinguished. The runbook states that immediate revocation and a guaranteed outage window are not established, requires observable identity/issuance checks, and forbids plaintext or disabled-validation fallback. No missing local S2 clause was found.

**S-DOC:** The maintained recovery procedure covers backup, key protection, certificate lifetime, renewal, rotation, restore and failure limits. The older generic procedure delegates to that owner document; current document bytes are the exact independently reviewed final versions. The earlier matrix's “submitted for review” sentence describes its prior checkpoint; the subsequent independent review and this current audit establish local completion. Register/progress summaries should use this current audit rather than treating that historical sentence as an unresolved implementation issue.

## Live boundary retained

Allowed and forbidden identities, renewal during real work, server/agent outage beyond observed certificate validity, restart and coherent CA/server restore, resumed versus fresh handshakes, and measured interruption against a predeclared recovery target remain **not executed** in this audit. Provider snapshots, decrypt authority and actual recovery volumes remain operational prerequisites, not proven artifacts. D12 permits local closure while keeping those live gates separately visible; it does not permit marking them passed.

The earlier review's wording that the complete finding remains open was its live-scope caution. The precise current status is **local/documentation acceptance complete; live acceptance outstanding**. No new source change is necessary for S1/S2/S-DOC based on this audit.
