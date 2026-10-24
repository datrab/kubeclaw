# Kubernetes Fixture Provider

`kubeclaw.kubernetes-fixture@1` prepares an isolated Kubernetes deployment.

The provider consumes checked Kubernetes YAML and one immutable local-registry
image reference. It creates a bounded namespace lease through the
`kubernetes.fixture` capability. It returns typed internal endpoints and
Secret references. It does not build, expose, test, or reveal Secret values.

The default cleanup mode deletes the lease after dependent tests finish.
Retained fixtures use a bounded lease expiry. The controller deletes the
namespace at expiry.
# Generated demo credential output

When `testCredentials.mode` is `generate`, the controller creates an immutable
Secret bound to the lease UID. Existing key-only or foreign Secrets do not acquire
generated provenance. The runtime reads the exact Secret only after verifying
the controller's source record, then checks its UID, resource version and value
digest. Only those verified values appear in the optional
`kubeclaw.generated-demo-credentials@1` output with deployment image/manifest
identity. This output does not prove application login or operator delivery.

### Generated private test Secrets (`testSecrets`)

Use the existing Kubernetes fixture with `fullStack: true`, namespace prefix `test`,
retention 60–3600 seconds and exposure off. This is not a new suite or a script
interpreter. `testSecrets.values` declares bounded generators (`random` with
16–64 bytes and hex/base64/base64url encoding, or `tls` for a local Service name).
`testSecrets.secrets` maps Secret names to keys and **public** string templates.
`${value-id}` references a shared random value; `${tls-id.ca}`, `.cert`, `.key`
reference one generated TLS identity. Literal URL/configuration strings are also
public. Never put existing passwords or production credentials in templates.

The controller generates material privately in the leased namespace before the
application manifest is applied. An immutable private journal preserves the same
values across retries and partial creation. Lease UID, unchanged spec, namespace
ownership, TTL and actual child UIDs are checked; replaced/missing committed
objects fail closed rather than rotating silently. Only metadata/digests enter
status. The runner receives no new Secret read/write or RBAC privileges. Namespace
cleanup/lease expiry removes both the journal and child Secrets.

Example (part of the project's fixture configuration):

```json
{"testSecrets":{"values":{"api":{"kind":"random","bytes":32,"encoding":"hex"},"db":{"kind":"tls","host":"database"}},"secrets":{"runtime":{"API_TOKEN":"${api}"},"database-tls":{"tls.crt":"${db.cert}","tls.key":"${db.key}","ca.crt":"${db.ca}"}}}}
```

Generated names must not collide with copied/demo Secrets. Manifest Secret
references must be declared; mounting the private journal, external CSI secrets,
image-pull secrets or undeclared keys is rejected. Project-specific names and
connection templates belong in the project repository. `secretReferences` still
means copying an operator-approved *existing* Secret; it is not provisioning.
