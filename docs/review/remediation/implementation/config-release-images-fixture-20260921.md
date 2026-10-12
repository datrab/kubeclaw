# Release image fixture: complete component schema inputs

The independent combined configuration review found that the original
`release-images.test.mjs` rendering fixture copied and committed only
`swarm.schema.json`. After the component migration, the real release verifier
also requires the canonical target of the `swarm-components.schema.json` chart
alias. Its rejection of the incomplete fixture was correct.

The fixture now copies both actual schema files into its temporary repository
and includes their directory in its existing configuration commit. All original
receipt, immutable image reference, actual Helm rendering and role assertions
remain unchanged. No release verifier or production validation was relaxed.

[Before/after bytes and patch](../../evidence/config-release-images-fixture-20260921/change.patch)
bind this correction. The prior failed release case remains in the independent
review's `run2` evidence. The nonauthor reviewer reran the complete original
release-images module: both cases passed in `run3`, with precisely this fixture
correction bound as the permitted source delta. The remaining combined checks
also passed; the [independent report](independent-component-worker-listener-20260921.md)
records their scope and raw evidence. This proves the fixture correction, not a
real image build or a closed CONFIG finding.
