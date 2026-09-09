# BuildKit preflight image identity

The deployment preflight previously defaulted to mutable `moby/buildkit:rootless`, independently of the digest-pinned runtime BuildKit base. The existing resumed change binds its generated default to the effective `buster-runtime` `BUILDKIT_BASE` (including the role override). Explicit operator overrides must be immutable sha256 references. This preserves the central versions generator and existing deployment entrypoint.

Root review confirmed the generator updates both Dockerfile and preflight consistently. The original version test passes two cases, including changed common base, role-specific override, drift rejection and idempotence. `node scripts/versions.mjs --check` reports 22 checked and no drift; `bash -n scripts/deploy.sh` passes. No preflight pod, image build, CI or deployment was started. This is a pinned probe prerequisite, not closure of native BuildKit/registry findings.
