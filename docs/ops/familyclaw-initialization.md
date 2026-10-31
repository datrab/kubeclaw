# Familyclaw first deployment and existing Paperless

The `familyclaw-initialization` platform Application creates the retained household
namespace and one bounded nonroot bootstrap Job. Its separate AppProject permits
only Namespace plus namespaced bootstrap resources. The Job can read and create
household Secrets/ConfigMaps, read PVC names for the existing initializer's safety
checks, and request a non-pruning sync of exactly `argocd/familyclaw`. It cannot
overwrite or delete household credentials, mutate workloads, or administer Paperless.

The Job runs in `kubeclaw-ops`, reusing its existing `ghcr-secret` image-pull
binding. It reads only the named Argo repository Secret and known-host ConfigMap
to obtain the immutable source. No registry credential is copied to another
namespace. Superseded bootstrap artifacts are pruned after the replacement
finishes; the household Namespace is explicitly protected.

The Job checks out immutable Familyclaw commit
`4666d431aed675c2896f5b33d4b409dd90004bcc` using the read-only repository key
and executes that repository's existing `initializeHousehold` implementation.
It keeps the durable create-only seed and refuses unmanaged or differing objects.
The stable bootstrap context binding is `familyclaw-initialization`.

Before first initialization it prints an ephemeral RSA public transport key and
waits for `/work/envelope.json`. Run `tools/familyclaw-paperless-binding.py` in the
existing Paperless Django management shell, calling `bind_familyclaw(public_pem)`.
This creates a dedicated nonstaff/non-superuser reader with an unusable password,
only view permissions, view grants for existing documents/metadata, and an additive
Document Added workflow for future document view access. Existing owners,
documents, permissions and workflows are preserved. The function also generates
database TLS bound to the household DNS name.

After assigning access to the existing collection, rebuild the Paperless search
index under its service user so the new view grants are reflected in search:

```bash
s6-setuidgid paperless python3 manage.py document_index reindex --no-progress-bar --heap-size-mb 128
```

Run this inside the existing Paperless container from its application directory,
retain logs privately, and check completion before testing document search. Do
not run indexing as root or use `--recreate` for this permission update.

The helper emits only counts and an AES-GCM/RSA-OAEP encrypted envelope. Transfer
that ciphertext to the waiting Job using the authorized pod exec path; write a
temporary file then rename it atomically to `envelope.json`. No plaintext token,
private TLS key or transport private key goes through chat, Git or command
arguments. The transport private key exists only in Job memory, and the consumed
envelope is removed. The read-only repository key's temporary copy is removed
immediately after checkout. A retry with an existing initialization seed needs
no new Paperless binding and preserves all credentials.

Before storing credentials, the Job authenticates against the existing internal
Paperless API and verifies documents are visible. After initialization it requests
one Argo sync at the pinned revision without pruning. Infrastructure startup is
separate from native model/channel onboarding. Verify Argo sync/health, database
migration completion, workload readiness and authenticated read-only Paperless
access from the actual Core Pod; a successful bootstrap Job alone is insufficient.

The current revision fixes first-start Argo waves for WaitForFirstConsumer
storage and the database Service dependency. If a previous revision is still
syncing, the bootstrap uses Argo's normal `Terminating` state and waits for the
controller to stop it before requesting the new non-pruning sync. It never
replaces an active operation if termination does not complete.

Before syncing the current production profile, create the private
`familyclaw-configuration-api` ConfigMap from the preserved original bootstrap
configuration with only the Paperless API base corrected. The durable seed,
original configuration, household identity and all credentials stay unchanged.
The projection is create-only, checks its ownership and refuses a differing
existing value. Firefly uses the TLS certificate's namespace-qualified DB host.
