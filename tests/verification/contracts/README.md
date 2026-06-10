Contract and schema verification lives here.

Canonical entrypoint:
- `tests/verification/contracts/check-telemetry-contract.mjs`

Default contract path:
- `docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`

Rule:
- when `--contract` is omitted, the verifier defaults to that canonical markdown contract
- `--contract` must point to a markdown contract document, not to `check-telemetry-contract.mjs`
