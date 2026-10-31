set -euo pipefail; node tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs; node --test tests/verification/reliability/external-effect-recovery.test.mts
