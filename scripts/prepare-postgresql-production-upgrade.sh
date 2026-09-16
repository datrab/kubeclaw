#!/usr/bin/env bash
# Private backup and read-only inventory of the existing LiteLLM database server.
set -euo pipefail
umask 077
: "${KUBE_CONTEXT:?Select the target Kubernetes context first}"
backup=$(mktemp -d "${HOME}/postgresql-before-upgrade.XXXXXX")
kube=(kubectl --context "$KUBE_CONTEXT" --namespace kubeclaw)
"${kube[@]}" get pvc data-postgresql-0 -o json > "$backup/pvc.json"
"${kube[@]}" get statefulset postgresql -o json > "$backup/statefulset.json"
"${kube[@]}" exec postgresql-0 -c postgresql -- sh -ec '
  password_file=${POSTGRES_POSTGRES_PASSWORD_FILE:-${POSTGRESQL_POSTGRES_PASSWORD_FILE:-/opt/bitnami/postgresql/secrets/postgres-password}}
  export PGPASSWORD="$(cat "$password_file")"
  exec pg_dumpall -h 127.0.0.1 -U postgres
' > "$backup/cluster.sql.partial"
test -s "$backup/cluster.sql.partial"
grep -q '^-- PostgreSQL database cluster dump complete' "$backup/cluster.sql.partial"
mv "$backup/cluster.sql.partial" "$backup/cluster.sql"
sha256sum "$backup/cluster.sql" > "$backup/cluster.sql.sha256"
printf 'Backup completed: %s\n' "$backup"

# Print metadata only. Passwords and application data stay out of terminal output.
"${kube[@]}" exec -i postgresql-0 -c postgresql -- sh -es <<'REMOTE'
password_file=${POSTGRES_POSTGRES_PASSWORD_FILE:-${POSTGRESQL_POSTGRES_PASSWORD_FILE:-/opt/bitnami/postgresql/secrets/postgres-password}}
export PGPASSWORD="$(cat "$password_file")"
psql -X -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'SELECT version();' \
  -c 'SELECT slot_name, plugin, slot_type FROM pg_replication_slots;'
databases=$(mktemp)
trap 'rm -f "$databases"' EXIT
psql -X -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -At \
  -c 'SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate;' > "$databases"
while IFS= read -r database; do
  printf '\nDatabase: %s\n' "$database"
  psql -X -h 127.0.0.1 -U postgres -d "$database" -v ON_ERROR_STOP=1 \
    -c 'SELECT extname, extversion FROM pg_extension ORDER BY extname;' \
    -c "SELECT n.nspname, c.relname AS index_name, am.amname
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_am am ON am.oid=c.relam
        WHERE c.relkind='i' AND am.amname IN ('gin','gist')
        AND n.nspname NOT IN ('pg_catalog','information_schema');"
done < "$databases"
REMOTE
