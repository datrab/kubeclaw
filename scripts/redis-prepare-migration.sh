#!/usr/bin/env bash
# Offline RDB -> selected Redis AOF conversion. Never touches a running source,
# an existing destination directory, Kubernetes resources, or client endpoints.
set -euo pipefail
umask 077

fail() { printf 'REDIS_MIGRATION_%s\n' "$1" >&2; exit 1; }
[[ $# == 3 ]] || fail 'USAGE_SNAPSHOT_SHA256_NEW_DIRECTORY'
snapshot=$1
expected=$2
destination=$3
script_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
: "${REDIS_SERVER:?Path to the selected native redis-server}"
: "${REDIS_CLI:?Path to the selected native redis-cli}"
: "${REDIS_CHECK_RDB:?Path to the selected native redis-check-rdb}"
maximum_seconds=${REDIS_MIGRATION_MAXIMUM_SECONDS:-600}
maximum_bytes=${REDIS_MIGRATION_MAXIMUM_BYTES:-21474836480}
[[ $maximum_seconds =~ ^[1-9][0-9]{0,4}$ && $maximum_bytes =~ ^[1-9][0-9]{0,14}$ ]] || fail LIMIT_INVALID
[[ $expected =~ ^[a-f0-9]{64}$ ]] || fail DIGEST_INVALID
[[ $snapshot == /* && -f $snapshot && ! -L $snapshot ]] || fail SNAPSHOT_INVALID
[[ $destination =~ ^/[a-zA-Z0-9_./-]+$ && $destination != / && ! -e $destination && ! -L $destination ]] || fail NEW_DIRECTORY_REQUIRED
[[ $(realpath -m -- "$destination") == "$destination" ]] || fail DESTINATION_NOT_CANONICAL
[[ $(stat -c %s -- "$snapshot") -le $maximum_bytes ]] || fail SNAPSHOT_LIMIT
[[ $(sha256sum -- "$snapshot" | cut -d' ' -f1) == "$expected" ]] || fail SNAPSHOT_DIGEST_MISMATCH
selected=$(node -e 'const fs=require("node:fs");console.log(JSON.parse(fs.readFileSync(process.argv[1])).infrastructureCharts.redis.appVersion)' "$script_root/versions.json")
[[ $("$REDIS_SERVER" --version) == *"v=$selected "* ]] || fail DESTINATION_VERSION_NOT_SELECTED
"$REDIS_CHECK_RDB" "$snapshot" >/dev/null

# Atomic mkdir is the admission boundary: a partial conversion remains visible
# and cannot be overwritten or silently resumed by another invocation.
mkdir -m 700 -- "$destination"
stage=$(mktemp -d /tmp/kubeclaw-redis-migrate-XXXXXXXX)
port=$(node --input-type=module -e 'import net from "node:net"; const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')
REDISCLI_AUTH=$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')
export REDISCLI_AUTH
child=''
cleanup() {
  if [[ -n $child ]]; then kill -KILL -- "-$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi
  rm -rf -- "$stage"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cp --no-clobber -- "$snapshot" "$destination/dump.rdb"
[[ $(sha256sum -- "$destination/dump.rdb" | cut -d' ' -f1) == "$expected" ]] || fail COPIED_SNAPSHOT_DIGEST_MISMATCH
node --input-type=module - "$script_root/my-values/infra/redis-values.yaml" >"$stage/policy.conf" <<'NODE'
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { load } = createRequire(process.argv[2])('js-yaml');
const values = load(fs.readFileSync(process.argv[2], 'utf8'));
if (typeof values.commonConfiguration !== 'string') throw new Error('REDIS_POLICY_REQUIRED');
process.stdout.write(values.commonConfiguration + '\n');
NODE
{
  cat "$stage/policy.conf"
  printf 'dir %s\ndbfilename dump.rdb\nbind 127.0.0.1\nport %s\nrequirepass %s\n' "$destination" "$port" "$REDISCLI_AUTH"
  printf 'daemonize no\npidfile %s/redis.pid\nlogfile %s/redis.log\n' "$stage" "$stage"
  # Redis must LOAD the RDB first. Starting with appendonly yes may select an
  # absent/empty AOF instead. Enable AOF on the loaded, isolated process below.
  printf 'appendonly no\n'
} >"$stage/redis.conf"
deadline=$(( SECONDS + maximum_seconds ))
cli() { timeout --signal=TERM --kill-after=2 10 "$REDIS_CLI" -h 127.0.0.1 -p "$port" --raw "$@"; }
ready() {
  until [[ $(cli PING 2>/dev/null || true) == PONG ]]; do
    kill -0 "$child" 2>/dev/null || fail DESTINATION_START_FAILED
    (( SECONDS < deadline )) || fail DEADLINE_EXCEEDED
    sleep 0.05
  done
}
start() {
  # The fresh destination binds loopback only and uses a random private password.
  # The outer limit bounds disk growth; no source credential enters this host.
  (ulimit -c 0; ulimit -f "$(( maximum_bytes / 1024 ))"; exec setsid timeout --signal=TERM --kill-after=5 "$maximum_seconds" "$REDIS_SERVER" "$stage/redis.conf") &
  child=$!
  ready
}
start
[[ $(cli CONFIG SET appendonly yes) == OK ]] || fail AOF_ENABLE_FAILED
while true; do
  state=$(cli INFO persistence | tr -d '\r')
  if [[ $state == *$'aof_enabled:1\n'* && $state == *$'aof_rewrite_in_progress:0\n'* && $state == *$'aof_rewrite_scheduled:0\n'* && $state == *$'aof_last_bgrewrite_status:ok\n'* ]]; then break; fi
  kill -0 "$child" 2>/dev/null || fail AOF_CONVERSION_FAILED
  (( SECONDS < deadline )) || fail DEADLINE_EXCEEDED
  sleep 0.05
done
[[ $(cli CONFIG REWRITE) == OK ]] || fail AOF_CONFIG_PERSIST_FAILED
cli SHUTDOWN NOSAVE
wait "$child"; child=''
[[ -f $destination/appendonlydir/appendonly.aof.manifest ]] || fail AOF_MANIFEST_REQUIRED
# Force the verification restart to use AOF: the retained source snapshot stays
# outside the destination after successful conversion.
mv -- "$destination/dump.rdb" "$stage/source.rdb"
start
state=$(cli INFO persistence | tr -d '\r')
[[ $state == *$'aof_enabled:1\n'* && $state == *$'aof_last_write_status:ok\n'* ]] || fail AOF_RESTART_FAILED
[[ $(cli CONFIG GET appendfsync | tail -1) == always ]] || fail FSYNC_POLICY_MISMATCH
[[ $(cli CONFIG GET maxmemory-policy | tail -1) == noeviction ]] || fail EVICTION_POLICY_MISMATCH
cli SHUTDOWN NOSAVE
wait "$child"; child=''
(( $(du -sb -- "$destination" | cut -f1) <= maximum_bytes )) || fail DESTINATION_SIZE_LIMIT
{
  printf 'format=redis-migration-v1\nsource_sha256=%s\ndestination_version=%s\n' "$expected" "$selected"
  printf 'verified_at=%s\n' "$(date -u +%FT%TZ)"
  printf 'state=aof-restart-verified\ncutover=not-performed\n'
} >"$destination/migration-receipt.txt"
(cd -- "$destination"; find appendonlydir -type f -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS; sha256sum migration-receipt.txt >>SHA256SUMS)
sync -f "$destination"
printf '%s\n' "$destination"
