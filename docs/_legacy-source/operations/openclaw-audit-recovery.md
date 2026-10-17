# Recover an interrupted OpenClaw audit import

OpenClaw 2026.9.4 refuses a checkpointless raw audit archive that starts with
whitespace. A fully scrubbed raw archive is not evidence that its records remain
in SQLite. Do not remove the archive, disable doctor, invent a checkpoint, or
trim whitespace to make migration proceed.

`scripts/recover-openclaw-audit-input.mjs` is an offline operator recovery for the
first config-audit archive generation. It requires reviewed SHA256 values for
both `logs/config-audit.jsonl.migrated.raw` and its intact sanitized companion.
It accepts only a nonempty raw file made entirely of spaces/tabs, a valid UTF-8
JSONL companion containing objects, and no existing checkpoint or doctor recovery
journal. Other states need separate investigation.

Stop all state writers before applying recovery. In a deployment blocked in its
exclusive migration init container, the gateway has not started; pause the doctor
process while inspecting/recovering the files, then resume it immediately. Do not
run recovery alongside an active gateway or another migration. Preserve the
database and inspect existing audit records before proceeding.

Run without `--apply` first:

```sh
node scripts/recover-openclaw-audit-input.mjs STATE_DIR RAW_SHA256 SANITIZED_SHA256
node scripts/recover-openclaw-audit-input.mjs STATE_DIR RAW_SHA256 SANITIZED_SHA256 --apply
```

The program preserves the original raw bytes in a mode-0600, hash-named recovery
file before atomically restoring the input from the sanitized companion. It does
not change the database or the companion. OpenClaw's normal doctor must then
sanitize/import any missing records, scrub the recovery input, and persist its
own checkpoint. Existing keys remain subject to OpenClaw's normal deduplication.
Retain the backup as recovery evidence. Repeating the operator command against a
changed archive fails its hash check instead of replacing newer data.

Verify the migration completes, imported records and the checkpoint exist, and a
subsequent normal migration has no pending audit recovery. Continue through the
remaining init steps and application readiness; recovery alone does not prove
that the deployment is healthy.

## Verification

```sh
node --test scripts/tests/recover-openclaw-audit-input.test.mjs
```

Inside the pinned OpenClaw image, also run the integration proof with its actual
doctor migration module (the bundled filename varies by upstream build):

```sh
node scripts/tests/recover-openclaw-audit-input.integration.mjs /app/dist/state-migrations.doctor-J5ZgjZY8.mjs
```

The integration proof uses a fresh `/tmp` state directory. It reproduces the
checkpointless scrubbed-archive refusal, recovers through the actual migration
implementation, and verifies repeatability without duplicate rows. It covers
both retained and missing previously imported records. It never operates on the
running agent's state directory.
