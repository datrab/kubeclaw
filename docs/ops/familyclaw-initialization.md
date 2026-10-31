# Familyclaw first deployment and existing Paperless

The `familyclaw-initialization` platform Application creates the retained household
namespace and one bounded nonroot bootstrap Job. Its separate AppProject permits
only Namespace plus namespaced bootstrap resources. The Job can read and create
household Secrets/ConfigMaps, read PVC names for the existing initializer's safety
checks, and request a non-pruning sync of exactly `argocd/familyclaw`. It cannot
overwrite or delete household credentials, mutate workloads, or administer Paperless.

The Job checks out immutable Familyclaw commit
`1a872d74bedc4a0dc37fb619c8d72378ef32cc04` using the read-only repository key
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
