Behavioral verification lives here.

Canonical entrypoint:
- `tests/verification/behavior/verify.mjs`

Focused reruns:
- `node tests/verification/behavior/verify.mjs --list-areas`
- `node tests/verification/behavior/verify.mjs --areas foundations,polling`
- `node tests/verification/behavior/verify.mjs --area fix-cycles`

Prerequisite:
- `python` must exist on `PATH` for representative pipeline fixture coverage

Current structure:
- checks are split by coherent area under `tests/verification/behavior/areas/`
