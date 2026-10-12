# Genuine RuntimeSecurity regression prerequisites

The pinned Trivy 0.74.0 Linux amd64 archive was downloaded from its official release and matched the exact versions.json checksum. The extracted binary reports Version: 0.74.0. No scanner/provider tests were executed.

The repository database lock was installed and all its original manifest, layer and extracted-file identities verified. That retained cache is unsuitable for current freshness-positive tests: vulnerability UpdatedAt is 2026-09-20T19:19:55Z, roughly 91 hours old versus the unchanged 48-hour policy. Java UpdatedAt is 2026-09-19T01:01:52Z, still within the unchanged seven-day limit. No source timestamp or lock was changed.

A separate upstream resolution through the unchanged repository downloader produced `tooling/fresh-resolved-cache`. Its vulnerability UpdatedAt is 2026-09-24T13:23:01Z. The current Java tag still resolves to the lock's same genuine layer. Both original metadata files and the resolved manifest/layer/file digest inventory are retained. This is test environment preparation, not a production lock update.

Use the absolute KUBECLAW_SECURITY_TEST_TRIVY and KUBECLAW_SECURITY_TEST_CACHE values in preparation-result.json for the full original security gates. Recheck freshness when running later. Image testing additionally needs the original DockerHub image, and native process/loopback prerequisites remain unverified by this preparation. No deadlines, tests, production sources, versions or locks were changed.

Evidence: preparation-result.json, locked-freshness.json, preparation-inputs.json, tooling/binary-provenance.json, tooling/fresh-resolved-cache/trivy-databases.json, both original metadata sets and downloader logs. Large local tools/database archives are evidence artifacts, not a proposed source commit.
