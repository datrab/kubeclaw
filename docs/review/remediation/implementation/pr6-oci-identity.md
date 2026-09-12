# PR #6: OCI descriptor identity inspection

IFR-19-001 needs the relationship between the selected image, platform manifest
and config rather than a comparison of different digest types. The existing
selected-release validator now has a read-only CLI consumer for that inspection.
It reads the selected named slot, keeps source run/attempt/commit identity, and
verifies each descriptor's raw bytes and declared child size. Platform selection
must be unique. Config architecture and optional variant must agree with the
index; artifacts and malformed rootfs relationships fail explicitly. Nested
indexes are currently rejected, not guessed through.

The distinction follows the [OCI descriptor contract](https://github.com/opencontainers/image-spec/blob/main/descriptor.md),
[image index](https://github.com/opencontainers/image-spec/blob/main/image-index.md)
and [image manifest](https://specs.opencontainers.org/image-spec/manifest/).
A digest identifies the bytes of its own document. An index describes the
platform manifests it references; the manifest separately references its config.

The GHCR adapter bounds token/manifest/config reads, uses one deadline and one
anonymous exact-repository token exchange when needed. A supplied registry bearer
is never silently replaced after authentication failure. Signed blob redirects
are allowed only to pkg-containers.githubusercontent.com over HTTPS, without
forwarded Authorization, with a bounded hop count. Tokens and invalid token JSON
are not echoed in diagnostics. Other redirects fail closed.

Local validation:

- Ten tests pass without skips. Raw-byte content-store tests cover positive
  single/multiple-platform documents, three independent hash tamper points,
  size/media/platform mismatches, variant handling, duplicate/nested selection
  and malformed rootfs/layer relationships.
- The final three tests use explicit protocol Response fixtures. They test
  credential scope, redirect header removal, response cancellation and token
  diagnostics. They are not real GHCR or container-runtime acceptance.
- Canonical lint and complete Knip pass; the existing update-check workflow now
  includes these tests.
- Actual CLI invocation on this repository fails before network access because
  no selected runtime release exists. No receipt, deployment or image is invented.
- One real attempt against the already documented pinned LiteLLM index timed out
  at the original 30-second deadline. The failed log is retained. The failure
  does not prove which request phase failed or a completed descriptor chain.

Evidence: `docs/review/evidence/pr6-oci-identity/`.

No layers were downloaded or executed. No Pod/container identity, active module
bytes, active bundle or release rollout was verified. The CLI output explicitly
marks these scopes false. This is an implemented inspection prerequisite, not
closure of IFR-19-001; live selected-image and fresh Pod/container/bundle evidence
remain open. The register still contains 39 incomplete findings.
