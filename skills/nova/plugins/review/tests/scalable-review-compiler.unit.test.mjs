// Repository-owned cross-role test; preserve original working directory and assertions.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
execFileSync(process.execPath, [fileURLToPath(new URL('../../../../../tests/verification/integration/nova-review-scalable-review-compiler.unit.test.mjs', import.meta.url)), ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
