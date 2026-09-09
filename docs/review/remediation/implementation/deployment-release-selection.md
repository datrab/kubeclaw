# Deployment entrypoint release selection

IFR-19-001: the actual runtime and Ops deployment scripts now require the
reviewed family image receipt and its generated values. There is no fallback to
canonical development `latest` tags. Missing selection gives the concrete
promotion/materialization next step. Runtime and Ops remain independent.

The small shared helper validates the complete named image set, exact immutable
name/reference pairing, source run ID/attempt, source commit and original IFR23
materializer `--check`. It renders the actual final Helm values arguments using
the installed Helm binary. Required first-party image slots are compared against
the selected base render by workload kind/name and container/init-container name;
substituting even another digest in the same receipt, removing or renaming a
required slot fails. Additional first-party references must match their named
receipt image. Explicit values overlays are checked before later overrides can
conceal a conflicting choice. No chart defaults or deployment architecture changed.

Nova/Buster `agents`, `agent`, `image`, `code`, Prism's two releases and `all`
consume the selected values. `all` validates all its runtime plans before setup
or infrastructure mutations; `agent --with-code` validates the bundle plan before
its first image upgrade. Bundle source defaults to the receipt commit, and a
different explicit expected commit or non-v2 contract fails. Private overlays and
bundle URL/Secret/key settings remain available. Final runtime bundle content is
still checked by the original manifest/commit/contract validation in the chart.
Rendered URL availability alone is not content evidence.

Ops keeps its actual API CIDR/namespace discovery before applying the selected
image overlay and private operational values. Optional image environment values
must repeat the selected slot. Rendering succeeds before namespace/credential
creation or Helm upgrade. The `render` entrypoints reuse actual deployment values
argument arrays and return before mutation. Ops render requires explicit discovery
values rather than inventing production network ranges.

Verification: 13/13 tests pass with actual temporary Git repositories, the original
materializer, actual Bash entrypoints and Helm charts (8 new deployment tests plus
5 existing release/configuration tests). Coverage includes all runtime roles and
sidecars, Prism services plus agent, both Ops slots, matching bundle source,
private operational and URL/auth overlays, cross-slot substitutions, masked
Prism/Ops overrides, removal of a runtime slot, tag rejection, missing receipt,
invalid source attempt, changed source bytes and generated-value drift. Tests use
clearly labeled shape-valid digest fixtures solely for rendering, never as proof
of built/pullable images. Negative deployment probes use an unavailable loopback
Kube context and fail before accessing it; no cluster is contacted.

Commands (from repository root with the provisioned toolchain on PATH):

```bash
node --test tests/verification/deployment/deployment-release.test.mjs tests/verification/deployment/release-configuration.test.mjs tests/verification/deployment/release-images.test.mjs
node tests/verification/contracts/check-deploy-prism-command.mts
node_modules/.bin/eslint --config charts/kubeclaw/files/config/eslint.config.mjs scripts/updates/deployment-release.mjs tests/verification/deployment/deployment-release.test.mjs
bash -n scripts/deploy.sh
bash -n scripts/deploy-ops-pod.sh
```

The original Prism contract check passes. Its obsolete publication-of-`latest`
assertion now requires candidate publication and selected Prism values/bundle
revision. Its existing cookie-forwarding assertion follows the already extracted
canonical Studio request handler and also verifies that the server invokes it;
the cookie behavior assertion remains. Canonical lint passes for new JavaScript
and both shells pass syntax validation.

The local helper validates a persisted selection; successful build provenance is
authenticated by the existing promotion and PR acceptance, not by local receipt
shape checks. Arbitrary private configuration compatibility, running Pod imageID,
startup and schema/data migration acceptance remain separate live checks. No
image build, GitHub Actions/CI execution, deployment or live image acceptance was
performed. SPIFFE/HMAC prerequisites, fixture/demo lifetime policy and Ops live
discovery remain unchanged.

Scoped files: `scripts/deploy.sh`, `scripts/deploy-ops-pod.sh`,
`scripts/updates/deployment-release.mjs`,
`tests/verification/deployment/deployment-release.test.mjs`,
`tests/verification/contracts/check-deploy-prism-command.mts`, `README.md`,
`docs/operations/runtime-versions-and-images.md`, the Install/image/bundle/Studio
release paragraphs of `docs/operations/prism-operator-guide.md`, and this note.
The separate design-round section appended by another agent is outside this slice.


Independent review follow-up: private `extraEnv` could duplicate a canonical
bundle enable flag and disable the actual startup check while the old validator
accepted another `true` flag. The validator now rejects duplicate reserved
`CODE_BUNDLE_*` and `KUBECLAW_CODE_BUNDLE_*` variables, unexpected aliases and
indirect controls. Each canonical init/gateway consumer from the source render
must retain its own enable flag, matching source commit and v2 contract; an
unrelated enabled container cannot stand in for it. Conditional Secret-based
bundle authentication remains permitted. Original shell/Helm regressions cover
false/true duplicates, commit/contract/manifest duplicates, alternate-prefix flags
and `valueFrom` shadowing. All 8 deployment tests pass after this correction;
canonical JavaScript lint remains clean.
