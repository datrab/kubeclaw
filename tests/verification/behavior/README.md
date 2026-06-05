Behavioral verification lives here.

Canonical entrypoint:
- `tests/verification/behavior/verify.mjs`

Focused reruns:
- `node tests/verification/behavior/verify.mjs --list-areas`
- `node tests/verification/behavior/verify.mjs --areas foundations,polling`
- `node tests/verification/behavior/verify.mjs --area fix-cycles`

Logging:
- Passing checks are quiet by default and print only the final JSON summary.
- Runtime logs for a check are buffered and printed if that check fails.
- Use `--verbose` or `VERIFICATION_VERBOSE=1` to stream runtime logs and include passed check names.

Prerequisite:
- `python` must exist on `PATH` for representative pipeline fixture coverage

Current structure:
- checks are split by coherent area under `tests/verification/behavior/areas/`
