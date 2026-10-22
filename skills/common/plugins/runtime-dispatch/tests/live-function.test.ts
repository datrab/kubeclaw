// Cross-role orchestration is repository-owned; preserve the original test command and working directory.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
execFileSync(process.execPath, [fileURLToPath(new URL('../../../../../tests/verification/integration/runtime-dispatch-live-function.test.ts', import.meta.url))], { stdio: 'inherit', env: process.env });
