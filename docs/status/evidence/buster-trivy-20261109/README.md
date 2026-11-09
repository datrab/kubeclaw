# Buster image security repair

Status: retained source evidence; no new runtime acceptance claim
Audience: operator, component maintainer
Owner: Buster maintainers
Evidence: merge parents and immutable source links below
Applies to: the explicitly identified source and runtime release
Last verified: 2026-11-09; source integration only, no new live operation

Product source: `860987cace95723269a50067c5ba55d691b53d52`.
See `acceptance.json` for the immutable image, CI job and artifact identities.

## Result and scope

The published worker passes its actual rootless build/registry publication,
restricted-capability ownership and Chromium proofs, followed by the existing
Trivy HIGH/CRITICAL security gate. All eight previously fixable findings are
removed. The 542 findings without published fixes remain explicitly recorded in
`remaining-unfixed-findings.json`; this is **not** a zero-vulnerability claim.
No scan policy was relaxed and no production deployment was changed.

The manual build's separate skill-bundle preparation rejected the dispatch's
missing retained baseline. The image acceptance job is independent and the
overall workflow is not claimed to pass. PR acceptance is recorded separately
by GitHub; this evidence does not substitute image acceptance for deployment or
bundle acceptance.

## Repairs

- Buster-only Debian snapshot: `20261109T000000Z`, supplying apt/libapt 2.6.2.
- All six Buster Go executables: `golang.org/x/net v0.62.0`, with required
  companion-module updates and complete authenticated checksum locks.
- The published Buster image now must pass its digest-bound security gate before
  a build receipt is issued. Failed scan evidence is preserved as an artifact.
- Regenerated workflow documentation and covered the new receipt ordering.

Vendor evidence: [Debian advisory](https://security-tracker.debian.org/tracker/CVE-2026-109518),
[Go module release](https://pkg.go.dev/golang.org/x/net@v0.62.0).

## Verification

`node scripts/versions.mjs --check` passes. The following focused suite passes
27 tests, with no failures or skips:

```sh
node --test tests/verification/deployment/versions.test.mjs \
  tests/verification/deployment/release-security-report.test.mjs \
  tests/verification/deployment/runtime-image-workflows.test.mjs \
  tests/verification/deployment/ci-second-round.test.mjs
```

The structured Codex autoreview command was:

```sh
python3 /home/node/.openclaw/agents/main/agent/codex-home/skills/autoreview/scripts/autoreview \
  --mode branch --base origin/main \
  --codex-bin /home/node/.openclaw/npm/projects/openclaw-acpx-052d680d6d/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex \
  --json-output /home/node/.openclaw/workspace/tmp/buster-trivy-20261109/review.json
```

An initial accepted finding identified missing archive checksums in the updated
kubectl/Trivy locks. Running `go mod download all` for each changed lock and
repeating it with unchanged SHA256 hashes fixed that failure. Do not run
`go mod tidy` blindly: several binary lock modules intentionally contain no
local package or tool directive. The final autoreview is clean; its sandbox
inspection limitation is preserved in `autoreview.json` rather than omitted.
