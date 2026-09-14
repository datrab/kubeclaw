#!/usr/bin/env bash
# Immutable DB/artifact groups. No automatic deletion or in-place restoration.
set -euo pipefail
umask 077

fail() { printf '%s\n' "PRISM_BACKUP_$1" >&2; exit 1; }
positive() { [[ $2 =~ ^[1-9][0-9]{0,12}$ ]] || fail "INVALID_$1"; }
file() { [[ -f $1 && ! -L $1 ]] || fail FILE_INVALID; }
size() { stat -c %s -- "$1"; }

configuration() {
  : "${BACKUP_ROOT:?}" "${BACKUP_MAXIMUM_BYTES:?}" "${BACKUP_MAXIMUM_RETAINED_BYTES:?}"
  : "${BACKUP_MAXIMUM_DURATION_SECONDS:?}"
  for key in BACKUP_MAXIMUM_BYTES BACKUP_MAXIMUM_RETAINED_BYTES BACKUP_MAXIMUM_DURATION_SECONDS; do
    positive "$key" "${!key}"
  done
  [[ $BACKUP_ROOT == /* && $BACKUP_ROOT != / && ! -L $BACKUP_ROOT ]] || fail ROOT_INVALID
  for tool in flock sha256sum stat du timeout sync find sort cmp cp; do
    command -v "$tool" >/dev/null || fail "TOOL_MISSING_$tool"
  done
  mkdir -p -- "$BACKUP_ROOT"
  [[ $(realpath -- "$BACKUP_ROOT") == "$BACKUP_ROOT" ]] || fail ROOT_INVALID
}

artifact_name() { [[ $1 =~ ^([a-f0-9]{2})/([a-f0-9]{64})$ && ${BASH_REMATCH[2]:0:2} == "${BASH_REMATCH[1]}" ]]; }

artifact_index() {
  local root=$1 item relative sum listing
  listing=$(mktemp "$BACKUP_ROOT/.objects-XXXXXXXX")
  find "$root" -mindepth 1 -print0 | sort -z > "$listing" || fail ARTIFACT_ENUMERATION_FAILED
  [[ -d $root && ! -L $root ]] || fail ARTIFACT_ROOT_INVALID
  while IFS= read -r -d '' item; do
    relative=${item#"$root"/}
    [[ -d $item && ! -L $item && $relative =~ ^[a-f0-9]{2}$ ]] && continue
    file "$item"
    artifact_name "$relative" || fail ARTIFACT_NAME_INVALID
    sum=$(sha256sum -- "$item"); sum=${sum%% *}
    [[ $sum == "${relative#*/}" ]] || fail ARTIFACT_DIGEST_MISMATCH
    printf '%s  artifacts/%s\n' "$sum" "$relative"
  done < "$listing"
  rm -f -- "$listing"
}

verify_group() {
  local group=$1 name
  [[ $group == "$BACKUP_ROOT"/backup-* && ${group#"$BACKUP_ROOT"/} != */* && -d $group && ! -L $group ]] || fail GROUP_INVALID
  for name in database.dump metadata.txt ARTIFACTS.sha256 SHA256SUMS; do file "$group/$name"; done
  (( $(size "$group/SHA256SUMS") < 1024 && $(size "$group/metadata.txt") < 16384 )) || fail MANIFEST_INVALID
  [[ $(wc -l < "$group/SHA256SUMS") == 3 ]] || fail MANIFEST_INVALID
  for name in database.dump metadata.txt ARTIFACTS.sha256; do
    [[ $(grep -Ec "^[a-f0-9]{64}  ${name//./\\.}$" "$group/SHA256SUMS") == 1 ]] || fail MANIFEST_INVALID
  done
  (cd "$group"; sha256sum --check --status SHA256SUMS) || fail CHECKSUM_MISMATCH
  grep -qx 'format=prism-db-artifacts-v1' "$group/metadata.txt" || fail FORMAT_INVALID
  (( $(du -sb -- "$group" | cut -f1) <= BACKUP_MAXIMUM_BYTES )) || fail GROUP_SIZE_EXCEEDED
  # Reconstruct the index from actual files; reject missing, extra, corrupt and
  # symlinked objects without trusting filenames from a checksum manifest.
  local checked
  checked=$(mktemp "$BACKUP_ROOT/.verify-XXXXXXXX")
  if ! artifact_index "$group/artifacts" > "$checked"; then rm -f -- "$checked"; fail ARTIFACT_VERIFICATION_FAILED; fi
  if ! cmp -s -- "$checked" "$group/ARTIFACTS.sha256"; then rm -f -- "$checked"; fail ARTIFACT_INDEX_MISMATCH; fi
  rm -f -- "$checked"
  printf '%s\n' "$group"
}

backup_group() {
  : "${ARTIFACT_ROOT:?}" "${PGDATABASE:?}" "${PRISM_BACKUP_IMAGE:?}"
  [[ $PGDATABASE =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]] || fail DATABASE_INVALID
  [[ $PRISM_BACKUP_IMAGE =~ ^[a-zA-Z0-9._:/-]+@sha256:[a-f0-9]{64}$ ]] || fail IMAGE_INVALID
  [[ $ARTIFACT_ROOT == /* && -d $ARTIFACT_ROOT && $(realpath -- "$ARTIFACT_ROOT") == "$ARTIFACT_ROOT" ]] || fail ARTIFACT_ROOT_INVALID
  [[ $BACKUP_ROOT != "$ARTIFACT_ROOT" && $BACKUP_ROOT != "$ARTIFACT_ROOT"/* && $ARTIFACT_ROOT != "$BACKUP_ROOT"/* ]] || fail ROOTS_OVERLAP
  local used allowance stage final item relative total object_bytes blocks
  used=$(du -sb -- "$BACKUP_ROOT" | cut -f1)
  allowance=$(( BACKUP_MAXIMUM_RETAINED_BYTES - used - 1048576 ))
  (( allowance > 0 )) || fail RETAINED_CAPACITY_EXCEEDED
  (( allowance <= BACKUP_MAXIMUM_BYTES )) || allowance=$BACKUP_MAXIMUM_BYTES
  (( allowance >= 1024 )) || fail RETAINED_CAPACITY_EXCEEDED
  stage=$(mktemp -d "$BACKUP_ROOT/.incomplete-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
  mkdir -- "$stage/artifacts"
  # Artifact publication is durable and immutable before a DB reference is
  # committed. Take the DB snapshot FIRST, then copy its immutable object superset.
  # Administrative deletion/restoration must not run concurrently with backups.
  (ulimit -f "$(( allowance / 1024 ))"; pg_dump --format=custom --file="$stage/database.dump") || fail DUMP_FAILED_INCOMPLETE_RETAINED
  pg_restore --list "$stage/database.dump" >/dev/null
  total=$(size "$stage/database.dump")
  find "$ARTIFACT_ROOT" -mindepth 1 -print0 | sort -z > "$stage/SOURCE.nul" || fail ARTIFACT_ENUMERATION_FAILED
  while IFS= read -r -d '' item; do
    relative=${item#"$ARTIFACT_ROOT"/}
    [[ -d $item && ! -L $item && $relative =~ ^[a-f0-9]{2}$ ]] && continue
    # Unpublished temporary objects cannot be referenced by the DB snapshot.
    [[ -f $item && ! -L $item && $relative =~ ^[a-f0-9]{2}/[a-f0-9]{64}\.[a-f0-9-]{36}\.pending$ ]] && continue
    file "$item"; artifact_name "$relative" || fail ARTIFACT_NAME_INVALID
    object_bytes=$(size "$item")
    total=$(( total + object_bytes + 4096 ))
    (( total + 1048576 <= allowance )) || fail GROUP_SIZE_EXCEEDED_INCOMPLETE_RETAINED
    mkdir -p -- "$stage/artifacts/${relative%%/*}"
    blocks=$(( (object_bytes + 1023) / 1024 )); (( blocks > 0 )) || blocks=1
    (ulimit -f "$blocks"; cp --no-dereference --reflink=never --no-preserve=ownership -- "$item" "$stage/artifacts/$relative")
  done < "$stage/SOURCE.nul"
  rm -- "$stage/SOURCE.nul"
  artifact_index "$stage/artifacts" > "$stage/ARTIFACTS.sha256"
  {
    printf 'format=prism-db-artifacts-v1\ndatabase=%s\napplication_image=%s\n' "$PGDATABASE" "$PRISM_BACKUP_IMAGE"
    printf 'scope=database-and-content-addressed-artifacts\ncredentials=external-authority-required\n'
    printf 'completed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    pg_dump --version
  } > "$stage/metadata.txt"
  (cd "$stage"; sha256sum database.dump metadata.txt ARTIFACTS.sha256 > SHA256SUMS)
  (( $(du -sb -- "$stage" | cut -f1) <= allowance )) || fail GROUP_SIZE_EXCEEDED_INCOMPLETE_RETAINED
  # syncfs covers all copied object files and directories before publication.
  sync -f "$stage"
  final="$BACKUP_ROOT/backup-${stage##*/.incomplete-}"
  mv --no-clobber --no-target-directory -- "$stage" "$final"
  [[ ! -e $stage ]] || fail PUBLICATION_FAILED
  sync -f "$BACKUP_ROOT"
  verify_group "$final"
}

latest_group() {
  local latest
  latest=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -print | sort | tail -n 1)
  [[ -n $latest ]] || fail COMPLETED_GROUP_MISSING
  verify_group "$latest"
}

database_proof() {
  local group
  # EXIT can run after Bash unwinds function locals. Keep cleanup ownership
  # in script-scoped variables so an SQL failure cannot lose the owned DB name.
  proof_created=0
  group=$(latest_group)
  # Preserve the original scheduled SQL restore check, but never pre-drop a
  # fixed database name. This is a DB smoke test, not an independent DR proof.
  proof_database="prism_proof_${RANDOM}_${RANDOM}_$$"
  cleanup_proof() {
    local status=$? cleanup_status=0
    trap - EXIT TERM INT
    if [[ $proof_created == 1 ]]; then dropdb -- "$proof_database" || cleanup_status=$?; fi
    if [[ $status != 0 ]]; then exit "$status"; fi
    exit "$cleanup_status"
  }
  trap cleanup_proof EXIT
  trap 'exit 143' TERM
  trap 'exit 130' INT
  createdb -- "$proof_database"
  proof_created=1
  pg_restore --exit-on-error --single-transaction --dbname="$proof_database" "$group/database.dump"
  psql --no-psqlrc --dbname="$proof_database" --set=ON_ERROR_STOP=1 \
    --command='SELECT count(*) FROM prism.project; SELECT count(*) FROM prism.design_revision; SELECT count(*) FROM prism.baseline;' >/dev/null
  dropdb -- "$proof_database"
  proof_created=0
  trap - EXIT TERM INT
  printf 'PRISM_DATABASE_RESTORE_SMOKE_PASSED:%s\n' "$proof_database"
}

configuration
# Bound the whole operation, including object copying and hashing, not only pg_dump.
if [[ ${1:-} != _locked ]]; then
  [[ $# == 1 && $1 =~ ^(backup|verify|database-proof)$ ]] || fail USAGE
  exec timeout --signal=TERM --kill-after=15 "$BACKUP_MAXIMUM_DURATION_SECONDS" \
    flock --exclusive --nonblock "$BACKUP_ROOT/.lock" bash "$0" _locked "$1"
fi
[[ $# == 2 ]] || fail USAGE
case "$2" in
  backup) backup_group ;;
  verify) latest_group ;;
  database-proof) database_proof ;;
  *) fail USAGE ;;
esac
