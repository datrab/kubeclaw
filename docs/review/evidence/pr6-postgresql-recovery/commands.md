# Reproduction and evidence scope

Run from the repository root. Supply two disposable real PostgreSQL 18.6 servers
with administrator URLs; the test creates uniquely named databases and roles.
No existing database is dropped. Install the exact source commit and dependencies
identified by tests/fixtures/litellm-database/provenance.json and the source uv.lock.
Set PYTHONPATH to that unmodified source directory and select its Python runtime.

```sh
POSTGRES_NATIVE_SOURCE_URL="$DISPOSABLE_SOURCE_ADMIN_URL" \
POSTGRES_NATIVE_DESTINATION_URL="$DISPOSABLE_DESTINATION_ADMIN_URL" \
POSTGRES_NATIVE_CLIENT_BIN="$POSTGRES_CLIENT_BIN_DIRECTORY" \
LITELLM_NATIVE_PYTHON="$PINNED_LITELLM_PYTHON" \
PYTHONPATH="$PINNED_LITELLM_SOURCE" \
node --test tests/verification/deployment/postgresql-recovery-native.mts
HELM_BIN="$HELM_BINARY" node --test tests/verification/deployment/postgresql-recovery-render.test.mjs
node_modules/.bin/eslint -c charts/kubeclaw/files/config/eslint.config.mjs scripts/render-postgresql-recovery.mjs scripts/postgresql-recovery-preflight.mjs tests/verification/deployment/postgresql-recovery-render.test.mjs tests/verification/deployment/postgresql-recovery-native.mts
bash -n scripts/postgresql-recovery.sh scripts/deploy.sh
node scripts/versions.mjs --check
```

native-crypto.txt is the final comprehensive native run. native-first.txt and
native.txt preserve earlier incremental SQL-only evidence, not additional unique
current tests. render.txt includes actual name/port overrides. Empty lint.txt
means exit 0 with no diagnostics. The native servers run in a QEMU TCG guest as
UID 999 with real ext4, without KVM or a writable host cgroup hierarchy. This is
not a cluster, container-entrypoint or positive worker-isolation acceptance.

bitnami-postgresql-manifest.json and bitnami-postgresql-recovery-tools.json retain
the selected platform manifest and static inventory of its verified layers.
Image digest: sha256:65d7506622ce2649914947b698d822d56c208295ba7ee80c1b34e48b251ba0c1.
Platform manifest: sha256:072aaa613036f81f61a3b2af873333a62d6b42dbc6a94d9f23d132c57f959396.
Presence of files is not runtime verification. The final operator live gate is
specified in docs/operations/litellm-postgresql-recovery.md.
