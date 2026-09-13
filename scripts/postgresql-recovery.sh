#!/usr/bin/env bash
# Full logical database backups; credentials remain in the external authority.
# No automatic deletion, same-server restore, --clean or implicit role rotation.
set -euo pipefail
umask 077

fail() { printf '%s\n' "POSTGRES_RECOVERY_$1" >&2; exit 1; }
positive() { [[ $2 =~ ^[1-9][0-9]{0,12}$ ]] || fail "INVALID_$1"; }
sql() { psql --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align --command "$1"; }

configuration() {
  : "${BACKUP_ROOT:?}" "${BACKUP_MAXIMUM_BYTES:?}" "${BACKUP_MAXIMUM_RETAINED_BYTES:?}"
  : "${BACKUP_MAXIMUM_AGE_SECONDS:?}" "${BACKUP_MAXIMUM_DURATION_SECONDS:?}"
  : "${BACKUP_EXPECTED_SERVER_VERSION:?}" "${BACKUP_APPLICATION_IMAGE:?}"
  : "${BACKUP_CREDENTIAL_AUTHORITY_REF:?}" "${LITELLM_MASTER_KEY:?}"
  : "${PGHOST:?}" "${PGDATABASE:?}" "${PGUSER:?}"
  for key in BACKUP_MAXIMUM_BYTES BACKUP_MAXIMUM_RETAINED_BYTES BACKUP_MAXIMUM_AGE_SECONDS BACKUP_MAXIMUM_DURATION_SECONDS BACKUP_EXPECTED_SERVER_VERSION; do
    positive "$key" "${!key}"
  done
  [[ $BACKUP_ROOT == /* && $BACKUP_ROOT != / && ! -L $BACKUP_ROOT ]] || fail ROOT_INVALID
  [[ $PGDATABASE =~ ^[a-z][a-z0-9_]{0,62}$ ]] || fail DATABASE_NAME_INVALID
  [[ $BACKUP_APPLICATION_IMAGE =~ ^[a-zA-Z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || fail APPLICATION_IMAGE_INVALID
  [[ $BACKUP_CREDENTIAL_AUTHORITY_REF =~ ^[a-zA-Z0-9._:/-]{1,256}$ ]] || fail CREDENTIAL_AUTHORITY_INVALID
  for tool in psql pg_dump pg_restore flock sha256sum stat du timeout sync; do command -v "$tool" >/dev/null || fail "TOOL_MISSING_$tool"; done
  if [[ $1 == verify ]]; then [[ -d $BACKUP_ROOT ]] || fail BACKUP_MISSING;
  else mkdir -p -- "$BACKUP_ROOT"; fi
  [[ $(stat -c %u "$BACKUP_ROOT") == "$(id -u)" ]] || fail ROOT_OWNER_INVALID
  local mode; mode=$(stat -c %a "$BACKUP_ROOT")
  (( (8#$mode & 077) == 0 )) || fail ROOT_NOT_PRIVATE
  export PGCONNECT_TIMEOUT=15
}

credential_binding() {
  # Domain separation is essential: SHA256(salt/master key) alone is LiteLLM's
  # actual encryption key and must NEVER be placed in a backup manifest.
  printf 'kubeclaw-recovery-credential-binding.v1\0%s\0%s' "$LITELLM_MASTER_KEY" "${LITELLM_SALT_KEY-$LITELLM_MASTER_KEY}" | sha256sum | cut -d' ' -f1
}

server_identity() {
  local version
  version=$(sql 'SHOW server_version_num')
  [[ $version == "$BACKUP_EXPECTED_SERVER_VERSION" ]] || fail SERVER_VERSION_NOT_SELECTED
  local identifier
  identifier=$(sql 'SELECT system_identifier FROM pg_control_system()')
  [[ $identifier =~ ^[0-9]{1,20}$ ]] || fail SERVER_IDENTITY_INVALID
  printf '%s\n' "$identifier"
}

backup() {
  local identity started used allowance blocks stage final
  identity=$(server_identity); started=$(date +%s)
  used=$(du --summarize --bytes "$BACKUP_ROOT" | cut -f1)
  [[ $used =~ ^[0-9]+$ ]] || fail RETAINED_SIZE_INVALID
  allowance=$(( BACKUP_MAXIMUM_RETAINED_BYTES - used - 67108864 ))
  (( allowance > 0 )) || fail RETAINED_CAPACITY_EXCEEDED
  (( allowance <= BACKUP_MAXIMUM_BYTES )) || allowance=$BACKUP_MAXIMUM_BYTES
  blocks=$(( allowance / 1024 )); (( blocks > 0 )) || fail RETAINED_CAPACITY_EXCEEDED
  stage=$(mktemp -d "$BACKUP_ROOT/.incomplete-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
  # An interrupted dump remains visibly incomplete and counts against capacity.
  # The previous completed backup is never removed to make the next one pass.
  (
    ulimit -c 0
    ulimit -f "$blocks"
    timeout --signal=TERM --kill-after=15 "$BACKUP_MAXIMUM_DURATION_SECONDS" \
      pg_dump --format=custom --file="$stage/database.dump"
  ) || fail DUMP_FAILED_INCOMPLETE_RETAINED
  (ulimit -f 64512; pg_restore --list "$stage/database.dump" >"$stage/archive-toc.txt")
  [[ $(server_identity) == "$identity" ]] || fail SOURCE_IDENTITY_CHANGED
  {
    printf 'format=postgresql-recovery-v1\n'
    printf 'database=%s\n' "$PGDATABASE"
    printf 'source_system_identifier=%s\n' "$identity"
    printf 'server_version_num=%s\n' "$BACKUP_EXPECTED_SERVER_VERSION"
    printf 'application_image=%s\n' "$BACKUP_APPLICATION_IMAGE"
    printf 'credential_authority_ref=%s\ncredential_binding=%s\n' "$BACKUP_CREDENTIAL_AUTHORITY_REF" "$(credential_binding)"
    printf 'started_epoch=%s\ncompleted_epoch=%s\n' "$started" "$(date +%s)"
    printf 'schema=full-custom-archive\ncredentials=external-authority-required\n'
  } >"$stage/metadata.env"
  (cd "$stage"; sha256sum database.dump archive-toc.txt metadata.env >SHA256SUMS)
  sync -f "$stage/database.dump"
  final="$BACKUP_ROOT/backup-${stage##*/.incomplete-}"
  [[ ! -e $final ]] || fail BACKUP_ID_ALREADY_EXISTS
  mv --no-clobber --no-target-directory "$stage" "$final"
  [[ ! -e $stage ]] || fail BACKUP_PUBLICATION_FAILED
  sync -f "$BACKUP_ROOT"
  printf '%s\n' "$final"
}

metadata() {
  awk -F= -v key="$2" '$1==key {count++; value=substr($0,length(key)+2)} END {if(count!=1) exit 1; print value}' "$1/metadata.env"
}

verify() {
  local directory=$1 name escaped age started completed
  [[ $directory == "$BACKUP_ROOT"/backup-* && -d $directory && ! -L $directory ]] || fail BACKUP_PATH_INVALID
  [[ ${directory#"$BACKUP_ROOT"/} != */* ]] || fail BACKUP_PATH_INVALID
  for name in database.dump archive-toc.txt metadata.env SHA256SUMS; do
    [[ -f $directory/$name && ! -L $directory/$name && $(stat -c %h "$directory/$name") == 1 ]] || fail BACKUP_FILE_INVALID
  done
  (( $(stat -c %s "$directory/metadata.env") < 65536 )) || fail METADATA_TOO_LARGE
  (( $(stat -c %s "$directory/SHA256SUMS") < 1024 )) || fail CHECKSUM_INDEX_INVALID
  (( $(stat -c %s "$directory/database.dump") <= BACKUP_MAXIMUM_BYTES )) || fail BACKUP_SIZE_EXCEEDED
  # Never let a modified checksum index select arbitrary files or parent paths.
  [[ $(wc -l <"$directory/SHA256SUMS") == 3 ]] || fail CHECKSUM_INDEX_INVALID
  for name in database.dump archive-toc.txt metadata.env; do
    escaped=${name//./\\.}
    [[ $(grep -Ec "^[a-f0-9]{64}  $escaped$" "$directory/SHA256SUMS") == 1 ]] || fail CHECKSUM_INDEX_INVALID
  done
  (cd "$directory"; sha256sum --check --status SHA256SUMS) || fail BACKUP_CHECKSUM_MISMATCH
  [[ $(metadata "$directory" format) == postgresql-recovery-v1 ]] || fail BACKUP_FORMAT_INVALID
  [[ $(metadata "$directory" database) == "$PGDATABASE" ]] || fail BACKUP_DATABASE_MISMATCH
  [[ $(metadata "$directory" application_image) == "$BACKUP_APPLICATION_IMAGE" ]] || fail BACKUP_APPLICATION_MISMATCH
  [[ $(metadata "$directory" credential_binding) == "$(credential_binding)" ]] || fail BACKUP_CREDENTIAL_SET_MISMATCH
  [[ $(metadata "$directory" server_version_num) == "$BACKUP_EXPECTED_SERVER_VERSION" ]] || fail BACKUP_VERSION_MISMATCH
  started=$(metadata "$directory" started_epoch); completed=$(metadata "$directory" completed_epoch)
  positive STARTED_EPOCH "$started"; positive COMPLETED_EPOCH "$completed"
  age=$(( $(date +%s) - started ))
  (( age >= 0 && completed >= started && completed <= $(date +%s) )) || fail BACKUP_TIMESTAMP_INVALID
  (( age <= BACKUP_MAXIMUM_AGE_SECONDS )) || fail BACKUP_RPO_EXCEEDED
  pg_restore --list "$directory/database.dump" >/dev/null
}

latest() {
  local candidate selected=''
  for candidate in "$BACKUP_ROOT"/backup-*; do
    [[ -d $candidate && ! -L $candidate ]] || continue
    [[ $candidate > $selected ]] && selected=$candidate
  done
  [[ -n $selected ]] || fail BACKUP_MISSING
  printf '%s\n' "$selected"
}

restore() {
  local directory=$1 target count
  verify "$directory"
  target=$(server_identity)
  [[ $target != "$(metadata "$directory" source_system_identifier)" ]] || fail SAME_SERVER_RESTORE_FORBIDDEN
  count=$(sql "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')")
  [[ $count == 0 ]] || fail RESTORE_REQUIRES_EMPTY_DATABASE
  # Restore object owners and ACLs; all required login roles must already exist
  # from the retained secret authority. Any SQL failure rolls the restore back.
  timeout --signal=TERM --kill-after=15 "$BACKUP_MAXIMUM_DURATION_SECONDS" \
    pg_restore --exit-on-error --single-transaction --dbname="$PGDATABASE" "$directory/database.dump"
  printf '%s\n' 'POSTGRES_RECOVERY_RESTORED_APPLICATION_ACCEPTANCE_REQUIRED'
}

scheduled() {
  : "${BACKUP_INTERVAL_SECONDS:?}"
  positive BACKUP_INTERVAL_SECONDS "$BACKUP_INTERVAL_SECONDS"
  local selected age
  if selected=$(latest) && (verify "$selected"); then
    age=$(( $(date +%s) - $(metadata "$selected" started_epoch) ))
    if (( age < BACKUP_INTERVAL_SECONDS )); then printf '%s\n' "$selected"; return; fi
  fi
  selected=$(backup)
  verify "$selected"
  printf '%s\n' "$selected"
}

configuration "${1:-}"
# Published directories are immutable and never retired automatically. A
# read-only verifier can safely inspect either side of the atomic publication.
if [[ ${1:-} == verify ]]; then
  [[ $# == 1 ]] || fail ARGUMENTS_INVALID
  selected=$(latest); verify "$selected"; printf '%s\n' "$selected"; exit 0
fi
# The kernel releases the lock after SIGKILL; no stale-PID lock takeover exists.
[[ ! -L $BACKUP_ROOT/.recovery.lock ]] || fail LOCK_PATH_INVALID
exec 9>"$BACKUP_ROOT/.recovery.lock"
flock --exclusive --nonblock 9 || fail BUSY
case ${1:-} in
  backup) [[ $# == 1 ]] || fail ARGUMENTS_INVALID; backup ;;
  scheduled) [[ $# == 1 ]] || fail ARGUMENTS_INVALID; scheduled ;;
  restore) [[ $# == 2 ]] || fail ARGUMENTS_INVALID; restore "$2" ;;
  *) fail 'USAGE_backup_scheduled_verify_restore_BACKUP_DIRECTORY' ;;
esac
