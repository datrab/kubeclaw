#!/bin/sh
set -eu

# Compatibility fix for pinned runtimes whose supervisor cannot traverse
# builder-owned, mode-0700 archived results. Only rewrite a temporary copy of
# the image entrypoint; never walk or change the persisted job/run trees.
patched=$(mktemp /tmp/buster-runtime-entrypoint.XXXXXX)
node - "$patched" <<'NODE'
const fs = require('node:fs');
const original = fs.readFileSync('/usr/local/bin/buster-runtime-entrypoint', 'utf8');
const recursive = 'chown -R builder:builder "$plan_state_dir" "$plan_run_dir"';
const handoff = 'chown builder:builder "$plan_state_dir" "$plan_run_dir"';
const lines = original.split('\n');
const matches = lines.filter(line => line === recursive).length;
if (matches !== 1 && !(matches === 0 && lines.filter(line => line === handoff).length === 1)) {
  throw new Error('Unrecognized Buster ownership handoff; refusing to alter entrypoint');
}
fs.writeFileSync(process.argv[2], lines.map(line => line === recursive ? handoff : line).join('\n'), { mode: 0o700 });
NODE
exec /bin/sh "$patched"
