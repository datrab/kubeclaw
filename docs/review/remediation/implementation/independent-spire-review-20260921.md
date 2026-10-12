# Independent review: SPIRE recovery

Fresh reviewer, 2026-09-21. The reviewer did not implement the operator procedure.
Scope is IFR-06-001 local S1, S2 and S-DOC from acceptance-20260920.md; no claim
about its separate live gate or other remediation findings.

## Evidence independently checked

- Re-rendered the cached chart 0.30.0 archive with the actual production values;
  output is byte-identical to the author's render (SHA-256
  `27ae94f759a0a0a42cb00d1cc6ab0b9c3f4b9b31aee73e122f9ff9a13cc4d8f3`).
  Archive SHA-256 and reviewed-document hashes are preserved in
  `docs/review/evidence/spire-independent-20260921/`.
- Independently parsed the manifests and asserted the SQLite and disk-key paths
  share the persistent mount, RWO claim, one server replica, UID 1000, image
  1.15.2, CA and X509 TTL, absent agent_ttl/availability_target overrides,
  ephemeral agent state, and actual registration selectors. All assertions passed.
- Checked actual Worker Trust Envoy templates for required certificates and exact
  peer URI SAN checks. These source checks do not prove deployed TLS behavior.
- Checked [SPIRE 1.15.2 server reference](https://raw.githubusercontent.com/spiffe/spire/v1.15.2/doc/spire_server.md),
  [agent reference](https://raw.githubusercontent.com/spiffe/spire/v1.15.2/doc/spire_agent.md),
  and [controller 0.7.0 registration types](https://raw.githubusercontent.com/spiffe/spire-controller-manager/v0.7.0/api/v1alpha1/clusterspiffeid_types.go).
  The effective image version, not umbrella appVersion, determines runtime defaults.

## Findings

S-REV-1 (documentation completeness): the initial procedure identified the lack
of explicit renewal configuration but omitted the effective default renewal
strategy and agent SVID TTL inheritance. SPIRE 1.15.2 documents default rotation
at half lifetime for agent/workload X509 SVIDs; absent agent_ttl inherits the
configured default_x509_svid_ttl. Request: document these with versioned sources,
while retaining the explicit absence of an outage/renewal SLA.

The remaining reviewed procedure is coherent and suitably direct. Its cold
whole-volume boundary protects both database and private key generation;
independent protected copies and decryption access are required before maintenance.
Restore is isolated first and never merges generations or blindly deletes a PVC.
Provider-specific commands must be validated before stopping the server. New full
handshakes, existing connections and resumed sessions are correctly distinguished.
The old generic recovery paragraph is replaced by a link to the detailed owner
procedure rather than leaving two competing instructions.

## Review outcome

S-REV-1 was corrected by the root implementer and independently re-read: the
final text documents 4h agent TTL inheritance, half-lifetime X509 renewal and
versioned source links, while explicitly denying a guaranteed 2h replacement or
4h outage tolerance. Final whitespace check passed. No unresolved finding remains
within this bounded local S1/S2/S-DOC review.

The local documentation/rendering criteria are satisfied at the reviewed hashes.
The complete IFR-06-001 finding remains open for its separate live gate.
No live cluster changes,
rotation, outage, signing/restore exercise or runtime test was performed. The
render and reference inspection cannot establish usable backups or recovery time.
