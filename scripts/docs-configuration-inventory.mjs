#!/usr/bin/env node
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import YAML from 'yaml';
import { assertYamlAuthorityRegistry, yamlAuthorityFile, yamlAuthorityPaths, yamlFieldAuthority } from './docs-yaml-field-authorities.mjs';
import {
  assertLocalHelmAuthorityRegistry, localHelmAuthorityFile, localHelmAuthorityPaths, localHelmFieldAuthority,
} from './docs-local-helm-authorities.mjs';
import { apiFieldSchemaAuthority } from './docs-api-schema-authorities.mjs';
import {
  yamlFieldChildPath, yamlFieldMatcherPath, yamlFieldPath, yamlFieldPathTokens, yamlFieldPathWithoutRoot,
} from './yaml-field-path.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
};
const root = path.resolve(option('--root', process.cwd()));
const checkOnly = argv.includes('--check');
const allowSensitivityFixture = argv.includes('--allow-sensitivity-fixture');
const allowSemanticGaps = argv.includes('--allow-semantic-gaps');
// A write run must be able to publish a newly discovered field as an explicit
// semantic gap. Check mode remains strict and rejects stale field authorities.
// Without this distinction, the mutation suite cannot create its temporary
// negative-control inventory before it verifies the published blocker.
const allowLocalHelmAuthorityMaintenance = argv.includes('--allow-local-helm-authority-maintenance') || !checkOnly;
const outputDirectory = path.resolve(
  option('--out-dir', path.join(root, 'docs/generated/inventory')),
);

const SOURCE_ROOTS = ['charts', 'examples', 'gitops', 'my-values', 'releases/values'];
const RUNTIME_SCAN_ROOTS = ['scripts', 'my-values', 'charts', 'gitops', 'skills', 'docker', 'ops', 'tools', 'cmd', 'packaging'];
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.sh', '.py', '.go', '.c', '.h', '.yaml', '.yml']);
const EXCLUDED_SEGMENTS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'tests', 'test', 'fixtures']);
const SENSITIVE_VALUE_NAME = /(?:pass(?:word)?|token|credential|private.?key|api.?key|oauth|webhook|client.?secret|allow.?from|approver|member|guild|channel.?id|role.?id|owner.?id|user(?:name|id|s)?|email|account)/i;
const SENSITIVE_ENV_NAME = /(?:pass(?:word)?|token|private.?key|api.?key|master.?key|salt.?key|auth.?key|client.?secret|signing.?secret|webhook)/i;
const SCHEMA_CONSTRAINTS = [
  'const', 'enum', 'format', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum',
  'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems',
  'uniqueItems', 'minProperties', 'maxProperties', 'additionalProperties',
];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function relative(absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function walk(relativeRoot, accept = () => true) {
  const start = path.join(root, relativeRoot);
  if (!fs.existsSync(start)) return [];
  const found = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && accept(absolutePath)) found.push(relative(absolutePath));
    }
  };
  visit(start);
  return found;
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

const meaningTextCache = new Map();
function meaningExcerpt(sourcePath, token, { requireSemanticLanguage = false } = {}) {
  if (!exists(sourcePath)) return null;
  const text = meaningTextCache.get(sourcePath) ?? read(sourcePath);
  meaningTextCache.set(sourcePath, text);
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const patterns = [new RegExp(`\`${escaped}\``, 'u'), new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, 'u')];
  const index = patterns.map((pattern) => text.search(pattern)).find((value) => value >= 0);
  if (index === undefined) return null;
  const lines = text.split('\n');
  const line = lineAt(text, index);
  const excerpt = lines.slice(line - 1, Math.min(lines.length, line + 2)).join(' ').replace(/\s+/gu, ' ').trim().slice(0, 280);
  if (requireSemanticLanguage && (excerpt.length < 35 || !/(?:controls?|selects?|sets?|limits?|requires?|enables?|disables?|uses?|reads?|writes?|path|file|URL|endpoint|timeout|bytes|request|response|failure|default|allowed|must|when)/iu.test(excerpt))) return null;
  return { path: sourcePath, line, excerpt };
}

const environmentContract = ({ purpose, acceptedForm, defaultBehavior, emptyBehavior, invalidBehavior, precedence, precedenceSteps, impact, failure, required = 'conditional', evidence = [] }) => ({
  purpose,
  acceptedForm,
  defaultBehavior,
  emptyBehavior,
  invalidBehavior,
  precedence,
  ...(precedenceSteps ? { precedenceSteps } : {}),
  impact,
  failure,
  required,
  evidence,
});

const ENVIRONMENT_CONTRACTS = new Map(Object.entries({
  BUNDLE_TMP_ROOT: environmentContract({ purpose: 'Carries the chart init script\'s fixed `/tmp/code-bundle` work directory across one shell-to-Node process boundary while the downloaded code bundle is validated.', acceptedForm: 'The internal fixed path `/tmp/code-bundle`; this is not an operator or external runtime input.', defaultBehavior: 'The init script assigns `/tmp/code-bundle` before bundle download and passes that value only to the validation Node process.', emptyBehavior: 'No supported empty state exists: the shell assignment at `deployment.yaml:944` fixes the value before the child-process export at line 1023.', invalidBehavior: 'Changing or removing the internal assignment can make archive extraction and Node validation use different directories, which stops code-bundle initialization.', precedence: 'The local shell assignment at `deployment.yaml:944` is the only producer. The command-local export at line 1023 passes it to the Node reader at line 1027; no values field, Pod environment entry, or external setting participates.', impact: 'The value joins the shell extraction directory to the Node validator\'s `extracted` path for this init-container execution only.', failure: 'The code-bundle init step fails before the workload starts when the archive and validator do not use the same temporary directory.', required: 'internal and fixed when code-bundle initialization runs' }),
  AGENT_HELM_TIMEOUT: environmentContract({ purpose: 'Limits how long Helm can wait for a Nova or Buster release operation.', acceptedForm: 'A Helm duration such as `45m`.', defaultBehavior: 'Uses `45m`.', emptyBehavior: 'An empty value is absent and selects `45m`.', invalidBehavior: 'Helm rejects an invalid duration or ends the release when the duration expires.', precedence: 'A non-empty process value wins; otherwise the deploy script uses `45m`.', impact: 'A shorter value stops a slow agent release sooner. A longer value delays rollback and failure reporting.', failure: 'The atomic Helm operation fails and rolls back when the wait limit expires.' }),
  AGENT_ROLLOUT_TIMEOUT: environmentContract({ purpose: 'Limits each Kubernetes rollout-status wait for Nova and Buster workloads.', acceptedForm: 'A kubectl duration such as `45m`.', defaultBehavior: 'Uses `45m`.', emptyBehavior: 'An empty value is absent and selects `45m`.', invalidBehavior: 'kubectl rejects an invalid duration or reports a rollout timeout.', precedence: 'A non-empty process value wins; otherwise the deploy script uses `45m`.', impact: 'This value changes only the observation deadline; it does not change the workload progress deadline.', failure: 'The deploy command stops when a required rollout does not become ready in time.' }),
  ALLOW_PARTIAL_INFRA: environmentContract({ purpose: 'Changes selected infrastructure rollout failures from fatal errors to warnings.', acceptedForm: '`true` or `false`.', defaultBehavior: 'Uses `false` and fails closed.', emptyBehavior: 'An empty value is absent and selects `false`.', invalidBehavior: 'Only the exact value `true` enables partial progress; every other value keeps fail-closed behavior.', precedence: 'A non-empty process value wins; otherwise the deploy script uses `false`.', impact: 'When true, deployment can continue after an infrastructure component fails readiness.', failure: 'The command can finish with incomplete infrastructure; operators must inspect warnings and component status before using the platform.' }),
  BACKUP_APPLICATION_IMAGE: environmentContract({ purpose: 'Pins the application image identity written into and checked against PostgreSQL backup metadata.', acceptedForm: 'An OCI image reference with a `sha256` digest.', defaultBehavior: 'No default.', emptyBehavior: 'An empty value is rejected before backup or restore.', invalidBehavior: 'A value without the required digest shape returns `POSTGRES_RECOVERY_APPLICATION_IMAGE_INVALID`.', precedence: 'The non-empty process value is the only source.', impact: 'Changing it makes existing backups fail the application-image compatibility check.', failure: 'Backup and restore stop before changing database state.', required: 'required' }),
  BACKUP_CREDENTIAL_AUTHORITY_REF: environmentContract({ purpose: 'Records the external credential-authority identity that must provide database roles and credentials during recovery.', acceptedForm: 'A 1-256 character authority reference containing letters, digits, dot, underscore, colon, slash, or hyphen.', defaultBehavior: 'No default.', emptyBehavior: 'An empty value is rejected before backup or restore.', invalidBehavior: 'A value outside the allowed shape returns `POSTGRES_RECOVERY_CREDENTIAL_AUTHORITY_INVALID`.', precedence: 'The non-empty process value is the only source.', impact: 'The reference is stored in backup metadata; it does not copy credential bytes into the backup.', failure: 'Recovery stops if the selected authority does not match the retained recovery plan.', required: 'required' }),
  BACKUP_EXPECTED_SERVER_VERSION: environmentContract({ purpose: 'Selects the PostgreSQL numeric server version accepted for backup and target recovery.', acceptedForm: 'A positive PostgreSQL `server_version_num`, for example `160004`.', defaultBehavior: 'No default.', emptyBehavior: 'An empty value is rejected before database access.', invalidBehavior: 'A non-positive value returns `POSTGRES_RECOVERY_INVALID_BACKUP_EXPECTED_SERVER_VERSION`; a different live version returns `POSTGRES_RECOVERY_SERVER_VERSION_NOT_SELECTED`.', precedence: 'The non-empty process value is the only source.', impact: 'The value prevents an unplanned source version or restore-client version from entering recovery.', failure: 'Backup, verify, restore, or migration stops before publication or restore.', required: 'required' }),
  BACKUP_INTERVAL_SECONDS: environmentContract({ purpose: 'Sets the minimum age at which the scheduled command creates another PostgreSQL backup.', acceptedForm: 'A positive integer from 1 through 9,999,999,999,999 seconds.', defaultBehavior: 'No default; only the `scheduled` command reads it.', emptyBehavior: 'An empty value is rejected for `scheduled`.', invalidBehavior: 'Zero, negative, non-numeric, or overlong input returns `POSTGRES_RECOVERY_INVALID_BACKUP_INTERVAL_SECONDS`.', precedence: 'The non-empty process value is the only source.', impact: 'A larger value reuses a still-valid latest backup for longer; it does not relax the maximum backup age.', failure: 'The scheduled command stops without creating or deleting a backup.', required: 'required for `scheduled`' }),
  BACKUP_MAXIMUM_AGE_SECONDS: environmentContract({ purpose: 'Sets the oldest backup age accepted by verification and restore.', acceptedForm: 'A positive integer from 1 through 9,999,999,999,999 seconds.', defaultBehavior: 'No default.', emptyBehavior: 'An empty value is rejected before reading a backup.', invalidBehavior: 'Invalid input returns `POSTGRES_RECOVERY_INVALID_BACKUP_MAXIMUM_AGE_SECONDS`; an older backup returns `POSTGRES_RECOVERY_BACKUP_RPO_EXCEEDED`.', precedence: 'The non-empty process value is the only source.', impact: 'This is the enforced recovery-point objective limit.', failure: 'Verification and restore stop; the backup is retained.', required: 'required' }),
  BACKUP_MAXIMUM_BYTES: environmentContract({ purpose: 'Caps one host PostgreSQL archive or one Prism database-and-artifact backup group.', acceptedForm: 'A positive integer from 1 through 9,999,999,999,999 bytes.', defaultBehavior: 'No default in either consumer.', emptyBehavior: 'An empty value is rejected before backup or verification.', invalidBehavior: 'Both consumers reject invalid input with their own `INVALID_BACKUP_MAXIMUM_BYTES` error; each also rejects an archive or group over the cap.', precedence: 'The non-empty process value is the only source at each consumer boundary.', impact: 'The cap limits disk use and can stop a dump or artifact copy that grows past the selected budget.', failure: 'The incomplete staging directory remains visible and the previous completed backup remains unchanged.', required: 'required' }),
  BACKUP_MAXIMUM_DURATION_SECONDS: environmentContract({ purpose: 'Caps host PostgreSQL dump/restore time and Prism backup command time.', acceptedForm: 'A positive integer from 1 through 9,999,999,999,999 seconds.', defaultBehavior: 'No default in either consumer.', emptyBehavior: 'An empty value is rejected before backup or restore.', invalidBehavior: 'Both consumers reject invalid input with their own `INVALID_BACKUP_MAXIMUM_DURATION_SECONDS` error.', precedence: 'The non-empty process value is the only source at each consumer boundary.', impact: 'The host recovery timeout sends TERM and then KILL after 15 seconds; the Prism CronJob passes the same limit to its backup command.', failure: 'A host backup retains an incomplete stage; a host restore transaction rolls back; a Prism backup job fails without replacing a completed group.', required: 'required' }),
  BACKUP_MAXIMUM_RETAINED_BYTES: environmentContract({ purpose: 'Caps retained backup storage before a host PostgreSQL or Prism backup starts.', acceptedForm: 'A positive integer from 1 through 9,999,999,999,999 bytes.', defaultBehavior: 'No default in either consumer.', emptyBehavior: 'An empty value is rejected before backup.', invalidBehavior: 'Both consumers reject invalid input; insufficient remaining allowance returns their `RETAINED_CAPACITY_EXCEEDED` error.', precedence: 'The non-empty process value is the only source at each consumer boundary.', impact: 'Host recovery reserves 64 MiB; Prism reserves 1 MiB. Neither path deletes an older backup to make room.', failure: 'The new backup does not start or remains incomplete; completed backups remain intact.', required: 'required' }),
  BACKUP_ROOT: environmentContract({ purpose: 'Selects the private backup-set directory and lock boundary for host PostgreSQL recovery or Prism database-and-artifact backup.', acceptedForm: 'An absolute, non-root, non-symlink directory. Host recovery also requires current-user ownership and no group/other permissions; Prism also requires a canonical real path.', defaultBehavior: 'No default in either consumer.', emptyBehavior: 'An empty value is rejected before filesystem access.', invalidBehavior: 'Each consumer returns its own `ROOT_INVALID`, owner, or mode error before publishing or restoring data.', precedence: 'The non-empty process value is the only source at each consumer boundary.', impact: 'Changing the directory changes which backup history, capacity budget, and lock the selected command sees.', failure: 'The selected command stops without replacing a completed backup or starting a restore.', required: 'required' }),
  LITELLM_MASTER_KEY: environmentContract({ purpose: 'Supplies the confidential LiteLLM master key used to bind a backup to the selected credential set.', acceptedForm: 'A non-empty secret value supplied through the recovery process environment.', defaultBehavior: 'No default.', emptyBehavior: 'An empty value is rejected before database access.', invalidBehavior: 'The recovery script does not validate key strength; a different value makes backup verification return `POSTGRES_RECOVERY_BACKUP_CREDENTIAL_SET_MISMATCH`.', precedence: 'The non-empty process value is the only source. Never place it in backup metadata.', impact: 'The script derives a domain-separated hash binding; it does not store the key.', failure: 'Backup configuration or later verification stops.', required: 'required' }),
  LITELLM_SALT_KEY: environmentContract({ purpose: 'Optionally supplies the confidential LiteLLM salt key used with the master key for the recovery credential binding.', acceptedForm: 'A secret string.', defaultBehavior: 'Uses `LITELLM_MASTER_KEY` when the variable is unset.', emptyBehavior: 'An explicitly empty value is accepted and differs from an unset value because the shell uses the non-colon `-` operator.', invalidBehavior: 'The script does not validate strength or format; a different effective value causes credential-set mismatch during verification.', precedence: 'An explicitly set value, including empty, wins; otherwise `LITELLM_MASTER_KEY` supplies the value.', impact: 'Changing it changes the credential binding and makes existing backups incompatible with the selected credentials.', failure: 'Verification and restore stop with `POSTGRES_RECOVERY_BACKUP_CREDENTIAL_SET_MISMATCH`.' }),
  PGHOST: environmentContract({ purpose: 'Selects the PostgreSQL server endpoint used by psql, pg_dump, and pg_restore.', acceptedForm: 'A libpq host name, IP address, or Unix-socket directory.', defaultBehavior: 'No default in the recovery script.', emptyBehavior: 'An empty value is rejected before database access.', invalidBehavior: 'libpq connection parsing or connection establishment fails.', precedence: 'The non-empty process value is passed through libpq; standard libpq rules apply to any other connection settings.', impact: 'Changing it changes the source or target server. Server identity checks still prevent same-server restore.', failure: 'The database client exits and the recovery command stops.', required: 'required' }),
  PGDATABASE: environmentContract({ purpose: 'Selects the PostgreSQL database used by host recovery and by the Prism backup container.', acceptedForm: 'Host recovery requires a lowercase identifier that starts with a letter; Prism backup accepts a letter or underscore followed by letters, digits, or underscores. Both limit the name to 63 characters.', defaultBehavior: 'No default in either checked-in consumer.', emptyBehavior: 'An empty value is rejected before database access.', invalidBehavior: 'Host recovery returns `POSTGRES_RECOVERY_DATABASE_NAME_INVALID`; Prism returns `PRISM_BACKUP_DATABASE_INVALID`.', precedence: 'The non-empty process value is passed to libpq; each backup writes the selected database into its metadata.', impact: 'Changing it selects a different database and makes host metadata from another database fail verification.', failure: 'The selected backup or recovery command stops before dump or restore.', required: 'required' }),
  PGUSER: environmentContract({ purpose: 'Selects the PostgreSQL login role used by the recovery tools.', acceptedForm: 'A non-empty libpq user name.', defaultBehavior: 'No default in the recovery script.', emptyBehavior: 'An empty value is rejected before database access.', invalidBehavior: 'The server rejects an unknown role or invalid credentials.', precedence: 'The non-empty process value is passed through libpq.', impact: 'The role must have enough rights for full dump, server identity inspection, and restore of owners and ACLs.', failure: 'The database client exits and the recovery command stops.', required: 'required' }),
  REDIS_SERVER: environmentContract({ purpose: 'Selects the native `redis-server` executable used for an isolated RDB-to-AOF conversion.', acceptedForm: 'A path to an executable `redis-server` binary.', defaultBehavior: 'No default.', emptyBehavior: 'An empty value is rejected before touching the snapshot.', invalidBehavior: 'A missing binary or a version that differs from `versions.json` fails the migration.', precedence: 'The non-empty process value is the only source.', impact: 'The selected binary starts only on loopback with an ephemeral password and the migration policy.', failure: 'The destination remains absent or visibly partial; no cutover occurs.', required: 'required' }),
  REDIS_CLI: environmentContract({ purpose: 'Selects the native `redis-cli` executable used to control and verify the isolated migration server.', acceptedForm: 'A path to an executable `redis-cli` binary compatible with the selected server.', defaultBehavior: 'No default.', emptyBehavior: 'An empty value is rejected before snapshot conversion.', invalidBehavior: 'A missing or incompatible client makes readiness, configuration, or shutdown checks fail.', precedence: 'The non-empty process value is the only source.', impact: 'The client performs loopback-only checks against the temporary server.', failure: 'Migration stops and retains a visible partial destination; no cutover occurs.', required: 'required' }),
  REDIS_CHECK_RDB: environmentContract({ purpose: 'Selects the native `redis-check-rdb` executable that validates the source snapshot before conversion.', acceptedForm: 'A path to an executable `redis-check-rdb` binary.', defaultBehavior: 'No default.', emptyBehavior: 'An empty value is rejected before reading the snapshot.', invalidBehavior: 'A missing binary or failed RDB check stops the migration.', precedence: 'The non-empty process value is the only source.', impact: 'The check prevents a corrupt snapshot from starting the isolated Redis process.', failure: 'No destination publication or cutover occurs.', required: 'required' }),
  REDIS_MIGRATION_MAXIMUM_SECONDS: environmentContract({ purpose: 'Sets the common deadline for starting, converting, and verifying the isolated Redis migration server.', acceptedForm: 'An integer from 1 through 99,999 seconds.', defaultBehavior: 'Uses `600` seconds.', emptyBehavior: 'An empty value is absent and selects `600`.', invalidBehavior: 'Zero, negative, non-numeric, or more than five digits returns `REDIS_MIGRATION_LIMIT_INVALID`.', precedence: 'A non-empty process value wins; otherwise the script uses `600`.', impact: 'A smaller value limits interruption time but can stop a valid large conversion.', failure: 'The temporary server is killed, the staging directory is removed, and a partial destination remains visible.' }),
  REDIS_MIGRATION_MAXIMUM_BYTES: environmentContract({ purpose: 'Caps the source snapshot, destination files, and temporary Redis file growth during conversion.', acceptedForm: 'An integer from 1 through 999,999,999,999,999 bytes.', defaultBehavior: 'Uses `21474836480` bytes (20 GiB).', emptyBehavior: 'An empty value is absent and selects 20 GiB.', invalidBehavior: 'Invalid input returns `REDIS_MIGRATION_LIMIT_INVALID`; oversized input or output returns a size-limit error.', precedence: 'A non-empty process value wins; otherwise the script uses 20 GiB.', impact: 'The value limits disk consumption and applies as a file-size limit to the isolated server.', failure: 'Conversion stops without cutover; a partial destination remains for inspection.' }),
  PIPELINE_LIGHT_WATCHDOG_POLL_SECONDS: environmentContract({ purpose: 'Sets how often the pipeline-light watchdog checks the run process and status file.', acceptedForm: 'A positive whole number of seconds.', defaultBehavior: 'Uses `15` seconds.', emptyBehavior: 'An empty value is absent and selects `15`.', invalidBehavior: 'The script has no explicit numeric validation; invalid shell arithmetic terminates it under strict mode.', precedence: 'A non-empty process value initializes the value; `--poll-seconds` overrides it when supplied.', impact: 'Lower values detect completion sooner and perform more checks.', failure: 'The watchdog exits and no later heartbeat or terminal notification is produced.' }),
  PIPELINE_LIGHT_WATCHDOG_HEARTBEAT_SECONDS: environmentContract({ purpose: 'Sets the maximum interval between unchanged-status heartbeat lines from the pipeline-light watchdog.', acceptedForm: 'A positive whole number of seconds.', defaultBehavior: 'Uses `300` seconds.', emptyBehavior: 'An empty value is absent and selects `300`.', invalidBehavior: 'The script has no explicit numeric validation; invalid shell arithmetic terminates it under strict mode.', precedence: 'A non-empty process value initializes the value; `--heartbeat-seconds` overrides it when supplied.', impact: 'Lower values write more unchanged-status lines; terminal state changes are still written immediately.', failure: 'The watchdog exits and no later heartbeat or terminal notification is produced.' }),
  POLICY_FILE: environmentContract({ purpose: 'Selects the project network-policy file applied during the Cilium migration.', acceptedForm: 'A readable YAML file path for the project policy set.', defaultBehavior: 'Uses `my-values/infra/network-policies.yaml` below the repository.', emptyBehavior: 'An empty value is absent and selects the repository file.', invalidBehavior: 'kubectl fails if the file is missing or invalid.', precedence: 'A non-empty process value wins; otherwise the repository policy file is used.', impact: 'The apply command installs this policy set after it verifies the cluster-wide Cilium baseline.', failure: 'The migration command stops before legacy NetworkPolicies are removed.' }),
  SOPS_FILE: environmentContract({ purpose: 'Selects the SOPS-encrypted file used as one optional source for secret setup.', acceptedForm: 'A readable SOPS YAML file path.', defaultBehavior: 'Uses `$HOME/openclaw-swarm/ansible/group_vars/production/secrets.yml`.', emptyBehavior: 'An empty value is absent and selects the default path.', invalidBehavior: 'A missing or unreadable file is skipped as a source; a present file that cannot be decrypted produces a setup error.', precedence: 'Existing target Secret data wins unless overwrite is enabled; then the configured SOPS file is considered before source-namespace copy and interactive input.', impact: 'Changing it changes the encrypted authority from which missing credential values can be loaded.', failure: 'Secret setup continues to the next permitted source or stops if a required value has no valid source.' }),
  SRC_NS: environmentContract({ purpose: 'Selects the Kubernetes namespace from which secret setup can copy existing application Secrets.', acceptedForm: 'A Kubernetes namespace name.', defaultBehavior: 'Uses `default`.', emptyBehavior: 'An empty value is absent and selects `default`.', invalidBehavior: 'kubectl rejects an invalid namespace or reports read/authorization errors.', precedence: 'Existing target Secrets win unless overwrite is enabled; SOPS is checked before source-namespace copy.', impact: 'Changing it changes only the copy source; target Secrets are still written to `NAMESPACE`.', failure: 'The helper moves to another permitted source for missing data or stops on a non-not-found Kubernetes error.' }),
}));

// A name-level contract is insufficient when independent processes interpret
// the same variable differently. These contracts are keyed by the exact
// receiving source so the generated reference cannot merge incompatible
// defaults, validation rules, or conditional requirements into one claim.
const ENVIRONMENT_CONSUMER_CONTRACTS = new Map();
const addEnvironmentConsumerContract = (name, sourcePath, contract) => {
  ENVIRONMENT_CONSUMER_CONTRACTS.set(`${name}:${sourcePath}`, contract);
};

const busterControllerSource = 'cmd/buster-namespace-controller/main.go';
const busterControllerContracts = {
  KUBECLAW_NAMESPACE: environmentContract({
    purpose: 'Selects the namespace in which the Buster namespace controller reads leases and creates its namespace-scoped bindings.',
    acceptedForm: 'A non-empty namespace name. This reader trims whitespace but does not validate Kubernetes name syntax at startup.',
    defaultBehavior: 'Uses the trimmed ServiceAccount namespace file; if that file is unreadable or blank, uses `kubeclaw`.',
    emptyBehavior: 'An absent, empty, or whitespace-only environment value selects the ServiceAccount namespace file and then `kubeclaw`.',
    invalidBehavior: 'A non-empty invalid value survives startup and later makes API paths, subjects, or admitted objects fail.',
    precedence: 'Trimmed non-empty process value, then trimmed non-empty ServiceAccount namespace file, then `kubeclaw`.',
    precedenceSteps: [
      { order: 1, source: 'process environment', condition: 'trimmed value is non-empty', evidence: `${busterControllerSource}:133` },
      { order: 2, source: 'ServiceAccount namespace file', condition: 'environment value is blank and file content is readable and non-empty', value: '/var/run/secrets/kubernetes.io/serviceaccount/namespace', evidence: `${busterControllerSource}:133` },
      { order: 3, source: 'controller fallback', condition: 'environment and namespace file do not supply a value', value: 'kubeclaw', evidence: `${busterControllerSource}:133` },
    ],
    impact: 'Changing it moves lease discovery and generated namespace bindings to another namespace authority.',
    failure: 'The controller starts with a malformed non-empty value, but reconciliation or Kubernetes admission fails.',
  }),
  BUSTER_ALLOWED_ACCESS_JSON: environmentContract({
    purpose: 'Defines which ServiceAccounts can request Buster tester or deployer access.',
    acceptedForm: 'A JSON array of objects. Each `subject` is one canonical DNS label or `namespace/name`; each mode is exactly `tester` or `deployer`. At least one subject is required. An empty modes list is valid and grants nothing.',
    defaultBehavior: 'Uses one `kubeclaw/agent-buster` subject with `tester` mode.',
    emptyBehavior: 'An absent, empty, or whitespace-only value selects the default JSON array.',
    invalidBehavior: 'Invalid JSON, an invalid subject, an unsupported mode, or no subjects returns a configuration error.',
    precedence: 'A trimmed non-empty process value wins; otherwise the checked-in JSON fallback applies.',
    impact: 'Changing it changes the identities and access modes that the controller places into leased namespaces.',
    failure: 'The controller returns an error before it starts its reconciliation loop.',
  }),
  BUSTER_ALLOWED_NAMESPACE_PREFIXES: environmentContract({
    purpose: 'Selects the namespace prefixes that Buster lease requests can use.',
    acceptedForm: 'A comma-separated list. The reader trims entries and drops empty entries but does not validate prefix syntax or length at startup.',
    defaultBehavior: 'Uses `test`.',
    emptyBehavior: 'A blank value, or a list that contains only blank entries, selects `test`.',
    invalidBehavior: 'A malformed non-empty prefix can survive startup and later produce an unusable namespace name or failed Kubernetes request.',
    precedence: 'A trimmed non-empty process value is split first; an empty result then falls back to `test`.',
    impact: 'Changing the list changes which requested names are admitted and which prefix is used for generated names.',
    failure: 'Lease validation, namespace creation, or Kubernetes admission fails when the effective prefix cannot produce a usable name.',
  }),
  BUSTER_DEFAULT_TTL_SECONDS: environmentContract({
    purpose: 'Sets the lease lifetime used when a request does not supply a positive `ttlSeconds` value.',
    acceptedForm: 'A base-10 integer that fits the platform Go `int`. The startup parser does not require a positive value and does not guard duration multiplication overflow.',
    defaultBehavior: 'Uses `7200` when the value is blank, non-numeric, or outside the Go `int` range.',
    emptyBehavior: 'An absent, empty, or whitespace-only value selects `7200`.',
    invalidBehavior: 'Non-numeric and integer-overflow input silently selects `7200`. A parsed value below 60, above the effective maximum, or affected by duration overflow makes later lease validation or expiry behavior fail.',
    precedence: 'A trimmed parseable process integer wins; otherwise `7200` applies.',
    impact: 'Changing it changes the default expiry time for leases without a positive request-specific TTL.',
    failure: 'The controller can start, but a defaulted lease is rejected or receives an unsafe expiry when the parsed value is unsuitable.',
  }),
  BUSTER_MAX_TTL_SECONDS: environmentContract({
    purpose: 'Sets the maximum lease lifetime accepted by the Buster namespace controller.',
    acceptedForm: 'A base-10 integer that fits the platform Go `int`. The startup parser does not require a positive value and does not guard duration multiplication overflow.',
    defaultBehavior: 'Uses `86400` when the value is blank, non-numeric, or outside the Go `int` range.',
    emptyBehavior: 'An absent, empty, or whitespace-only value selects `86400`.',
    invalidBehavior: 'Non-numeric and integer-overflow input silently selects `86400`. A zero, negative, too-small, or duration-overflowing parsed value causes later lease validation or expiry behavior to reject otherwise valid leases.',
    precedence: 'A trimmed parseable process integer wins; otherwise `86400` applies.',
    impact: 'Changing it changes the upper lifetime bound and the clamp applied during expiry calculation.',
    failure: 'The controller can start, but leases are rejected or receive an unsafe expiry when the effective maximum is unsuitable.',
  }),
  BUSTER_CONTROLLER_SERVICE_ACCOUNT: environmentContract({ purpose: 'Selects the ServiceAccount subject placed into generated Buster RoleBindings.', acceptedForm: 'A non-empty Kubernetes ServiceAccount name; this reader trims whitespace but does not validate name syntax at startup.', defaultBehavior: 'Uses `agent-buster-namespace-controller`.', emptyBehavior: 'An absent, empty, or whitespace-only value selects the default.', invalidBehavior: 'A malformed non-empty name survives startup and later fails Kubernetes admission or binds the wrong valid identity.', precedence: 'A trimmed non-empty process value wins; otherwise the checked-in name applies.', impact: 'Changing it changes which controller identity receives permissions in leased namespaces.', failure: 'RoleBinding reconciliation fails, or a wrong valid ServiceAccount receives the binding.' }),
  BUSTER_SECRET_ROLE_NAME: environmentContract({ purpose: 'Selects the Role referenced by generated Secret-access RoleBindings.', acceptedForm: 'A non-empty Kubernetes Role name; this reader trims whitespace but does not validate name syntax at startup.', defaultBehavior: 'Uses `buster-controller-secrets`.', emptyBehavior: 'An absent, empty, or whitespace-only value selects the default.', invalidBehavior: 'A malformed non-empty name survives startup and later fails admission; a wrong valid name leaves Secret access ineffective.', precedence: 'A trimmed non-empty process value wins; otherwise the checked-in name applies.', impact: 'Changing it redirects the Secret permission reference in leased namespaces.', failure: 'RoleBinding reconciliation or later Secret access fails.' }),
  BUSTER_DEPLOYER_ROLE_NAME: environmentContract({ purpose: 'Selects the ClusterRole or Role reference granted for requested deployer access.', acceptedForm: 'A non-empty Kubernetes role name; this reader trims whitespace but does not validate name syntax at startup.', defaultBehavior: 'Uses `buster-namespace-deployer`.', emptyBehavior: 'An absent, empty, or whitespace-only value selects the default.', invalidBehavior: 'A malformed non-empty name survives startup and later fails admission; a wrong valid name grants no intended deployer authority.', precedence: 'A trimmed non-empty process value wins; otherwise the checked-in name applies.', impact: 'Changing it changes the permission set bound to approved deployer subjects.', failure: 'Access-binding reconciliation fails or approved deployers remain unauthorized.' }),
  BUSTER_TESTER_ROLE_NAME: environmentContract({ purpose: 'Selects the ClusterRole or Role reference granted for requested tester access.', acceptedForm: 'A non-empty Kubernetes role name; this reader trims whitespace but does not validate name syntax at startup.', defaultBehavior: 'Uses `buster-namespace-tester`.', emptyBehavior: 'An absent, empty, or whitespace-only value selects the default.', invalidBehavior: 'A malformed non-empty name survives startup and later fails admission; a wrong valid name grants no intended tester authority.', precedence: 'A trimmed non-empty process value wins; otherwise the checked-in name applies.', impact: 'Changing it changes the permission set bound to approved tester subjects.', failure: 'Access-binding reconciliation fails or approved testers remain unauthorized.' }),
  BUSTER_CONTROLLER_POLL_MS: environmentContract({ purpose: 'Sets the delay between complete Buster lease reconciliation passes.', acceptedForm: 'A base-10 integer from 1 through the largest millisecond count that fits `time.Duration`.', defaultBehavior: 'Uses `3000` milliseconds.', emptyBehavior: 'An absent, empty, or whitespace-only value selects `3000`.', invalidBehavior: 'Non-numeric, zero, negative, or multiplication-overflow input returns `BUSTER_CONTROLLER_POLL_MS must be positive`.', precedence: 'A trimmed non-empty process value wins; otherwise `3000` applies.', impact: 'Changing it changes reconciliation latency and Kubernetes API request frequency.', failure: 'The controller returns an error before it starts its reconciliation loop.' }),
};
for (const [name, contract] of Object.entries(busterControllerContracts)) {
  ENVIRONMENT_CONTRACTS.set(name, contract);
  addEnvironmentConsumerContract(name, busterControllerSource, contract);
}

const busterReadinessSource = 'cmd/buster-namespace-controller/demo-readiness-lifecycle.go';
const busterReadinessContracts = {
  BUSTER_READY_LISTEN: environmentContract({
    purpose: 'Enables the demo-readiness HTTPS server and selects the TCP address on which it listens.',
    acceptedForm: 'A non-empty host-and-port or colon-and-port string accepted by `net.SplitHostPort`; the chart supplies `:8443`. The address must also be available to `tls.Listen` at startup.',
    defaultBehavior: 'No address default. An absent value disables the complete readiness server.',
    emptyBehavior: 'An empty value disables readiness, skips the four companion-input checks, and makes readiness server startup a no-op.',
    invalidBehavior: 'An invalid address returns `invalid Ready listen address`. A valid but unavailable address returns the listener error when the server starts.',
    precedence: 'The exact process value is the only runtime source. No trimming or fallback occurs.',
    impact: 'Changing it enables, disables, or moves the readiness API. Product decisions cannot be enabled unless readiness is enabled.',
    failure: 'Controller startup stops before reconciliation when configuration or listener creation fails.',
  }),
  BUSTER_READY_AUDIENCE: environmentContract({
    purpose: 'Sets the Kubernetes TokenReview audience required from callers of the readiness API.',
    acceptedForm: 'From 1 through 1024 bytes with no NUL, carriage-return, or line-feed byte. Whitespace-only text is accepted by startup validation.',
    defaultBehavior: 'No default; required only when `BUSTER_READY_LISTEN` is non-empty.',
    emptyBehavior: 'Rejected when readiness is enabled; ignored when readiness is disabled.',
    invalidBehavior: 'Invalid text stops startup. A valid value that is absent from a caller TokenReview result makes the request return HTTP 401 with `DEMO_READY_UNAUTHORIZED`.',
    precedence: 'The exact process value is the only source and is checked only after the listen gate enables readiness.',
    impact: 'Changing it changes which audience a caller token must prove.',
    failure: 'Enabled startup fails for invalid configuration, or callers with a different audience are denied.',
    required: 'required when `BUSTER_READY_LISTEN` is non-empty',
  }),
  BUSTER_READY_PRODUCER: environmentContract({
    purpose: 'Selects the one Kubernetes ServiceAccount identity allowed to call the readiness API.',
    acceptedForm: 'Exactly `system:serviceaccount:<namespace>:<name>`. Namespace and name must match `^[a-z0-9][a-z0-9.-]{0,252}$`; this is the implemented check, not full Kubernetes DNS validation.',
    defaultBehavior: 'No default; required only when `BUSTER_READY_LISTEN` is non-empty.',
    emptyBehavior: 'Rejected when readiness is enabled; ignored when readiness is disabled.',
    invalidBehavior: 'A malformed identity stops startup. A well-formed identity that differs from TokenReview `status.user.username` makes the request return HTTP 401.',
    precedence: 'The exact process value is the only source and is checked only after the listen gate enables readiness.',
    impact: 'Changing it transfers readiness-call authority to another ServiceAccount and also changes the identity that the product producer must differ from.',
    failure: 'Enabled startup fails for malformed configuration, or a different caller identity is denied.',
    required: 'required when `BUSTER_READY_LISTEN` is non-empty',
  }),
  BUSTER_READY_TLS_CERT: environmentContract({
    purpose: 'Selects the PEM certificate chain presented by the readiness HTTPS listener.',
    acceptedForm: 'A non-empty file path whose PEM certificate can be loaded with the selected private key. The chart supplies `/var/run/kubeclaw/ready-server/tls.crt`.',
    defaultBehavior: 'No default; required only when `BUSTER_READY_LISTEN` is non-empty.',
    emptyBehavior: 'Rejected when readiness is enabled; ignored when readiness is disabled.',
    invalidBehavior: 'An unreadable or malformed certificate, or one that does not match the key, stops startup with `Ready TLS certificate unavailable`.',
    precedence: 'The exact process path is the only source. The file is opened when the readiness server starts.',
    impact: 'Changing it changes the certificate chain that readiness clients authenticate.',
    failure: 'The readiness listener does not start and controller startup stops.',
    required: 'required when `BUSTER_READY_LISTEN` is non-empty',
  }),
  BUSTER_READY_TLS_KEY: environmentContract({
    purpose: 'Selects the private-key PEM file used by the readiness HTTPS listener.',
    acceptedForm: 'A non-empty file path containing a private key that matches the selected certificate. The chart supplies `/var/run/kubeclaw/ready-server/tls.key`.',
    defaultBehavior: 'No default; required only when `BUSTER_READY_LISTEN` is non-empty.',
    emptyBehavior: 'Rejected when readiness is enabled; ignored when readiness is disabled.',
    invalidBehavior: 'An unreadable, malformed, or nonmatching key stops startup with `Ready TLS certificate unavailable`.',
    precedence: 'The exact process path is the only source. The file is opened when the readiness server starts.',
    impact: 'Changing it changes the private key used for the readiness TLS identity.',
    failure: 'The readiness listener does not start and controller startup stops.',
    required: 'required when `BUSTER_READY_LISTEN` is non-empty',
  }),
};
const busterReadinessEvidence = {
  BUSTER_READY_LISTEN: [{ path: busterReadinessSource, line: 18, endLine: 27 }, { path: busterReadinessSource, line: 32, endLine: 43 }],
  BUSTER_READY_AUDIENCE: [{ path: busterReadinessSource, line: 18, endLine: 27 }, { path: 'cmd/buster-namespace-controller/demo-readiness.go', line: 116, endLine: 141 }],
  BUSTER_READY_PRODUCER: [{ path: busterReadinessSource, line: 18, endLine: 27 }, { path: 'cmd/buster-namespace-controller/demo-readiness.go', line: 116, endLine: 141 }],
  BUSTER_READY_TLS_CERT: [{ path: busterReadinessSource, line: 18, endLine: 39 }],
  BUSTER_READY_TLS_KEY: [{ path: busterReadinessSource, line: 18, endLine: 39 }],
};
for (const [name, contract] of Object.entries(busterReadinessContracts)) {
  addEnvironmentConsumerContract(name, busterReadinessSource, { ...contract, evidence: busterReadinessEvidence[name] });
}

const busterProductSource = 'cmd/buster-namespace-controller/demo-product.go';
const busterProductContracts = {
  BUSTER_PRODUCT_ENABLED: environmentContract({
    purpose: 'Enables validation and use of signed product decisions after the readiness authority is configured.',
    acceptedForm: 'Only exact `true`, exact `false`, or an empty value. Exact `true` enables the feature; exact `false` and empty disable it.',
    defaultBehavior: 'Disabled when the variable is absent.',
    emptyBehavior: 'Disables product decisions and ignores all five companion inputs.',
    invalidBehavior: 'Any other value, including case changes, whitespace, `0`, or `1`, returns `DEMO_PRODUCT_CONFIG_INVALID`.',
    precedence: 'The exact process value is the only source. No trimming or Boolean coercion occurs.',
    impact: 'Enabling it makes the five companion inputs mandatory and activates the signed product-decision routes; readiness must already be enabled.',
    failure: 'Controller startup stops for an invalid value, missing readiness, or an invalid companion input. Disabled product routes return HTTP 404 with `DEMO_PRODUCT_DISABLED_OR_ROUTE_INVALID`.',
  }),
  BUSTER_PRODUCT_AUDIENCE: environmentContract({
    purpose: 'Sets the Kubernetes TokenReview audience required from callers of the product-decision API.',
    acceptedForm: 'From 1 through 1024 bytes with no NUL, carriage-return, or line-feed byte. Whitespace-only text is accepted by startup validation.',
    defaultBehavior: 'No default; ignored while product decisions are disabled.',
    emptyBehavior: 'Rejected when `BUSTER_PRODUCT_ENABLED=true`; ignored when the feature is disabled.',
    invalidBehavior: 'Invalid text returns `DEMO_PRODUCT_CONFIG_INVALID`. A valid audience not proved by TokenReview makes requests return HTTP 401 with `DEMO_PRODUCT_UNAUTHORIZED`.',
    precedence: 'The exact process value is the only source and is read only after exact `true` enables the feature.',
    impact: 'Changing it changes which audience a product-decision caller token must prove.',
    failure: 'Enabled controller startup stops, or callers with a different audience are denied.',
    required: 'required when `BUSTER_PRODUCT_ENABLED=true`',
  }),
  BUSTER_PRODUCT_PRODUCER: environmentContract({
    purpose: 'Selects the Kubernetes ServiceAccount identity allowed to submit signed product decisions.',
    acceptedForm: 'Exactly `system:serviceaccount:<namespace>:<name>`, with both final parts matching `^[a-z0-9][a-z0-9.-]{0,252}$`, and different from `BUSTER_READY_PRODUCER`.',
    defaultBehavior: 'No default; ignored while product decisions are disabled.',
    emptyBehavior: 'Rejected when `BUSTER_PRODUCT_ENABLED=true`; ignored when the feature is disabled.',
    invalidBehavior: 'Malformed input or reuse of the readiness producer returns `DEMO_PRODUCT_CONFIG_INVALID`; another valid caller identity receives HTTP 401.',
    precedence: 'The exact process value is the only source and is read only after exact `true` enables the feature.',
    impact: 'Changing it transfers product-decision submission authority while keeping that authority separate from readiness publication.',
    failure: 'Enabled controller startup stops, or an unauthorized caller is denied.',
    required: 'required when `BUSTER_PRODUCT_ENABLED=true`',
  }),
  BUSTER_PRODUCT_ISSUER: environmentContract({
    purpose: 'Sets the issuer text that every verified signed product decision must contain.',
    acceptedForm: 'From 1 through 1024 bytes with no NUL, carriage-return, or line-feed byte. Whitespace-only text is accepted by startup validation.',
    defaultBehavior: 'No default; ignored while product decisions are disabled.',
    emptyBehavior: 'Rejected when `BUSTER_PRODUCT_ENABLED=true`; ignored when the feature is disabled.',
    invalidBehavior: 'Invalid text returns `DEMO_PRODUCT_CONFIG_INVALID`; a signed decision with another issuer returns HTTP 409 with `DEMO_PRODUCT_REQUEST_INVALID`.',
    precedence: 'The exact process value is the only source and is read only after exact `true` enables the feature.',
    impact: 'Changing it invalidates otherwise valid decisions that name the previous issuer.',
    failure: 'Enabled controller startup stops, or a decision from a different issuer is rejected.',
    required: 'required when `BUSTER_PRODUCT_ENABLED=true`',
  }),
  BUSTER_PRODUCT_VERIFY_KEY: environmentContract({
    purpose: 'Supplies the Ed25519 public key used to verify signed product-decision payloads.',
    acceptedForm: 'Strict standard Base64 that decodes to exactly 32 bytes, the Ed25519 public-key size.',
    defaultBehavior: 'No default; ignored while product decisions are disabled.',
    emptyBehavior: 'Rejected when `BUSTER_PRODUCT_ENABLED=true`; ignored when the feature is disabled.',
    invalidBehavior: 'Malformed Base64 or the wrong decoded length returns `DEMO_PRODUCT_CONFIG_INVALID`. A different valid key starts successfully but rejects signatures from the old signer with `DEMO_PRODUCT_SIGNATURE_INVALID`.',
    precedence: 'The exact process value is the only source and is read only after exact `true` enables the feature.',
    impact: 'Changing it rotates the public signature authority for product decisions; it is verification material, not a signing secret.',
    failure: 'Enabled controller startup stops, or decisions signed by a nonmatching key return HTTP 409.',
    required: 'required when `BUSTER_PRODUCT_ENABLED=true`',
  }),
  BUSTER_PRODUCT_ACTORS_JSON: environmentContract({
    purpose: 'Defines the actor identifiers that signed product decisions may name.',
    acceptedForm: 'A JSON array with at least one unique string. Every string must contain 1 through 1024 bytes and no NUL, carriage-return, or line-feed byte.',
    defaultBehavior: 'No default; ignored while product decisions are disabled.',
    emptyBehavior: 'An absent or empty value is invalid JSON and is rejected when enabled; it is ignored when disabled.',
    invalidBehavior: 'Malformed JSON, `null`, an empty array, a non-string member, invalid actor text, or a duplicate actor returns `DEMO_PRODUCT_CONFIG_INVALID`. An unlisted signed actor later returns `DEMO_PRODUCT_REQUEST_INVALID`.',
    precedence: 'The exact process value is the only source and is decoded only after exact `true` enables the feature.',
    impact: 'Changing it changes the actor allowlist applied after signature verification.',
    failure: 'Enabled controller startup stops, or a validly signed decision from an unlisted actor returns HTTP 409.',
    required: 'required when `BUSTER_PRODUCT_ENABLED=true`',
  }),
};
const busterProductEvidence = Object.fromEntries(Object.keys(busterProductContracts).map((name) => [name, [
  { path: busterProductSource, line: 58, endLine: 80 },
  ...(name === 'BUSTER_PRODUCT_ENABLED' ? [{ path: busterProductSource, line: 331, endLine: 343 }] : []),
  ...(name === 'BUSTER_PRODUCT_ACTORS_JSON' || name === 'BUSTER_PRODUCT_ISSUER'
    ? [{ path: busterProductSource, line: 169, endLine: 178 }] : []),
  ...(name === 'BUSTER_PRODUCT_VERIFY_KEY' ? [{ path: busterProductSource, line: 162, endLine: 172 }] : []),
]]));
for (const [name, contract] of Object.entries(busterProductContracts)) {
  addEnvironmentConsumerContract(name, busterProductSource, { ...contract, evidence: busterProductEvidence[name] });
}

const busterRuntimeSource = 'docker/buster-runtime-entrypoint.sh';
const busterRuntimeContracts = {
  BUSTER_V2_TOKEN: environmentContract({
    purpose: 'Supplies the bearer credential used to authenticate remote-plan requests when SPIFFE/XFCC authentication is not selected.',
    acceptedForm: 'A non-empty string at entrypoint startup. Bearer-token mode additionally requires at least 32 characters.',
    defaultBehavior: 'No default. The current entrypoint requires the value even when `BUSTER_TRUSTED_PEER_SPIFFE_ID` later selects SPIFFE authentication.',
    emptyBehavior: 'An absent or empty value stops the entrypoint before BuildKit or Buster starts.',
    invalidBehavior: 'In bearer-token mode, a value shorter than 32 characters stops server creation with `BUSTER_REMOTE_TOKEN_INVALID`; requests with a missing or different bearer value receive HTTP 401. In SPIFFE mode, the entrypoint requires the value but does not pass it to the Buster child process.',
    precedence: 'The entrypoint captures and removes the process value. A non-empty `BUSTER_TRUSTED_PEER_SPIFFE_ID` selects SPIFFE and suppresses token forwarding; otherwise the captured value is passed to Buster as `BUSTER_V2_TOKEN` and is the sole bearer credential.',
    impact: 'Changing it rotates Nova-to-Buster bearer authentication in token mode. It has no request-authentication effect in SPIFFE mode, although the current startup guard still requires it.',
    failure: 'The container stops for a missing or empty value, the Buster server stops for a short bearer token, or requests with nonmatching credentials receive HTTP 401.',
    required: 'required at entrypoint startup; used for request authentication only when SPIFFE is not selected',
  }),
  BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT: environmentContract({
    purpose: 'Selects the delegated cgroup-v2 subtree that enforces process, memory, and CPU limits for Playwright browser work.',
    acceptedForm: 'The non-empty path must exist, resolve exactly to `/var/run/kubeclaw-browser-cgroup`, expose `pids`, `memory`, and `cpu` controllers, contain no host processes, and permit those controllers to be delegated.',
    defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value stops the entrypoint before the Buster runtime starts.',
    invalidBehavior: 'Missing files stop the strict shell. An unsafe path, missing controller, existing host process, or failed delegation produces the matching explicit cgroup error.',
    precedence: 'The environment path is the only source; the checked canonical path is copied into the generated runtime configuration.',
    impact: 'Changing it changes the kernel resource-control boundary for browser processes.',
    failure: 'The container stops before serving work, or runtime policy construction rejects an unusable cgroup root.', required: 'required',
  }),
  BUSTER_PLAN_PORT: environmentContract({
    purpose: 'Selects the TCP port for the Buster remote-plan HTTP server on fixed host `0.0.0.0`.',
    acceptedForm: 'A string converted by JavaScript `Number` to a safe integer from 0 through 65535. Zero requests an operating-system-selected port; whitespace converts to zero.',
    defaultBehavior: 'Uses `18891` when absent.', emptyBehavior: 'An exact empty string selects `18891`.',
    invalidBehavior: 'Negative, fractional, nonnumeric, infinite, or unsafe values fail configuration; values above 65535 fail port validation; a busy valid port returns the listener error.',
    precedence: 'A non-empty process value wins; otherwise `18891` applies.',
    impact: 'Changing it moves the plan, health, bootstrap, and readiness endpoints and must agree with container and Service routing.',
    failure: 'The remote-plan server does not start.',
  }),
  BUSTER_PLAN_STATE_DIR: environmentContract({
    purpose: 'Selects durable plan-job state, stored results, recovery records, and the admission lock.',
    acceptedForm: 'A non-empty writable directory path. Use an absolute path because the shell and runtime resolve relative paths from different directories.',
    defaultBehavior: 'Uses `/var/lib/buster-v2/plan-jobs`.', emptyBehavior: 'An empty value selects `/var/lib/buster-v2/plan-jobs`.',
    invalidBehavior: 'Directory creation or ownership failure stops the entrypoint; later permission, filesystem, or recovery errors stop runtime startup or state operations.',
    precedence: 'A non-empty process value wins; otherwise the fixed state directory applies.',
    impact: 'Changing it moves durable job state; an ephemeral or wrong location can lose recovery data or prevent admission.',
    failure: 'The container or state operation fails at the first inaccessible or inconsistent path.',
  }),
  BUSTER_PLAN_RUN_DIR: environmentContract({
    purpose: 'Selects the working root for repository extraction, suite workspaces, artifacts, and observability files of remote-plan jobs.',
    acceptedForm: 'A non-empty writable directory path. Use an absolute path because the shell and runtime resolve relative paths from different directories.',
    defaultBehavior: 'Uses `/var/lib/buster-v2/runs`.', emptyBehavior: 'An empty value selects `/var/lib/buster-v2/runs`.',
    invalidBehavior: 'Directory creation or ownership failure stops the entrypoint; later permission or filesystem errors fail affected jobs.',
    precedence: 'A non-empty process value wins; otherwise the fixed run directory applies.',
    impact: 'Changing it moves the area in which untrusted snapshots are extracted and suites create working data.',
    failure: 'The container fails at setup or a job fails when it cannot create or use its working directory.',
  }),
  BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY: environmentContract({
    purpose: 'Supplies the Ed25519 public trust anchor used to verify Nova-signed repository snapshots.',
    acceptedForm: 'A non-empty Node-readable Ed25519 public key; this environment path normally carries PEM text.',
    defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value stops the entrypoint.',
    invalidBehavior: 'Missing material reports the required or missing-key error. Unparseable or non-Ed25519 material reports `BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID`; a nonmatching valid key causes `BUSTER_SOURCE_ATTESTATION_INVALID`.',
    precedence: 'The generated configuration fixes this environment-variable name; its process value is the only key source.',
    impact: 'Changing it rotates the source-signature authority and requires the matching Nova signing key.',
    failure: 'Runtime startup stops for bad key material, or new jobs are rejected when signature verification fails.', required: 'required',
  }),
  BUSTER_TRUSTED_PEER_SPIFFE_ID: environmentContract({
    purpose: 'Selects SPIFFE/XFCC authentication and names the one Nova SPIFFE identity allowed to submit remote-plan requests.',
    acceptedForm: 'A non-empty SPIFFE ID matching `spiffe://[a-z0-9.-]+/<path>` for successful authorization.',
    defaultBehavior: 'An absent value selects bearer-token authentication.', emptyBehavior: 'An empty value selects bearer-token authentication.',
    invalidBehavior: 'Malformed non-empty text reaches the allow policy; request authorization catches the policy error and returns HTTP 401.',
    precedence: 'A non-empty value selects SPIFFE instead of token use. The current entrypoint still requires `BUSTER_V2_TOKEN` at startup even when SPIFFE is selected.',
    impact: 'Changing it switches the remote-plan authentication boundary and the only accepted workload identity.',
    failure: 'Requests that do not arrive through the trusted loopback proxy with the exact valid identity return HTTP 401.',
  }),
  BUSTER_V2_MAX_ARCHIVE_BYTES: environmentContract({
    purpose: 'Caps the compressed repository archive accepted in one remote-plan request.',
    acceptedForm: 'A non-empty string converted by JavaScript `Number` to a positive safe integer in bytes.',
    defaultBehavior: 'Uses `67108864` bytes (64 MiB).', emptyBehavior: 'An empty value selects 64 MiB.',
    invalidBehavior: 'Zero, negative, fractional, nonnumeric, infinite, or unsafe values fail startup; an oversized request reports `BUSTER_REMOTE_ARCHIVE_SIZE_EXCEEDED`.',
    precedence: 'A non-empty process value wins; otherwise 64 MiB applies.',
    impact: 'Changing it changes the largest compressed source snapshot admitted into storage.',
    failure: 'Invalid configuration stops startup; an oversized job is rejected before extraction.',
  }),
  BUSTER_V2_MAX_EXTRACTED_BYTES: environmentContract({
    purpose: 'Caps the accumulated declared uncompressed size of regular files and directories in a submitted source archive.',
    acceptedForm: 'A non-empty string converted by JavaScript `Number` to a positive safe integer in bytes.',
    defaultBehavior: 'Uses `536870912` bytes (512 MiB).', emptyBehavior: 'An empty value selects 512 MiB.',
    invalidBehavior: 'Zero, negative, fractional, nonnumeric, infinite, or unsafe values fail startup; an oversized archive reports `BUSTER_REMOTE_ARCHIVE_EXPANDED_SIZE_EXCEEDED`.',
    precedence: 'A non-empty process value wins; otherwise 512 MiB applies.',
    impact: 'Changing it changes the expansion limit applied during archive inspection before extraction.',
    failure: 'Invalid configuration stops startup; an oversized job is rejected before extraction.',
  }),
  BUSTER_ALLOWED_SOURCE_SECRETS: environmentContract({
    purpose: 'Defines the source Secret names that a `kubernetes.fixture` request may ask the namespace controller to copy.',
    acceptedForm: 'A comma-separated list with at most 32 non-empty items. This reader does not trim items; each retained name must contain only letters, digits, dot, underscore, or hyphen. Duplicate names collapse in the downstream set.',
    defaultBehavior: 'Uses an empty list, which denies every source-Secret request.', emptyBehavior: 'An absent or empty value becomes an empty list.',
    invalidBehavior: 'More than 32 items fails runtime configuration. Invalid names fail invoker construction. A valid but unapproved request reports `KUBERNETES_FIXTURE_SECRET_REFERENCE_DENIED`.',
    precedence: 'The process value wholly replaces the empty runtime default. Copy succeeds only when this runtime list and the controller list both allow the name.',
    impact: 'Changing it changes which named Secrets a fixture request may ask the controller to copy.',
    failure: 'Startup or first invoker construction fails for invalid policy, or the individual request is denied.',
  }),
  BUSTER_LEASE_API_GROUP: environmentContract({
    purpose: 'Selects the lease CRD API group used by fixture, Tailscale exposure, and Kubernetes runtime-security capabilities.',
    acceptedForm: 'With the shipped capabilities enabled, lowercase alphanumeric at both ends, with lowercase alphanumeric, dot, or hyphen internally.',
    defaultBehavior: 'Uses `kubeclaw.forgestack.ai`.', emptyBehavior: 'An empty value selects `kubeclaw.forgestack.ai`.',
    invalidBehavior: 'The generator does not validate syntax; the first applicable job fails with `KUBERNETES_FIXTURE_API_GROUP_INVALID` or `TAILSCALE_EXPOSURE_API_INVALID`.',
    precedence: 'A truthy process string wins; otherwise the built-in group applies.',
    impact: 'Changing it changes CRD API versions, kubectl resource names, and runtime-security lookups.',
    failure: 'Capability construction or later Kubernetes requests fail against an invalid or unavailable group.',
  }),
  BUSTER_LEASE_API_VERSION: environmentContract({
    purpose: 'Selects the lease CRD version used by fixture and Tailscale exposure operations.',
    acceptedForm: 'With the shipped capabilities enabled, a value matching `^v[0-9]+(?:alpha|beta)?[0-9]*$`.',
    defaultBehavior: 'Uses `v1alpha1`.', emptyBehavior: 'An empty value selects `v1alpha1`.',
    invalidBehavior: 'The generator does not validate syntax; the first applicable job fails with `KUBERNETES_FIXTURE_API_VERSION_INVALID` or `TAILSCALE_EXPOSURE_API_INVALID`.',
    precedence: 'A truthy process string wins; otherwise `v1alpha1` applies.',
    impact: 'Changing it changes generated lease `apiVersion` values and the selected Kubernetes API endpoint.',
    failure: 'Capability construction or later Kubernetes requests fail against an invalid or unavailable version.',
  }),
  BUILDKIT_HOST: environmentContract({ purpose: 'Selects the Unix socket on which the bundled rootless BuildKit daemon listens and the generated container-build capability connects.', acceptedForm: 'A non-empty BuildKit address; the shipped path uses `unix:///run/user/1000/buildkit/buildkitd.sock`.', defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value stops the entrypoint.', invalidBehavior: 'An invalid address prevents directory setup, daemon readiness, or later `buildctl` connections.', precedence: 'The exact process value is the only source and is copied into the generated runtime configuration.', impact: 'Changing it moves both the daemon listener and build client to another socket.', failure: 'The container stops after the bounded readiness loop or builds cannot connect.', required: 'required' }),
  BUILDKIT_STATE_DIR: environmentContract({ purpose: 'Selects the persistent root directory used by the bundled BuildKit daemon.', acceptedForm: 'A non-empty writable directory path.', defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value stops the entrypoint.', invalidBehavior: 'Directory creation, ownership, or daemon startup fails for an unusable path.', precedence: 'The exact process value is the only source.', impact: 'Changing it moves BuildKit cache and worker state.', failure: 'The BuildKit daemon fails before the Buster worker starts.', required: 'required' }),
  BUILDKIT_OTEL_SOCKET_PATH: environmentContract({ purpose: 'Selects the Unix socket on which BuildKit emits OTLP telemetry.', acceptedForm: 'A writable Unix-socket path.', defaultBehavior: 'Uses `$XDG_RUNTIME_DIR/buildkit/otel-grpc.sock`.', emptyBehavior: 'An empty value selects the XDG-based default.', invalidBehavior: 'A bad path prevents parent-directory creation or BuildKit startup.', precedence: 'A non-empty process value wins; otherwise the XDG runtime directory supplies the socket path.', impact: 'Changing it moves the BuildKit telemetry endpoint.', failure: 'The entrypoint or BuildKit daemon stops before the worker starts.' }),
  BUSTER_PLAN_CONFIG_ROOT: environmentContract({ purpose: 'Selects the private directory in which the entrypoint writes generated Buster platform, runtime, and Kubernetes client configuration.', acceptedForm: 'A writable directory path.', defaultBehavior: 'Uses `/tmp/buster-plan-config`.', emptyBehavior: 'An empty value selects `/tmp/buster-plan-config`.', invalidBehavior: 'Creation, permission, file-write, or ownership failure stops the entrypoint.', precedence: 'A non-empty process value wins; otherwise the fixed temporary directory applies.', impact: 'Changing it moves generated configuration and changes the base directory for relative runtime paths.', failure: 'The Buster worker does not start.' }),
  BUSTER_KUBERNETES_SERVICE_ACCOUNT_ROOT: environmentContract({ purpose: 'Selects the projected Kubernetes credential directory used to build the worker kubeconfig.', acceptedForm: 'A directory containing readable `token`, `ca.crt`, and `namespace` files; the namespace must contain only lowercase letters, digits, and hyphen.', defaultBehavior: 'Uses `/var/run/buster-worker/kubernetes`.', emptyBehavior: 'An empty value selects the default mount path.', invalidBehavior: 'Missing files stop the strict shell; an invalid namespace reports `projected Kubernetes namespace is invalid`.', precedence: 'A non-empty process value wins; otherwise the fixed projected-volume path applies.', impact: 'Changing it selects a different Kubernetes credential projection and namespace authority.', failure: 'The entrypoint stops before it writes kubeconfig or starts the worker.' }),
  BUSTER_NETWORK_HTTP_EXACT_ORIGINS: environmentContract({ purpose: 'Defines exact HTTP origins that the Buster `network.http` capability may contact in addition to its fixed suffix policy.', acceptedForm: 'A comma-separated list of origins; items are trimmed and empty items are removed. Runtime origin parsing and policy checks validate retained values.', defaultBehavior: 'Uses an empty list.', emptyBehavior: 'An absent or empty value permits no additional exact origins.', invalidBehavior: 'An invalid retained origin fails capability construction with the network policy validation error.', precedence: 'The process list wholly replaces the empty default.', impact: 'Changing it expands or narrows the exact outbound HTTP allowlist.', failure: 'The runtime fails capability construction or denies the request.' }),
  BUSTER_BROWSER_AXE_EXACT_ORIGINS: environmentContract({ purpose: 'Defines exact web origins permitted for the Buster Axe, Lighthouse, visual, and Playwright browser capabilities.', acceptedForm: 'A comma-separated list of origins; items are trimmed and empty items are removed. Each browser capability validates the retained origins.', defaultBehavior: 'Uses an empty list.', emptyBehavior: 'An absent or empty value permits no additional exact browser origins.', invalidBehavior: 'An invalid retained origin fails the affected browser capability policy construction.', precedence: 'The process list wholly replaces the empty default.', impact: 'Changing it expands or narrows browser test destinations.', failure: 'The runtime fails capability construction or denies a target outside the policy.' }),
  BUSTER_NETWORK_HTTP_ALLOW_WEBSOCKET: environmentContract({ purpose: 'Controls whether the `network.http` capability accepts WebSocket requests.', acceptedForm: 'Only exact `true` enables WebSocket support.', defaultBehavior: 'Uses `false`.', emptyBehavior: 'An absent or empty value selects `false`.', invalidBehavior: 'Any value other than exact `true` is treated as false; no startup error is produced.', precedence: 'The exact process comparison is the only source.', impact: 'Changing it to exact `true` permits WebSocket traffic within the remaining network policy.', failure: 'WebSocket requests are denied when the effective value is false.' }),
  BUSTER_PLAN_TRUSTED_SOURCE_AUTHORITY: environmentContract({ purpose: 'Names the source authority that must appear in every verified Nova snapshot attestation.', acceptedForm: 'A non-empty authority string; the loader rejects an empty effective value when it constructs the Ed25519 verifier.', defaultBehavior: 'Uses `nova:production`.', emptyBehavior: 'An empty value selects `nova:production`.', invalidBehavior: 'An empty generated authority fails with `BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID`; a different valid authority rejects attestations from the previous authority.', precedence: 'A truthy process value wins; otherwise `nova:production` applies.', impact: 'Changing it rotates the logical source issuer independently from the public key.', failure: 'Runtime startup or source-snapshot admission fails.' }),
  BUSTER_V2_MAX_ACTIVE_JOBS: environmentContract({ purpose: 'Caps how many remote-plan jobs may execute at the same time.', acceptedForm: 'A non-empty value converted by JavaScript `Number` to a positive safe integer.', defaultBehavior: 'Uses `2`.', emptyBehavior: 'An empty value selects `2`.', invalidBehavior: 'Zero, negative, fractional, nonnumeric, infinite, or unsafe input fails with `BUSTER_REMOTE_CONFIG_INVALID:maximumActiveJobs`.', precedence: 'A non-empty process value wins; otherwise `2` applies.', impact: 'Changing it changes parallel job execution and resource pressure; accepted jobs wait in the queue when the cap is reached.', failure: 'Invalid configuration stops startup; valid excess work remains queued.' }),
  BUSTER_V2_MAX_QUEUED_JOBS: environmentContract({ purpose: 'Caps accepted jobs waiting for an execution slot.', acceptedForm: 'A non-empty value converted by JavaScript `Number` to a positive safe integer.', defaultBehavior: 'Uses `16`.', emptyBehavior: 'An empty value selects `16`.', invalidBehavior: 'Zero, negative, fractional, nonnumeric, infinite, or unsafe input fails with `BUSTER_REMOTE_CONFIG_INVALID:maximumQueuedJobs`.', precedence: 'A non-empty process value wins; otherwise `16` applies.', impact: 'Changing it changes admission capacity while active slots are occupied.', failure: 'Invalid configuration stops startup; a full valid queue rejects new work with `BUSTER_REMOTE_ADMISSION_FULL`.' }),
  BUSTER_V2_MAX_CONCURRENT_ATTEMPTS: environmentContract({ purpose: 'Caps both one job’s requested attempt concurrency and the sum of attempt weights across active jobs.', acceptedForm: 'A non-empty value converted by JavaScript `Number` to a positive safe integer.', defaultBehavior: 'Uses `64`.', emptyBehavior: 'An empty value selects `64`.', invalidBehavior: 'Zero, negative, fractional, nonnumeric, infinite, or unsafe input fails with `BUSTER_REMOTE_CONFIG_INVALID:maximumConcurrentAttempts`.', precedence: 'A non-empty process value wins; otherwise `64` applies.', impact: 'Changing it changes admission and scheduling of attempt-heavy jobs.', failure: 'Invalid configuration stops startup; an oversized job returns `BUSTER_REMOTE_CONCURRENCY_EXCEEDS_SERVICE_LIMIT` and aggregate pressure delays queued jobs.' }),
  KUBECLAW_REGISTRY_CONFIG: environmentContract({ purpose: 'Supplies the complete registry endpoint, transport, and authentication contract from which the entrypoint generates BuildKit and runtime client files.', acceptedForm: 'Non-empty JSON accepted by `scripts/registry-client-config.mjs` for both `buildkit` and `runtime` outputs.', defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value stops the entrypoint.', invalidBehavior: 'Malformed, incomplete, or unsafe registry configuration makes the generator stop before BuildKit starts.', precedence: 'The exact process value is written to the private temporary input and is the only registry authority.', impact: 'Changing it redirects image push/pull traffic and changes transport or credentials for both clients.', failure: 'The container stops before BuildKit or Buster starts.', required: 'required' }),
  KUBERNETES_SERVICE_HOST: environmentContract({ purpose: 'Selects the Kubernetes API host written into the generated worker kubeconfig.', acceptedForm: 'A non-empty host or IP address supplied by Kubernetes service discovery.', defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value stops the entrypoint.', invalidBehavior: 'Malformed text creates an unusable API URL and later Kubernetes requests fail.', precedence: 'The exact process value is the only host source.', impact: 'Changing it redirects every worker Kubernetes capability to another API endpoint.', failure: 'Kubeconfig generation or later Kubernetes operations fail.', required: 'required' }),
  KUBERNETES_SERVICE_PORT: environmentContract({ purpose: 'Selects the Kubernetes API port written into the generated worker kubeconfig.', acceptedForm: 'A non-empty port string supplied by Kubernetes service discovery.', defaultBehavior: 'No default in this entrypoint consumer.', emptyBehavior: 'An absent or empty value stops the entrypoint.', invalidBehavior: 'Malformed text creates an unusable API URL and later Kubernetes requests fail.', precedence: 'The exact process value is the only port source for this consumer.', impact: 'Changing it redirects every worker Kubernetes capability to another API port.', failure: 'Kubeconfig generation or later Kubernetes operations fail.', required: 'required' }),
  RUNTIME_CONFIG_ROOT: environmentContract({ purpose: 'Carries the entrypoint-selected generated-configuration directory into its embedded Node generator.', acceptedForm: 'The internal value already selected through `BUSTER_PLAN_CONFIG_ROOT`.', defaultBehavior: 'Assigned internally before the child process starts.', emptyBehavior: 'No supported empty state exists.', invalidBehavior: 'A mismatched path makes generated configuration writes fail or land outside the directory prepared by the shell.', precedence: 'The local shell assignment is the only producer.', impact: 'Joins shell directory preparation to Node file generation.', failure: 'The entrypoint stops before starting Buster.', required: 'internal' }),
  REGISTRY_CLIENT_RUNTIME: environmentContract({ purpose: 'Carries the internally generated registry runtime-client file path into the embedded Node configuration generator.', acceptedForm: 'The private `runtime.json` path generated earlier in the same entrypoint.', defaultBehavior: 'Assigned internally before the child process starts.', emptyBehavior: 'No supported empty state exists.', invalidBehavior: 'A missing or invalid file stops JSON parsing and configuration generation.', precedence: 'The local shell assignment is the only producer.', impact: 'Binds Buster container-build and scanner clients to the same registry contract.', failure: 'The entrypoint stops before starting Buster.', required: 'internal' }),
  REGISTRY_REFERENCE: environmentContract({ purpose: 'Carries the normalized registry reference from the generated client contract into the embedded Node configuration generator.', acceptedForm: 'The non-empty registry reference read from the generated runtime client JSON.', defaultBehavior: 'Assigned internally before the child process starts.', emptyBehavior: 'No supported empty state exists.', invalidBehavior: 'Missing or invalid registry JSON prevents this assignment or later produces invalid allowed prefixes.', precedence: 'The generated registry client file is the only producer.', impact: 'Sets repository and allowlist prefixes used by build, fixture, and security-scan capabilities.', failure: 'The entrypoint stops or registry operations are denied.', required: 'internal' }),
  CONTROLLER_NAMESPACE: environmentContract({ purpose: 'Carries the validated projected ServiceAccount namespace into the embedded Node configuration generator.', acceptedForm: 'The internal lowercase letter, digit, and hyphen namespace value validated by the shell.', defaultBehavior: 'Read internally from the projected namespace file.', emptyBehavior: 'An empty projected namespace is rejected before assignment.', invalidBehavior: 'Invalid namespace text stops the entrypoint.', precedence: 'The projected ServiceAccount namespace file is the only producer.', impact: 'Sets the controller namespace used by Kubernetes capabilities.', failure: 'The entrypoint stops or capabilities target the wrong valid namespace.', required: 'internal' }),
  BUSTER_V2_STATE_DIR: environmentContract({ purpose: 'Carries the resolved plan state directory into the embedded Node configuration generator.', acceptedForm: 'The internal path selected through `BUSTER_PLAN_STATE_DIR`.', defaultBehavior: 'Assigned internally from the selected state directory.', emptyBehavior: 'No supported empty state exists.', invalidBehavior: 'A mismatched path separates shell ownership setup from runtime state resolution.', precedence: 'The local shell assignment is the only producer.', impact: 'Binds generated runtime state to the prepared directory.', failure: 'Runtime startup or durable state operations fail.', required: 'internal' }),
  BUSTER_V2_RUN_DIR: environmentContract({ purpose: 'Carries the resolved job working directory into the embedded Node configuration generator.', acceptedForm: 'The internal path selected through `BUSTER_PLAN_RUN_DIR`.', defaultBehavior: 'Assigned internally from the selected run directory.', emptyBehavior: 'No supported empty state exists.', invalidBehavior: 'A mismatched path separates shell ownership setup from job workspace resolution.', precedence: 'The local shell assignment is the only producer.', impact: 'Binds generated runtime workspaces to the prepared directory.', failure: 'Runtime startup or job execution fails.', required: 'internal' }),
};
const entrypointEvidence = (line, endLine) => ({ path: busterRuntimeSource, line, endLine });
const productionEvidence = (line, endLine) => ({ path: 'skills/buster/engine/test-gates/production.ts', line, endLine });
const serviceEvidence = (line, endLine) => ({ path: 'skills/buster/engine/test-gates/remote-plan-service.ts', line, endLine });
const busterRuntimeEvidence = {
  BUSTER_V2_TOKEN: [entrypointEvidence(1, 6), entrypointEvidence(171, 176), entrypointEvidence(325, 336), productionEvidence(133, 144), { path: 'skills/buster/engine/test-gates/remote-plan-http.ts', line: 8, endLine: 29 }, { path: 'skills/buster/engine/test-gates/remote-plan-http.ts', line: 105, endLine: 120 }],
  BUILDKIT_HOST: [entrypointEvidence(7, 35), entrypointEvidence(53, 61), productionEvidence(252, 264)],
  BUILDKIT_STATE_DIR: [entrypointEvidence(7, 35)],
  BUILDKIT_OTEL_SOCKET_PATH: [entrypointEvidence(7, 35)],
  BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT: [entrypointEvidence(63, 87), productionEvidence(200, 204), productionEvidence(355, 375)],
  BUSTER_PLAN_PORT: [entrypointEvidence(171, 187), productionEvidence(410, 419), { path: 'skills/buster/engine/test-gates/remote-plan-runtime.ts', line: 24, endLine: 50 }],
  BUSTER_PLAN_STATE_DIR: [entrypointEvidence(37, 41), entrypointEvidence(108, 117), productionEvidence(212, 225)],
  BUSTER_PLAN_RUN_DIR: [entrypointEvidence(37, 41), entrypointEvidence(108, 117), productionEvidence(231, 237)],
  BUSTER_PLAN_CONFIG_ROOT: [entrypointEvidence(37, 41), entrypointEvidence(108, 117), entrypointEvidence(147, 180)],
  BUSTER_KUBERNETES_SERVICE_ACCOUNT_ROOT: [entrypointEvidence(108, 145)],
  BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY: [entrypointEvidence(103, 108), productionEvidence(135, 152), serviceEvidence(71, 105)],
  BUSTER_TRUSTED_PEER_SPIFFE_ID: [entrypointEvidence(1, 6), entrypointEvidence(171, 187), entrypointEvidence(325, 336), { path: 'skills/buster/engine/test-gates/remote-plan-http.ts', line: 105, endLine: 120 }],
  BUSTER_V2_MAX_ARCHIVE_BYTES: [entrypointEvidence(171, 187), productionEvidence(212, 225), serviceEvidence(71, 105)],
  BUSTER_V2_MAX_EXTRACTED_BYTES: [entrypointEvidence(171, 187), productionEvidence(231, 237), serviceEvidence(474, 489)],
  BUSTER_V2_MAX_ACTIVE_JOBS: [entrypointEvidence(171, 187), productionEvidence(231, 237), serviceEvidence(474, 489), serviceEvidence(647, 658)],
  BUSTER_V2_MAX_QUEUED_JOBS: [entrypointEvidence(171, 187), productionEvidence(231, 237), serviceEvidence(474, 489), serviceEvidence(530, 540)],
  BUSTER_V2_MAX_CONCURRENT_ATTEMPTS: [entrypointEvidence(171, 187), productionEvidence(231, 237), serviceEvidence(474, 489), serviceEvidence(530, 540), serviceEvidence(647, 658)],
  BUSTER_PLAN_TRUSTED_SOURCE_AUTHORITY: [entrypointEvidence(171, 187), productionEvidence(212, 225), serviceEvidence(84, 105)],
  BUSTER_ALLOWED_SOURCE_SECRETS: [entrypointEvidence(147, 153), entrypointEvidence(221, 227), productionEvidence(265, 277), { path: 'skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts', line: 447, endLine: 464 }],
  BUSTER_LEASE_API_GROUP: [entrypointEvidence(221, 237), productionEvidence(265, 280), { path: 'skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts', line: 447, endLine: 453 }],
  BUSTER_LEASE_API_VERSION: [entrypointEvidence(221, 237), productionEvidence(265, 280), { path: 'skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts', line: 447, endLine: 453 }],
  BUSTER_NETWORK_HTTP_EXACT_ORIGINS: [entrypointEvidence(147, 163), entrypointEvidence(239, 245)],
  BUSTER_BROWSER_AXE_EXACT_ORIGINS: [entrypointEvidence(147, 163), entrypointEvidence(247, 292)],
  BUSTER_NETWORK_HTTP_ALLOW_WEBSOCKET: [entrypointEvidence(147, 153), entrypointEvidence(239, 245)],
  KUBECLAW_REGISTRY_CONFIG: [entrypointEvidence(11, 22), entrypointEvidence(215, 220), entrypointEvidence(296, 303)],
  KUBERNETES_SERVICE_HOST: [entrypointEvidence(118, 145)],
  KUBERNETES_SERVICE_PORT: [entrypointEvidence(118, 145)],
  RUNTIME_CONFIG_ROOT: [entrypointEvidence(108, 117), entrypointEvidence(147, 180)],
  REGISTRY_CLIENT_RUNTIME: [entrypointEvidence(11, 22), entrypointEvidence(147, 180), entrypointEvidence(296, 303)],
  REGISTRY_REFERENCE: [entrypointEvidence(11, 22), entrypointEvidence(215, 227)],
  CONTROLLER_NAMESPACE: [entrypointEvidence(118, 153), entrypointEvidence(221, 237)],
  BUSTER_V2_STATE_DIR: [entrypointEvidence(108, 117), entrypointEvidence(171, 180), productionEvidence(212, 225)],
  BUSTER_V2_RUN_DIR: [entrypointEvidence(108, 117), entrypointEvidence(171, 180), productionEvidence(231, 237)],
};
for (const [name, contract] of Object.entries(busterRuntimeContracts)) {
  const evidence = busterRuntimeEvidence[name] ?? [];
  addEnvironmentConsumerContract(name, busterRuntimeSource, {
    ...contract,
    evidence,
    precedenceSteps: contract.precedenceSteps ?? [{
      order: 1,
      source: 'Buster runtime input resolution',
      condition: contract.precedence,
      evidence: `${evidence[0]?.path ?? busterRuntimeSource}:${evidence[0]?.line ?? 1}`,
    }],
  });
}

for (const [name, contract] of Object.entries({
  KUBERNETES_SERVICE_HOST: environmentContract({ purpose: 'Selects the Kubernetes API host used by the Buster namespace controller.', acceptedForm: 'A non-empty host name or IP address; this reader does not trim or validate syntax at startup.', defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value is rejected.', invalidBehavior: 'Malformed non-empty text reaches the API URL and later fails URL parsing, TLS, DNS, or connection setup.', precedence: 'The exact process value is the only host source.', impact: 'Changing it redirects every namespace-controller Kubernetes request.', failure: 'The controller stops before reconciliation for an empty value or cannot complete API requests for an unusable value.', required: 'required', evidence: [{ path: busterControllerSource, line: 132, endLine: 165 }] }),
  KUBERNETES_SERVICE_PORT: environmentContract({ purpose: 'Selects the Kubernetes API TCP port used by the Buster namespace controller.', acceptedForm: 'A non-empty port string; this reader trims whitespace but does not validate numeric syntax or range.', defaultBehavior: 'Uses `443`.', emptyBehavior: 'An absent, empty, or whitespace-only value selects `443`.', invalidBehavior: 'A malformed non-empty value is concatenated into the API URL and later fails URL parsing, connection setup, or reconciliation.', precedence: 'A trimmed non-empty process value wins; otherwise `443` applies.', impact: 'Changing it redirects every controller request to another port on `KUBERNETES_SERVICE_HOST`.', failure: 'The controller cannot complete Kubernetes API requests.', evidence: [{ path: busterControllerSource, line: 132, endLine: 165 }] }),
  BUSTER_LEASE_API_GROUP: environmentContract({ purpose: 'Selects the API group used in Buster lease request paths and the controller finalizer.', acceptedForm: 'A non-empty API-group string; this reader trims whitespace but does not validate syntax at startup.', defaultBehavior: 'Uses `kubeclaw.forgestack.ai`.', emptyBehavior: 'An absent, empty, or whitespace-only value selects the default group.', invalidBehavior: 'A malformed non-empty value survives startup and later causes malformed or not-found API requests or an invalid finalizer.', precedence: 'A trimmed non-empty process value wins; otherwise the checked-in group applies.', impact: 'Changing it redirects lease discovery and changes the finalizer identity.', failure: 'Lease reconciliation or Kubernetes admission fails.' }),
  BUSTER_LEASE_API_VERSION: environmentContract({ purpose: 'Selects the API version used in Buster lease request paths.', acceptedForm: 'A non-empty API-version string; this reader trims whitespace but does not validate syntax at startup.', defaultBehavior: 'Uses `v1alpha1`.', emptyBehavior: 'An absent, empty, or whitespace-only value selects the default version.', invalidBehavior: 'A malformed or unavailable non-empty value survives startup and later causes malformed or not-found API requests.', precedence: 'A trimmed non-empty process value wins; otherwise the checked-in version applies.', impact: 'Changing it redirects lease discovery to another served API version.', failure: 'Lease reconciliation fails because the selected resource endpoint is invalid or unavailable.' }),
  BUSTER_ALLOWED_SOURCE_SECRETS: environmentContract({ purpose: 'Lists the Secret object names that a Buster lease may copy from its approved source namespace.', acceptedForm: 'A comma-separated list whose trimmed non-empty entries contain only letters, digits, dot, underscore, or hyphen.', defaultBehavior: 'Uses an empty allowlist.', emptyBehavior: 'An absent, empty, or whitespace-only value permits no source Secret names.', invalidBehavior: 'Any entry outside `^[A-Za-z0-9._-]+$` returns `invalid BUSTER_ALLOWED_SOURCE_SECRETS entry`.', precedence: 'The process value is split, trimmed, and validated; no other controller source adds names.', impact: 'Changing it changes which named Secret references can be admitted into leased namespaces.', failure: 'The controller returns an error before it starts when any entry is invalid.' }),
})) addEnvironmentConsumerContract(name, busterControllerSource, contract);

const kubernetesSubprocessEnvironmentSources = [
  ['skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts', 500, 520],
  ['skills/buster/engine/test-gates/kubernetes-runtime-security.ts', 70, 85],
  ['skills/buster/engine/test-gates/tailscale-exposure-runtime.ts', 90, 102],
];
for (const [sourcePath, line, endLine] of kubernetesSubprocessEnvironmentSources) {
  addEnvironmentConsumerContract('KUBERNETES_SERVICE_HOST', sourcePath, environmentContract({ purpose: 'Passes the pod-discovered Kubernetes API host to the isolated kubectl child process used by this capability.', acceptedForm: 'The Kubernetes-provided host or IP string accepted by kubectl client discovery.', defaultBehavior: 'No repository default; Kubernetes normally injects the service value.', emptyBehavior: 'An absent value is passed as absent and kubectl must resolve configuration through the generated kubeconfig.', invalidBehavior: 'kubectl reports URL, DNS, TLS, or connection failure.', precedence: 'The child process receives the current parent-process value together with the explicit generated kubeconfig.', impact: 'Changing it changes Kubernetes client discovery for this capability.', failure: 'The capability command cannot reach the Kubernetes API.', evidence: [{ path: sourcePath, line, endLine }] }));
  addEnvironmentConsumerContract('KUBERNETES_SERVICE_PORT', sourcePath, environmentContract({ purpose: 'Passes the pod-discovered Kubernetes API port to the isolated kubectl child process used by this capability.', acceptedForm: 'A port string accepted by kubectl client discovery.', defaultBehavior: 'No repository default in this consumer; Kubernetes normally injects the service value.', emptyBehavior: 'An absent value is passed as absent and kubectl must resolve configuration through the generated kubeconfig.', invalidBehavior: 'kubectl reports URL or connection failure for an unusable value.', precedence: 'The child process receives the current parent-process value together with the explicit generated kubeconfig.', impact: 'Changing it changes Kubernetes client discovery for this capability.', failure: 'The capability command cannot reach the Kubernetes API.', evidence: [{ path: sourcePath, line, endLine }] }));
}

for (const [sourcePath, purpose, failure] of [
  ['skills/prism/server/control-config.ts', 'Authenticates Control dispatch to the Prism worker when SPIFFE workload identity is disabled.', 'Control startup stops with `PRISM_WORKER_SECRET is required`.'],
  ['skills/prism/server/worker-config.ts', 'Authenticates requests received by the Prism worker when SPIFFE workload identity is disabled.', 'Worker startup stops with `PRISM_WORKER_SECRET is required`.'],
  ['skills/prism/config/native-worker.ts', 'Authenticates native-worker artifact and dispatch traffic when SPIFFE workload identity is disabled.', 'Native-worker configuration stops with `PRISM_NATIVE_ARTIFACT_AUTH_REQUIRED`.'],
]) addEnvironmentConsumerContract('PRISM_WORKER_SECRET', sourcePath, environmentContract({
  purpose,
  acceptedForm: 'A non-empty shared secret when `WORKER_TRUST_SPIFFE_ENABLED` is not exactly `true`.',
  defaultBehavior: 'Uses an empty internal value only when SPIFFE workload identity is exactly enabled.',
  emptyBehavior: 'Accepted only with `WORKER_TRUST_SPIFFE_ENABLED=true`; otherwise startup rejects it.',
  invalidBehavior: 'The reader does not impose a character format. A value that differs from the peer causes authentication failure.',
  precedence: 'The receiving process reads its captured environment once at startup. Exact SPIFFE enablement removes the shared-secret requirement.',
  impact: 'Changing the value requires every shared-secret producer and consumer at this trust boundary to change together.',
  failure,
  required: 'required when SPIFFE workload identity is not exactly `true`',
}));

addEnvironmentConsumerContract('ARTIFACT_ROOT', 'skills/prism/server/control-config.ts', environmentContract({
  purpose: 'Selects the directory in which Prism Control stores and retrieves artifact data.',
  acceptedForm: 'A filesystem path available to the Control process.',
  defaultBehavior: 'Uses `/var/lib/prism/artifacts` only when the variable is absent.',
  emptyBehavior: 'An explicitly empty string is retained because the reader uses nullish fallback, not empty-string fallback.',
  invalidBehavior: 'This loader does not validate the path; the first artifact filesystem operation reports the unusable location.',
  precedence: 'An explicitly present process value, including empty, wins; otherwise `/var/lib/prism/artifacts` applies.',
  impact: 'Changing the path changes which artifact set Control sees and can separate database records from their files.',
  failure: 'Artifact reads or writes fail when the effective path is absent, inaccessible, or inconsistent with persisted records.',
}));
addEnvironmentConsumerContract('ARTIFACT_ROOT', 'charts/prism/files/prism-backup.sh', environmentContract({
  purpose: 'Selects the complete Prism artifact tree copied into a database-and-artifact backup group.',
  acceptedForm: 'An existing canonical absolute directory that is not a symbolic link and does not overlap `BACKUP_ROOT`.',
  defaultBehavior: 'No default.',
  emptyBehavior: 'An absent or empty value stops before backup staging.',
  invalidBehavior: 'A relative, missing, symlinked, non-canonical, or overlapping directory returns `ARTIFACT_ROOT_INVALID` or `ROOTS_OVERLAP`.',
  precedence: 'The non-empty process value is the only artifact-source path for this command.',
  impact: 'Changing the path changes the artifact snapshot paired with the database dump.',
  failure: 'The backup command stops without publishing a completed backup group.',
  required: 'required',
}));

for (const [sourcePath, contract] of [
  ['skills/prism/server/studio-config.ts', environmentContract({ purpose: 'Selects the TCP listen port for Prism Studio.', acceptedForm: 'An integer from 1 through 65535.', defaultBehavior: 'Uses `8080` only when absent.', emptyBehavior: 'An empty string converts to zero and is rejected.', invalidBehavior: 'A non-integer, zero, negative, or value above 65535 returns `PRISM_STUDIO_PORT_INVALID`.', precedence: 'A present process value wins; otherwise `8080` applies.', impact: 'Changing it moves the Studio HTTP listener and requires the Service or caller route to match.', failure: 'Studio stops during configuration before it starts listening.' })],
  ['skills/prism/server/control-config.ts', environmentContract({ purpose: 'Selects the TCP listen port for Prism Control.', acceptedForm: 'A value accepted by JavaScript `Number` and later by the Node HTTP listener.', defaultBehavior: 'Uses `8080` only when absent.', emptyBehavior: 'An empty string converts to `0`, which asks the operating system for an ephemeral port.', invalidBehavior: 'This loader performs no explicit validation; the Node listener rejects an unusable value.', precedence: 'A present process value wins; otherwise `8080` applies.', impact: 'Changing it moves the Control HTTP listener; port zero makes the chosen port unsuitable for a fixed Kubernetes Service target.', failure: 'The listener fails at startup for an invalid value, or peers cannot reach a port that does not match their route.' })],
  ['skills/prism/server/worker-config.ts', environmentContract({ purpose: 'Selects the TCP listen port for the Prism worker service.', acceptedForm: 'A value accepted by JavaScript `Number` and later by the Node HTTP listener.', defaultBehavior: 'Uses `8080` only when absent.', emptyBehavior: 'An empty string converts to `0`, which requests an ephemeral port.', invalidBehavior: 'This loader performs no explicit validation; the Node listener rejects an unusable value.', precedence: 'A present process value wins; otherwise `8080` applies.', impact: 'Changing it moves the worker listener and requires Control and the Service route to match.', failure: 'Worker startup fails or Control cannot reach the worker listener.' })],
  ['skills/prism/server/ingestion.ts', environmentContract({ purpose: 'Selects the TCP listen port for Prism ingestion.', acceptedForm: 'A value accepted by JavaScript `Number` and the Node HTTP listener.', defaultBehavior: 'Uses `8080` only when absent.', emptyBehavior: 'An empty string converts to `0`, which requests an ephemeral port.', invalidBehavior: 'The source has no separate range check; the Node listener rejects an unusable value.', precedence: 'A present process value wins; otherwise `8080` applies.', impact: 'Changing it moves the ingestion listener and requires the Service and Control URL to match.', failure: 'Ingestion fails to listen or callers cannot reach the selected port.' })],
  ['skills/prism/server/agent-bridge.mjs', environmentContract({ purpose: 'Selects the loopback TCP listen port for the Prism agent bridge.', acceptedForm: 'A non-empty value accepted by JavaScript `Number` and the Node HTTP listener.', defaultBehavior: 'Uses `18080` when absent or empty.', emptyBehavior: 'An empty string is false and therefore selects `18080`.', invalidBehavior: 'The source has no separate range check; the Node listener rejects an unusable value.', precedence: 'A truthy process value wins; otherwise `18080` applies.', impact: 'Changing it moves the loopback bridge endpoint used by local agent integration.', failure: 'The bridge fails to listen or its local caller cannot connect.' })],
  ['tools/ops-mcp/src/config.mjs', environmentContract({ purpose: 'Selects the TCP listen port for the Ops MCP HTTP server.', acceptedForm: 'An integer from 0 through 65535; zero requests an ephemeral port.', defaultBehavior: 'Uses `8080` only when absent.', emptyBehavior: 'An empty string converts to zero and is accepted as an ephemeral-port request.', invalidBehavior: 'A non-integer, negative, or value above 65535 throws `Invalid Ops MCP listen port`.', precedence: 'A present process value wins; otherwise `8080` applies.', impact: 'Changing it moves the Ops MCP endpoint; port zero is suitable for tests but not a fixed Service target.', failure: 'Ops MCP stops during configuration before it starts listening.' })],
]) addEnvironmentConsumerContract('PORT', sourcePath, contract);

for (const [name, contract] of Object.entries({
  HOST: environmentContract({ purpose: 'Selects the network address on which the Ops MCP HTTP server listens.', acceptedForm: 'A host name or IP address accepted by the Node HTTP listener.', defaultBehavior: 'Uses `0.0.0.0` when absent.', emptyBehavior: 'An explicitly empty string is retained and passed to the listener.', invalidBehavior: 'The Node listener rejects an address it cannot bind; local-only mode separately requires exact `127.0.0.1`.', precedence: 'A present process value wins; otherwise `0.0.0.0` applies.', impact: 'Changing it changes the network exposure of the privileged analysis endpoint.', failure: 'Configuration rejects a non-loopback local-only combination, or the HTTP server fails to bind.' }),
  OPS_LOCAL_ONLY: environmentContract({ purpose: 'Requires the Ops MCP server to bind only to IPv4 loopback.', acceptedForm: 'Only exact `1` enables this protection.', defaultBehavior: 'Disabled when absent.', emptyBehavior: 'An empty value leaves local-only mode disabled.', invalidBehavior: 'Every value other than exact `1` is treated as disabled; when enabled, any `HOST` other than `127.0.0.1` stops startup.', precedence: 'The process value is compared exactly once during configuration.', impact: 'Disabling it can expose the privileged MCP endpoint beyond the pod-local Codex client.', failure: 'An unsafe enabled combination throws `Local-only MCP requires HOST=127.0.0.1` before listen.' }),
  ARGOCD_NAMESPACE: environmentContract({ purpose: 'Selects the Argo CD namespace that Ops MCP includes in its permitted observation scope.', acceptedForm: 'A valid lowercase Kubernetes namespace name.', defaultBehavior: 'Uses `argocd` when absent.', emptyBehavior: 'An empty string is retained and then rejected as an invalid namespace.', invalidBehavior: 'Invalid syntax makes namespace allow-list construction throw before server startup.', precedence: 'A present process value wins; otherwise `argocd` applies.', impact: 'Changing it changes the namespace used for Argo CD observation and validation.', failure: 'Ops MCP stops with the explicit `OPS_ALLOWED_NAMESPACES` validation error.' }),
  OPS_ALLOWED_NAMESPACES: environmentContract({ purpose: 'Defines the complete Kubernetes namespace allow-list for Ops MCP tools.', acceptedForm: 'A comma-separated list of valid lowercase Kubernetes namespace names that includes `OPS_DEFAULT_NAMESPACE`; whitespace is not trimmed.', defaultBehavior: 'Uses only the effective `OPS_DEFAULT_NAMESPACE` when absent.', emptyBehavior: 'An empty string becomes one invalid empty namespace and is rejected.', invalidBehavior: 'Invalid syntax or omission of the default namespace throws `OPS_ALLOWED_NAMESPACES must contain valid, explicit namespaces including OPS_DEFAULT_NAMESPACE`.', precedence: 'A present process list wins; otherwise the effective default namespace supplies the one-item list.', impact: 'Adding a namespace expands where this privileged analysis service can read resources; removing one blocks those tools.', failure: 'Ops MCP stops before it creates the HTTP server.' }),
  OPS_MCP_BEARER_TOKEN: environmentContract({ purpose: 'Supplies the in-memory bearer credential required by every Ops MCP HTTP request.', acceptedForm: 'From 32 through 512 URL-safe characters in the set `A-Z`, `a-z`, `0-9`, dot, underscore, tilde, and hyphen.', defaultBehavior: 'No default; exactly one bearer source is required.', emptyBehavior: 'An empty value is rejected as a missing or invalid token.', invalidBehavior: 'Wrong length or characters stop startup; a request with a different token is denied.', precedence: 'Use either this value or `OPS_MCP_BEARER_TOKEN_FILE`, never both. A configured file is reopened for every request.', impact: 'Changing the credential invalidates every existing client authorization header.', failure: 'Startup stops without valid authentication, or requests receive an authorization failure.', required: 'required when no bearer-token file is configured' }),
  OPS_MCP_BEARER_TOKEN_FILE: environmentContract({ purpose: 'Selects the mounted file from which Ops MCP reads its bearer credential for each request.', acceptedForm: 'A readable file containing one 32-512 character URL-safe token, with surrounding whitespace removed.', defaultBehavior: 'No default; exactly one bearer source is required.', emptyBehavior: 'An empty path is absent; startup then requires `OPS_MCP_BEARER_TOKEN`.', invalidBehavior: 'An unreadable file, 514-byte read, or invalid trimmed token stops startup and later makes readiness and authorization fail closed.', precedence: 'Use either this file or the direct token, never both. The file wins only by being the sole configured source and is reopened on every request for Secret-volume rotation.', impact: 'Changing the path changes the live rotating credential authority without caching the old inode.', failure: 'Startup stops, readiness becomes false, and requests are denied while the file is missing or invalid.', required: 'required when no direct bearer token is configured' }),
  MCP_ALLOWED_ORIGINS: environmentContract({ purpose: 'Limits browser-origin requests accepted by the Ops MCP HTTP endpoint.', acceptedForm: 'A comma-separated list of exact Origin header strings; surrounding whitespace is removed and empty items are discarded.', defaultBehavior: 'Uses an empty set, which disables Origin filtering.', emptyBehavior: 'An empty string produces an empty set and accepts any Origin value.', invalidBehavior: 'The loader does not parse URL structure; a malformed entry simply fails to equal legitimate Origin headers.', precedence: 'The process string is split once at startup; no later source augments the set.', impact: 'Adding entries permits those exact browser origins. An empty set is safe only when loopback binding and bearer authentication remain enforced.', failure: 'A request with an Origin not in a non-empty set is rejected.' }),
})) addEnvironmentConsumerContract(name, 'tools/ops-mcp/src/config.mjs', contract);

addEnvironmentConsumerContract('KUBECLAW_NATIVE_SUPERVISOR_PID', 'skills/worker/core/worker/native-worker-launcher.c', environmentContract({
  purpose: 'Binds the privileged native-worker launcher to the exact unprivileged supervisor process that invoked it.',
  acceptedForm: 'A base-10 positive process ID below 4,294,967,295 and no sign or trailing characters.',
  defaultBehavior: 'No default.',
  emptyBehavior: 'An absent value returns `WORKER_NATIVE_LAUNCH_PARENT_REQUIRED`; an empty value returns `WORKER_NATIVE_LAUNCH_IDENTITY_INVALID`.',
  invalidBehavior: 'Malformed, zero, negative, overflowed, or stale process identity is rejected; a changed parent returns `WORKER_NATIVE_LAUNCH_PARENT_LOST`.',
  precedence: 'The launcher reads only its process environment and then verifies it against the live parent PID after installing a parent-death signal.',
  impact: 'The binding prevents a detached caller from reusing the root launcher after the trusted supervisor exits.',
  failure: 'The launcher writes the exact `WORKER_NATIVE_LAUNCH_*` code to stderr and exits 125 before entering the worker cgroup or dropping identity.',
  required: 'required',
}));

const prismNativeNumericDefaults = {
  PRISM_NATIVE_CPU_TIME_MS: [60000, Number.MAX_SAFE_INTEGER], PRISM_NATIVE_MEMORY_BYTES: [8589934592, Number.MAX_SAFE_INTEGER], PRISM_NATIVE_TASKS: [2048, Number.MAX_SAFE_INTEGER],
  PRISM_NATIVE_UID: [1000, 2147483647], PRISM_NATIVE_GID: [1000, 2147483647], PRISM_NATIVE_MAXIMUM_OWNERSHIP_RECORDS: [65536, 2147483647],
  PRISM_NATIVE_MAXIMUM_OWNERSHIP_BYTES: [67108864, 2147483647], PRISM_NATIVE_MAXIMUM_INPUT_BYTES: [16777216, 2147483647],
  PRISM_NATIVE_MAXIMUM_OUTPUT_BYTES: [33554432, 2147483647], PRISM_NATIVE_MAXIMUM_RESULT_BYTES: [67108864, 2147483647],
  PRISM_NATIVE_MAXIMUM_JOURNAL_BYTES: [68719476736, Number.MAX_SAFE_INTEGER], PRISM_NATIVE_POLL_INTERVAL_MS: [20, 2147483647],
  PRISM_NATIVE_DRAIN_TIMEOUT_MS: [10000, 2147483647], PRISM_NATIVE_CLOSE_TIMEOUT_MS: [105000, 2147483647],
  PRISM_NATIVE_DISPATCH_TIMEOUT_MS: [900000, 2147483647],
};
for (const [name, [fallback, maximum]] of Object.entries(prismNativeNumericDefaults)) addEnvironmentConsumerContract(name, 'skills/prism/config/native-worker.ts', environmentContract({
  purpose: `Sets the Prism native-worker ${name.toLowerCase().replace(/^prism_native_/u, '').replaceAll('_', ' ')} boundary.`,
  acceptedForm: `A positive safe integer from 1 through ${maximum}.`,
  defaultBehavior: `Uses \`${fallback}\` when absent.`,
  emptyBehavior: 'An empty string converts to zero and is rejected.',
  invalidBehavior: `A non-integer or out-of-range value returns the source-defined \`PRISM_NATIVE_${name.includes('RESULT') ? 'RESULT_LIMIT' : name.includes('DISPATCH') ? 'DISPATCH_DEADLINE' : name.includes('CPU_TIME') || name.includes('MEMORY') || name.endsWith('TASKS') ? 'POLICY' : 'CONFIG'}_INVALID\` family error.`,
  precedence: 'A present process value wins; otherwise the listed immutable loader fallback applies.',
  impact: 'Changing the value changes a resource, size, or time safety boundary for native execution and must stay consistent with the host pool policy.',
  failure: 'Native-worker configuration stops before it accepts or launches work.',
}));

for (const name of ['PRISM_NATIVE_POOL_POLICY_FILE', 'PRISM_NATIVE_LAUNCHER']) addEnvironmentConsumerContract(name, 'skills/prism/config/native-worker.ts', environmentContract({
  purpose: name.endsWith('POLICY_FILE') ? 'Selects the signed/owned native-worker pool policy read by the Prism supervisor.' : 'Selects the privileged native-worker launcher executable used by the Prism supervisor.',
  acceptedForm: 'A non-empty canonical absolute path other than filesystem root.', defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value is rejected.',
  invalidBehavior: `A relative, non-canonical, empty, or root path returns \`PRISM_NATIVE_PATH_REQUIRED:${name}\`; the selected file then has its own identity and ownership checks.`,
  precedence: 'The process value is the only path source.', impact: 'Changing the path changes the native isolation authority or executable and requires a new host acceptance proof.',
  failure: 'The native supervisor stops before opening the pool or launcher.', required: 'required',
}));

addEnvironmentConsumerContract('PRISM_ENGINE_CONTENT_DIGEST', 'skills/prism/config/native-worker.ts', environmentContract({ purpose: 'Binds native execution to one immutable Prism engine content identity.', acceptedForm: 'Lowercase `sha256:` followed by 64 hexadecimal digits.', defaultBehavior: 'No production or supervisor default.', emptyBehavior: 'Allowed only outside production when the caller asks only for the optional digest; supervisor configuration always rejects it.', invalidBehavior: 'Production and supervisor readers return `PRISM_NATIVE_ENGINE_CONTENT_IDENTITY_REQUIRED`.', precedence: 'The trimmed process value is the only digest source.', impact: 'Changing it creates a new executable-content identity and invalidates work bound to the previous engine.', failure: 'Native supervisor or production configuration stops before accepting work.', required: 'required for production and native supervisor configuration' }));
addEnvironmentConsumerContract('KUBECLAW_NATIVE_SCOPE', 'skills/prism/config/native-worker.ts', environmentContract({ purpose: 'Selects the already-created native worker cgroup scope whose membership the host process must enter.', acceptedForm: 'A non-empty scope path supplied by the native supervisor.', defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value is rejected.', invalidBehavior: 'An empty value returns `PRISM_NATIVE_PREEXEC_MEMBERSHIP_REQUIRED`; the launcher performs the canonical path and cgroup-v2 ownership checks.', precedence: 'The injected process value is the only scope source.', impact: 'Changing it changes the kernel resource-control boundary for this worker process.', failure: 'Native host startup stops before work is admitted.', required: 'required' }));
addEnvironmentConsumerContract('PLAYWRIGHT_BROWSERS_PATH', 'skills/prism/config/native-worker.ts', environmentContract({ purpose: 'Selects the browser binary directory exposed to native Prism work.', acceptedForm: 'A filesystem path available to the worker process.', defaultBehavior: 'Uses `/ms-playwright` when absent.', emptyBehavior: 'An explicitly empty string is retained because the loader uses nullish fallback.', invalidBehavior: 'The loader does not validate the path; browser startup reports a missing or unusable installation.', precedence: 'A present process value wins; otherwise `/ms-playwright` applies.', impact: 'Changing it changes which installed browser runtime native tests execute.', failure: 'Browser-backed work fails when the selected installation is absent or incompatible.' }));

for (const name of ['PRISM_PRODUCT_ORIGIN', 'PRISM_PRODUCT_CONTROLLER_URL', 'PRISM_PRODUCT_OPERATORS', 'PRISM_PRODUCT_PRIVATE_KEY_FILE', 'PRISM_PRODUCT_ISSUER', 'PRISM_PRODUCT_CONTROLLER_CA_FILE', 'PRISM_PRODUCT_CONTROLLER_TOKEN_FILE']) {
  const url = name === 'PRISM_PRODUCT_ORIGIN' || name === 'PRISM_PRODUCT_CONTROLLER_URL';
  const operators = name === 'PRISM_PRODUCT_OPERATORS';
  const privateKey = name === 'PRISM_PRODUCT_PRIVATE_KEY_FILE';
  addEnvironmentConsumerContract(name, 'skills/prism/control/product-decisions.ts', environmentContract({
    purpose: `${name} supplies ${url ? 'one HTTPS product-decision authority endpoint' : operators ? 'the explicit product-operator allow-list' : privateKey ? 'the dedicated product-decision signing key file' : 'one required product-decision authority value'}.`,
    acceptedForm: url ? 'An HTTPS origin with no credentials, query, fragment, or path other than `/`.' : operators ? 'A JSON array of unique, non-empty, already-trimmed strings.' : privateKey ? 'A readable file containing a dedicated Ed25519 private key.' : 'A non-empty string after trimming.',
    defaultBehavior: 'No value is read while product decisions are disabled; no default exists when enabled.',
    emptyBehavior: `When product decisions are enabled, an absent, empty, or whitespace-only value returns \`${name} is required\`.`,
    invalidBehavior: url ? 'A non-HTTPS or non-origin URL returns `product authority requires HTTPS origins`.' : operators ? 'Malformed JSON or an empty, duplicated, or untrimmed list returns `explicit product operator allowlist is required`.' : privateKey ? 'Read failure or a non-Ed25519 key stops composition.' : 'The reader requires non-empty trimmed text; the downstream controller connection validates the selected file or identity.',
    precedence: 'Exact `PRISM_PRODUCT_DECISIONS_ENABLED=true` activates the captured startup environment; no other source overrides it.',
    impact: 'Changing this authority input changes who can issue, receive, or approve signed product decisions.',
    failure: 'Control composition stops before the product-decision endpoint becomes available.', required: 'required only when product decisions are exactly enabled',
  }));
}
addEnvironmentConsumerContract('PRISM_PRODUCT_DECISIONS_ENABLED', 'skills/prism/control/product-decisions.ts', environmentContract({ purpose: 'Enables the external signed product-decision authority.', acceptedForm: 'Only exact `true` enables the feature.', defaultBehavior: 'Disabled when absent.', emptyBehavior: 'An empty value keeps the feature disabled.', invalidBehavior: 'Every value other than exact `true` keeps the feature disabled.', precedence: 'The captured process value is the sole enablement switch.', impact: 'Enabling it makes every product authority input mandatory and exposes the signed decision composition path.', failure: 'Enabled startup fails closed when any authority input is missing or invalid.' }));

for (const [name, fallback] of Object.entries({
  PRISM_WORKER_MAXIMUM_ACTIVE_REQUESTS: 16,
  PRISM_WORKER_MAXIMUM_PROBE_REQUESTS: 4,
  PRISM_WORKER_MAXIMUM_CONNECTIONS: 128,
  PRISM_WORKER_REQUEST_BODY_TIMEOUT_MS: 120000,
})) addEnvironmentConsumerContract(name, 'skills/prism/server/worker-config.ts', environmentContract({
  purpose: `Sets the worker ingress ${name.toLowerCase().replace(/^prism_worker_/u, '').replaceAll('_', ' ')} limit.`,
  acceptedForm: 'A positive safe integer from 1 through 2,147,483,647.', defaultBehavior: `Uses \`${fallback}\` when absent.`,
  emptyBehavior: 'An empty string converts to zero and is rejected.', invalidBehavior: `Invalid input returns \`PRISM_WORKER_INGRESS_INVALID:${name}\`.`,
  precedence: 'A present process value wins; otherwise the listed loader fallback applies.',
  impact: 'Changing this limit changes worker concurrency, connection pressure, request size handling, or the time allowed to receive a request body.',
  failure: 'Worker configuration stops before the HTTP service starts.',
}));
addEnvironmentConsumerContract('PRISM_WORKER_SHUTDOWN_TIMEOUT_MS', 'skills/prism/server/worker-config.ts', environmentContract({
  purpose: 'Limits how long the Prism worker can spend on its controlled shutdown sequence.', acceptedForm: 'A positive safe integer from 1 through 2,147,483,647 milliseconds.',
  defaultBehavior: 'Uses `120000` milliseconds when absent.', emptyBehavior: 'An empty string converts to zero and is rejected.',
  invalidBehavior: 'Invalid input returns `PRISM_WORKER_SHUTDOWN_TIMEOUT_MS must be a positive timer-safe integer`.', precedence: 'A present process value wins; otherwise 120 seconds applies.',
  impact: 'A shorter value can interrupt drain or native close; a longer value must still fit below the pod termination grace period.', failure: 'Worker startup stops for invalid input; an undersized valid limit can force termination before clean drain completes.',
}));

for (const sourcePath of ['skills/prism/server/control-config.ts', 'skills/prism/server/worker-config.ts', 'skills/prism/config/native-worker.ts']) addEnvironmentConsumerContract('WORKER_TRUST_SPIFFE_ENABLED', sourcePath, environmentContract({
  purpose: 'Selects SPIFFE workload identity instead of the shared worker-secret trust path.', acceptedForm: 'Only exact `true` enables SPIFFE trust.', defaultBehavior: 'Disabled when absent.', emptyBehavior: 'An empty value keeps shared-secret trust enabled.',
  invalidBehavior: 'Every value other than exact `true` selects the shared-secret path and therefore requires its shared credential and, for the worker, its database URL.',
  precedence: 'Each process captures its own environment at startup; its selected trust mode must match every peer.',
  impact: 'Changing the mode changes the authentication boundary and the set of required SPIFFE identities or shared secrets.',
  failure: 'Startup stops for incomplete selected trust data, or peers reject one another when their modes differ.',
}));

for (const name of ['PRISM_TRUSTED_NOVA_SPIFFE_ID', 'PRISM_TRUSTED_WORKER_SPIFFE_ID', 'PRISM_CONTROL_SPIFFE_ID', 'PRISM_TRUSTED_AGENT_SPIFFE_ID']) addEnvironmentConsumerContract(name, 'skills/prism/server/control-config.ts', environmentContract({
  purpose: `Selects the exact SPIFFE identity accepted for ${name.toLowerCase().replace(/^prism_/u, '').replaceAll('_', ' ')} at Prism Control.`, acceptedForm: 'A non-empty SPIFFE ID string supplied by the rendered worker-trust configuration.',
  defaultBehavior: 'Uses an empty string while SPIFFE trust is disabled.', emptyBehavior: 'Accepted only while `WORKER_TRUST_SPIFFE_ENABLED` is not exact `true`.',
  invalidBehavior: 'When SPIFFE trust is enabled, any missing required identity returns `Prism SPIFFE trust policy is incomplete`; peer certificate matching enforces the actual identity.',
  precedence: 'The captured process value is the only identity source for this Control instance.', impact: 'Changing it changes which workload certificate Control trusts at that role boundary.',
  failure: 'Control startup stops for an incomplete policy or rejects a peer with a different SPIFFE identity.', required: 'required when SPIFFE worker trust is exactly enabled',
}));
addEnvironmentConsumerContract('PRISM_TRUSTED_TEST_RUNNER_SPIFFE_ID', 'skills/prism/server/control-config.ts', environmentContract({
  purpose: 'Selects the optional SPIFFE identity trusted for the isolated Prism test runner.', acceptedForm: 'A SPIFFE ID string or empty text when no test-runner identity is admitted.', defaultBehavior: 'Uses an empty string when absent.', emptyBehavior: 'An empty value admits no test-runner SPIFFE identity.', invalidBehavior: 'The loader retains the string; the authorization boundary rejects a peer that does not match the configured identity.', precedence: 'The captured process value is the only test-runner identity source.', impact: 'Changing it changes whether and which test runner can use the trusted test path.', failure: 'The test runner is denied when its presented identity does not match.' }));
addEnvironmentConsumerContract('PRISM_TRUSTED_CONTROL_SPIFFE_ID', 'skills/prism/server/worker-config.ts', environmentContract({
  purpose: 'Selects the exact Prism Control SPIFFE identity trusted by the worker.', acceptedForm: 'A non-empty SPIFFE ID string when worker SPIFFE trust is enabled.', defaultBehavior: 'Uses an empty string while SPIFFE trust is disabled.', emptyBehavior: 'Accepted only while `WORKER_TRUST_SPIFFE_ENABLED` is not exact `true`.', invalidBehavior: 'An empty value with SPIFFE enabled returns `Prism worker SPIFFE trust policy is incomplete`; peer matching rejects a different identity.', precedence: 'The captured process value is the only trusted Control identity source.', impact: 'Changing it changes which Control workload can dispatch authenticated work to this worker.', failure: 'Worker startup stops or authenticated dispatch is denied.', required: 'required when SPIFFE worker trust is exactly enabled' }));

for (const [name, fallback, purpose] of [
  ['PRISM_WORKER_URL', 'http://prism-worker:8080', 'Selects the internal Prism worker endpoint used by Control.'],
  ['PRISM_INGESTION_URL', 'http://prism-ingestion:8080', 'Selects the internal Prism ingestion endpoint used by Control.'],
  ['PRISM_CONTROL_INTERNAL_URL', 'http://prism-control:8080', 'Selects the internal Prism Control endpoint used by Control and the worker.'],
  ['PRISM_STUDIO_PUBLIC_URL', 'https://prism-studio', 'Selects the public Prism Studio URL placed into Control responses and links.'],
]) addEnvironmentConsumerContract(name, 'skills/prism/server/control-config.ts', environmentContract({ purpose, acceptedForm: 'An absolute URL accepted by the WHATWG URL parser.', defaultBehavior: `Uses \`${fallback}\` when absent.`, emptyBehavior: 'An explicitly empty string is passed to the URL parser and rejected, except the Studio public URL which is retained as text.', invalidBehavior: name === 'PRISM_STUDIO_PUBLIC_URL' ? 'This loader does not parse the Studio value; downstream link consumers expose an invalid selection.' : 'The URL constructor throws before Control starts.', precedence: 'A present process value wins; otherwise the listed service default applies.', impact: 'Changing it redirects internal service traffic or the public link authority.', failure: 'Control startup fails for parsed endpoint errors, or requests and links target the wrong valid endpoint.' }));
addEnvironmentConsumerContract('PRISM_CONTROL_INTERNAL_URL', 'skills/prism/server/worker-config.ts', environmentContract({ purpose: 'Selects the internal Control endpoint used by the Prism worker.', acceptedForm: 'An absolute URL accepted by the WHATWG URL parser.', defaultBehavior: 'Uses `http://prism-control:8080` when absent.', emptyBehavior: 'An empty string is rejected by the URL parser.', invalidBehavior: 'The URL constructor throws before worker startup.', precedence: 'A present process value wins; otherwise the cluster-service URL applies.', impact: 'Changing it redirects worker control callbacks and native result delivery.', failure: 'Worker startup stops or later Control requests cannot connect.' }));
addEnvironmentConsumerContract('PRISM_CONTROL_INTERNAL_URL', 'skills/prism/config/native-worker.ts', environmentContract({ purpose: 'Selects the exact Control endpoint used by the native Prism host path.', acceptedForm: 'A required absolute URL accepted by the WHATWG URL parser.', defaultBehavior: 'No default in the native host reader.', emptyBehavior: 'An absent or empty value is rejected by the URL parser.', invalidBehavior: 'The URL constructor throws before native host configuration completes.', precedence: 'The injected process value is the only endpoint source for the native host.', impact: 'Changing it redirects native artifact and dispatch communication.', failure: 'Native host startup stops or cannot reach Control.', required: 'required' }));
addEnvironmentConsumerContract('DATABASE_URL', 'skills/prism/server/worker-config.ts', environmentContract({ purpose: 'Selects the Prism PostgreSQL connection URL used by the worker on the shared-secret trust path.', acceptedForm: 'A non-empty PostgreSQL connection URL accepted by the database client.', defaultBehavior: 'Uses an empty internal value only when SPIFFE trust is enabled.', emptyBehavior: 'Rejected with `DATABASE_URL is required` when SPIFFE trust is disabled.', invalidBehavior: 'The loader checks only presence; the database client reports parse, TLS, authentication, or connection failure.', precedence: 'The captured process value is the only database endpoint; exact SPIFFE enablement removes this reader’s presence requirement.', impact: 'Changing it redirects worker persistence to a different database authority.', failure: 'Worker startup stops for a missing required value or database operations fail against an invalid endpoint.', required: 'required when SPIFFE worker trust is not exactly enabled' }));
addEnvironmentConsumerContract('DATABASE_URL', 'skills/prism/server/control-config.ts', environmentContract({ purpose: 'Selects the PostgreSQL connection used by the unconditional `pg.Pool` that backs the Prism Control listener.', acceptedForm: 'A PostgreSQL connection URL accepted by node-postgres. An absent or empty value selects node-postgres connection-parameter resolution instead of disabling the database.', defaultBehavior: 'The loader passes `undefined` to `pg.Pool`. Node-postgres then reads `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT`, and `PGDATABASE` and uses its library defaults for fields that remain absent.', emptyBehavior: 'An empty connection string is falsey to node-postgres, so it follows the same `PG*` and library-default path as an absent value; it does not create a non-database listener.', invalidBehavior: 'The loader does not parse the URL. Pool connection reports URL parsing, DNS, TLS, authentication, or connection failure when Control first uses PostgreSQL.', precedence: 'Values present in a non-empty connection URL configure the pool. For connection fields not supplied by that URL, node-postgres uses the matching `PG*` variable and then its library default.', impact: 'Changing the URL or its fallback `PG*` inputs redirects the durable Control state to another PostgreSQL authority.', failure: 'Control can bind its HTTP listener before the lazy pool connects, but a database-backed request fails when the resolved PostgreSQL connection is unusable.', required: 'required as a usable PostgreSQL resolution; `DATABASE_URL` itself can be absent only when the `PG*` variables or node-postgres defaults identify the intended database' }));
addEnvironmentConsumerContract('DATABASE_URL', 'skills/prism/server/migrate.ts', environmentContract({ purpose: 'Selects the PostgreSQL database on which the Prism migration process applies schema changes.', acceptedForm: 'A PostgreSQL connection URL accepted by node-postgres. An absent or empty value invokes node-postgres `PG*` and library-default resolution.', defaultBehavior: 'The migration pool receives `undefined`; node-postgres reads `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT`, and `PGDATABASE`, then applies library defaults to fields that remain absent.', emptyBehavior: 'An empty connection string follows the same node-postgres fallback path as an absent value.', invalidBehavior: 'The migration fails on URL parsing, DNS, TLS, authentication, connection, or SQL errors before it can complete.', precedence: 'Values present in a non-empty connection URL configure the pool. Missing URL fields fall back to matching `PG*` variables and then node-postgres defaults.', impact: 'Changing the URL or fallback `PG*` inputs redirects schema migration to a different database authority.', failure: 'The migration process exits without completing the schema transaction, and dependent Prism workloads must not be treated as ready.', required: 'required as a usable PostgreSQL resolution; the chart supplies `DATABASE_URL` for the migration job' }));
addEnvironmentConsumerContract('PRISM_NATIVE_MAXIMUM_INPUT_BYTES', 'skills/prism/server/worker-config.ts', environmentContract({ purpose: 'Caps the request body accepted by the Prism worker ingress before native dispatch.', acceptedForm: 'A positive safe integer from 1 through 2,147,483,647 bytes.', defaultBehavior: 'Uses `16777216` bytes when absent.', emptyBehavior: 'An empty string converts to zero and is rejected.', invalidBehavior: 'Invalid input returns `PRISM_WORKER_INGRESS_INVALID:PRISM_NATIVE_MAXIMUM_INPUT_BYTES`.', precedence: 'A present worker process value wins; otherwise the 16 MiB ingress default applies.', impact: 'Changing it changes the earliest body-size boundary; the native host has its own independently checked contract for the same name.', failure: 'Worker configuration stops or oversized requests are rejected before native execution.' }));

for (const [name, contract] of Object.entries({
  BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE: environmentContract({ purpose: 'Selects the rootless BuildKit image used by the deployment capability probe.', acceptedForm: 'An OCI image reference pinned with a `sha256` digest.', defaultBehavior: 'Uses the checked-in `moby/buildkit:v0.26.2-rootless` digest.', emptyBehavior: 'An empty value is absent and selects the checked-in digest.', invalidBehavior: 'The container runtime rejects an invalid or unavailable image; the probe also rejects a runtime that lacks the required rootless capability.', precedence: 'A non-empty process value wins; otherwise the checked-in digest applies.', impact: 'Changing it changes the executable probe used to decide whether build capability is ready.', failure: 'The probe pod fails and deployment does not claim rootless BuildKit readiness.' }),
  BUILDKIT_ROOTLESS_PREFLIGHT_TIMEOUT: environmentContract({ purpose: 'Limits the wait for the rootless BuildKit capability probe pod.', acceptedForm: 'A kubectl duration such as `180s`.', defaultBehavior: 'Uses `180s`.', emptyBehavior: 'An empty value is absent and selects `180s`.', invalidBehavior: 'kubectl rejects an invalid duration or reports a timeout.', precedence: 'A non-empty process value wins; otherwise the checked-in timeout applies.', impact: 'A shorter value stops a slow probe sooner; a longer value delays deployment failure.', failure: 'The probe is diagnosed and removed, and deployment stops without claiming BuildKit readiness.' }),
  CODE_BUNDLE_GITHUB_REPOSITORY: environmentContract({ purpose: 'Supplies the GitHub `owner/repository` used to derive source-bundle release URLs.', acceptedForm: 'A GitHub repository identifier in `owner/repository` form.', defaultBehavior: 'Empty; the deploy script can derive the repository from Git remote metadata.', emptyBehavior: 'An empty value requests repository derivation.', invalidBehavior: 'A missing or malformed effective repository prevents release-asset URL derivation.', precedence: 'An explicit environment repository wins; otherwise the script inspects the checked-in repository remote.', impact: 'Changing it redirects all derived Nova, Buster, and Prism bundle URLs.', failure: 'Code-bundle preflight or deployment stops before downloading an unbound archive.' }),
  CODE_BUNDLE_PREFLIGHT_SKIP: environmentContract({ purpose: 'Disables the remote code-bundle release preflight for a controlled render path.', acceptedForm: 'Only the exact string `true` skips the preflight; use `false` otherwise.', defaultBehavior: 'Uses `false`.', emptyBehavior: 'An empty value is absent and selects `false`.', invalidBehavior: 'Any value other than exact `true` does not skip verification.', precedence: 'A non-empty process value wins; otherwise verification remains enabled.', impact: 'When true, the command does not prove that the remote archive and receipt exist before rendering.', failure: 'A later init container can fail if the unverified asset is missing or invalid.' }),
  CODE_BUNDLE_RELEASE_TAG: environmentContract({ purpose: 'Selects the GitHub release tag under which derived code-bundle assets are located.', acceptedForm: 'A GitHub release tag valid in a release download URL.', defaultBehavior: 'Uses `agent-code-bundles`.', emptyBehavior: 'An empty value is absent and selects the default tag.', invalidBehavior: 'A nonexistent or malformed tag makes the derived asset unavailable.', precedence: 'A non-empty process value wins; otherwise the checked-in tag applies.', impact: 'Changing it redirects derived Nova, Buster, and Prism archive URLs while expected commits still bind their contents.', failure: 'Bundle preflight or init download fails.' }),
  DISABLE_IMAGE_PULL_SECRETS: environmentContract({ purpose: 'Omits configured imagePullSecrets from an agent Helm release.', acceptedForm: 'Only `1` disables imagePullSecrets; use `0` to retain them.', defaultBehavior: 'Uses `0` and keeps imagePullSecrets.', emptyBehavior: 'An empty value is absent and selects `0`.', invalidBehavior: 'Any value other than exact `1` retains imagePullSecrets.', precedence: 'A non-empty process value wins; otherwise the deploy script uses `0`.', impact: 'Use it only when every selected image is anonymously pullable or another cluster mechanism supplies credentials.', failure: 'Private image pulls fail with `ImagePullBackOff` when the override removes the required Secret.' }),
  KUBECLAW_DEPLOY_LAB_DOCKERHUB_MIRROR: environmentContract({ purpose: 'Enables the anonymous HTTP Docker Hub pull-through mirror used by the lab deployment.', acceptedForm: 'Exactly `true` or `false`.', defaultBehavior: 'Uses `false`.', emptyBehavior: 'An empty value is absent and selects `false`.', invalidBehavior: 'Any other value stops deployment with a boolean validation error.', precedence: 'A non-empty process value wins; otherwise the mirror remains disabled.', impact: 'When enabled, deployment applies the lab mirror resources. It does not make the service production-ready or HTTPS-authenticated.', failure: 'Invalid input or a failed mirror rollout stops the infrastructure path.' }),
  KUBECLAW_DEPLOY_LAB_REGISTRY: environmentContract({ purpose: 'Enables the anonymous HTTP local OCI registry used by the lab deployment.', acceptedForm: 'Exactly `true` or `false`.', defaultBehavior: 'Uses `false`.', emptyBehavior: 'An empty value is absent and selects `false`.', invalidBehavior: 'Any other value stops deployment with a boolean validation error.', precedence: 'A non-empty process value wins; otherwise the local registry remains disabled.', impact: 'When enabled, deployment renders the lab registry from an explicit storage configuration. This is not a production HTTPS registry.', failure: 'Invalid input, missing storage configuration, or rollout failure stops the infrastructure path.' }),
  KUBECLAW_KUBERNETES_PREFLIGHT_SECRET: environmentContract({ purpose: 'Names the approved test Secret mounted by the Kubernetes and combined production preflights.', acceptedForm: 'A valid Kubernetes Secret name.', defaultBehavior: 'Uses `kubeclaw-fixture-preflight`.', emptyBehavior: 'An empty value is absent and selects the default Secret name.', invalidBehavior: 'The command rejects an invalid name and fails when the Secret does not exist or cannot be mounted.', precedence: 'Command argument 3 wins; this environment value is the fallback; then the checked-in default applies.', impact: 'This public object name selects test data exposure for the preflight workload; it does not contain the Secret payload.', failure: 'The preflight stops and produces no successful production receipt.' }),
  KUBECLAW_LAB_REGISTRY_STORAGE_CONFIG: environmentContract({ purpose: 'Selects the explicit JSON storage configuration used to render the lab local registry.', acceptedForm: 'A readable JSON file accepted by `render-registry-local.mjs`.', defaultBehavior: 'No default when the lab registry is enabled.', emptyBehavior: 'An empty value is rejected only when `KUBECLAW_DEPLOY_LAB_REGISTRY=true`.', invalidBehavior: 'A missing, invalid, or unsafe storage configuration stops registry rendering.', precedence: 'The non-empty process value is the only storage-config source for the enabled lab registry.', impact: 'The file selects registry storage behavior and persistence.', failure: 'Deployment stops before applying the local registry resources.', required: 'required when the lab registry is enabled' }),
  KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE: environmentContract({ purpose: 'Selects the private signing-key file used to issue a production preflight receipt.', acceptedForm: 'A readable filesystem path to the private key paired with the installed trusted public key.', defaultBehavior: 'Empty; production receipt commands require an explicit file.', emptyBehavior: 'An empty value is rejected by receipt-producing commands.', invalidBehavior: 'A missing, unreadable, or mismatched key prevents receipt signing or verification.', precedence: 'The process value is the only private-key path; the trusted public-key file remains a separate checked-in/installed authority.', impact: 'The path is publishable, but the file contents are secret. Changing the key pair changes who can issue accepted receipts.', failure: 'The production preflight stops without an accepted receipt.', required: 'required for production receipt commands' }),
  KUBECLAW_RUN_SECRET_SETUP: environmentContract({ purpose: 'Selects whether the deploy `setup` and `all` paths invoke secret setup.', acceptedForm: 'Case-insensitive `auto`; truthy `1`, `true`, `yes`, `on`, or `enabled`; or falsey `0`, `false`, `no`, `off`, or `disabled`.', defaultBehavior: '`auto`: run with a terminal and skip with a warning without one.', emptyBehavior: 'An empty value is absent and selects `auto`.', invalidBehavior: 'Every value outside the exact accepted set stops deployment with an explicit mode error.', precedence: 'A non-empty process value wins; otherwise `auto` applies.', impact: 'A truthy value requires secret setup even without a terminal; a falsey value always skips it.', failure: 'Forced setup fails when required sources are unavailable; skipped setup can leave later workloads unready.' }),
  KUBECLAW_SECRET_SETUP_MODE: environmentContract({ purpose: 'Selects whether the secret helper can ask for missing values interactively.', acceptedForm: 'Case-insensitive `auto`, `interactive`, or `noninteractive`; truthy `1`, `true`, `yes`, `on`, or `enabled` selects interactive mode; falsey `0`, `false`, `no`, `off`, or `disabled` selects noninteractive mode.', defaultBehavior: '`auto`: use prompts only when `/dev/tty` is readable and writable.', emptyBehavior: 'An empty value is absent and selects `auto`.', invalidBehavior: 'Every value outside the exact accepted set stops secret setup.', precedence: 'A non-empty process value wins; otherwise `auto` applies.', impact: 'Noninteractive mode requires existing target Secrets, SOPS, source-namespace copies, or bootstrap inputs.', failure: 'A required value without an allowed source remains missing and setup reports the gap.' }),
  KUBECLAW_SECRETS_OVERWRITE: environmentContract({ purpose: 'Allows secret setup to replace existing target Secret data.', acceptedForm: 'Case-insensitive truthy `1`, `true`, `yes`, `on`, or `enabled` enables overwrite. Falsey `0`, `false`, `no`, `off`, or `disabled` keeps existing data.', defaultBehavior: 'Uses `false` and reuses existing Secrets.', emptyBehavior: 'An empty value is absent and selects `false`.', invalidBehavior: 'A value outside the exact accepted boolean set does not enable overwrite and therefore preserves existing data.', precedence: 'A non-empty process value wins; otherwise existing target Secrets remain authoritative.', impact: 'When enabled, later configured sources can replace live credential material and trigger dependent restarts or auth failures.', failure: 'Partial or wrong replacement can break consumers; inspect each Secret and rotate deliberately.' }),
  KUBECLAW_WORKSPACE_NAMESPACE_FILE: environmentContract({ purpose: 'Selects the local file from which deployment reads and to which it records the chosen workspace namespace.', acceptedForm: 'A writable local file path whose content is a valid Kubernetes namespace.', defaultBehavior: 'Uses `my-values/.workspace-namespace`.', emptyBehavior: 'An empty value is absent and selects the default path.', invalidBehavior: 'Invalid file content is ignored with a warning; write failures stop the persistence step.', precedence: 'An explicit `NAMESPACE` wins; otherwise a valid saved file can supply the namespace before an optional prompt.', impact: 'The file affects later local deploy invocations; it does not change cluster state by itself.', failure: 'Deployment uses another valid namespace source or stops when it cannot safely persist the selected value.' }),
  KUBECLAW_WORKSPACE_PROMPT: environmentContract({ purpose: 'Controls whether deployment asks the operator to confirm or select a workspace namespace.', acceptedForm: '`auto`, `true`, or `false`, with normalized boolean aliases.', defaultBehavior: '`auto`: prompt only on an interactive terminal when a namespace was not explicitly set.', emptyBehavior: 'An empty value is absent and selects `auto`.', invalidBehavior: 'An unrecognized value stops deployment; `true` without an interactive terminal also stops.', precedence: 'Explicit `NAMESPACE` and a valid saved namespace are resolved before the prompt mode.', impact: 'The selection changes the namespace targeted by the deployment command.', failure: 'The command stops before cluster changes when it cannot obtain a safe namespace choice.' }),
  LITELLM_NODE_PORT: environmentContract({ purpose: 'Selects the Kubernetes NodePort exposed by the LiteLLM Service.', acceptedForm: 'An integer from 30000 through 32767.', defaultBehavior: 'Uses `30050`.', emptyBehavior: 'An empty value is absent and selects `30050`.', invalidBehavior: 'A non-integer or out-of-range value stops deployment before patching the Service.', precedence: 'A non-empty process value wins; otherwise the checked-in default applies.', impact: 'Changing it changes the node-level LiteLLM endpoint and can conflict with another Service.', failure: 'Infrastructure deployment stops before accepting an invalid Service port.' }),
  NAMESPACE: environmentContract({ purpose: 'Selects the primary Kubernetes namespace targeted by deployment, secret setup, and policy migration.', acceptedForm: 'A valid Kubernetes namespace name.', defaultBehavior: 'Uses `kubeclaw` when no explicit or saved workspace namespace supplies a value.', emptyBehavior: 'An empty value is absent and selects the default or workspace selection path.', invalidBehavior: 'The workspace resolver rejects invalid saved or entered names; kubectl rejects invalid direct names at the API boundary.', precedence: 'An explicitly set process value wins; otherwise deployment can use the saved workspace file or prompt; the final fallback is `kubeclaw`.', impact: 'Changing it redirects namespaced reads, writes, release ownership, Secret setup, and policy operations.', failure: 'A wrong valid namespace can target the wrong workload set, so operators must verify the bound cluster and namespace before mutation.' }),
  NATIVE_WORKER_NODE_POLICY_FILE: environmentContract({ purpose: 'Selects the native-worker node policy checked before Prism workloads are deployed.', acceptedForm: 'A readable YAML policy file path.', defaultBehavior: 'Uses `my-values/infra/native-worker-pools.yaml`.', emptyBehavior: 'An empty value is absent and selects the checked-in policy.', invalidBehavior: 'A missing, invalid, or unsatisfied policy stops the worker-node preflight.', precedence: 'A non-empty process path wins; otherwise the checked-in policy applies.', impact: 'Changing it changes which nodes and isolation conditions Prism workers may use.', failure: 'Prism deployment stops before applying workloads to an unapproved worker pool.' }),
  PRISM_DATABASE_SECRET_NAME: environmentContract({ purpose: 'Names the Kubernetes Secret that supplies Prism PostgreSQL credentials.', acceptedForm: 'A valid Secret name in `PRISM_NAMESPACE` with every required database key.', defaultBehavior: 'Uses `prism-postgresql-auth`.', emptyBehavior: 'An empty value is absent and selects the default.', invalidBehavior: 'An invalid name, missing Secret, or missing required key stops Prism deployment.', precedence: 'A non-empty process value wins and is passed to both the Prism and PostgreSQL chart bindings.', impact: 'This public object name changes the database credential authority for Prism components.', failure: 'Secret preflight or workload startup fails; no valid database connection is claimed.' }),
  PRISM_RUNTIME_SECRET_NAME: environmentContract({ purpose: 'Names the Kubernetes Secret that supplies Prism runtime signing and ingress credentials.', acceptedForm: 'A valid Secret name in `PRISM_NAMESPACE` with every required runtime key.', defaultBehavior: 'Uses `prism-runtime`.', emptyBehavior: 'An empty value is absent and selects the default.', invalidBehavior: 'An invalid name, missing Secret, or missing required key stops Prism deployment.', precedence: 'A non-empty process value wins and is passed to the Prism chart.', impact: 'This public object name changes the runtime credential authority used by Prism services and preflights.', failure: 'Secret preflight, pod startup, or authenticated request verification fails.' }),
  PRISM_IMAGE_PULL_SECRET_NAME: environmentContract({ purpose: 'Names the Kubernetes Secret used to pull Prism and Prism test images.', acceptedForm: 'A valid image-pull Secret name in `PRISM_NAMESPACE`.', defaultBehavior: 'Uses `ghcr-secret`.', emptyBehavior: 'An empty value is absent and selects the default.', invalidBehavior: 'An invalid or missing Secret stops Prism preflight or causes image pulls to fail.', precedence: 'A non-empty process value wins and is written into the rendered imagePullSecrets list.', impact: 'This public object name changes the registry credential authority; it does not contain credential bytes.', failure: 'Deployment stops at preflight or pods report `ImagePullBackOff`.' }),
  PRISM_E2E_RUN_FAILURES: environmentContract({ purpose: 'Adds the destructive/negative Prism production-failure exercise after the main end-to-end run.', acceptedForm: 'Only exact `true` enables the failure exercise.', defaultBehavior: 'Uses `false`.', emptyBehavior: 'An empty value is absent and selects `false`.', invalidBehavior: 'Any value other than exact `true` leaves the additional exercise disabled.', precedence: 'A non-empty process value wins; otherwise failure injection remains off.', impact: 'When enabled, the command deliberately exercises failure paths after the success journey.', failure: 'A failed negative exercise makes the end-to-end command fail and retain its evidence.' }),
  PRISM_E2E_USE_LEASE: environmentContract({ purpose: 'Selects whether the Prism end-to-end command requests an isolated Buster namespace lease.', acceptedForm: 'Only exact `true` enables lease creation.', defaultBehavior: 'Uses `true`.', emptyBehavior: 'An empty value is absent and selects `true`.', invalidBehavior: 'Any value other than exact `true` runs in the configured Prism namespace without a lease.', precedence: 'A non-empty process value wins; otherwise isolation is enabled.', impact: 'Disabling it removes namespace isolation and makes the test operate on the configured Prism namespace.', failure: 'Lease creation or namespace preparation failure stops the test before Prism deployment.' }),
  PRISM_E2E_USER: environmentContract({ purpose: 'Supplies the Tailscale login identity used by the Prism end-to-end authorization journey.', acceptedForm: 'A non-empty Tailscale login identity accepted by the test policy.', defaultBehavior: 'No default.', emptyBehavior: 'An empty value stops the end-to-end command.', invalidBehavior: 'An identity that is not authorized by the selected policy makes the access checks fail.', precedence: 'The non-empty process value is written to the runner ConfigMap.', impact: 'This is an identity, not a secret. It selects the subject whose access is tested.', failure: 'The end-to-end job or authorization assertion fails.', required: 'required for Prism end-to-end' }),
  PRISM_HELM_TIMEOUT: environmentContract({ purpose: 'Limits each atomic Prism and Prism-agent Helm release operation.', acceptedForm: 'A Helm duration such as `45m`.', defaultBehavior: 'Uses `45m`.', emptyBehavior: 'An empty value is absent and selects `45m`.', invalidBehavior: 'Helm rejects an invalid duration or rolls back when the deadline expires.', precedence: 'A non-empty process value wins; otherwise the checked-in timeout applies.', impact: 'A longer value permits slower migrations and rollouts but delays rollback and reporting.', failure: 'The atomic release fails and rolls back; deployment diagnostics remain available.' }),
  PRISM_NAMESPACE: environmentContract({ purpose: 'Selects the Kubernetes namespace for Prism, Prism agent, their Secrets, and their acceptance checks.', acceptedForm: 'A valid Kubernetes namespace name.', defaultBehavior: 'Uses the effective primary `NAMESPACE`.', emptyBehavior: 'An empty value is absent and inherits `NAMESPACE`.', invalidBehavior: 'kubectl or Helm rejects an invalid namespace; a wrong valid namespace fails Secret and ownership checks.', precedence: 'A non-empty process value wins; otherwise the resolved primary namespace applies. The E2E lease path temporarily overrides it with the allocated namespace.', impact: 'Changing it redirects every Prism namespaced resource and trust binding.', failure: 'Preflight or deployment stops when required resources are absent from the selected namespace.' }),
  PRISM_ROLLOUT_TIMEOUT: environmentContract({ purpose: 'Limits Prism Kubernetes rollout and ready-pod waits after Helm succeeds.', acceptedForm: 'A kubectl duration such as `45m`.', defaultBehavior: 'Uses `45m`.', emptyBehavior: 'An empty value is absent and selects `45m`.', invalidBehavior: 'kubectl rejects an invalid duration or reports a rollout timeout.', precedence: 'A non-empty process value wins; otherwise the checked-in timeout applies.', impact: 'This changes the observation deadline, not the workload configuration.', failure: 'Deployment stops and reports the workload that did not become ready.' }),
  SPIFFE_HELM_REPO: environmentContract({ purpose: 'Selects the SPIFFE Helm repository URL registered for the SPIRE charts.', acceptedForm: 'An HTTPS Helm repository URL.', defaultBehavior: 'Uses `https://spiffe.github.io/helm-charts-hardened/`.', emptyBehavior: 'An empty value is absent and selects the checked-in URL.', invalidBehavior: 'Helm repository registration or chart lookup fails.', precedence: 'A non-empty process value wins; otherwise the checked-in upstream repository applies.', impact: 'Changing it changes where SPIRE chart metadata and packages are fetched.', failure: 'SPIRE installation stops before its releases are upgraded.' }),
  SPIRE_CHART_VERSION: environmentContract({ purpose: 'Pins the SPIRE server and agent Helm chart version.', acceptedForm: 'A chart version present in the selected SPIFFE repository.', defaultBehavior: 'Uses `0.30.0`.', emptyBehavior: 'An empty value is absent and selects the checked-in version.', invalidBehavior: 'Helm fails when the version does not exist or the chart is incompatible.', precedence: 'A non-empty process value wins; otherwise the checked-in pin applies.', impact: 'Changing it changes SPIRE control-plane and agent behavior and requires trust/readiness verification.', failure: 'The atomic Helm release fails or its rollout does not become ready.' }),
  SPIRE_CRDS_CHART_VERSION: environmentContract({ purpose: 'Pins the SPIRE CRD Helm chart version.', acceptedForm: 'A CRD chart version present in the selected SPIFFE repository.', defaultBehavior: 'Uses `0.6.0`.', emptyBehavior: 'An empty value is absent and selects the checked-in version.', invalidBehavior: 'Helm fails when the version does not exist or is incompatible.', precedence: 'A non-empty process value wins; otherwise the checked-in pin applies.', impact: 'Changing it changes cluster-scoped SPIRE API definitions and must remain compatible with the SPIRE chart.', failure: 'SPIRE installation stops before the main release is accepted.' }),
  TAILSCALE_HELM_REPO: environmentContract({ purpose: 'Represents a retired direct Tailscale Helm repository override.', acceptedForm: 'Leave unset or empty.', defaultBehavior: 'Empty; deployment uses the pinned chart lock in `versions.json`.', emptyBehavior: 'An empty value selects the pinned lock.', invalidBehavior: 'Any non-empty value stops deployment as superseded.', precedence: 'The pinned infrastructure-chart lock is authoritative; this variable cannot override it.', impact: 'The fail-closed rule prevents an arbitrary repository from replacing the locked Tailscale chart.', failure: 'Tailscale operator deployment stops with a superseded-setting error.' }),
  TAILSCALE_OAUTH_CLIENT_ID: environmentContract({ purpose: 'Optionally supplies the public client identity used to bootstrap the Tailscale operator OAuth Secret.', acceptedForm: 'A non-empty Tailscale OAuth client ID.', defaultBehavior: 'Empty; reuse an existing Secret or another secret-setup source.', emptyBehavior: 'An empty value supplies no bootstrap identity.', invalidBehavior: 'The helper does not validate the identity locally; the Tailscale operator reports rejected credentials.', precedence: 'An existing target Secret wins unless overwrite is enabled; the paired bootstrap environment values are used only when both are present.', impact: 'This identity is not secret, but it must be paired with the matching client secret.', failure: 'Secret creation is skipped or operator authentication fails.' }),
  TAILSCALE_OAUTH_CLIENT_SECRET: environmentContract({ purpose: 'Optionally supplies the confidential client secret used to bootstrap the Tailscale operator OAuth Secret.', acceptedForm: 'A non-empty secret value paired with `TAILSCALE_OAUTH_CLIENT_ID`.', defaultBehavior: 'Empty; reuse an existing Secret or another secret-setup source.', emptyBehavior: 'An empty value supplies no bootstrap credential.', invalidBehavior: 'The helper does not validate the credential locally; the Tailscale operator reports rejected credentials.', precedence: 'An existing target Secret wins unless overwrite is enabled; the paired bootstrap values are used only when both are present.', impact: 'The value is written to Kubernetes Secret data and must not be logged or published.', failure: 'Secret creation is skipped or operator authentication fails.' }),
  TAILSCALE_OAUTH_SECRET_NAME: environmentContract({ purpose: 'Selects the Kubernetes Secret object that holds the Tailscale operator OAuth client identity and secret.', acceptedForm: 'A valid Kubernetes Secret name in the effective Tailscale operator namespace.', defaultBehavior: 'Uses `operator-oauth`.', emptyBehavior: 'An empty value is absent and selects `operator-oauth`.', invalidBehavior: 'kubectl, Helm, or the Kubernetes API rejects an invalid object name; a valid but wrong name leaves the operator without its expected credentials.', precedence: 'A non-empty process value wins; otherwise setup and deployment both use `operator-oauth`.', impact: 'Changing the name changes which Secret setup creates or verifies and which Secret the operator release expects. This value names an object and does not contain credential payload.', failure: 'Secret verification or operator rollout fails, and Tailscale-backed ingress remains unavailable.' }),
  TAILSCALE_OPERATOR_ENABLED: environmentContract({ purpose: 'Enables Tailscale operator secret setup and installation.', acceptedForm: 'A boolean-like value accepted by `component_enabled`.', defaultBehavior: 'Uses `true`.', emptyBehavior: 'An empty value is absent and selects `true`.', invalidBehavior: 'An unrecognized value behaves as disabled because only normalized `true` enables the component.', precedence: 'A non-empty process value wins; otherwise Tailscale integration remains enabled.', impact: 'Disabling it removes the operator installation path and final-preview tailnet URL support.', failure: 'The script reports the skip; Tailscale-backed ingress and preview URLs remain unavailable.' }),
  TAILSCALE_OPERATOR_NAMESPACE: environmentContract({ purpose: 'Selects the Kubernetes namespace that owns the Tailscale operator release and its OAuth Secret.', acceptedForm: 'A valid Kubernetes namespace name.', defaultBehavior: 'Uses `tailscale`.', emptyBehavior: 'An empty value is absent and selects `tailscale`.', invalidBehavior: 'kubectl or Helm rejects an invalid namespace; a valid but wrong namespace separates setup, Secret, or release state from the intended operator.', precedence: 'A non-empty process value wins; otherwise setup and deployment both use `tailscale`.', impact: 'Changing the namespace changes the ownership boundary for the operator release, ServiceAccount, and OAuth Secret.', failure: 'Secret lookup, Helm release, or rollout verification fails; no Tailscale-backed ingress is accepted.' }),
  ARGOCD_HELM_REPO: environmentContract({ purpose: 'Selects the Helm repository URL registered under the local `argo` alias.', acceptedForm: 'An HTTPS Helm repository URL.', defaultBehavior: 'Uses `https://argoproj.github.io/argo-helm`.', emptyBehavior: 'An empty value is absent and selects the checked-in upstream URL.', invalidBehavior: 'Helm repository registration or chart lookup fails.', precedence: 'A non-empty process value wins; `--force-update` makes it replace an existing local alias.', impact: 'Changing it changes the source of the pinned Argo CD chart package.', failure: 'Argo CD installation stops before Helm upgrades the release.' }),
  ARGOCD_VALUES_FILE: environmentContract({ purpose: 'Selects the Helm values file for the Argo CD release.', acceptedForm: 'A readable YAML values file.', defaultBehavior: 'Uses `my-values/infra/argocd-values.yaml`.', emptyBehavior: 'An empty value is absent and selects the checked-in file.', invalidBehavior: 'Helm stops on a missing, unreadable, or invalid file.', precedence: 'A non-empty process path replaces the default values-file path; explicit `--set` and `--set-file` arguments in the script still win.', impact: 'Changing it changes the rendered Argo CD configuration.', failure: 'The Helm release fails and the ingress is not applied.' }),
  ARGOCD_TAILSCALE_INGRESS: environmentContract({ purpose: 'Selects the Kubernetes manifest applied for private Tailscale access to Argo CD.', acceptedForm: 'A readable Kubernetes YAML manifest.', defaultBehavior: 'Uses `my-values/infra/argocd-tailscale-ingress.yaml`.', emptyBehavior: 'An empty value is absent and selects the checked-in manifest.', invalidBehavior: 'kubectl rejects a missing or invalid manifest.', precedence: 'A non-empty process path replaces the checked-in ingress path.', impact: 'Changing it changes how Argo CD is exposed in the tailnet after the Helm release succeeds.', failure: 'Argo CD can be running while the private ingress apply fails.' }),
  CILIUM_K3S_READY: environmentContract({ purpose: 'Confirms that the operator completed the disruptive K3s host preflight for the initial Cilium cutover.', acceptedForm: 'Exactly `true`.', defaultBehavior: 'Uses `false`.', emptyBehavior: 'An empty value is absent and refuses the cutover.', invalidBehavior: 'Every value other than exact `true` stops the install path.', precedence: 'The process value is the only confirmation source; it is checked on every install attempt.', impact: 'This is an operator assertion, not an automated proof. It permits the script to inspect CRI state and start the same-CIDR cutover.', failure: 'The script exits before installing Cilium and leaves the existing network unchanged.' }),
  CILIUM_DATAPLANE_VERIFIED: environmentContract({ purpose: 'Confirms that pod recreation and dataplane connectivity checks completed before project policy migration.', acceptedForm: 'Exactly `true`.', defaultBehavior: 'Uses `false`.', emptyBehavior: 'An empty value is absent and refuses policy migration.', invalidBehavior: 'Every value other than exact `true` stops the migration.', precedence: 'The process value is the only confirmation source.', impact: 'This assertion permits the script to apply project Cilium policies over the cluster baseline.', failure: 'No project policy or legacy cleanup action runs.' }),
  CILIUM_TRAFFIC_VERIFIED: environmentContract({ purpose: 'Confirms that pipeline and negative traffic tests passed before legacy NetworkPolicy cleanup.', acceptedForm: 'Exactly `true`.', defaultBehavior: 'Uses `false`.', emptyBehavior: 'An empty value is absent and refuses cleanup.', invalidBehavior: 'Every value other than exact `true` stops the cleanup mode.', precedence: 'The process value is the only confirmation source.', impact: 'This assertion permits deletion of superseded static NetworkPolicy objects after the Cilium verifier passes.', failure: 'Legacy policies remain in place as a safety boundary.' }),
  KUBE_CONTEXT: environmentContract({ purpose: 'Selects the explicit Kubernetes context used by operator scripts that bind kubectl and Helm to a cluster.', acceptedForm: 'A non-empty context name present in the bound kubeconfig.', defaultBehavior: 'No default in scripts that require it.', emptyBehavior: 'An empty value is rejected before cluster mutation.', invalidBehavior: 'kubectl or Helm rejects a missing context; an existing but wrong context can target the wrong cluster.', precedence: 'The process value is passed explicitly as `--context` or `--kube-context`; it does not rely on the ambient current context.', impact: 'Changing it redirects every cluster read and write performed by the owning command.', failure: 'Unknown contexts stop the command; operators must separately verify the expected API server and cluster identity before mutation.', required: 'required for the listed operator scripts' }),
  KUBECLAW_ALLOW_LEGACY_REPO_SETUP: environmentContract({ purpose: 'Acknowledges the destructive breadth of the legacy one-time repository setup script.', acceptedForm: 'Exactly `1`.', defaultBehavior: 'Unset; the legacy script refuses to run.', emptyBehavior: 'An empty value refuses execution.', invalidBehavior: 'Every value other than exact `1` stops before Git changes.', precedence: 'The process value is the only acknowledgement source.', impact: 'When enabled, the script can run broad Git add, commit, remote replacement, branch rename, and push operations.', failure: 'Without the acknowledgement, no Git mutation occurs. With it, later Git command failures can leave a partial repository setup.' }),
  OPS_NAMESPACE: environmentContract({ purpose: 'Selects the Kubernetes namespace for the optional Ops analysis pod.', acceptedForm: 'A valid Kubernetes namespace name.', defaultBehavior: 'Uses `kubeclaw-ops`.', emptyBehavior: 'An empty value is absent and selects `kubeclaw-ops`.', invalidBehavior: 'kubectl or Helm rejects an invalid namespace.', precedence: 'A non-empty process value wins and is exported to the bootstrap helper.', impact: 'Changing it redirects Ops discovery, Secret creation, release resources, and follow-up commands.', failure: 'Deployment or later login/verify commands cannot find the intended Ops pod.' }),
  OPS_RELEASE: environmentContract({ purpose: 'Selects the Helm release name and resulting stateful Ops pod name.', acceptedForm: 'A valid Helm release name.', defaultBehavior: 'Uses `codex-ops`.', emptyBehavior: 'An empty value is absent and selects `codex-ops`.', invalidBehavior: 'Helm rejects an invalid name; a wrong valid name can create or target another release.', precedence: 'A non-empty process value wins and is exported to the bootstrap helper.', impact: 'The script derives the pod name as `<release>-0` for login, pairing, status, and verification.', failure: 'Follow-up commands fail or target the wrong valid release.' }),
  OPS_DISCOVERY_VALUES: environmentContract({ purpose: 'Supplies the explicit discovery JSON used by the non-mutating Ops render command.', acceptedForm: 'A readable JSON values file produced by an equivalent discovery step.', defaultBehavior: 'No default for `render`; live `deploy` runs discovery instead.', emptyBehavior: 'An empty value stops `render` before Helm rendering.', invalidBehavior: 'Copy, release rendering, or JSON consumption fails for a missing or malformed file.', precedence: 'The process file is authoritative only for `render`; `deploy` regenerates discovery from the bound cluster.', impact: 'Changing it changes the simulated discovered cluster scope rendered into the Ops chart.', failure: 'No rendered manifest is emitted.', required: 'required for `render`' }),
  OPS_POD_VALUES: environmentContract({ purpose: 'Adds an operator-owned Helm values overlay to the Ops release.', acceptedForm: 'A readable YAML values file.', defaultBehavior: 'Empty; only discovered and checked-in release values are used.', emptyBehavior: 'No operator overlay is appended.', invalidBehavior: 'Rendering or Helm fails for a missing or invalid file.', precedence: 'Discovered values load first, checked-in release values load second, and this non-empty overlay loads last before explicit image and feature overrides.', impact: 'Changing it can alter Ops permissions, mounts, resources, and runtime behavior.', failure: 'Pre-render validation or release upgrade fails.' }),
  OPS_CODEX_IMAGE: environmentContract({ purpose: 'Overrides the Codex container image in the Ops chart.', acceptedForm: 'An OCI image reference accepted by the container runtime.', defaultBehavior: 'Empty; the selected release values supply the image.', emptyBehavior: 'No image override is added.', invalidBehavior: 'Rendering can succeed, but an invalid or unavailable reference causes image-pull failure.', precedence: 'A non-empty process value becomes a final Helm `--set-string` override.', impact: 'Changing it changes the executable Codex environment in the Ops pod.', failure: 'The pod reports an image pull or startup failure.' }),
  OPS_MCP_IMAGE: environmentContract({ purpose: 'Overrides the MCP sidecar image in the Ops chart.', acceptedForm: 'An OCI image reference accepted by the container runtime.', defaultBehavior: 'Empty; the selected release values supply the image.', emptyBehavior: 'No image override is added.', invalidBehavior: 'Rendering can succeed, but an invalid or unavailable reference causes image-pull failure.', precedence: 'A non-empty process value becomes a final Helm `--set-string` override.', impact: 'Changing it changes the security and analysis service used by the Ops pod.', failure: 'The MCP sidecar reports an image pull or startup failure.' }),
  OPS_GITHUB_TOKEN_FILE: environmentContract({ purpose: 'Selects the local file whose confidential token is copied into the Ops GitHub Secret.', acceptedForm: 'A readable path to a file that contains the intended GitHub token.', defaultBehavior: 'Empty; no GitHub Secret override is requested.', emptyBehavior: 'The deployment does not enable the chart GitHub Secret binding.', invalidBehavior: 'The bootstrap helper fails when the file is missing, unreadable, or contains unusable credentials.', precedence: 'A non-empty path enables the fixed `codex-ops-github` Secret binding after discovery values and release values.', impact: 'The path is publishable; the file content is secret and grants the Ops pod GitHub access.', failure: 'Secret creation or GitHub authentication fails.' }),
  OPS_TAILSCALE_AUTHKEY_FILE: environmentContract({ purpose: 'Selects the local file whose confidential auth key enables Tailscale in the Ops pod.', acceptedForm: 'A readable path to a file that contains a valid Tailscale auth key.', defaultBehavior: 'Empty; Tailscale remains disabled in the Ops chart.', emptyBehavior: 'No Tailscale enable override is added.', invalidBehavior: 'The bootstrap helper or Tailscale sidecar rejects a missing, unreadable, expired, or invalid key.', precedence: 'A non-empty path adds the final `tailscale.enabled=true` Helm override and supplies Secret setup.', impact: 'The path is publishable; the file content is secret and joins the Ops pod to the tailnet.', failure: 'Secret creation or Tailscale authentication fails.' }),
})) ENVIRONMENT_CONTRACTS.set(name, contract);

function operatorEnvironmentFamilyContract(name) {
  const role = name.match(/^(NOVA|BUSTER|PRISM)_CODE_BUNDLE_(ARCHIVE_URL|EXPECTED_COMMIT|CONTRACT_VERSION|AUTH_SECRET|AUTH_SECRET_KEY)$/u);
  if (role) {
    const component = role[1].toLowerCase();
    const field = role[2];
    const definitions = {
      ARCHIVE_URL: environmentContract({ purpose: `Selects the published ${component} source-bundle archive instead of deriving its GitHub release URL.`, acceptedForm: 'An `https` archive URL accepted by the bundle init contract.', defaultBehavior: 'Empty; the deploy script derives a release URL when repository and expected commit are available.', emptyBehavior: 'An empty value requests URL derivation.', invalidBehavior: 'The code-bundle preflight rejects an unreachable archive, an unsafe scheme, or a receipt mismatch.', precedence: 'A non-empty environment URL wins; then selected values are checked; finally the script derives the GitHub release URL.', impact: `Changing it changes the exact ${component} code archive delivered to the init container.`, failure: 'Render or deploy stops before the workload accepts an unverified bundle.' }),
      EXPECTED_COMMIT: environmentContract({ purpose: `Pins the ${component} source commit that the code-bundle receipt must report.`, acceptedForm: 'The full source commit identifier expected by the bundle contract.', defaultBehavior: 'Empty; code deployment requires a value from the environment or selected values.', emptyBehavior: 'An empty value does not disable verification and causes code deploy to stop when no selected value supplies it.', invalidBehavior: 'A value that differs from the release receipt fails the bundle preflight.', precedence: 'A non-empty environment value wins; otherwise the selected release values supply the expected commit.', impact: `The value binds the ${component} runtime to one verified source revision.`, failure: 'The workload is not upgraded with the unverified bundle.' }),
      CONTRACT_VERSION: environmentContract({ purpose: `Selects the code-bundle manifest contract expected by the ${component} init path.`, acceptedForm: 'A supported bundle contract identifier; the current default is `v2`.', defaultBehavior: 'Uses `v2`.', emptyBehavior: 'An empty value is absent and selects `v2`.', invalidBehavior: 'The bundle preflight rejects an unsupported or mismatched contract.', precedence: 'A non-empty environment value wins; otherwise selected values and then `v2` apply.', impact: 'Changing it changes which manifest and receipt rules the downloaded archive must satisfy.', failure: 'Render or deployment stops before activating the bundle.' }),
      AUTH_SECRET: environmentContract({ purpose: `Names the Kubernetes Secret that supplies an optional bearer token for the private ${component} bundle archive.`, acceptedForm: 'A Kubernetes Secret name in the target namespace.', defaultBehavior: 'Empty; public archive access uses no auth Secret.', emptyBehavior: 'An empty value disables Secret-backed archive authentication.', invalidBehavior: 'An invalid or missing named Secret causes render, init, or archive download failure.', precedence: 'A non-empty environment value wins; otherwise selected values can name the Secret.', impact: 'This is a public object name, not credential payload. It changes which Secret the init container references.', failure: 'The workload cannot fetch a private bundle and does not become ready.' }),
      AUTH_SECRET_KEY: environmentContract({ purpose: `Names the key within the ${component} bundle authentication Secret.`, acceptedForm: 'A key present in the named Kubernetes Secret.', defaultBehavior: 'Uses `token`.', emptyBehavior: 'An empty value is absent and selects `token`.', invalidBehavior: 'A missing key causes the bundle init container to fail.', precedence: 'A non-empty environment value wins; otherwise selected values and then `token` apply.', impact: 'This is a public key name, not credential payload.', failure: 'The private bundle cannot be downloaded and the workload remains unready.' }),
    };
    return definitions[field];
  }
  const componentSwitch = name.match(/^KUBECLAW_DEPLOY_(POSTGRESQL|LITELLM|SPIRE|PRISM)$/u);
  if (componentSwitch) return environmentContract({ purpose: `Enables or skips ${componentSwitch[1]} in the deployment path.`, acceptedForm: 'A boolean-like value accepted by `component_enabled`: `1`, `true`, `yes`, `on`, or `enabled` enables it; `0`, `false`, `no`, `off`, or `disabled` disables it.', defaultBehavior: 'Uses `true`.', emptyBehavior: 'An empty value is absent and selects `true`.', invalidBehavior: 'Any unrecognized value behaves as disabled because `component_enabled` matches only normalized `true`.', precedence: 'A non-empty process value wins; otherwise the deploy script uses `true`.', impact: `Disabling the switch skips ${componentSwitch[1]} installation; dependent features can remain unavailable.`, failure: 'The script reports the skip. It does not prove that dependent workloads can operate without the component.' });
  const values = name.match(/^(NOVA|BUSTER|POSTGRESQL|REDIS|SPIRE|TAILSCALE)_VALUES_FILE$/u);
  if (values) return environmentContract({ purpose: `Selects the ${values[1].toLowerCase()} Helm values file or private overlay used by deployment.`, acceptedForm: 'A readable YAML file path.', defaultBehavior: name === 'NOVA_VALUES_FILE' || name === 'BUSTER_VALUES_FILE' ? 'Empty; no private overlay is added.' : 'Uses the checked-in infrastructure values file.', emptyBehavior: name === 'NOVA_VALUES_FILE' || name === 'BUSTER_VALUES_FILE' ? 'An empty value adds no private overlay.' : 'An empty value is absent and selects the checked-in file.', invalidBehavior: 'Deployment stops when a required file is missing, unreadable, or invalid YAML.', precedence: name === 'NOVA_VALUES_FILE' || name === 'BUSTER_VALUES_FILE' ? 'The selected release values form the base; this non-empty private file is appended as the later Helm values source.' : 'A non-empty process path replaces the default checked-in values-file path; later Helm command-line overrides still win.', impact: 'Changing the file changes the rendered release configuration and therefore requires a fresh render and readiness check.', failure: 'Preflight, Helm rendering, or the atomic release fails before the new configuration is accepted.' });
  const release = name.match(/^(POSTGRESQL|REDIS|PRISM|TAILSCALE_OPERATOR)_RELEASE$/u);
  if (release) return environmentContract({ purpose: `Selects the Helm release name for ${release[1].toLowerCase()}.`, acceptedForm: 'A valid Helm release name that matches the intended existing or new release.', defaultBehavior: `Uses \`${release[1] === 'TAILSCALE_OPERATOR' ? 'tailscale-operator' : release[1].toLowerCase()}\`.`, emptyBehavior: 'An empty value is absent and selects the default.', invalidBehavior: 'Helm rejects an invalid name; selecting the wrong valid name can create a second release instead of upgrading the intended one.', precedence: 'A non-empty process value wins; otherwise the deploy script uses its checked-in release name.', impact: 'The name is part of stateful-release ownership and uninstall targeting.', failure: 'Preflight or Helm stops; an incorrectly selected valid name requires operator reconciliation.' });
  const compatibilityImage = name.match(/^(GENERAL|NAMESPACE_CONTROLLER)_IMAGE_(REPOSITORY|TAG)$/u);
  if (compatibilityImage) {
    const currentName = compatibilityImage[1] === 'GENERAL' ? `NOVA_IMAGE_${compatibilityImage[2]}` : `BUSTER_CONTROLLER_IMAGE_${compatibilityImage[2]}`;
    const kind = compatibilityImage[2];
    return environmentContract({ purpose: `Supplies the compatibility fallback for \`${currentName}\` when the current image override is empty.`, acceptedForm: kind === 'TAG' ? 'An image tag accepted by the container runtime.' : 'An OCI repository without an embedded credential.', defaultBehavior: 'Empty; the selected Helm values remain authoritative.', emptyBehavior: 'An empty value adds no compatibility override.', invalidBehavior: 'Helm or the container runtime rejects an invalid or unavailable effective image reference.', precedence: `A non-empty \`${currentName}\` wins, then this compatibility value, then the selected Helm values.`, impact: `Changing it changes the effective image only while \`${currentName}\` is empty.`, failure: 'Render, image pull, or rollout fails; the atomic Helm operation rolls back when applicable.' });
  }
  const image = name.match(/^(NOVA|BUSTER_GATEWAY|BUSTER_CONTROLLER|PRISM_(?:CONTROL|STUDIO|WORKER|INGESTION))_IMAGE_(REPOSITORY|TAG|DIGEST)$/u);
  if (image) {
    const kind = image[2];
    const compatibilityFallback = /^(?:NOVA|BUSTER_CONTROLLER)$/u.test(image[1]) && kind !== 'DIGEST';
    const fallbackName = image[1] === 'NOVA' ? `GENERAL_IMAGE_${kind}` : `NAMESPACE_CONTROLLER_IMAGE_${kind}`;
    return environmentContract({ purpose: `Overrides the selected ${image[1].toLowerCase().replaceAll('_', ' ')} container image ${kind.toLowerCase()}.`, acceptedForm: kind === 'DIGEST' ? 'A lowercase `sha256:` digest with 64 hexadecimal digits.' : kind === 'TAG' ? 'An image tag accepted by the container runtime.' : 'An OCI repository without an embedded credential.', defaultBehavior: compatibilityFallback ? `Uses \`${fallbackName}\` when that compatibility value is non-empty; otherwise selected values remain authoritative.` : 'Empty; checked-in selected values remain authoritative.', emptyBehavior: compatibilityFallback ? `An empty value selects \`${fallbackName}\` when it is non-empty, then falls back to selected values.` : 'An empty value does not add an override.', invalidBehavior: kind === 'DIGEST' ? 'Prism deployment rejects a missing or invalid effective digest.' : 'Helm or the container runtime rejects an invalid or unavailable image reference.', precedence: compatibilityFallback ? `This non-empty value wins, then \`${fallbackName}\`, then the selected Helm values.` : 'A non-empty environment override wins over the selected values for this image field.', impact: 'Changing it changes executable workload content and requires receipt, pull, and rollout verification.', failure: 'Render, image pull, or rollout fails; atomic Helm operations roll back when applicable.' });
  }
  const preflightImage = name.match(/^KUBECLAW_(KUBERNETES|HTTP|API|A11Y|LIGHTHOUSE|VISUAL|E2E|SECURITY|TAILSCALE|PRODUCTION)_PREFLIGHT_IMAGE$/u);
  if (preflightImage) return environmentContract({ purpose: `Selects the digest-pinned workload image for the ${preflightImage[1].toLowerCase()} production preflight.`, acceptedForm: 'An OCI image reference pinned with a `sha256` digest.', defaultBehavior: 'Empty; the command requires an explicit argument or this environment value.', emptyBehavior: 'An empty value provides no fallback.', invalidBehavior: 'The preflight rejects a missing, mutable, malformed, or unavailable image.', precedence: 'Command argument 2 wins; this environment value is the fallback.', impact: 'The image is the exact test workload whose behavior and receipt are evaluated.', failure: 'The preflight stops and does not issue a successful production receipt.' });
  const expectedText = name.match(/^KUBECLAW_(HTTP|TAILSCALE)_PREFLIGHT_EXPECTED_TEXT$/u);
  if (expectedText) return environmentContract({ purpose: `Optionally requires the ${expectedText[1].toLowerCase()} preflight response body to contain an exact text fragment.`, acceptedForm: 'A non-empty UTF-8 text fragment.', defaultBehavior: 'Empty; no extra body-fragment assertion is sent.', emptyBehavior: 'An empty value disables this additional assertion.', invalidBehavior: 'The preflight fails when the response does not contain the supplied fragment.', precedence: 'The process value is forwarded to the test command when non-empty.', impact: 'This narrows success from reachability to reachability plus expected content.', failure: 'The preflight receipt reports failure and deployment acceptance stops.' });
  const notifyContracts = {
    OPENCLAW_NOTIFY_CHANNEL: environmentContract({ purpose: 'Selects the OpenClaw channel adapter used for the required terminal-state message.', acceptedForm: 'An OpenClaw channel name accepted by `openclaw message send`.', defaultBehavior: 'Uses `discord`.', emptyBehavior: 'An empty value is absent and selects `discord`.', invalidBehavior: 'OpenClaw rejects an unknown channel and the required notification fails.', precedence: 'A non-empty process value wins; otherwise `discord` applies. Agent reply channel inherits the effective value unless explicitly overridden.', impact: 'Changing it redirects the required channel delivery and default agent reply delivery.', failure: 'The notifier exits 1 when a required delivery attempt fails.' }),
    OPENCLAW_NOTIFY_TARGET: environmentContract({ purpose: 'Selects the destination identifier for the required OpenClaw channel message.', acceptedForm: 'A destination string accepted by the selected OpenClaw channel.', defaultBehavior: 'Empty; another delivery route can satisfy the notifier precondition.', emptyBehavior: 'No channel message is attempted when empty.', invalidBehavior: 'OpenClaw rejects an unknown or unauthorized destination.', precedence: 'The process value is used directly and becomes the default agent reply target.', impact: 'A non-empty value makes channel delivery required for notifier success.', failure: 'The notifier exits 1 when the required message lacks a successful message ID.' }),
    OPENCLAW_NOTIFY_SESSION_KEY: environmentContract({ purpose: 'Selects an OpenClaw system-event session that receives a supplemental pipeline event.', acceptedForm: 'An OpenClaw session key.', defaultBehavior: 'Empty; no supplemental system event is sent.', emptyBehavior: 'The system-event route is disabled.', invalidBehavior: 'OpenClaw rejects an unknown session; the attempt is reported as failed.', precedence: 'The process value is used directly.', impact: 'This route is supplemental when another required route exists; by itself, its success determines the notifier result.', failure: 'The notifier exits 1 when it is the only attempted route and delivery fails.' }),
    OPENCLAW_NOTIFY_SESSION_MODE: environmentContract({ purpose: 'Selects the scheduling mode for the supplemental OpenClaw system event.', acceptedForm: 'A mode accepted by `openclaw system event --mode`.', defaultBehavior: 'Uses `now`.', emptyBehavior: 'An empty value is absent and selects `now`.', invalidBehavior: 'OpenClaw rejects the mode and the session-event attempt fails.', precedence: 'A non-empty process value wins; otherwise `now` applies.', impact: 'The mode changes when the selected session processes the event.', failure: 'The notifier reports the failed supplemental route and can exit 1 if no required route succeeds.' }),
    OPENCLAW_NOTIFY_ACCOUNT: environmentContract({ purpose: 'Selects the OpenClaw account used for the required channel message.', acceptedForm: 'An account name configured in OpenClaw.', defaultBehavior: 'Uses `default`.', emptyBehavior: 'An empty value is absent and selects `default`.', invalidBehavior: 'OpenClaw rejects an unknown or unauthorized account.', precedence: 'A non-empty process value wins; otherwise `default` applies. Agent reply account inherits it unless explicitly overridden.', impact: 'Changing it changes the sending identity and credential authority.', failure: 'The required delivery fails and the notifier exits 1.' }),
    OPENCLAW_NOTIFY_SILENT: environmentContract({ purpose: 'Requests silent delivery for the required channel message.', acceptedForm: 'Only exact `1` enables the OpenClaw `--silent` flag.', defaultBehavior: 'Uses `0`.', emptyBehavior: 'An empty value is absent and selects `0`.', invalidBehavior: 'Any value other than exact `1` sends without the silent flag.', precedence: 'A non-empty process value wins; otherwise normal notification applies.', impact: 'This changes recipient notification behavior, not message content or delivery requirements.', failure: 'Unsupported silence behavior is reported by the selected channel adapter.' }),
    OPENCLAW_NOTIFY_AGENT_ID: environmentContract({ purpose: 'Selects the OpenClaw agent awakened for configured terminal pipeline states.', acceptedForm: 'An installed OpenClaw agent identifier.', defaultBehavior: 'Uses `main`.', emptyBehavior: 'An empty value is absent and selects `main`.', invalidBehavior: 'OpenClaw rejects an unknown agent.', precedence: 'A non-empty process value wins; otherwise `main` applies.', impact: 'Changing it changes which agent receives the pipeline context and continuation request.', failure: 'The required agent wake fails and the notifier exits 1.' }),
    OPENCLAW_NOTIFY_AGENT_SESSION_KEY: environmentContract({ purpose: 'Selects the OpenClaw agent session awakened for matching terminal statuses.', acceptedForm: 'A non-empty OpenClaw agent session key.', defaultBehavior: 'Empty; no agent wake is attempted.', emptyBehavior: 'The agent route is disabled.', invalidBehavior: 'OpenClaw rejects an unknown session key.', precedence: 'The process value is used directly.', impact: 'When non-empty and the status policy matches, agent wake becomes a required delivery.', failure: 'The notifier exits 1 when the required agent call does not return a JSON object.' }),
    OPENCLAW_NOTIFY_AGENT_ON_STATUSES: environmentContract({ purpose: 'Selects the pipeline status values that can trigger an OpenClaw agent wake.', acceptedForm: 'A comma-separated list compared case-insensitively after trimming; for example `failed,complete`.', defaultBehavior: 'Uses `failed`.', emptyBehavior: 'An empty list matches no status.', invalidBehavior: 'Unknown tokens never match and therefore do not trigger the agent route.', precedence: 'The process value is used directly; the pipeline level is compared with each normalized token.', impact: 'Adding a status can wake the agent for non-failure terminal messages.', failure: 'A nonmatching policy silently skips the agent route; other configured routes still determine success.' }),
    OPENCLAW_NOTIFY_AGENT_TIMEOUT_SECONDS: environmentContract({ purpose: 'Limits the OpenClaw agent command execution time.', acceptedForm: 'A seconds value accepted by `openclaw agent --timeout`.', defaultBehavior: 'Uses `180` seconds.', emptyBehavior: 'An empty value is absent and selects `180`.', invalidBehavior: 'OpenClaw rejects an invalid timeout or the call fails when the limit expires.', precedence: 'A non-empty process value wins; otherwise 180 seconds applies.', impact: 'A shorter value bounds wake latency but can stop a slow agent response.', failure: 'The required agent route fails and the notifier exits 1.' }),
    OPENCLAW_NOTIFY_AGENT_DELIVER: environmentContract({ purpose: 'Controls whether the awakened agent also sends its reply through a channel.', acceptedForm: 'Only exact `1` enables `--deliver`.', defaultBehavior: 'Uses `1`.', emptyBehavior: 'An empty value is absent and selects `1`.', invalidBehavior: 'Any value other than exact `1` disables reply delivery while retaining the agent call.', precedence: 'A non-empty process value wins; otherwise reply delivery is enabled.', impact: 'Disabling it keeps the agent result in the session and sends no channel reply.', failure: 'When enabled, invalid reply routing can make the agent command fail.' }),
    OPENCLAW_NOTIFY_AGENT_REPLY_CHANNEL: environmentContract({ purpose: 'Selects the channel used for an awakened agent reply.', acceptedForm: 'An OpenClaw channel name.', defaultBehavior: 'Inherits `OPENCLAW_NOTIFY_CHANNEL`.', emptyBehavior: 'An explicitly empty value disables reply delivery because a reply target cannot be completed.', invalidBehavior: 'OpenClaw rejects an unknown channel.', precedence: 'An explicit non-empty process value wins; otherwise the effective notification channel applies.', impact: 'Changing it separates agent replies from the primary notification channel.', failure: 'The agent delivery route fails when the selected adapter is invalid or unavailable.' }),
    OPENCLAW_NOTIFY_AGENT_REPLY_TARGET: environmentContract({ purpose: 'Selects the destination for an awakened agent reply.', acceptedForm: 'A target accepted by the reply channel.', defaultBehavior: 'Inherits `OPENCLAW_NOTIFY_TARGET`.', emptyBehavior: 'No `--deliver` arguments are added when the effective target is empty.', invalidBehavior: 'OpenClaw rejects an unknown or unauthorized target.', precedence: 'An explicit non-empty process value wins; otherwise the primary notification target applies.', impact: 'Changing it redirects only the agent reply.', failure: 'The agent delivery route fails when enabled with an invalid target.' }),
    OPENCLAW_NOTIFY_AGENT_REPLY_ACCOUNT: environmentContract({ purpose: 'Selects the OpenClaw account used to deliver an awakened agent reply.', acceptedForm: 'An account name configured in OpenClaw.', defaultBehavior: 'Inherits `OPENCLAW_NOTIFY_ACCOUNT`.', emptyBehavior: 'An empty value is absent and inherits the primary account.', invalidBehavior: 'OpenClaw rejects an unknown or unauthorized account.', precedence: 'An explicit non-empty process value wins; otherwise the effective notification account applies.', impact: 'Changing it changes the reply sending identity.', failure: 'The agent delivery route fails when the account cannot send to the selected target.' }),
    PIPELINE_LIGHT_MESSAGE: environmentContract({ purpose: 'Supplies the human-readable pipeline status body sent through each selected route.', acceptedForm: 'A non-empty UTF-8 string.', defaultBehavior: 'No default.', emptyBehavior: 'An empty value stops the notifier with exit 2.', invalidBehavior: 'The script accepts arbitrary text and prefixes it with the selected level; downstream adapters can impose length limits.', precedence: 'The process value is the only message source.', impact: 'The same prefixed payload is used for session and channel delivery and embedded in the agent wake message.', failure: 'No delivery is attempted when the value is empty.', required: 'required' }),
    PIPELINE_LIGHT_LEVEL: environmentContract({ purpose: 'Labels the pipeline message and selects whether the agent status policy matches.', acceptedForm: 'A status token; the notifier lowercases and trims it only for policy comparison.', defaultBehavior: 'Uses `info`.', emptyBehavior: 'An empty value is absent and selects `info`.', invalidBehavior: 'Unknown text is still sent as a label but matches an agent route only when the policy contains the same normalized token.', precedence: 'A non-empty process value wins; otherwise `info` applies.', impact: 'The value appears in the message prefix and controls conditional agent wake.', failure: 'A typo can prevent the intended agent wake while channel/session delivery still occurs.' }),
    PIPELINE_LIGHT_STATUS_FILE: environmentContract({ purpose: 'Adds the pipeline status-file path to the awakened agent context.', acceptedForm: 'A filesystem path meaningful to the receiving agent.', defaultBehavior: 'Empty; the context omits the field.', emptyBehavior: 'No status-file line is added.', invalidBehavior: 'The notifier does not read or validate this path; an incorrect path gives the agent unusable context.', precedence: 'The process value is used directly when non-empty.', impact: 'It affects agent context only, not the primary notification payload.', failure: 'The agent can fail to inspect pipeline state, but message delivery itself can still succeed.' }),
    PIPELINE_LIGHT_WATCHDOG_LOG_FILE: environmentContract({ purpose: 'Adds the pipeline watchdog log path to the awakened agent context.', acceptedForm: 'A filesystem path meaningful to the receiving agent.', defaultBehavior: 'Empty; the context omits the field.', emptyBehavior: 'No watchdog-log line is added.', invalidBehavior: 'The notifier does not read or validate this path.', precedence: 'The process value is used directly when non-empty.', impact: 'It gives the agent a diagnostic location without attaching log contents.', failure: 'An incorrect path limits diagnosis but does not by itself fail delivery.' }),
    PIPELINE_LIGHT_RUN_PID: environmentContract({ purpose: 'Adds the watched pipeline process ID to the awakened agent context.', acceptedForm: 'A process identifier represented as text.', defaultBehavior: 'Empty; the context omits the field.', emptyBehavior: 'No process-ID line is added.', invalidBehavior: 'The notifier does not validate the PID; an invalid value gives the agent incorrect context.', precedence: 'The process value is used directly when non-empty.', impact: 'It helps the agent correlate the notification with a local run.', failure: 'An incorrect value limits diagnosis but does not by itself fail delivery.' }),
  };
  if (notifyContracts[name]) return notifyContracts[name];
  return null;
}

function environmentMeaning(name, consumers, surface) {
  const contract = ENVIRONMENT_CONTRACTS.get(name) ?? operatorEnvironmentFamilyContract(name);
  const consumer = consumers[0];
  if (contract) {
    assert(consumer, `environment contract ${name} has no source occurrence`);
    return { status: 'authored-source-backed-contract', text: contract.purpose, evidence: `${consumer.path}:${consumer.line}`, blockerOwner: null, closureCondition: null, contract };
  }
  if (surface === 'operator-authored-input') {
    return {
      status: 'operator-contract-blocker',
      text: `${consumer.path} reads ${name}, but the maintained catalog does not yet define its operator contract.`,
      evidence: `${consumer.path}:${consumer.line}`,
      blockerOwner: sourceOwner(consumer.path).component,
      closureCondition: `Add a source-backed ${name} purpose, accepted form, default and empty behavior, precedence, impact, and exact failure meaning.`,
    };
  }
  const injection = consumers.some((item) => item.access === 'kubernetes-env');
  return {
    status: 'classified-non-operator-boundary',
    text: injection
      ? `Checked-in deployment sources inject ${name}. Configure its declared producer or external authority; do not set this transport variable as an operator option from this reference.`
      : `A checked-in process reads ${name}, but this surface is ${surface} and is not a supported direct operator option. Use the owning runtime, CI, or maintainer interface.`,
    evidence: `${consumer.path}:${consumer.line}`,
    blockerOwner: null,
    closureCondition: null,
    contract: null,
  };
}

const OPERATOR_ENV_SOURCE_RULES = [
  /^scripts\/deploy\.sh$/u,
  /^scripts\/deploy-(?:argocd|cilium|ops-pod)\.sh$/u,
  /^scripts\/setup\.sh$/u,
  /^my-values\/setup-secrets\.sh$/u,
  /^scripts\/(?:postgresql-recovery|redis-prepare-migration|pipeline-light-[a-z0-9-]+|activate-native-worker-[a-z0-9-]+|repair-[a-z0-9-]+|migrate-[a-z0-9-]+|install-[a-z0-9-]+|rotate-[a-z0-9-]+|backup-[a-z0-9-]+|restore-[a-z0-9-]+)\.sh$/u,
];

function operatorEnvironmentSource(sourcePath) {
  return OPERATOR_ENV_SOURCE_RULES.some((rule) => rule.test(sourcePath));
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function redactValue(fieldPath, value) {
  let lastSegment;
  try {
    lastSegment = String(yamlFieldPathTokens(fieldPath)
      .filter((token) => typeof token === 'string')
      .at(-1) ?? fieldPath);
  }
  catch { lastSegment = fieldPath.split('.').at(-1)?.replace(/\[[0-9]+\]$/u, '') ?? fieldPath; }
  if (SENSITIVE_VALUE_NAME.test(lastSegment)) return '<redacted:sensitive-field>';
  if (typeof value === 'string') {
    if (value.length > 160) return `<redacted:long-string:${value.length}>`;
    if (/^(?:ghp_|github_pat_|sk-|tskey-|-----BEGIN )/.test(value)) return '<redacted:credential-shape>';
    if (/^[0-9]{15,20}$/.test(value)) return '<redacted:identity-number>';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return '<redacted:identity-email>';
    if (/^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(value)) return '<redacted:credential-url>';
  }
  return value;
}

function environmentDefaultIsSecretPayload(name) {
  if (/(?:_VERIFY_KEY|_PUBLIC_KEY|_TLS_CERT|_CA_FILE)$/u.test(name)) return false;
  if (/(?:_CLIENT_ID|_USER|_USERNAME|_ACCOUNT|_PRODUCER|_AUDIENCE|_ISSUER)$/u.test(name)) return false;
  if (['PGUSER', 'REDIS_USERNAME'].includes(name)) return false;
  if (/^(?:DISABLE_IMAGE_PULL_SECRETS|KUBECLAW_RUN_SECRET_SETUP|KUBECLAW_SECRET_SETUP_MODE|KUBECLAW_SECRETS_OVERWRITE|OPS_COPY_PULL_SECRET|BUSTER_SECRET_ROLE_NAME)$/u.test(name)) return false;
  if (/_AUTH_SECRET_KEY$/u.test(name)) return false;
  if (/(?:_AUTH_SECRET|_PREFLIGHT_SECRET|_SECRET_NAME)$/u.test(name)) return false;
  if (/(?:ALLOWED|SOURCE).*SECRETS?$/u.test(name)) return false;
  if (/SECRET.*(?:NAMESPACE|REF)$/u.test(name) || /CREDENTIAL_AUTHORITY_REF$/u.test(name)) return false;
  if (/_FILE$/u.test(name)) return false;
  return SENSITIVE_ENV_NAME.test(name);
}

function shellParameterValue(operator, name, rawValue) {
  if (!operator) return { role: 'none', display: '<none>' };
  if (operator.includes('?')) return { role: 'required-guard', display: '<no default; expansion stops when the requirement is not met>' };
  if (operator.includes('+')) {
    return {
      role: 'alternate',
      display: environmentDefaultIsSecretPayload(name) ? '<redacted:sensitive-field>' : redactValue('environment-value', rawValue),
    };
  }
  if (rawValue?.includes('${')) return { role: 'default', display: '<nested parameter expansion; see source>' };
  return {
    role: 'default',
    display: environmentDefaultIsSecretPayload(name) ? '<redacted:sensitive-field>' : redactValue('environment-value', rawValue),
  };
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableObject(item)]));
  }
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(stableObject(value), null, 2)}\n`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function priorInventory(name) {
  const target = path.join(outputDirectory, name);
  if (!fs.existsSync(target)) return null;
  try { return JSON.parse(fs.readFileSync(target, 'utf8')); } catch { return null; }
}

function yamlClass(relativePath) {
  if (/^charts\/[^/]+\/(?:ci-)?values\.ya?ml$/.test(relativePath)) return 'helm-values';
  if (relativePath.startsWith('gitops/platform/values/')) return 'gitops-values';
  if (relativePath.startsWith('gitops/')) return 'gitops-manifest';
  if (relativePath.startsWith('releases/values/')) return 'release-values';
  if (/^my-values\/[^/]+-values\.ya?ml$/.test(relativePath)) return 'helm-overlay';
  if (/^examples\/[^/]+-values\.ya?ml$/.test(relativePath)) return 'helm-example';
  if (relativePath.startsWith('my-values/')) return 'operator-values-or-manifest';
  return 'yaml-configuration';
}

function yamlSources() {
  const files = new Set();
  for (const sourceRoot of SOURCE_ROOTS) {
    for (const file of walk(sourceRoot, (absolutePath) => /\.ya?ml$/.test(absolutePath))) {
      if (file.startsWith('charts/') && !/(?:^|\/)(?:ci-)?values\.ya?ml$/.test(file)) continue;
      files.add(file);
    }
  }
  return [...files].sort();
}

function canonicalHelmPath(value) {
  return yamlFieldPathWithoutRoot(value, { arrayWildcard: true });
}

function helmValueLeafCatalog() {
  const result = new Map();
  const sourceChart = (sourcePath) => {
    if (sourcePath.startsWith('charts/')) return sourcePath.split('/').slice(0, 2).join('/');
    if (sourcePath === 'my-values/prism-values.yaml') return 'charts/prism';
    return 'charts/kubeclaw';
  };
  const visit = (value, tokens, leaves) => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, [...tokens, '[]'], leaves));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => {
        visit(item, [...tokens, key], leaves);
      });
      return;
    }
    if (tokens.length) leaves.add(yamlFieldPath(tokens, { root: false }));
  };
  for (const sourcePath of yamlSources().filter((item) => ['helm-values', 'helm-overlay', 'helm-example'].includes(yamlClass(item)))) {
    const chart = sourceChart(sourcePath);
    const leaves = result.get(chart) ?? new Set();
    for (const document of YAML.parseAllDocuments(read(sourcePath), { prettyErrors: false })) {
      if (!document.errors.length) visit(document.toJS(), [], leaves);
    }
    result.set(chart, leaves);
  }
  return result;
}

function helmActions(text) {
  return [...text.matchAll(/\{\{-?([\s\S]*?)-?\}\}/gu)].map((match) => {
    const expression = match[1].trim();
    const command = /^(else\s+if|define|if|with|range|else|end)\b/u.exec(expression)?.[1]?.replace(/\s+/gu, ' ') ?? 'expression';
    return { expression, command, index: match.index, end: match.index + match[0].length, line: lineAt(text, match.index) };
  });
}

function balancedHelmBody(actions, startIndex) {
  let depth = 1;
  for (let index = startIndex + 1; index < actions.length; index += 1) {
    if (['define', 'if', 'with', 'range'].includes(actions[index].command)) depth += 1;
    else if (actions[index].command === 'end') depth -= 1;
    if (depth === 0) return actions.slice(startIndex + 1, index);
  }
  throw new Error(`CONFIG_HELM_CONTROL_UNBALANCED: ${actions[startIndex].command} at line ${actions[startIndex].line}`);
}

function helmHelperDefinitions() {
  const definitions = new Map();
  for (const sourcePath of walk('charts', (absolutePath) => /\/templates\//u.test(absolutePath))) {
    const text = read(sourcePath);
    const actions = helmActions(text);
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      const name = action.command === 'define' ? /^define\s+"([^"]+)"/u.exec(action.expression)?.[1] : null;
      if (!name) continue;
      const body = balancedHelmBody(actions, index);
      const aliases = new Map();
      const accesses = [];
      for (const item of body) {
        const assignment = /^(\$[A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*(?:deepCopy\s+)?\.([A-Za-z_][A-Za-z0-9_.-]*)/u.exec(item.expression);
        if (assignment) aliases.set(assignment[1], assignment[2]);
        for (const relative of item.expression.matchAll(/(?:^|[\s(|,])\.([A-Za-z_][A-Za-z0-9_.-]*)/gu)) {
          if (/^(?:Values|Release|Chart|Capabilities|Template)(?:\.|$)/u.test(relative[1])) continue;
          accesses.push({ suffix: relative[1], path: sourcePath, line: item.line, expression: item.expression });
        }
        for (const [variable, base] of aliases) {
          const escaped = variable.replace(/\$/gu, '\\$');
          for (const relative of item.expression.matchAll(new RegExp(`${escaped}\\.([A-Za-z_][A-Za-z0-9_.-]*)`, 'gu'))) {
            accesses.push({ suffix: `${base}.${relative[1]}`, path: sourcePath, line: item.line, expression: item.expression });
          }
          if (new RegExp(`\\b(?:toYaml|toJson)\\s+${variable.replace(/\$/gu, '\\$')}\\b`, 'u').test(item.expression)) {
            accesses.push({ suffix: base, path: sourcePath, line: item.line, expression: item.expression, serialized: true });
          }
        }
      }
      definitions.set(name, { name, sourcePath, line: action.line, accesses });
    }
  }
  return definitions;
}

function chartConsumers() {
  const consumers = new Map();
  const leafCatalog = helmValueLeafCatalog();
  const helperDefinitions = helmHelperDefinitions();
  for (const file of walk('charts', (absolutePath) => /\/templates\//u.test(absolutePath) && !/\/NOTES\.txt$/u.test(absolutePath))) {
    const text = read(file);
    const lines = text.split('\n');
    const chart = file.split('/').slice(0, 2).join('/');
    const chartLeaves = leafCatalog.get(chart) ?? new Set();
    const actions = helmActions(text);
    const add = (valuePath, match, details = {}) => {
      const canonicalPath = canonicalHelmPath(valuePath);
      const key = `${chart}:${canonicalPath}`;
      const entries = consumers.get(key) ?? [];
      const consumerPath = details.consumerPath ?? file;
      const consumerText = consumerPath === file ? text : read(consumerPath);
      const consumerLines = consumerPath === file ? lines : consumerText.split('\n');
      const line = details.consumerLine ?? match.line ?? lineAt(text, match.index);
      const lineText = consumerLines[line - 1] ?? '';
      const nearby = consumerLines.slice(Math.max(0, line - 3), line + 2).join(' ');
      const entry = {
        path: consumerPath,
        line,
        kind: details.kind ?? 'helm-template',
        authority: `${chart} template`,
        templateExpression: lineText.trim().slice(0, 240),
        exactValuePath: canonicalPath,
        bindingKind: details.bindingKind ?? 'exact-leaf-access',
        bindingProof: details.bindingProof ?? `the expression reads .Values.${canonicalPath}`,
        helperCallProof: details.helperCallProof ?? null,
        requiredSignal: /\brequired\b|\bfail\b/u.test(lineText),
        conditionalSignal: /\{\{-?\s*(?:if|with)\b|\bdefault\b/u.test(nearby),
        constraints: [
          /\bregexMatch\b/u.test(lineText) ? 'template regexMatch validation' : null,
          /\brequired\b/u.test(lineText) ? 'Helm required expression' : null,
          /\bfail\b/u.test(lineText) ? 'Helm fail expression' : null,
        ].filter(Boolean),
      };
      if (!entries.some((current) => current.path === entry.path && current.line === entry.line
        && current.exactValuePath === entry.exactValuePath && current.bindingKind === entry.bindingKind)) entries.push(entry);
      consumers.set(key, entries);
    };
    const addExactOrSerialized = (basePath, match, expression) => {
      const base = canonicalHelmPath(basePath);
      if (chartLeaves.has(base)) add(base, match);
      if (/\b(?:toYaml|toJson|join)\b/u.test(expression)) {
        for (const leafPath of chartLeaves) if (leafPath.startsWith(`${base}.`) || leafPath.startsWith(`${base}[]`)) {
          add(leafPath, match, {
            bindingKind: 'serialized-subtree-leaf',
            bindingProof: `${expression.trim()} serializes ancestor ${base}; ${leafPath} is an exact checked-in descendant leaf`,
          });
        }
      }
    };
    const variableRoots = new Map();
    for (const action of actions) {
      for (const match of action.expression.matchAll(/(?:\$[A-Za-z_][A-Za-z0-9_]*\.)?Values((?:\.[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\])+)/gu)) {
        addExactOrSerialized(match[1].replace(/^\./u, ''), action, action.expression);
      }
      const assignment = /^(\$[A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*(?:\$[A-Za-z_][A-Za-z0-9_]*\.)?Values((?:\.[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\])+)/u.exec(action.expression);
      if (assignment) variableRoots.set(assignment[1], canonicalHelmPath(assignment[2].replace(/^\./u, '')));
      const derivedAssignment = /^(\$[A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*[\s\S]*?(\$[A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_.-]*))?/u.exec(action.expression);
      if (!assignment && derivedAssignment && variableRoots.has(derivedAssignment[2])) {
        variableRoots.set(derivedAssignment[1], `${variableRoots.get(derivedAssignment[2])}${derivedAssignment[3] ? `.${derivedAssignment[3]}` : ''}`);
      }
      for (const [variable, base] of variableRoots) {
        const escaped = variable.replace(/\$/gu, '\\$');
        for (const match of action.expression.matchAll(new RegExp(`${escaped}((?:\\.[A-Za-z_][A-Za-z0-9_-]*)+)`, 'gu'))) {
          const suffix = match[1].replace(/^\./u, '');
          const exact = `${base}.${suffix}`;
          if (chartLeaves.has(exact)) add(exact, action, {
            bindingKind: 'assigned-variable-leaf-access',
            bindingProof: `${variable} is bound to .Values.${base} and this expression reads ${variable}.${suffix}`,
          });
        }
      }
      for (const call of action.expression.matchAll(/(?:include|template)\s+"([^"]+)"\s+((?:\$[A-Za-z_][A-Za-z0-9_]*\.)?\.?Values(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\])+)/gu)) {
        const helper = helperDefinitions.get(call[1]);
        if (!helper) throw new Error(`CONFIG_HELM_HELPER_UNRESOLVED: ${file}:${action.line} ${call[1]}`);
        const base = canonicalHelmPath(call[2].replace(/^(?:\$[A-Za-z_][A-Za-z0-9_]*\.)?\.?Values\.?/u, ''));
        for (const access of helper.accesses) {
          const exact = `${base}.${access.suffix}`;
          if (!chartLeaves.has(exact)) continue;
          add(exact, action, {
            consumerPath: access.path,
            consumerLine: access.line,
            bindingKind: 'helper-body-leaf-access',
            bindingProof: `${file}:${action.line} passes .Values.${base} to helper ${helper.name}; ${access.path}:${access.line} reads exact relative leaf .${access.suffix}`,
            helperCallProof: { path: file, line: action.line, helper: helper.name, argumentPath: base, sourceLineSha256: sha256(lines[action.line - 1] ?? '') },
          });
        }
      }
    }
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
      const action = actions[actionIndex];
      if (!['range', 'with'].includes(action.command)) continue;
      const baseMatch = /(?:\$[A-Za-z_][A-Za-z0-9_]*\.)?Values((?:\.[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\])+)/u.exec(action.expression);
      if (!baseMatch) continue;
      const base = canonicalHelmPath(baseMatch[1].replace(/^\./u, ''));
      const body = balancedHelmBody(actions, actionIndex);
      const itemBase = action.command === 'range' ? `${base}[]` : base;
      let provedLeaf = false;
      for (const bodyAction of body) {
        for (const call of bodyAction.expression.matchAll(/(?:include|template)\s+"([^"]+)"\s+\(dict[\s\S]*?"([A-Za-z_][A-Za-z0-9_]*)"\s+\./gu)) {
          const helper = helperDefinitions.get(call[1]);
          if (!helper) continue;
          const argumentName = call[2];
          for (const access of helper.accesses) {
            if (access.suffix !== argumentName && !access.suffix.startsWith(`${argumentName}.`)) continue;
            const relative = access.suffix === argumentName ? '' : access.suffix.slice(argumentName.length + 1);
            const candidates = access.serialized && !relative
              ? [...chartLeaves].filter((leafPath) => leafPath.startsWith(`${itemBase}.`) || leafPath.startsWith(`${itemBase}[]`))
              : [`${itemBase}${relative ? `.${relative}` : ''}`];
            for (const exact of candidates) {
              if (!chartLeaves.has(exact)) continue;
              provedLeaf = true;
              add(exact, bodyAction, {
                consumerPath: access.path,
                consumerLine: access.line,
                bindingKind: `${action.command}-dict-helper-${access.serialized ? 'serialized-item-leaf' : 'item-leaf-access'}`,
                bindingProof: `${action.command} at ${file}:${action.line} binds . to ${itemBase}; ${file}:${bodyAction.line} passes it as dict key ${argumentName} to ${helper.name}; ${access.path}:${access.line} ${access.serialized ? 'serializes that exact item subtree' : `reads .${access.suffix}`}`,
                helperCallProof: { path: file, line: bodyAction.line, helper: helper.name, argumentPath: itemBase, sourceLineSha256: sha256(lines[bodyAction.line - 1] ?? '') },
              });
            }
          }
        }
        if (action.command === 'range' && /(?:^|[\s(,|])\.(?=$|[\s),|}])/u.test(bodyAction.expression)) {
          provedLeaf = true;
          add(itemBase, bodyAction, {
            bindingKind: 'range-scalar-item',
            bindingProof: `range at ${file}:${action.line} binds dot to scalar item ${itemBase}; the body passes that exact scalar item to its rendered receiver`,
          });
        }
        for (const relative of bodyAction.expression.matchAll(/(?:^|[\s(|,])\.([A-Za-z_][A-Za-z0-9_.-]*)/gu)) {
          const exact = `${itemBase}.${relative[1]}`;
          if (!chartLeaves.has(exact)) continue;
          provedLeaf = true;
          add(exact, bodyAction, {
            bindingKind: `${action.command}-item-leaf-access`,
            bindingProof: `${action.command} at ${file}:${action.line} binds . to ${itemBase}; the body reads exact leaf .${relative[1]}`,
          });
        }
        if (/\b(?:toYaml|toJson)\s+\./u.test(bodyAction.expression)) for (const leafPath of chartLeaves) {
          if (leafPath.startsWith(`${itemBase}.`) || leafPath.startsWith(`${itemBase}[]`)) {
            provedLeaf = true;
            add(leafPath, bodyAction, {
              bindingKind: `${action.command}-serialized-item-leaf`,
              bindingProof: `${action.command} at ${file}:${action.line} binds . to ${itemBase}; the body serializes that exact item subtree`,
            });
          }
        }
      }
      if (!provedLeaf && action.command === 'range') {
        const itemLeaves = [...chartLeaves].filter((leafPath) => leafPath === itemBase);
        for (const leafPath of itemLeaves) add(leafPath, action, {
          bindingKind: 'range-scalar-item',
          bindingProof: `range iterates scalar leaf ${itemBase}`,
        });
      }
    }
    const matchingLeaves = (pattern, suffix = '', descendants = false) => {
      const expected = yamlFieldPathTokens(`${pattern}${suffix ? `.${suffix}` : ''}`);
      const matches = (leafPath) => {
        const actual = yamlFieldPathTokens(leafPath);
        if (actual.length < expected.length || (!descendants && actual.length !== expected.length)) return false;
        return expected.every((token, index) => token === '*' ? typeof actual[index] === 'string' : token === actual[index]);
      };
      return [...chartLeaves].filter(matches);
    };
    const rangeEnd = (startIndex) => {
      let depth = 1;
      for (let index = startIndex + 1; index < actions.length; index += 1) {
        if (['define', 'if', 'with', 'range'].includes(actions[index].command)) depth += 1;
        else if (actions[index].command === 'end') depth -= 1;
        if (depth === 0) return index;
      }
      throw new Error(`CONFIG_HELM_CONTROL_UNBALANCED: range at ${file}:${actions[startIndex].line}`);
    };
    const resolveExpressionPattern = (expression, environment, dotPattern) => {
      const direct = /(?:\$[A-Za-z_][A-Za-z0-9_]*\.)?Values((?:\.[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\])+)/u.exec(expression);
      if (direct) return canonicalHelmPath(direct[1].replace(/^\./u, ''));
      const variable = [...expression.matchAll(/(\$[A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_.-]*))?/gu)]
        .find((candidate) => environment.has(candidate[1]) && environment.get(candidate[1]) !== '<map-key>');
      if (variable) return `${environment.get(variable[1])}${variable[2] ? `.${variable[2]}` : ''}`;
      const relative = /^\.([A-Za-z_][A-Za-z0-9_.-]*)/u.exec(expression.trim());
      if (relative && dotPattern) return `${dotPattern}.${relative[1]}`;
      return null;
    };
    const analyzeRange = (startIndex, parentEnvironment = new Map(), parentDot = null) => {
      const start = actions[startIndex];
      const header = /^range\s+(?:(\$[A-Za-z_][A-Za-z0-9_]*)\s*,\s*)?(\$[A-Za-z_][A-Za-z0-9_]*)\s*:=\s*([\s\S]+)$/u.exec(start.expression);
      const simpleSource = !header ? /^range\s+([\s\S]+)$/u.exec(start.expression)?.[1] : null;
      const sourceExpression = header?.[3] ?? simpleSource;
      if (!sourceExpression) return;
      const sourcePattern = resolveExpressionPattern(sourceExpression, parentEnvironment, parentDot);
      if (!sourcePattern) return;
      const arrayItems = [...chartLeaves].some((leafPath) => leafPath === `${sourcePattern}[]` || leafPath.startsWith(`${sourcePattern}[].`));
      const itemPattern = arrayItems ? `${sourcePattern}[]` : `${sourcePattern}.*`;
      const environment = new Map(parentEnvironment);
      if (header?.[1]) environment.set(header[1], '<map-key>');
      if (header?.[2]) environment.set(header[2], itemPattern);
      const dotPattern = header ? itemPattern : itemPattern;
      const endIndex = rangeEnd(startIndex);
      for (let index = startIndex + 1; index < endIndex; index += 1) {
        const item = actions[index];
        if (item.command === 'range') {
          analyzeRange(index, environment, dotPattern);
          index = rangeEnd(index);
          continue;
        }
        const alias = /^(\$[A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*([\s\S]+)$/u.exec(item.expression);
        if (alias) {
          const resolved = resolveExpressionPattern(alias[2], environment, dotPattern);
          if (resolved) environment.set(alias[1], resolved);
        }
        for (const [variable, pattern] of environment) {
          if (pattern === '<map-key>') continue;
          const escaped = variable.replace(/\$/gu, '\\$');
          const uses = [...item.expression.matchAll(new RegExp(`${escaped}(?:\\.([A-Za-z_][A-Za-z0-9_.-]*))?`, 'gu'))];
          for (const use of uses) {
            const suffix = use[1] ?? '';
            const descendants = /\b(?:dict|append|toYaml|toJson)\b/u.test(item.expression) && Boolean(suffix);
            for (const leafPath of matchingLeaves(pattern, suffix, descendants)) add(leafPath, item, {
              bindingKind: descendants ? 'range-derived-subtree-leaf' : 'range-variable-leaf-access',
              bindingProof: `balanced range at ${file}:${start.line} binds ${variable} to ${pattern}; ${file}:${item.line} reads ${variable}${suffix ? `.${suffix}` : ''}${descendants ? ' into a serialized or validated derived value' : ''}`,
            });
          }
        }
        for (const relative of item.expression.matchAll(/(?:^|[\s(|,])\.([A-Za-z_][A-Za-z0-9_.-]*)/gu)) {
          const descendants = /\b(?:dict|append|toYaml|toJson)\b/u.test(item.expression);
          for (const leafPath of matchingLeaves(dotPattern, relative[1], descendants)) add(leafPath, item, {
            bindingKind: descendants ? 'range-relative-subtree-leaf' : 'range-relative-leaf-access',
            bindingProof: `balanced range at ${file}:${start.line} binds dot to ${dotPattern}; ${file}:${item.line} reads .${relative[1]}`,
          });
        }
      }
    };
    actions.forEach((action, index) => {
      if (action.command === 'range') analyzeRange(index);
    });
    for (const range of text.matchAll(/range\s+\$([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*list\s+((?:"[^"]+"\s*)+)/gu)) {
      const variable = range[1];
      const names = [...range[2].matchAll(/"([^"]+)"/gu)].map((item) => item[1]);
      const dynamic = new RegExp(`\\(index\\s+\\$\\.Values\\s+\\$${variable}\\)\\.([A-Za-z_][A-Za-z0-9_.-]*)`, 'gu');
      for (const match of text.matchAll(dynamic)) {
        for (const name of names) {
          const valuePath = canonicalHelmPath(`${name}.${match[1]}`);
          const dynamicLine = lines[lineAt(text, match.index) - 1] ?? '';
          const targets = chartLeaves.has(valuePath) ? [valuePath]
            : /\b(?:toYaml|toJson)\b/u.test(dynamicLine)
              ? [...chartLeaves].filter((leafPath) => leafPath.startsWith(`${valuePath}.`) || leafPath.startsWith(`${valuePath}[]`)) : [];
          for (const target of targets) add(target, { index: match.index, line: lineAt(text, match.index) }, {
            kind: 'helm-template-dynamic-index',
            bindingKind: target === valuePath ? 'enumerated-index-leaf-access' : 'enumerated-index-serialized-subtree-leaf',
            bindingProof: `range enumerates ${names.join(', ')} and index $.Values $${variable} reads ${valuePath}${target === valuePath ? '' : ` before serializing exact descendant ${target}`}`,
          });
        }
      }
    }
    for (const assignment of text.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*index\s+\$?\.Values\.([A-Za-z_][A-Za-z0-9_.-]*)\s+\$([A-Za-z_][A-Za-z0-9_]*)/gu)) {
      const [variable, base, selector] = assignment.slice(1);
      const prefix = text.slice(0, assignment.index);
      const ranges = [...prefix.matchAll(new RegExp(`range\\s+\\$${selector}\\s*:=\\s*list\\s+((?:"[^"]+"\\s*)+)`, 'gu'))];
      const names = [...(ranges.at(-1)?.[1] ?? '').matchAll(/"([^"]+)"/gu)].map((item) => item[1]);
      const tail = text.slice(assignment.index + assignment[0].length);
      for (const use of tail.matchAll(new RegExp(`\\$${variable}\\.([A-Za-z_][A-Za-z0-9_.-]*)`, 'gu'))) {
        const useIndex = assignment.index + assignment[0].length + use.index;
        for (const name of names) {
          const exact = canonicalHelmPath(`${base}.${name}.${use[1]}`);
          if (chartLeaves.has(exact)) add(exact, { index: useIndex, line: lineAt(text, useIndex) }, {
            kind: 'helm-template-dynamic-index',
            bindingKind: 'indexed-variable-leaf-access',
            bindingProof: `${file}:${lineAt(text, assignment.index)} binds $${variable} to index $.Values.${base} $${selector}; this expression reads exact suffix ${use[1]}`,
          });
        }
      }
      for (const call of tail.matchAll(new RegExp(`(?:include|template)\\s+"([^"]+)"\\s+\\$${variable}\\b`, 'gu'))) {
        const helper = helperDefinitions.get(call[1]);
        if (!helper) continue;
        const callIndex = assignment.index + assignment[0].length + call.index;
        const callLine = lineAt(text, callIndex);
        for (const name of names) for (const access of helper.accesses) {
          const exact = canonicalHelmPath(`${base}.${name}.${access.suffix}`);
          if (!chartLeaves.has(exact)) continue;
          add(exact, { index: callIndex, line: callLine }, {
            consumerPath: access.path,
            consumerLine: access.line,
            bindingKind: 'indexed-helper-body-leaf-access',
            bindingProof: `${file}:${lineAt(text, assignment.index)} binds $${variable} to index $.Values.${base} $${selector}; ${file}:${callLine} passes it to ${helper.name}; helper body reads .${access.suffix}`,
            helperCallProof: { path: file, line: callLine, helper: helper.name, argumentPath: `${base}.${name}`, sourceLineSha256: sha256(lines[callLine - 1] ?? '') },
          });
        }
        break;
      }
    }
    for (const range of text.matchAll(/range\s+(?:\$[A-Za-z_][A-Za-z0-9_]*\s*,\s*)?(\$[A-Za-z_][A-Za-z0-9_]*)\s*:=\s*dict\s+([^}]*)/gu)) {
      const variable = range[1];
      const argumentsText = range[2];
      const bases = [];
      for (const value of argumentsText.matchAll(/"[^"]+"\s+((?:\$[A-Za-z_][A-Za-z0-9_]*\.)?\.?Values(?:\.[A-Za-z_][A-Za-z0-9_-]*)+|\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_.-]*)?)/gu)) {
        if (/(?:^|\.)Values\./u.test(value[1])) bases.push(canonicalHelmPath(value[1].replace(/^(?:\$[A-Za-z_][A-Za-z0-9_]*\.)?\.?Values\.?/u, '')));
        else {
          const variableMatch = /^(\$[A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_.-]*))?$/u.exec(value[1]);
          if (variableMatch && variableRoots.has(variableMatch[1])) bases.push(`${variableRoots.get(variableMatch[1])}${variableMatch[2] ? `.${variableMatch[2]}` : ''}`);
        }
      }
      const startAction = actions.findIndex((item) => item.index === range.index || (item.index <= range.index && item.end >= range.index));
      if (startAction < 0) continue;
      const body = balancedHelmBody(actions, startAction);
      for (const item of body) for (const access of item.expression.matchAll(new RegExp(`\\${variable}\\.([A-Za-z_][A-Za-z0-9_.-]*)`, 'gu'))) {
        for (const base of bases) {
          const exact = `${base}.${access[1]}`;
          if (!chartLeaves.has(exact)) continue;
          add(exact, item, {
            bindingKind: 'dict-range-leaf-access',
            bindingProof: `${file}:${lineAt(text, range.index)} binds ${variable} to one of ${bases.join(', ')}; ${file}:${item.line} reads exact suffix ${access[1]}`,
          });
        }
      }
    }
  }
  return consumers;
}

function externalChartProfileBindings() {
  const bindings = new Map();
  for (const sourcePath of walk('gitops/platform/bootstrap', (absolutePath) => /\.ya?ml$/u.test(absolutePath))) {
    const text = read(sourcePath);
    for (const document of YAML.parseAllDocuments(text, { prettyErrors: false })) {
      if (document.errors.length) continue;
      const value = document.toJS();
      if (value?.kind !== 'Application') continue;
      const sources = value.spec?.sources ?? (value.spec?.source ? [value.spec.source] : []);
      const chartSource = sources.find((source) => source?.chart);
      if (!chartSource) continue;
      const application = value.metadata?.name ?? '<unnamed>';
      const profilePath = `my-values/infra/${application}-values.yaml`;
      if (!exists(profilePath)) continue;
      bindings.set(profilePath, [{
        path: sourcePath,
        line: Math.max(1, lineAt(text, text.indexOf(`chart: ${chartSource.chart}`))),
        kind: 'external-chart-schema-unbound-profile',
        direction: 'schema-authority-only; not selected for runtime read',
        authority: `external chart schema ${chartSource.chart}@${chartSource.targetRevision ?? '<unversioned>'}; this profile is not the active Argo valueFiles binding`,
        application,
        chart: chartSource.chart,
        targetRevision: chartSource.targetRevision ?? '<unversioned>',
        inactiveProfile: true,
      }]);
    }
  }
  return bindings;
}

function runtimeFileBindings(sourcePath) {
  const exactReaders = new Map([
    ['my-values/infra/native-worker-pools.yaml', [
      { path: 'scripts/gitops.mjs', line: 171, kind: 'runtime-file-reader', direction: 'read', authority: 'preflightGitOps passes the selected policy file to loadNativeNodePolicy; the parser reads and validates it before native Prism selection' },
      { path: 'scripts/native-worker-node-policy.mjs', line: 36, kind: 'runtime-file-parser', direction: 'read', authority: 'loadNativeNodePolicy reads YAML bytes and calls validateNativeNodePolicy' },
    ]],
    ['my-values/infra/native-worker-pools-ax41.yaml', [
      { path: 'scripts/activate-native-worker-ax41.sh', line: 26, kind: 'runtime-file-reader-invocation', direction: 'read', authority: 'activation passes this exact profile to render-native-worker-node.mjs' },
      { path: 'scripts/render-native-worker-node.mjs', line: 69, kind: 'runtime-file-parser', direction: 'read', authority: 'the renderer calls loadNativeNodePolicy for its policy-file argument before it writes a new output bundle' },
      { path: 'scripts/native-worker-node-policy.mjs', line: 36, kind: 'runtime-file-parser', direction: 'read', authority: 'loadNativeNodePolicy reads YAML bytes and calls validateNativeNodePolicy' },
    ]],
    ['releases/values/ops.yaml', [
      { path: 'scripts/deploy-ops-pod.sh', line: 21, kind: 'helm-values-reader', direction: 'read', authority: 'the deploy command passes this exact file to Helm with -f after discovered values and before explicit --set-string overrides' },
      { path: 'scripts/updates/materialize-release.mjs', line: 38, kind: 'generated-file-producer', direction: 'write', authority: 'materialize-release writes codexImage and mcpImage from the verified ops release receipt; operators do not author this generated file' },
    ]],
    ['gitops/platform/values/codex-ops.yaml', [
      { path: 'scripts/argocd-self-management.mjs', line: 15, kind: 'runtime-file-reader', direction: 'read', authority: 'the Argo bootstrap generator parses this exact YAML file' },
      { path: 'scripts/argocd-self-management.mjs', line: 82, kind: 'argocd-values-object-producer', direction: 'write-derived', authority: 'the generator combines these values with immutable release images in the codex-ops Application valuesObject' },
    ]],
    ['my-values/infra/litellm-config.yaml', [
      { path: 'scripts/deploy.sh', line: 1175, kind: 'runtime-file-reader-invocation', direction: 'read', authority: 'deploy.sh passes this exact configuration to render-litellm-deployment.mjs' },
      { path: 'scripts/render-litellm-deployment.mjs', line: 10, kind: 'opaque-config-reader', direction: 'read', authority: 'the renderer reads the exact bytes, hashes them for rollout, and stores them as ConfigMap/litellm-config data' },
      { path: 'scripts/render-postgresql-recovery.mjs', line: 45, kind: 'credential-contract-reader', direction: 'read', authority: 'the recovery renderer validates the LiteLLM master-key authority from the same configuration file' },
    ]],
    ['my-values/infra/postgresql-recovery.yaml', [
      { path: 'scripts/deploy.sh', line: 1108, kind: 'runtime-file-reader-invocation', direction: 'read', authority: 'deploy.sh passes this exact recovery policy to render-postgresql-recovery.mjs before apply' },
      { path: 'scripts/render-postgresql-recovery.mjs', line: 101, kind: 'runtime-file-parser', direction: 'read', authority: 'the renderer parses and validates every policy field before it emits PVC, ConfigMap, CronJob, and verification resources' },
    ]],
  ]);
  if (exactReaders.has(sourcePath)) return exactReaders.get(sourcePath);
  const bindings = [];
  for (const candidate of runtimeTextSources()) {
    if (candidate === sourcePath) continue;
    if (/^(?:scripts\/(?:docs-|check-|test-|verify-|.*inventory|.*blueprint|.*publication|.*platform-surface)|skills\/.*\/tests?\/)/u.test(candidate)) continue;
    const text = read(candidate);
    let index = text.indexOf(sourcePath);
    let variable = null;
    if (index < 0 && candidate.endsWith('.sh')) {
      const basename = path.basename(sourcePath);
      const assignment = [...text.matchAll(/^\s*([A-Z][A-Z0-9_]*_(?:VALUES|CONFIG)_FILE)=(.*)$/gmu)]
        .find((item) => item[2].includes(basename));
      if (assignment) {
        variable = assignment[1];
        const downstream = text.slice((assignment.index ?? 0) + assignment[0].length);
        const use = new RegExp(`(?:--values|-f|infrastructure-release|stateful-release-preflight|deploy-|helm)[^\n]{0,240}\\$\\{?${variable}(?:\\}|\\b)`, 'u').exec(downstream);
        if (use) index = (assignment.index ?? 0) + assignment[0].length + (use.index ?? 0);
      }
    }
    if (index < 0) continue;
    bindings.push({ path: candidate, line: lineAt(text, index), kind: 'runtime-file-input', direction: 'read', authority: variable
      ? `${candidate} resolves ${sourcePath} as the default for ${variable} and passes that variable to its deploy path`
      : `${candidate} loads or passes the exact path ${sourcePath}` });
  }
  return bindings;
}

function gitOpsValueBindings() {
  const bindings = new Map();
  for (const sourcePath of walk('gitops', (absolutePath) => /\.ya?ml$/u.test(absolutePath))) {
    const text = read(sourcePath);
    for (const document of YAML.parseAllDocuments(text, { prettyErrors: false })) {
      if (document.errors.length) continue;
      const value = document.toJS();
      if (value?.kind !== 'Application') continue;
      const sources = value.spec?.sources ?? (value.spec?.source ? [value.spec.source] : []);
      for (const source of sources) {
        for (const authoredPath of source?.helm?.valueFiles ?? []) {
          const cleanPath = String(authoredPath).replace(/^\$values\//u, '');
          const needle = String(authoredPath);
          const index = text.indexOf(needle);
          const entries = bindings.get(cleanPath) ?? [];
          entries.push({
            path: sourcePath,
            line: index < 0 ? 1 : lineAt(text, index),
            kind: 'argocd-helm-values',
            direction: 'read',
            authority: `Argo CD Application ${value.metadata?.name ?? '<unnamed>'}; Helm chart ${source.chart ?? source.path ?? '<external>'}@${source.targetRevision ?? '<unversioned>'}`,
            application: value.metadata?.name ?? '<unnamed>',
            chart: source.chart ?? source.path ?? '<external>',
            targetRevision: source.targetRevision ?? '<unversioned>',
            repository: source.repoURL ?? '<unversioned-repository>',
          });
          bindings.set(cleanPath, entries);
        }
      }
    }
  }
  return bindings;
}

function directExternalChartBindings(sourcePath) {
  const versions = exists('versions.json') ? JSON.parse(read('versions.json')) : {};
  const definitions = {
    'my-values/infra/postgresql-values.yaml': {
      chart: 'postgresql', targetRevision: versions.infrastructureCharts?.postgresql?.version,
      repository: 'registry-1.docker.io/bitnamicharts', path: 'scripts/deploy.sh', line: 1153,
      authority: 'deploy.sh passes this exact values file to the digest-staged PostgreSQL chart selected by versions.json',
    },
    'my-values/infra/redis-values.yaml': {
      chart: 'redis', targetRevision: versions.infrastructureCharts?.redis?.version,
      repository: 'registry-1.docker.io/bitnamicharts', path: 'scripts/deploy.sh', line: 1144,
      authority: 'deploy.sh passes this exact values file to the digest-staged Redis chart selected by versions.json',
    },
    'my-values/infra/spire-values.yaml': {
      chart: 'spire', targetRevision: versions.platformCharts?.spire?.version,
      repository: 'https://spiffe.github.io/helm-charts-hardened/', path: 'scripts/deploy.sh', line: 1130,
      authority: 'deploy.sh passes this exact values file to the explicitly versioned SPIRE chart',
    },
    'my-values/infra/tailscale-operator-values.yaml': {
      chart: 'tailscale-operator', targetRevision: versions.infrastructureCharts?.tailscale?.version,
      repository: 'https://pkgs.tailscale.com/helmcharts', path: 'scripts/deploy.sh', line: 1045,
      authority: 'deploy.sh passes this exact values file to the digest-staged Tailscale operator chart selected by versions.json',
    },
  };
  const binding = definitions[sourcePath];
  if (!binding) return [];
  assert(binding.targetRevision, `direct external chart binding has no pinned version: ${sourcePath}`);
  return [{ ...binding, kind: 'operator-helm-values', direction: 'read', application: path.basename(sourcePath, path.extname(sourcePath)) }];
}

let renderProfileCache = null;
function discoveredRenderProfiles() {
  if (renderProfileCache) return renderProfileCache;
  const profiles = new Map();
  for (const authorityPath of ['scripts/docs-platform-surface-inventory.mjs', 'scripts/platform-surface-source-discovery.mjs', 'scripts/check-cni-portability.mjs']) {
    if (!exists(authorityPath)) continue;
    const text = read(authorityPath);
    for (const match of text.matchAll(/(?:render|helm)\([^\n]{0,120}?['"](charts\/[a-z0-9-]+)['"][\s\S]{0,240}?\[\s*['"](my-values\/[a-z0-9_./-]+-values\.yaml)['"]/gu)) {
      profiles.set(match[2], { chartRoot: match[1], evidence: `${authorityPath}:${lineAt(text, match.index)}` });
    }
  }
  renderProfileCache = profiles;
  return profiles;
}

function localHelmBinding(sourcePath) {
  if (sourcePath.startsWith('charts/')) return { chartRoot: sourcePath.split('/').slice(0, 2).join('/'), evidence: sourcePath };
  if (sourcePath === 'gitops/platform/values/codex-ops.yaml') {
    return {
      chartRoot: 'charts/ops-pod',
      evidence: 'scripts/argocd-self-management.mjs:79-82 valuesObject forwarding to the local Ops chart',
    };
  }
  if (['examples/nova-values.yaml', 'examples/buster-values.yaml'].includes(sourcePath)) {
    return { chartRoot: 'charts/kubeclaw', evidence: `${sourcePath}: deploy command in the file header` };
  }
  const discoveredProfile = discoveredRenderProfiles().get(sourcePath);
  if (discoveredProfile) return discoveredProfile;
  const quotedVariants = [sourcePath];
  for (const candidate of runtimeTextSources()) {
    if (candidate === sourcePath) continue;
    if (/^(?:scripts\/(?:docs-|check-|test-|verify-|.*inventory|.*blueprint|.*publication|.*platform-surface)|skills\/.*\/tests?\/)/u.test(candidate)) continue;
    const text = read(candidate);
    if (!quotedVariants.some((needle) => text.includes(needle))) continue;
    for (const needle of quotedVariants) {
      const index = text.indexOf(needle);
      if (index < 0) continue;
      const nearby = text.slice(Math.max(0, index - 700), index + needle.length + 700);
      const sourceLine = text.split('\n')[lineAt(text, index) - 1] ?? '';
      const sameLineChart = sourceLine.match(/charts\/[a-z0-9-]+/u)?.[0];
      const nearbyNeedleIndex = nearby.indexOf(needle);
      const chartMatches = [...nearby.matchAll(/charts\/[a-z0-9-]+/gu)];
      const nearestChart = chartMatches.sort((left, right) => Math.abs((left.index ?? 0) - nearbyNeedleIndex) - Math.abs((right.index ?? 0) - nearbyNeedleIndex))[0]?.[0];
      const chart = sameLineChart ?? nearestChart;
      if (chart) return { chartRoot: chart, evidence: candidate };
      const invocation = nearby.match(/helm\s+upgrade(?:\s+--install)?\s+[^\s\\]+\s+([^\s\\]+)[\s\S]*?(?:--values|-f)\s+[^\n]*$/mu);
      if (invocation && !invocation[1].startsWith('$')) {
        const version = nearby.match(/--version\s+([^\s\\]+)/u)?.[1] ?? '<version supplied by Helm source>';
        const repositoryAlias = invocation[1].split('/')[0];
        const repositoryPattern = new RegExp(`helm\\s+repo\\s+add\\s+${repositoryAlias.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s+([^\\s\\\\]+)`, 'u');
        const repository = repositoryPattern.exec(text)?.[1] ?? '<unversioned-repository>';
        return {
          chartRoot: null,
          evidence: candidate,
          externalBinding: {
            path: candidate,
            line: lineAt(text, index),
            kind: 'operator-helm-values',
            direction: 'read',
            authority: `operator Helm invocation for ${invocation[1]}@${version}`,
            application: path.basename(candidate),
            chart: invocation[1],
            targetRevision: version,
            repository,
          },
        };
      }
    }
  }
  return null;
}

function sourceOwner(sourcePath) {
  const cleanPath = sourcePath.split('#')[0];
  const chart = cleanPath.match(/^(charts\/[^/]+)/)?.[1];
  if (chart) return { component: `Helm chart ${chart}`, evidence: `${chart}/Chart.yaml` };
  if (cleanPath.startsWith('gitops/')) return { component: 'GitOps platform configuration', evidence: cleanPath };
  if (cleanPath.startsWith('my-values/')) return { component: 'maintained deployment profile', evidence: cleanPath };
  if (cleanPath.startsWith('releases/')) return { component: 'release configuration', evidence: cleanPath };
  if (cleanPath.startsWith('scripts/')) return { component: `operator script ${cleanPath}`, evidence: cleanPath };
  const packageOwner = nearestPackage(cleanPath);
  if (packageOwner) return { component: packageOwner.name, evidence: packageOwner.path };
  return { component: cleanPath.split('/')[0] || 'unknown', evidence: cleanPath };
}

function deploymentFieldBoundary(resource, exactPath) {
  if (['ConfigMap', 'Secret'].includes(resource.kind) && /^(?:data|stringData)\./u.test(exactPath)) {
    return { kind: 'opaque-object-payload', owner: `the workload that reads ${resource.kind}/${resource.name}` };
  }
  if (resource.kind === 'Application' && /^spec\.sources?(?:\[\])?\.helm\.(?:valuesObject|values)(?:\.|$)/u.test(exactPath)) {
    return { kind: 'embedded-helm-payload', owner: 'Argo CD Helm rendering and the selected chart' };
  }
  if (/^metadata\.annotations\./u.test(exactPath)) {
    return { kind: 'controller-annotation-payload', owner: 'the controller named by the annotation prefix' };
  }
  if (/(?:^|\.)containers\[\]\.(?:args|command)\[\]$/u.test(exactPath)
    || /(?:^|\.)containers\[\]\.env\[\]\.(?:name|value)$/u.test(exactPath)) {
    return { kind: 'workload-process-payload', owner: 'the selected container image and process entry point' };
  }
  return { kind: 'api-envelope', owner: null };
}

function embeddedPayloadConsumers(context, exactPath, boundary, valueType) {
  const exactLine = context.fieldLine ?? 1;
  const semanticPath = yamlFieldMatcherPath(exactPath);
  if (boundary.kind === 'embedded-helm-payload') {
    const suffix = canonicalHelmPath(exactPath.replace(/^spec\.sources?(?:\[[0-9]+\])?\.helm\.(?:valuesObject|values)\.?/u, ''));
    const sources = context.documentValue?.spec?.sources ?? (context.documentValue?.spec?.source ? [context.documentValue.spec.source] : []);
    const sourceMatch = /^spec\.sources\[([0-9]+)\]/u.exec(exactPath);
    const selected = sourceMatch ? sources[Number(sourceMatch[1])] : sources[0];
    const localChart = typeof selected?.path === 'string' && selected.path.startsWith('charts/') ? selected.path : null;
    if (localChart && suffix) {
      const matches = context.consumerMap.get(`${localChart}:${suffix}`) ?? [];
      if (matches.length) return matches.map((item) => ({ ...item, kind: 'embedded-helm-runtime-consumer', authority: `${localChart} exact template receiver` }));
    }
    if (valueType === 'object' || valueType === 'array') return [{
      path: context.sourcePath,
      line: exactLine,
      kind: 'structural-container',
      direction: 'none',
      authority: 'This mapping or list has no independent scalar contract. Its exact child leaf rows identify the selected chart receivers.',
    }];
    return [{
      path: selected?.chart === 'argo-cd' ? 'gitops/platform/bootstrap/argocd.yaml' : context.sourcePath,
      line: selected?.chart === 'argo-cd' ? 15 : exactLine,
      kind: selected?.chart === 'argo-cd' ? 'version-bound-external-controller-contract' : 'embedded-payload-consumer-unproved',
      direction: 'read',
      authority: selected?.chart === 'argo-cd'
        ? `Argo CD chart ${selected.targetRevision} installs this exact configs.cm key into the selected controller configuration`
        : `no exact checked-in template or content-addressed external chart receiver was found for ${suffix}`,
    }];
  }
  if (boundary.kind === 'controller-annotation-payload') {
    if (semanticPath === 'metadata.annotations.kubeclaw.io/health-mode') return [{
      path: 'gitops/platform/bootstrap/argocd.yaml', line: 40, kind: 'checked-in-controller-reader', direction: 'read',
      authority: 'the pinned Argo CD 10.8.0 Application health Lua code reads this exact annotation key',
    }];
    if (/^metadata\.annotations\.argocd\.argoproj\.io\/(?:ignore-healthcheck|sync-wave|compare-options)$/u.test(semanticPath)) return [{
      path: 'gitops/platform/bootstrap/argocd.yaml', line: 15, kind: 'version-bound-external-controller-contract', direction: 'read',
      authority: 'the pinned Argo CD 10.8.0 chart selects the controller version that owns this exact argocd.argoproj.io annotation contract',
    }];
    return [{ path: context.sourcePath, line: exactLine, kind: 'embedded-payload-consumer-unproved', direction: 'unknown', authority: 'no exact version-bound annotation controller was found' }];
  }
  if (boundary.kind === 'workload-process-payload') {
    const index = Number(/containers\[([0-9]+)\]/u.exec(exactPath)?.[1] ?? 0);
    const image = context.documentValue?.spec?.template?.spec?.containers?.[index]?.image
      ?? context.documentValue?.spec?.containers?.[index]?.image
      ?? '<selected container image>';
    return [{
      path: context.sourcePath, line: exactLine, kind: 'selected-image-process-contract', direction: 'read',
      authority: `container ${index} image ${image} receives this exact command, argument, or environment field`,
    }];
  }
  if (boundary.kind === 'opaque-object-payload') {
    const objectName = context.resource.name;
    const payloadKey = yamlFieldPathTokens(exactPath).slice(1).join('.');
    if (context.resource.kind === 'ConfigMap' && objectName === 'registry-local-config' && payloadKey === 'config.yml'
      && context.sourcePath === 'my-values/infra/registry-local.yaml') {
      const lines = read(context.sourcePath).split('\n');
      const exact = (pattern, kind, chainStep, authority, occurrence = 'first') => {
        const index = occurrence === 'last' ? lines.findLastIndex((line) => pattern.test(line)) : lines.findIndex((line) => pattern.test(line));
        assert(index >= 0, `CONFIG_PAYLOAD_CHAIN_DRIFT: ${context.sourcePath} lost ${chainStep}`);
        return { path: context.sourcePath, line: index + 1, kind, chainStep, direction: 'read', authority };
      };
      return [
        exact(/^\s*name:\s*registry-local-config\s*$/u, 'configmap-volume-object-reference', 'object-to-volume', 'Deployment/registry-local volume `config` selects ConfigMap/registry-local-config', 'last'),
        exact(/^\s*-\s*name:\s*config\s*$/u, 'pod-volume-name-link', 'volume-to-mount', 'Pod volume and volumeMount use the exact shared name `config`'),
        exact(/^\s*mountPath:\s*\/etc\/kubeclaw-registry\s*$/u, 'configmap-mount-path', 'mount-to-filesystem', 'ConfigMap keys are projected below /etc/kubeclaw-registry'),
        exact(/^\s*args:\s*\[serve,\s*\/etc\/kubeclaw-registry\/config\.yml\]\s*$/u, 'process-config-argument', 'filesystem-to-process-argument', 'registry process receives the exact projected key path as its `serve` configuration argument'),
        exact(/^\s*image:\s*registry:3\.0\.0\s*$/u, 'selected-image-config-reader', 'process-argument-to-reader', 'the selected registry:3.0.0 process owns and parses the Distribution config.yml contract'),
      ];
    }
    return [{
      path: context.sourcePath, line: exactLine, kind: 'embedded-payload-consumer-unproved', direction: 'unknown',
      authority: `no exact object/key to volume or environment to process-reader chain for ${context.resource.kind}/${objectName} key ${payloadKey} was found`,
    }];
  }
  return [{ path: context.sourcePath, line: exactLine, kind: 'embedded-payload-consumer-unproved', direction: 'unknown', authority: 'no exact receiver was found' }];
}

function yamlSemantics(context, exactPath, valueType) {
  if (context.resource) {
    const { kind, name, apiVersion } = context.resource;
    const semanticExactPath = yamlFieldMatcherPath(exactPath);
    const apiOwner = kind === 'Application' ? 'Argo CD Application controller' : `Kubernetes ${kind} controller`;
    const boundary = deploymentFieldBoundary(context.resource, semanticExactPath);
    if (boundary.kind !== 'api-envelope') return {
      required: 'embedded-payload-contract',
      requiredReason: `${apiVersion}/${kind} validates the outer field type; ${boundary.owner} owns the embedded value semantics.`,
      defaultKind: 'authored-embedded-payload',
      constraints: [`outer ${apiVersion}/${kind} API field type`, `inner contract owned by ${boundary.owner}`],
      runtimeOwner: boundary.owner,
      consumers: embeddedPayloadConsumers(context, exactPath, boundary, valueType),
      precedence: ['authored manifest payload', `${apiVersion}/${kind} admission preserves the accepted payload`, `${boundary.owner} reads and interprets the payload`],
      effectiveValueProof: `${context.sourcePath} -> ${apiVersion}/${kind} field -> ${boundary.owner}`,
      changeImpact: `Changes the value delivered to ${boundary.owner}; it does not change Kubernetes API behavior by itself.`,
      failureMeaning: `An invalid outer type fails API admission. A type-valid but invalid payload fails only when ${boundary.owner} parses or uses it.`,
      blockerOwner: sourceOwner(context.sourcePath).component,
      closureCondition: `Link the exact ${boundary.owner} contract before presenting this embedded payload as a direct operator option.`,
      deploymentBoundary: boundary.kind,
    };
    return {
      required: 'external-schema',
      requiredReason: `${apiVersion}/${kind} admission and CRD/OpenAPI validation own required-field semantics.`,
      defaultKind: 'authored-manifest',
      constraints: [`${apiVersion}/${kind} API schema and admission`],
      runtimeOwner: `${apiOwner} for ${kind}/${name}`,
      consumers: [{
        path: context.sourcePath,
        line: context.fieldLine ?? 1,
        sourceLineSha256: sha256(read(context.sourcePath).split('\n')[(context.fieldLine ?? 1) - 1] ?? ''),
        kind: 'kubernetes-api',
        authority: apiFieldSchemaAuthority(apiVersion, kind, exactPath).authority,
      }],
      precedence: ['authored manifest', 'Kubernetes API defaulting and admission', `${apiOwner} reconciliation`],
      effectiveValueProof: `${context.sourcePath} -> ${apiVersion}/${kind} admission -> ${kind}/${name}`,
      changeImpact: `Changes the desired ${kind}/${name} resource state after admission.`,
      failureMeaning: `Invalid fields fail API admission or Argo sync; accepted fields can still fail ${apiOwner} reconciliation.`,
      blockerOwner: null,
      closureCondition: null,
    };
  }
  if (context.externalBindings.length) {
    const binding = context.externalBindings[0];
    const directRuntimeBinding = context.runtimeBindings[0] ?? null;
    const inactive = binding.inactiveProfile === true && !directRuntimeBinding;
    return {
      required: 'external-schema',
      requiredReason: `The external chart ${binding.chart}@${binding.targetRevision} owns required and optional value semantics.`,
      defaultKind: 'authored-override',
      constraints: [`external Helm chart ${binding.chart}@${binding.targetRevision}`],
      runtimeOwner: inactive ? `No active runtime owner; external Helm chart ${binding.chart} owns the field schema`
        : directRuntimeBinding ? `${sourceOwner(directRuntimeBinding.path).component} and external Helm chart ${binding.chart}`
          : `Argo CD Application ${binding.application} and Helm chart ${binding.chart}`,
      consumers: [...context.externalBindings, ...context.runtimeBindings],
      precedence: inactive
        ? [`${binding.chart}@${binding.targetRevision} external defaults`, `${context.sourcePath} inactive authored profile`, 'no effective runtime value until a deploy binding selects this file']
        : directRuntimeBinding
          ? [`${binding.chart}@${binding.targetRevision} chart defaults`, `${context.sourcePath} authored override`, `${directRuntimeBinding.path} direct loader/deploy binding`]
          : [`${binding.chart}@${binding.targetRevision} chart defaults`, `${context.sourcePath} authored override`, `Argo CD Application ${binding.application} Helm rendering`],
      effectiveValueProof: inactive ? `${binding.path}:${binding.line} proves schema authority; no active valueFiles/deploy binding selects ${context.sourcePath}`
        : directRuntimeBinding ? `${context.sourcePath} -> ${directRuntimeBinding.path}:${directRuntimeBinding.line} -> ${binding.chart}@${binding.targetRevision}`
          : `${context.sourcePath} -> ${binding.path}:${binding.line} -> ${binding.chart}@${binding.targetRevision}`,
      changeImpact: inactive ? 'No current runtime impact; this profile affects the external chart only after an operator binds it.'
        : directRuntimeBinding ? `Changes the ${binding.chart} values consumed by the linked loader or deploy command.`
          : `Changes the rendered ${binding.application} release when Argo CD reconciles it.`,
      failureMeaning: inactive ? 'No current deployment failure; using the profile with an incompatible chart fails Helm validation or rendering.'
        : directRuntimeBinding ? 'An invalid value fails the linked loader, Helm rendering, or workload readiness.'
          : 'An invalid value fails Helm rendering or Argo CD synchronization; an accepted value can still fail workload readiness.',
      blockerOwner: inactive ? context.owner.component : null,
      closureCondition: inactive ? 'Bind this profile to a versioned Helm invocation/Application, or remove the inactive profile.' : null,
    };
  }
  let linkedHelmConsumers = context.chartRoot && exactPath
    ? [...(context.consumerMap.get(`${context.chartRoot}:${canonicalHelmPath(exactPath)}`) ?? [])]
    : [];
  const extraContainerIndex = /^extraContainers\[([0-9]+)\](?:\.|$)/u.exec(exactPath)?.[1];
  if (extraContainerIndex !== undefined) {
    const selectedName = context.documentValue?.extraContainers?.[Number(extraContainerIndex)]?.name;
    if (selectedName === 'buster-v2-runtime') {
      linkedHelmConsumers = linkedHelmConsumers.filter((consumer) => !(consumer.path === 'charts/kubeclaw/templates/deployment.yaml'
        && consumer.line === 1527));
    } else if (selectedName) {
      linkedHelmConsumers = linkedHelmConsumers.filter((consumer) => consumer.path !== 'charts/kubeclaw/templates/_registry-clients.tpl');
    }
  }
  if (context.runtimeBindings.length) {
    const readers = context.runtimeBindings.filter((item) => item.direction === 'read');
    const sourceWriters = context.runtimeBindings.filter((item) => item.direction === 'write');
    const derivedWriters = context.runtimeBindings.filter((item) => item.direction === 'write-derived');
    const binding = readers[0] ?? context.runtimeBindings[0];
    return {
      required: 'source-loader-contract',
      requiredReason: linkedHelmConsumers.length
        ? `${binding.path} preserves this runtime input in the generated values object; the linked chart template owns its final interpretation.`
        : `${binding.path} owns parsing and validation for this runtime input.`,
      defaultKind: sourceWriters.length ? 'generated-runtime-input' : 'authored-runtime-input',
      constraints: [
        `loader contract in ${binding.path}`,
        ...linkedHelmConsumers.flatMap((item) => item.constraints ?? []),
      ],
      runtimeOwner: linkedHelmConsumers.length
        ? `Helm release rendered from ${context.chartRoot}`
        : sourceOwner(binding.path).component,
      consumers: [...context.runtimeBindings, ...linkedHelmConsumers],
      precedence: [
        ...sourceWriters.map((item) => `${item.path} generated-file write`),
        `${context.sourcePath} selected file value`,
        ...readers.map((item) => `${item.path} read/validation`),
        ...derivedWriters.map((item) => `${item.path} derived runtime output`),
        ...(linkedHelmConsumers.length ? [`${context.chartRoot}/values.yaml chart defaults merged by Helm`, 'linked chart template rendering'] : []),
        'generated or live runtime state',
      ],
      effectiveValueProof: linkedHelmConsumers.length
        ? `${context.sourcePath} -> ${binding.path}:${binding.line} -> ${linkedHelmConsumers[0].path}:${linkedHelmConsumers[0].line}`
        : `${context.sourcePath} -> ${binding.path}:${binding.line}`,
      changeImpact: linkedHelmConsumers.length
        ? 'Changes the generated values object and the linked chart output when this source wins Helm precedence.'
        : 'Changes the generated runtime policy or operational action produced by the linked loader.',
      failureMeaning: linkedHelmConsumers.length
        ? 'Invalid input can fail Helm rendering or API admission; an accepted change can alter workload behavior or readiness.'
        : 'Invalid input fails the linked loader/preflight before runtime activation; accepted changes can alter generated runtime state.',
      blockerOwner: null,
      closureCondition: null,
    };
  }
  const matches = linkedHelmConsumers;
  if (matches.length) {
    const requiredSignal = matches.some((item) => item.requiredSignal);
    const conditionalSignal = matches.some((item) => item.conditionalSignal);
    const required = requiredSignal ? 'required' : conditionalSignal ? 'conditional' : 'optional';
    const overlay = context.sourceClass !== 'helm-values';
    return {
      required,
      requiredReason: requiredSignal ? 'A linked template uses Helm required/fail validation.' : conditionalSignal ? 'A linked template condition or default controls consumption.' : 'A linked template consumes the value without a required/fail assertion.',
      defaultKind: overlay ? 'authored-override' : 'chart-default',
      constraints: [...new Set(matches.flatMap((item) => item.constraints))],
      runtimeOwner: `Helm release rendered from ${context.chartRoot}`,
      consumers: [...new Map(matches.map((item) => [`${item.path}:${item.line}`, item])).values()],
      precedence: overlay
        ? [`${context.chartRoot}/values.yaml chart default`, `${context.sourcePath} override`, 'later Helm -f/--set input when supplied', 'linked template rendering']
        : [`${context.sourcePath} chart default`, 'later Helm -f/--set input when supplied', 'linked template rendering'],
      effectiveValueProof: `${context.sourcePath} -> ${matches[0].path}:${matches[0].line}`,
      changeImpact: 'Changes each linked rendered template field when this source wins Helm precedence.',
      failureMeaning: requiredSignal ? 'A missing or invalid value stops Helm rendering.' : 'A rejected render stops deployment; an accepted change can alter workload behavior or readiness.',
      blockerOwner: null,
      closureCondition: null,
    };
  }
  if (valueType === 'object' || valueType === 'array') {
    return {
      required: 'not-applicable-container', requiredReason: 'This row is a structural container; leaf rows own effective-value semantics.',
      defaultKind: context.sourceClass === 'helm-values' ? 'chart-default-container' : 'authored-container', constraints: [],
      runtimeOwner: 'Not applicable; structural container', consumers: [{ path: context.sourcePath, line: 1, kind: 'structural-container', authority: 'child leaf facts' }],
      precedence: ['See child leaf fields'], effectiveValueProof: 'See child leaf fields', changeImpact: 'No independent value; child changes define impact.',
      failureMeaning: 'No independent failure; child validation and consumers define failure.', blockerOwner: null, closureCondition: null,
    };
  }
  return {
    required: 'not-applicable-unused',
    requiredReason: 'No checked-in template, Application binding, or API resource consumes this leaf.',
    defaultKind: context.sourceClass === 'helm-values' ? 'unused-chart-default' : 'unbound-authored-value',
    constraints: [],
    runtimeOwner: 'Not applicable; no checked-in runtime binding',
    consumers: [{ path: context.owner.evidence, line: 1, kind: 'not-applicable', authority: 'no discovered runtime binding' }],
    precedence: ['Authored value has no effective runtime precedence until a binding exists.'],
    effectiveValueProof: 'No effective runtime value; discovery found no binding.',
    changeImpact: 'No proved runtime impact in the checked-in deployment path.',
    failureMeaning: 'No runtime failure is proved; keeping an unused value can mislead operators.',
    blockerOwner: context.owner.component,
    closureCondition: 'Add a source-backed template/Application/deploy binding or remove the unused value.',
  };
}

function normalizedChartName(value) {
  return String(value ?? '').split('/').filter(Boolean).at(-1) ?? '';
}

function normalizedChartRepository(value) {
  return String(value ?? '').replace(/^oci:\/\//u, '').replace(/\/+$/u, '');
}

function exactYamlAuthority(context, fieldPath) {
  const exactDeclaration = yamlAuthorityFile(context.sourcePath);
  const localDeclaration = localHelmAuthorityFile(context.sourcePath);
  const declaration = exactDeclaration ?? localDeclaration;
  if (declaration && declaration.sourceSha256 !== context.sourceDigest
    && !(localDeclaration && allowLocalHelmAuthorityMaintenance)) {
    throw new Error(`CONFIG_YAML_AUTHORITY_DRIFT: ${context.sourcePath} changed without an exact field-authority update; expected ${declaration.sourceSha256}, got ${context.sourceDigest}`);
  }
  const authority = yamlFieldAuthority(context.sourcePath, fieldPath) ?? localHelmFieldAuthority(context.sourcePath, fieldPath);
  if (!authority) return null;
  if (authority.externalChart) {
    const binding = context.externalBindings.find((item) => item.inactiveProfile !== true)
      ?? context.externalBindings[0];
    assert(binding, `CONFIG_YAML_AUTHORITY_DRIFT: ${context.sourcePath}${fieldPath} pins an external chart but has no chart binding`);
    assert.equal(normalizedChartName(binding.chart), authority.externalChart.chart,
      `CONFIG_YAML_AUTHORITY_DRIFT: ${context.sourcePath}${fieldPath} chart changed`);
    assert.equal(String(binding.targetRevision), authority.externalChart.version,
      `CONFIG_YAML_AUTHORITY_DRIFT: ${context.sourcePath}${fieldPath} chart version changed`);
    assert.equal(normalizedChartRepository(binding.repository), normalizedChartRepository(authority.externalChart.repository),
      `CONFIG_YAML_AUTHORITY_DRIFT: ${context.sourcePath}${fieldPath} chart repository changed`);
  }
  return authority;
}

function deploymentApiFieldContract(resource, exactPath) {
  const normalized = yamlFieldMatcherPath(exactPath);
  const api = `${resource.apiVersion}/${resource.kind}`;
  const operational = (purpose, acceptedValues, emptyBehavior, impact, failure, controller = `${resource.kind} controller`) => ({
    status: 'deployment-operational-authority', purpose, acceptedValues, emptyBehavior, impact, failure,
    apiAuthority: `${api} schema, admission, defaulting, and ${controller} reconciliation`,
  });
  const structural = (purpose) => ({
    status: 'deployment-structural-authority',
    purpose,
    acceptedValues: `The exact type and format in the pinned ${api} schema authority.`,
    emptyBehavior: `If the exact versioned schema permits omission, the API stores no value for this leaf; if the parent requires it, admission rejects the object. The schema does not turn an authored empty value into omission.`,
    impact: `Changes the API identity or structural relationship of ${resource.kind}/${resource.name}; it is not a separate KubeClaw runtime option.`,
    failure: `A schema-invalid value fails admission or Argo CD synchronization. A valid but inconsistent relationship can prevent ${resource.kind}/${resource.name} reconciliation.`,
    apiAuthority: `${api} pinned schema authority and the named reconciler for this object`,
  });
  if (normalized === 'apiVersion') return structural(`Selects the versioned API schema used to decode ${resource.kind}/${resource.name}.`);
  if (normalized === 'kind') return structural(`Selects the API resource kind decoded for ${resource.name}.`);
  if (normalized === 'metadata.name') return operational(`Names this ${resource.kind} object within its API scope.`, 'A value that satisfies the pinned Kubernetes ObjectMeta name schema.', 'The pinned schema and the sibling generateName field define omission behavior; an empty authored name must satisfy the same schema.', 'Changes object identity. Controllers and references continue to target the old name until they are changed together.', 'A malformed name fails admission. A renamed object can leave references unresolved.', 'Kubernetes API server');
  if (normalized === 'metadata.namespace') return operational(`Selects the namespace that contains ${resource.kind}/${resource.name}.`, 'An existing or deliberately created DNS-label namespace allowed by admission policy.', 'Omission uses the client request namespace; an empty scalar is invalid and must not be used as a namespace default.', 'Changes API scope, DNS names, RBAC, Secret and ConfigMap lookup, and controller ownership.', 'A missing or unauthorized namespace makes apply fail; moving only one resource breaks same-namespace references.', 'Kubernetes API server');
  if (/^metadata\.labels\./u.test(normalized)) return operational('Sets one exact object label used by selectors, policy, inventory, or ownership tooling.', 'A Kubernetes label value: at most 63 characters, empty or beginning and ending with an alphanumeric character, with `-`, `_`, and `.` permitted inside.', 'Removing the label removes that identity signal. An empty value retains the key and is not equivalent to omission.', 'Changes selector matching, policy scope, grouping, or controller ownership wherever the same exact key is selected.', 'An invalid value fails admission. Removing or changing a selected label can detach a workload from its Service, Deployment, policy, or operational inventory.', 'Kubernetes API server and each exact matching selector');
  if (/^metadata\.annotations\./u.test(normalized)) return operational('Sets one exact annotation on this object.', 'A string that satisfies the pinned ObjectMeta schema. The annotation key identifies the separate component that can interpret the value.', 'Omission removes the annotation. An empty string remains an authored string and has no inferred component meaning.', 'Changes the stored annotation. It changes runtime behavior only when the component named by the exact annotation key reads it.', 'Invalid key syntax fails API admission. A schema-valid value can still be rejected or ignored by its named component.', 'Kubernetes API server and the component named by the exact annotation key');

  if (resource.kind === 'Application') {
    if (/^spec\.sources?\[\]\.repoURL$|^spec\.source\.repoURL$/u.test(normalized)) return operational('Selects the Git or Helm repository from which Argo CD reads desired state.', 'An absolute repository URL supported by Argo CD and authorized by its repository credentials.', 'An empty or omitted URL leaves the source incomplete and reconciliation cannot load desired state.', 'Changes the trust and content origin for every object generated from this source.', 'Malformed, unreachable, or unauthorized repositories produce comparison and synchronization errors.', 'Argo CD Application controller');
    if (/^spec\.sources?\[\]\.targetRevision$|^spec\.source\.targetRevision$/u.test(normalized)) return operational('Selects the Git revision, chart version, or immutable source revision reconciled by Argo CD.', 'A revision accepted by the selected source type. This repository uses complete commits or exact chart versions where the surrounding source contract requires them.', 'An empty revision is not a complete source selection.', 'Changes the exact desired-state version rendered and applied by the Application.', 'A missing or unresolved revision produces a comparison error and prevents synchronization.', 'Argo CD repo-server and Application controller');
    if (/^spec\.sources?\[\]\.(?:chart|path)$|^spec\.source\.(?:chart|path)$/u.test(normalized)) return operational('Selects the chart name or repository directory rendered for this Application source.', 'A chart name or clean repository-relative directory that exists at the selected revision.', 'An empty selection cannot identify render input unless another valid source mode is used.', 'Changes the complete manifest set produced by this source.', 'A missing chart or path makes manifest generation fail.', 'Argo CD repo-server');
    if (/^spec\.sources?\[\]\.helm\.valueFiles\[\]$/u.test(normalized)) return operational('Adds one ordered Helm values file to this Argo CD source.', 'A repository-relative values path, or a `$ref/` path backed by a declared multi-source reference.', 'An empty item is invalid. An empty list uses only chart defaults and inline values.', 'Changes Helm precedence and every rendered field overridden by the selected file.', 'A missing file or invalid reference makes manifest generation fail.', 'Argo CD repo-server Helm renderer');
    if (/^spec\.sources?\[\]\.helm\.releaseName$|^spec\.source\.helm\.releaseName$/u.test(normalized)) return operational('Sets the Helm release name used while Argo CD renders this source.', 'A Helm release name accepted by the pinned renderer and chart helpers.', 'Omission lets Argo CD derive a release name from the Application; an empty scalar is not an explicit stable name.', 'Changes generated names, labels, and selectors for charts that use the Helm release identity.', 'An invalid name stops rendering; changing it can replace or orphan resources.', 'Argo CD repo-server Helm renderer');
    if (/^spec\.sources?\[\]\.ref$/u.test(normalized)) return operational('Defines the multi-source reference name used by `$ref/` values-file paths.', 'A non-empty Argo CD source-reference identifier unique within this Application.', 'Omission means the source cannot be addressed by another source; an empty reference is invalid.', 'Changes how values and chart sources are joined during manifest generation.', 'A missing or mismatched reference makes the linked values file unresolved.', 'Argo CD repo-server');
    if (normalized === 'spec.destination.server') return operational('Selects the Kubernetes API server to which Argo CD applies this Application.', 'A cluster URL or registered cluster name accepted by Argo CD; in-cluster deployment uses `https://kubernetes.default.svc`.', 'An empty destination server leaves the Application destination incomplete.', 'Changes the target cluster for all generated resources.', 'An unknown, unreachable, or unauthorized cluster prevents synchronization.', 'Argo CD Application controller');
    if (normalized === 'spec.destination.namespace') return operational('Selects the default target namespace for namespaced resources generated by this Application.', 'A DNS-label namespace allowed by the AppProject destination policy.', 'An empty namespace is valid only when every generated resource supplies its own namespace or is cluster-scoped.', 'Changes the namespace, DNS, RBAC, storage, Secret, and policy scope of generated resources.', 'A forbidden or absent namespace causes sync failure; a partial move breaks namespaced dependencies.', 'Argo CD Application controller');
    if (normalized === 'spec.project') return operational('Binds this Application to the named Argo CD AppProject policy.', 'An existing AppProject name in the Argo CD namespace.', 'An omitted project uses Argo CD `default`; an empty name is not the selected policy.', 'Changes permitted source repositories, destinations, and resource kinds.', 'A missing project or denied source/destination makes reconciliation fail.', 'Argo CD Application controller');
    if (/^spec\.syncPolicy\.syncOptions\[\]$/u.test(normalized)) return operational('Adds one Argo CD synchronization option to the Application.', 'A `Name=true|false` option supported by the pinned Argo CD 10.8.0 authority.', 'Omission leaves that named option absent. An empty list item must satisfy the pinned CRD item schema and is not treated as a named option.', 'Changes apply, namespace creation, validation, ownership, or pruning behavior according to the named option.', 'An unsupported or unsafe option can make synchronization fail or apply resources with unintended ownership semantics.', 'Argo CD 10.8.0 Application controller');
    if (/^spec\.syncPolicy\.automated\.(?:prune|selfHeal|allowEmpty)$/u.test(normalized)) return operational(`Controls Argo CD automated synchronization behavior for ${normalized.split('.').at(-1)}.`, '`true` or `false` as defined by the pinned Argo CD 10.8.0 CRD.', 'When the exact CRD permits omission, Argo CD receives no authored Boolean and applies the pinned controller semantics for that named flag. An authored empty scalar fails the Boolean schema.', 'Changes whether Argo CD removes absent resources, repairs live drift, or permits an empty generated set.', 'An unsafe selection can retain stale resources, overwrite emergency changes, or prune the complete Application output.', 'Argo CD 10.8.0 Application controller');
    if (/^spec\.sources?\[\]\.directory\.recurse$|^spec\.source\.directory\.recurse$/u.test(normalized)) return operational('Controls whether Argo CD recursively scans subdirectories below the selected Git directory.', '`true` includes matching manifests below nested directories. `false` limits discovery to the selected directory.', 'When the exact CRD permits omission, the directory generator does not enable recursive traversal. An authored empty scalar fails the Boolean schema.', 'Changes the set of manifests that enters desired state from the selected source path.', 'A false value can silently omit nested resources. A true value can include unintended manifests that match the directory rules.', 'Argo CD 10.8.0 repo-server directory generator');
    if (/^spec\.sources?\[\]\.directory\.include$|^spec\.source\.directory\.include$/u.test(normalized)) return operational('Selects which files the Argo CD directory generator includes.', 'An Argo CD directory include glob, including brace expansion supported by the pinned controller version.', 'Omission includes all supported manifest files not excluded by another rule. An empty pattern matches no useful input.', 'Changes the exact manifest files loaded from the selected Git directory.', 'A malformed or over-narrow pattern omits desired resources; an over-broad pattern can include files that must not be applied.', 'Argo CD repo-server directory generator');
    if (/^spec\.sources?\[\]\.helm\.skipTests$|^spec\.source\.helm\.skipTests$/u.test(normalized)) return operational('Controls whether Argo CD omits Helm test-hook resources while rendering this source.', '`true` skips resources annotated as Helm tests. `false` keeps them in rendered output.', 'Omission uses the pinned Argo CD Helm-renderer default. An empty scalar is invalid.', 'Changes whether chart test Jobs and their supporting resources enter the Application manifest set.', 'Keeping incompatible test hooks can make synchronization unhealthy; skipping them removes those chart-provided validation resources.', 'Argo CD repo-server Helm renderer');
    if (/^spec\.ignoreDifferences\[\]\.(?:group|kind|name|namespace)$/u.test(normalized)) return operational('Selects the API objects to which this Argo CD difference-suppression rule applies.', 'An exact API group, kind, object name, or namespace accepted by the pinned Argo CD Application CRD. Empty group denotes the Kubernetes core API group.', 'Omitted name or namespace broadens the rule to all matching objects in that dimension; kind is required for a useful rule.', 'Changes which live objects can hide differences from Argo CD comparison and synchronization.', 'A narrow selector leaves expected controller-owned drift visible; a broad selector can hide real configuration drift.', 'Argo CD Application comparison engine');
    if (/^spec\.ignoreDifferences\[\]\.jqPathExpressions\[\]$/u.test(normalized)) return operational('Adds one JQ expression whose selected fields Argo CD ignores during comparison.', 'A valid JQ path expression accepted by the pinned Argo CD comparison engine.', 'An empty item is invalid as a useful selector; an empty list suppresses no fields.', 'Changes which live-field differences are hidden for the objects selected by the enclosing rule.', 'An invalid expression causes comparison errors. An over-broad expression can hide consequential drift.', 'Argo CD Application comparison engine');
  }

  if (resource.kind === 'AppProject') {
    if (normalized === 'spec.description') return structural(`Stores the human-readable description of AppProject/${resource.name}; the AppProject policy evaluator does not use it to authorize a source, destination, or resource kind.`);
    if (/^spec\.sourceRepos\[\]$/u.test(normalized)) return operational('Allows Applications in this AppProject to read one repository scope.', 'An exact repository URL or an Argo CD-supported repository pattern.', 'An empty item grants nothing and is invalid as a useful repository authority.', 'Changes the source trust boundary for every Application assigned to the project.', 'An omitted required repository makes Application sources forbidden; an overbroad pattern expands supply-chain authority.', 'Argo CD AppProject policy evaluator');
    if (/^spec\.destinations\[\]\.(?:server|namespace)$/u.test(normalized)) return operational('Defines one cluster or namespace boundary to which project Applications may deploy.', 'A registered cluster server and an exact namespace or supported namespace pattern.', 'An empty destination element does not authorize a useful target.', 'Changes the deployment scope available to all Applications in this project.', 'A narrow value blocks synchronization; an overbroad pattern expands deployment authority.', 'Argo CD AppProject policy evaluator');
    if (/^spec\.(?:clusterResourceWhitelist|namespaceResourceWhitelist)\[\]\.(?:group|kind)$/u.test(normalized)) return operational('Defines one API group/kind pattern that project Applications may manage.', 'A Kubernetes API group or kind, including `*` only when broad authority is intentional.', 'An empty group can mean the core API group; an empty kind does not define a useful allow rule.', 'Changes the resource kinds that Applications in the project can create, update, or delete.', 'A missing rule blocks synchronization; a wildcard can grant cluster-wide management authority.', 'Argo CD AppProject policy evaluator');
  }

  if (resource.kind === 'ValidatingAdmissionPolicy') {
    if (normalized === 'spec.failurePolicy') return operational('Selects how the API server handles an error while evaluating this admission policy.', 'Exactly `Fail` or `Ignore` for admissionregistration.k8s.io/v1.', 'Omission uses the versioned API default `Fail`; an empty scalar is invalid.', 'Changes whether an evaluation error denies the request or lets it continue.', '`Ignore` can admit a request that the policy could not evaluate. `Fail` can stop valid work when the policy expression or dependency fails.', 'Kubernetes API server CEL admission evaluator');
    if (/^spec\.matchConstraints\.resourceRules\[\]\.(?:apiGroups|apiVersions|operations|resources)\[\]$/u.test(normalized)) return operational('Adds one exact API group, version, operation, or resource selector to the admission-policy match rule.', 'A value accepted by the admissionregistration.k8s.io/v1 ResourceRule field, including only the wildcards permitted by that exact field.', 'An empty item is invalid. Removing an item narrows or changes the request set evaluated by the policy.', 'Changes which API requests are evaluated and can be denied by this policy.', 'A narrow selector leaves intended requests unprotected; a broad selector can deny unrelated cluster operations.', 'Kubernetes API server admission matcher');
    if (/^spec\.matchConditions\[\]\.name$/u.test(normalized)) return operational('Names one match condition within this admission policy.', 'A unique DNS-label-compatible condition name accepted by admissionregistration.k8s.io/v1.', 'The name is required for a declared condition; an empty value fails admission.', 'Changes the stable identity used to report a failed or errored match condition.', 'A duplicate or invalid name makes the policy invalid.', 'Kubernetes API server admission matcher');
    if (/^spec\.matchConditions\[\]\.expression$/u.test(normalized)) return operational('Defines the CEL expression that decides whether this policy evaluates the matched request.', 'A Boolean CEL expression valid in the admissionregistration.k8s.io/v1 match-condition environment.', 'The expression is required; an empty expression fails policy validation.', 'Changes which matched requests proceed to the validation expressions.', 'A compile error prevents a valid policy. A false expression skips validation; an error follows failurePolicy.', 'Kubernetes API server CEL admission evaluator');
    if (/^spec\.variables\[\]\.name$/u.test(normalized)) return operational('Names one lazily evaluated CEL variable available to later admission expressions.', 'A unique identifier accepted by admissionregistration.k8s.io/v1 and not conflicting with reserved CEL names.', 'The name is required for a declared variable; an empty value fails validation.', 'Changes the identifier referenced by later expressions.', 'A duplicate, invalid, or renamed identifier makes dependent expressions fail compilation.', 'Kubernetes API server CEL admission evaluator');
    if (/^spec\.variables\[\]\.expression$/u.test(normalized)) return operational('Defines the CEL expression used to compute one admission-policy variable.', 'A CEL expression valid in the admissionregistration.k8s.io/v1 variable environment.', 'The expression is required; an empty value fails policy validation.', 'Changes the value supplied to every later match or validation expression that references this variable.', 'A compile or evaluation error prevents the dependent policy decision according to failurePolicy.', 'Kubernetes API server CEL admission evaluator');
    if (/^spec\.validations\[\]\.expression$/u.test(normalized)) return operational('Defines the Boolean CEL rule that an admitted request must satisfy.', 'A Boolean CEL expression valid in the admissionregistration.k8s.io/v1 validation environment.', 'The expression is required; an empty value fails policy validation.', 'Changes the invariant enforced for every request selected by the policy and binding.', 'False denies the request. A compile or evaluation error follows failurePolicy.', 'Kubernetes API server CEL admission evaluator');
    if (/^spec\.validations\[\]\.message$/u.test(normalized)) return operational('Sets the denial message returned when the paired validation expression is false.', 'A non-empty user-facing string that does not contain line breaks, as required by admissionregistration.k8s.io/v1.', 'Omission lets the API server produce its fallback expression message; an empty authored message is invalid.', 'Changes the diagnostic shown to the caller without changing which request is denied.', 'An invalid message prevents policy acceptance; an unclear message makes remediation difficult.', 'Kubernetes API server CEL admission evaluator');
  }
  if (resource.kind === 'ValidatingAdmissionPolicyBinding') {
    if (normalized === 'spec.policyName') return operational('Selects the ValidatingAdmissionPolicy activated by this binding.', 'The exact name of an existing ValidatingAdmissionPolicy.', 'This field is required; an empty or omitted name makes the binding invalid.', 'Changes which CEL policy evaluates requests selected by this binding.', 'A missing policy leaves the binding unresolved and no intended admission decision can be enforced.', 'Kubernetes API server admission evaluator');
    if (/^spec\.validationActions\[\]$/u.test(normalized)) return operational('Selects one action taken when the bound validation fails.', 'One of `Deny`, `Warn`, or `Audit`, subject to the combinations permitted by admissionregistration.k8s.io/v1.', 'At least one action is required; an empty item is invalid.', 'Changes whether failure blocks the request, warns the caller, or records an audit annotation.', 'A non-denying action can allow prohibited state; an invalid combination makes the binding invalid.', 'Kubernetes API server admission evaluator');
  }

  if (normalized === 'spec.replicas') return operational('Sets the desired number of workload replicas.', 'A non-negative integer within cluster capacity.', 'For workload APIs in this inventory, omission leaves the field absent and API defaulting stores one replica. An authored empty scalar is invalid.', 'Changes availability, rollout concurrency, scheduling demand, and resource use.', 'Zero stops the workload. Excess demand leaves Pods Pending; an invalid value fails admission.');
  if (resource.kind === 'Deployment' && /^spec\.(?:selector\.matchLabels|template\.metadata\.labels)\./u.test(normalized)) return operational('Sets one Pod label used by the Deployment selector or its Pod template.', 'A Kubernetes label value that is identical on both selector and template for this immutable Deployment relationship.', 'A selected label cannot be empty or omitted independently from its matching template label.', 'Changes which Pods the Deployment owns. The selector is immutable after creation.', 'A selector/template mismatch fails admission. Changing an existing selector requires Deployment replacement and can orphan Pods.', 'Kubernetes Deployment controller');
  if (resource.kind === 'Deployment' && normalized === 'spec.strategy.type') return operational('Selects the Deployment rollout strategy.', 'Exactly `RollingUpdate` or `Recreate` for apps/v1.', 'Omission defaults to `RollingUpdate`; an empty scalar is invalid.', 'Changes whether old and new Pods overlap during an update.', '`Recreate` introduces downtime. An incompatible rolling-update configuration fails validation or stalls rollout.', 'Kubernetes Deployment controller');
  if (/\.containers\[\]\.name$/u.test(normalized)) return operational('Names this container within the Pod specification.', 'A unique DNS-label-compatible container name within the Pod.', 'The name is required; an empty value fails admission.', 'Changes the identity used by logs, exec, status, patches, and references such as startup ordering tools.', 'A duplicate or invalid name fails admission; external automation that retains the old name no longer finds the container.');
  if (/\.containers\[\]\.ports\[\]\.name$/u.test(normalized) || (resource.kind === 'Service' && /^spec\.ports\[\]\.name$/u.test(normalized))) return operational('Names this network port for references by Services, probes, and policy.', 'A unique IANA service-name-compatible value within the applicable Pod or Service.', 'Omission is allowed when no named reference is needed; an empty authored value is invalid.', 'Changes the symbolic port identity used by targetPort, probes, and network policy.', 'A duplicate or invalid name fails admission; stale named references stop routing or health checks.');
  if (/\.containers\[\]\.image$/u.test(normalized)) return operational('Selects the OCI image executed by this container.', 'A valid OCI image reference. Immutable production selection uses a digest.', 'An empty image is invalid and prevents Pod creation.', 'Changes the executable filesystem and process code run by the workload.', 'Malformed or unavailable references cause admission errors, `ErrImagePull`, or `ImagePullBackOff`.');
  if (/\.containers\[\]\.imagePullPolicy$/u.test(normalized)) return operational('Selects when kubelet pulls the container image.', '`Always`, `IfNotPresent`, or `Never`.', 'Omission lets Kubernetes derive a policy from the image tag; an empty scalar is invalid.', 'Changes registry traffic and whether cached bytes can be reused.', 'An unsupported value fails admission; `Never` without cached bytes or a required pull failure prevents startup.');
  if (/\.containers\[\]\.resources\.(?:requests|limits)\.(?:cpu|memory|ephemeral-storage)$/u.test(normalized)) return operational('Sets one Kubernetes scheduling request or runtime resource limit for the container.', 'A non-negative Kubernetes resource quantity appropriate to the named resource.', 'Omission removes that request or limit; an empty scalar is invalid.', 'Changes scheduling, reserved capacity, throttling, eviction, or termination behavior.', 'Invalid quantities fail admission. Excessive requests leave Pods Pending; undersized limits cause throttling, eviction, or OOM termination.');
  if (/\.(?:containerPort|port|targetPort|nodePort)$/u.test(normalized)) return operational('Sets a listener, Service, target, policy, or externally allocated network port.', 'A value that satisfies the exact pinned field schema. Numeric port fields use the schema minimum and maximum. A named target port is valid only when the exact schema accepts a string.', 'If the exact schema permits omission, the API stores no authored port unless that same schema supplies a default. An authored empty scalar must satisfy the field schema.', 'Changes the network endpoint used by workloads, Services, probes, or policy.', 'A schema-invalid port fails admission. A schema-valid but conflicting or mismatched port makes traffic or health checks fail.');
  if (/\.protocol$/u.test(normalized)) return operational('Selects the network protocol for this port or policy rule.', 'One of the enum values in the exact pinned field schema.', 'If the exact schema permits omission, the API stores the schema default when one exists; otherwise it stores no authored protocol. An empty string must satisfy the same enum.', 'Changes how traffic is matched or routed.', 'An unsupported value fails admission; a schema-valid mismatch prevents the expected traffic.');
  if (resource.kind === 'Service' && normalized === 'spec.type') return operational('Selects how Kubernetes exposes this Service.', '`ClusterIP`, `NodePort`, `LoadBalancer`, or `ExternalName` where supported by the remaining Service fields.', 'Omission defaults to `ClusterIP`; an empty scalar is invalid.', 'Changes the network exposure boundary and allocated Service fields.', 'An incompatible type/field combination fails admission or makes the endpoint unreachable or unintentionally exposed.', 'Kubernetes Service controller');
  if (/\.(?:secretRef|secret|secretKeyRef)\.name$|\.secretName$/u.test(normalized)) return operational('Selects the existing Kubernetes Secret read by this workload field.', 'A DNS-compatible Secret name in the workload namespace unless the exact controller documents another scope.', 'An empty or omitted required reference cannot supply the selected data.', 'Changes which credential or trust object is delivered to the workload.', 'A malformed or missing required Secret prevents Pod materialization or makes authentication fail.');
  if (/\.configMap\.name$|\.configMapRef\.name$/u.test(normalized)) return operational('Selects the existing Kubernetes ConfigMap delivered to this workload.', 'A DNS-compatible ConfigMap name in the workload namespace.', 'An empty or omitted required reference cannot supply configuration.', 'Changes which configuration object is mounted or injected.', 'A missing required ConfigMap prevents Pod materialization; incompatible content makes the process fail.');
  if (/\.persistentVolumeClaim\.claimName$/u.test(normalized)) return operational('Selects the PersistentVolumeClaim mounted by this Pod.', 'A DNS-compatible PVC name in the Pod namespace.', 'An empty claim name is invalid.', 'Changes the persistent storage object visible to the workload.', 'A missing or unbound claim leaves the Pod Pending.');
  if (resource.kind === 'PersistentVolumeClaim' && normalized === 'spec.resources.requests.storage') return operational('Requests persistent storage capacity for this claim.', 'A positive Kubernetes storage quantity such as `20Gi`.', 'An empty or omitted storage request is not a usable capacity contract.', 'Changes the requested volume size; existing volumes cannot be assumed to shrink.', 'An invalid or unsupported size fails admission or provisioning; insufficient capacity causes write failures.', 'Kubernetes storage controller and selected CSI driver');
  if (resource.kind === 'PersistentVolumeClaim' && normalized === 'spec.storageClassName') return operational('Selects the StorageClass that provisions this claim.', 'An installed StorageClass name; explicit empty-string and omission have API-specific default-class behavior.', 'Omission can select the cluster default. An explicit empty string disables dynamic class selection.', 'Changes provisioner, topology, binding, expansion, and retention behavior.', 'A missing or unsuitable class leaves the claim Pending or creates storage with the wrong lifecycle.', 'Kubernetes storage controller and selected CSI driver');
  if (resource.kind === 'PersistentVolumeClaim' && /^spec\.accessModes\[\]$/u.test(normalized)) return operational('Requests one access mode for the PersistentVolumeClaim.', 'One of the access modes supported by the selected CSI driver, such as `ReadWriteOncePod`, `ReadWriteOnce`, `ReadOnlyMany`, or `ReadWriteMany`.', 'At least one usable access mode is required; an empty item is invalid.', 'Changes eligible volumes, node attachment, and concurrent writer guarantees.', 'An unsupported mode leaves the claim Pending. Weakening `ReadWriteOncePod` can permit unsafe concurrent writers.', 'Kubernetes storage controller and selected CSI driver');
  if (/\.(?:livenessProbe|readinessProbe|startupProbe)\./u.test(normalized)) return operational('Configures one exact container health-probe field.', 'A value accepted by the Kubernetes Probe schema and by the receiving HTTP, TCP, gRPC, or command endpoint.', 'Omission uses Probe defaults or removes the exact check; an empty scalar is invalid.', 'Changes startup gating, Service readiness, or automatic container restart timing.', 'A wrong endpoint or aggressive timing causes false unready or restart loops; weak settings delay failure detection.');
  if (/\.volumeMounts\[\]\.(?:name|mountPath|subPath|readOnly)$/u.test(normalized) || /\.volumes\[\]\.name$/u.test(normalized)) return operational('Defines or selects one volume mount relationship in the Pod.', 'A unique matching volume name, valid container path, clean subpath, or Boolean read-only flag according to the exact field.', 'Required names and mount paths cannot be empty; omitted read-only state defaults to writable.', 'Changes which files the container can read or modify and where they appear.', 'Invalid or unmatched fields fail admission or Pod setup; a wrong path hides required configuration or exposes writable data.');
  if (resource.kind === 'CiliumNetworkPolicy' || resource.kind === 'CiliumClusterwideNetworkPolicy') {
    if (normalized === 'spec.description') return structural(`Stores the human-readable description of ${resource.kind}/${resource.name}; Cilium does not use this field to select endpoints or allow traffic.`);
    if (/^spec\.enableDefaultDeny\.(?:ingress|egress)$/u.test(normalized)) return operational('Controls whether selecting endpoints with this policy enables default-deny enforcement for the named traffic direction.', '`true` enables default deny for this direction. `false` keeps this policy from enabling default deny by itself.', 'If the exact Cilium 1.20.1 CRD permits omission, the policy engine receives no authored override for this direction. An authored empty scalar fails the Boolean schema.', 'Changes whether traffic not explicitly allowed by the complete policy set is denied for selected endpoints.', 'False can leave unintended traffic allowed. True without complete allow rules blocks required connectivity.', 'Cilium 1.20.1 policy engine');
    if (/\.port$/u.test(normalized)) return operational('Selects a destination port allowed by this Cilium policy rule.', 'A decimal port from 1 through 65535 or a supported named port.', 'An empty port is invalid; removing the port entry changes the rule scope.', 'Changes which application endpoint the selected identities may reach.', 'A mismatch blocks required traffic; a broad or wrong port weakens isolation.', 'Cilium policy engine');
    if (/\.protocol$/u.test(normalized)) return operational('Selects the transport protocol matched by this Cilium policy port.', 'One of the protocol values accepted by the pinned Cilium 1.20.1 CRD field.', 'If the exact CRD permits omission, the policy engine receives no authored protocol and applies the CRD-defined rule semantics. An empty string must satisfy the same field schema.', 'Changes which transport traffic the policy permits.', 'A mismatch blocks required traffic or permits an unintended protocol.', 'Cilium 1.20.1 policy engine');
    if (/\.(?:fromEntities|toEntities)\[\]$/u.test(normalized)) return operational('Selects a Cilium reserved identity matched by this policy direction.', 'A reserved entity value accepted by the pinned Cilium 1.20.1 CRD field.', 'Removing the item removes that identity from the rule; removing the complete list leaves no entity match from this field. An empty string must satisfy the same field schema.', 'Changes the non-Pod identity boundary that can send or receive traffic.', 'A wrong entity blocks required infrastructure traffic or grants a broader trust boundary.', 'Cilium 1.20.1 policy engine');
    if (/\.endpointSelector\.|\.(?:fromEndpoints|toEndpoints)\[\]\./u.test(normalized)) return operational('Defines one exact label selector key, operator, or value used by the Cilium policy.', 'A label selector value accepted by the pinned Cilium CRD field.', 'Removing the exact leaf removes that selector term; an authored empty value remains part of the enclosing selector and must satisfy the CRD.', 'Changes which endpoints the policy selects as subjects, sources, or destinations.', 'A selector mismatch denies required traffic; an overbroad selector grants unintended connectivity.', 'Cilium policy engine');
  }
  if (resource.kind === 'Ingress') {
    if (normalized === 'spec.ingressClassName') return operational('Selects the IngressClass whose controller can reconcile this Ingress.', 'A string that satisfies the pinned networking.k8s.io/v1 field schema and names an IngressClass present in the target cluster.', 'The pinned schema permits omission and defines no field default. Class selection after omission depends on explicitly configured IngressClass and cluster admission settings. An empty string remains an authored string.', 'Changes which named IngressClass can own the routes.', 'A missing class leaves the Ingress unhandled; selecting the wrong class can expose it through an unintended ingress implementation.', 'Kubernetes API server and the controller named by the selected IngressClass');
    if (normalized === 'spec.defaultBackend.service.name') return operational('Selects the Service used when no Ingress rule matches.', 'A Service name that satisfies the pinned networking.k8s.io/v1 schema and resolves in the Ingress namespace.', 'The pinned schema marks the service name as required inside a declared service backend.', 'Changes the workload that receives unmatched ingress traffic.', 'A missing Service or endpoint leaves the backend unresolved and unmatched requests fail.', 'Controller named by spec.ingressClassName');
    if (normalized === 'spec.defaultBackend.service.port.number') return operational('Selects the numeric Service port used by the default Ingress backend.', 'An integer from 1 through 65535 that exists on the selected Service.', 'A backend must select either a port name or number; an empty number is invalid.', 'Changes the Service listener that receives unmatched ingress traffic.', 'A missing port makes the backend unresolved and requests fail.', 'Selected Ingress controller');
    if (/^spec\.tls\[\]\.hosts\[\]$/u.test(normalized)) return operational('Adds one DNS host covered by this Ingress TLS entry.', 'A DNS host name accepted by the pinned networking.k8s.io/v1 schema and covered by the certificate in the enclosing secretName.', 'Removing the item removes that host from this TLS entry; removing the complete host list leaves certificate selection to the Ingress controller. An authored empty string must still satisfy the field schema.', 'Changes which requested host names use the enclosing TLS certificate.', 'A host/certificate mismatch causes client TLS verification failure.', 'Controller named by spec.ingressClassName');
  }
  if (resource.kind === 'NetworkPolicy') {
    if (/^spec\.podSelector\.matchLabels\./u.test(normalized)) return operational('Sets one exact label equality requirement for Pods selected by this NetworkPolicy.', 'A valid Kubernetes label value for the exact label key in the path.', 'Removing the entry broadens or changes the selector; an empty value selects only Pods with that exact empty label value.', 'Changes which Pods receive the ingress and egress isolation rules.', 'An over-broad selector can isolate unrelated Pods; a mismatch leaves intended Pods outside this policy.', 'Kubernetes NetworkPolicy evaluator');
    if (/^spec\.podSelector\.matchExpressions\[\]\.key$/u.test(normalized)) return operational('Selects the Pod label key evaluated by this NetworkPolicy match expression.', 'A valid Kubernetes label key.', 'The key is required for a match expression; an empty value fails admission.', 'Changes which label dimension selects protected Pods.', 'A wrong key selects no intended Pods or a different Pod set.', 'Kubernetes NetworkPolicy evaluator');
    if (/^spec\.podSelector\.matchExpressions\[\]\.operator$/u.test(normalized)) return operational('Selects the set operation used by this NetworkPolicy label expression.', 'Exactly `In`, `NotIn`, `Exists`, or `DoesNotExist`.', 'The operator is required; an empty value fails admission.', 'Changes how the key and values select protected Pods.', 'An invalid operator fails admission; a valid but wrong operator can invert policy scope.', 'Kubernetes NetworkPolicy evaluator');
    if (/^spec\.podSelector\.matchExpressions\[\]\.values\[\]$/u.test(normalized)) return operational('Adds one label value used by the enclosing NetworkPolicy selector expression.', 'A valid Kubernetes label value; values are required for `In` and `NotIn` and forbidden for existence operators.', 'An empty item is a literal empty label value, not omission. Removing all values invalidates value-based operators.', 'Changes the Pod set selected by the enclosing expression.', 'An invalid operator/value combination fails admission; a wrong value leaves intended Pods unprotected.', 'Kubernetes NetworkPolicy evaluator');
    if (/^spec\.policyTypes\[\]$/u.test(normalized)) return operational('Selects one traffic direction isolated by this NetworkPolicy.', 'Exactly `Ingress` or `Egress`.', 'Omission triggers networking.k8s.io/v1 defaulting from present rule sections; an empty item is invalid.', 'Changes whether ingress, egress, or both directions default to denied except for explicit allows.', 'Omitting a required direction leaves traffic unisolated; adding one without allow rules blocks that direction.', 'Kubernetes NetworkPolicy evaluator');
  }
  if (resource.kind === 'Namespace' && /^metadata\.labels\.pod-security\.kubernetes\.io\/(?:audit|enforce|warn)$/u.test(normalized)) return operational('Selects the Pod Security Admission level for this namespace and enforcement mode named by the label.', 'Exactly `privileged`, `baseline`, or `restricted` for the configured Kubernetes Pod Security Admission version.', 'Removing the label delegates that mode to cluster-level Pod Security Admission configuration. An empty value is invalid as a level.', 'Changes whether violating Pods are denied, warned, or recorded for this namespace.', 'A weak level admits unsafe Pods. A strict level can reject workloads whose securityContext is incomplete.', 'Kubernetes Pod Security Admission controller');
  if (resource.kind === 'Service' && /^spec\.selector\./u.test(normalized)) return operational('Sets one exact Pod-label equality requirement used by this Service.', 'A valid Kubernetes label value for the exact selector key.', 'Removing the selector entry broadens or changes endpoint selection; a Service without a selector requires externally managed EndpointSlices.', 'Changes which Pods receive traffic sent to the Service.', 'A mismatch yields no ready endpoints; an over-broad selector routes traffic to unintended Pods.', 'Kubernetes Service and EndpointSlice controllers');
  throw new Error(`CONFIG_YAML_API_CONTRACT_GAP: ${api} ${normalized} has no exact operational or proved-structural contract`);
}

function versionedApiSchemaContract(schema) {
  const constraints = [`type \`${schema.type ?? 'schema-defined'}\``];
  if (schema.enum?.length) constraints.push(`one of ${schema.enum.map((value) => `\`${String(value)}\``).join(', ')}`);
  if (schema.format) constraints.push(`format \`${schema.format}\``);
  if (schema.minimum !== null && schema.minimum !== undefined) constraints.push(`minimum ${schema.minimum}`);
  if (schema.maximum !== null && schema.maximum !== undefined) constraints.push(`maximum ${schema.maximum}`);
  const acceptedValues = `The pinned authority (${schema.authority}) defines ${constraints.join('; ')} for the exact leaf \`${schema.resolvedPath}\`.`;
  const defaultBehavior = schema.default === '<no schema default>'
    ? 'The exact field schema defines no default.'
    : `The exact field schema default is \`${JSON.stringify(schema.default)}\`.`;
  const omissionBehavior = schema.requiredBySchema
    ? 'The parent schema requires this field, so omission fails schema validation.'
    : `The parent schema permits omission. ${defaultBehavior}`;
  const emptyBehavior = schema.nullable
    ? 'The exact schema permits null. Any other empty value must satisfy the same type, enum, format, and range constraints.'
    : 'The exact schema does not permit null. An empty string, list, or object is an authored value and must satisfy the same type, enum, format, range, and parent constraints.';
  return { acceptedValues, defaultBehavior, omissionBehavior, emptyBehavior };
}

function yamlMeaning(context, exactPath, valueType, semantics, authority) {
  if (valueType === 'object' || valueType === 'array') return { status: 'structural-container', text: 'Structural container. Child leaf rows define configurable behavior.', evidence: context.sourcePath, blockerOwner: null, closureCondition: null };
  if (authority && context.resource && semantics.deploymentBoundary) {
    const receiverProved = semantics.consumers.length > 0
      && semantics.consumers.every((consumer) => consumer.kind !== 'embedded-payload-consumer-unproved');
    return {
    status: receiverProved ? 'embedded-payload-authority' : 'embedded-payload-meaning-blocker',
    text: `${context.resource.apiVersion}/${context.resource.kind} stores this value as ${semantics.deploymentBoundary.replaceAll('-', ' ')}; Kubernetes validates only its outer type. ${authority.purpose} Accepted values: ${authority.acceptedValues} Selected default: the checked-in value in this row is the repository baseline. Empty or omitted value: ${authority.emptyBehavior}`,
    evidence: `${context.sourcePath}:${context.fieldLine}; scripts/docs-yaml-field-authorities.mjs`,
    acceptedValues: authority.acceptedValues,
    emptyBehavior: authority.emptyBehavior,
    sourceFileSha256: authority.sourceFileSha256,
    semanticAuthorityEvidence: authority.semanticAuthorityEvidence,
    semanticContractEvidence: authority.semanticContractEvidence,
    semanticContractBinding: authority.semanticContractBinding ?? null,
    externalChart: null,
    blockerOwner: receiverProved ? null : sourceOwner(context.sourcePath).component,
    closureCondition: receiverProved ? null : 'Add an exact checked-in reader or a pinned external image/controller contract for this payload.',
  };
  }
  if (context.resource && semantics.deploymentBoundary) {
    return {
      status: 'embedded-payload-meaning-blocker',
      text: `${context.resource.apiVersion}/${context.resource.kind} stores this as ${semantics.deploymentBoundary.replaceAll('-', ' ')}. Kubernetes validates only the outer field type, and no exact receiving-controller or process contract explains this value.`,
      evidence: context.sourcePath,
      blockerOwner: sourceOwner(context.sourcePath).component,
      closureCondition: 'Add an exact source-path and field-path authority with the receiving controller or process, purpose, accepted values, default and empty behavior, impact, and failure symptom.',
    };
  }
  if (context.resource) {
    const contract = deploymentApiFieldContract(context.resource, exactPath);
    const schemaAuthority = {
      ...apiFieldSchemaAuthority(context.resource.apiVersion, context.resource.kind, exactPath),
      fieldPath: exactPath,
    };
    const schemaContract = versionedApiSchemaContract(schemaAuthority);
    return {
      status: contract.status,
      text: `${contract.purpose} Accepted values: ${schemaContract.acceptedValues} Operational constraint: ${contract.acceptedValues} Default: ${schemaContract.defaultBehavior} Omission: ${schemaContract.omissionBehavior} Empty value: ${schemaContract.emptyBehavior} Operational result after omission or an empty value: ${contract.emptyBehavior}`,
      evidence: `${context.sourcePath}:${context.fieldLine ?? 1}; ${schemaAuthority.authority}; sha256:${schemaAuthority.authoritySha256}`,
      acceptedValues: `${schemaContract.acceptedValues} ${contract.acceptedValues}`,
      defaultBehavior: schemaContract.defaultBehavior,
      omissionBehavior: schemaContract.omissionBehavior,
      emptyBehavior: `${schemaContract.emptyBehavior} ${contract.emptyBehavior}`,
      apiAuthority: `${schemaAuthority.authority}; ${contract.apiAuthority}`,
      apiSchemaAuthority: schemaAuthority,
      sourceLine: context.fieldLine ?? 1,
      sourceLineSha256: sha256(read(context.sourcePath).split('\n')[(context.fieldLine ?? 1) - 1] ?? ''),
      blockerOwner: null,
      closureCondition: null,
    };
  }
  if (authority) return {
    status: authority.externalChart ? 'external-chart-authority' : authority.chartRoot ? 'local-helm-field-authority' : 'implementation-authority',
    text: `${authority.purpose} Accepted values: ${authority.acceptedValues} ${context.sourceClass === 'helm-values'
      ? 'Selected chart default: the checked-in value in this row is the chart default.'
      : context.sourceClass === 'helm-example'
        ? 'Selected example value: the checked-in value in this row is an example selection, not a chart default.'
        : 'Selected overlay value: the checked-in value in this row is an overlay selection, not a chart default.'} Empty or omitted value: ${authority.emptyBehavior}`,
    evidence: authority.externalChart
      ? `${context.sourcePath}:${context.fieldLine}; scripts/docs-yaml-field-authorities.mjs; ${authority.externalChart.chart}@${authority.externalChart.version}; archive sha256:${authority.externalChart.archiveSha256}`
      : authority.chartRoot
        ? `${context.sourcePath}:${context.fieldLine}; ${semantics.consumers.map((consumer) => `${consumer.path}:${consumer.line}`).join('; ')}; scripts/docs-local-helm-field-authorities.json`
        : `${context.sourcePath}:${context.fieldLine}; scripts/docs-yaml-field-authorities.mjs`,
    acceptedValues: authority.acceptedValues,
    emptyBehavior: authority.emptyBehavior,
    sourceFileSha256: authority.sourceFileSha256,
    externalChart: authority.externalChart ?? null,
    localHelmChart: authority.chartRoot ?? null,
    semanticGroup: authority.group ?? null,
    semanticAuthorityEvidence: authority.semanticAuthorityEvidence,
    semanticContractEvidence: authority.semanticContractEvidence,
    semanticContractBinding: authority.semanticContractBinding ?? null,
    blockerOwner: null,
    closureCondition: null,
  };
  const dottedPath = exactPath.replace(/\[[0-9]+\]/gu, '[]');
  const consumer = semantics.consumers.find((item) => item !== 'unknown');
  const inactive = semantics.required === 'not-applicable-unused'
    || (semantics.consumers.length > 0 && semantics.consumers.every((item) => item?.inactiveProfile === true || item?.kind === 'not-applicable'));
  if (inactive) return {
    status: 'inactive-profile',
    text: context.sourcePath === 'my-values/infra/litellm-values.yaml'
      ? 'This leaf belongs to an unselected Helm-style LiteLLM profile. The current deployment reads my-values/infra/litellm-config.yaml and renders my-values/infra/litellm-deployment.yaml. Editing this profile changes no checked-in deployment path.'
      : `This leaf belongs to the inactive profile ${context.sourcePath}. No checked-in render or deploy path selects that profile, so operators must not treat the leaf as effective configuration.`,
    evidence: context.sourcePath === 'my-values/infra/litellm-values.yaml'
      ? 'scripts/deploy.sh:1175'
      : consumer?.path ? `${consumer.path}:${consumer.line ?? 1}` : context.sourcePath,
    blockerOwner: context.owner.component,
    closureCondition: semantics.closureCondition,
  };
  const external = semantics.required === 'external-schema';
  if (consumer?.kind?.startsWith('helm-template')) {
    return {
      status: 'template-render-meaning-blocker',
      text: `${dottedPath} reaches the exact Helm expression \`${consumer.templateExpression}\`, but that render link alone does not explain purpose, accepted values, default and empty behavior, impact, or the receiving failure symptom.`,
      evidence: `${consumer.path}:${consumer.line}`,
      blockerOwner: context.owner.component,
      closureCondition: `Add an exact ${context.sourcePath}#$.${exactPath} local Helm authority and pin every linked template source.`,
    };
  }
  return {
    status: external ? 'external-schema-meaning-blocker' : 'implementation-only-meaning-blocker',
    text: external
      ? `${dottedPath} belongs to ${consumer?.authority ?? 'an external schema'}, but this repository has no maintained field-level behavior and failure explanation.`
      : `${dottedPath} reaches ${consumer?.path ?? 'the linked consumer'}, but the link alone does not explain its purpose, accepted values, empty/default behavior, or failure symptom.`,
    evidence: consumer?.path ? `${consumer.path}:${consumer.line ?? 1}` : context.sourcePath,
    blockerOwner: context.owner.component,
    closureCondition: `Add a source-backed ${dottedPath} explanation with purpose, accepted values, default/empty behavior, change impact, and failure symptom.`,
  };
}

function yamlFields(value, context, fieldPath = '$', result = [], pathSegments = []) {
  const valueType = typeOf(value);
  const exactPath = fieldPath === '$' ? '' : fieldPath.replace(/^\$\.?/, '');
  const node = pathSegments.length ? context.document?.getIn(pathSegments, true) : context.document?.contents;
  const fieldLine = Array.isArray(node?.range) ? context.lineCounter?.linePos(node.range[0]).line : 1;
  const fieldContext = { ...context, fieldLine };
  const discoveredSemantics = yamlSemantics(fieldContext, exactPath, valueType);
  const authority = valueType === 'object' || valueType === 'array' ? null : exactYamlAuthority(context, fieldPath);
  if (authority?.chartRoot && !allowLocalHelmAuthorityMaintenance) {
    const actualConsumers = discoveredSemantics.consumers.map((consumer) => ({
      path: consumer.path,
      kind: consumer.kind,
      templateExpression: consumer.templateExpression,
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const expectedConsumers = authority.consumerProof.map((consumer) => ({
      path: consumer.path,
      kind: consumer.kind,
      templateExpression: consumer.templateExpression,
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    assert.deepEqual(actualConsumers, expectedConsumers,
      `CONFIG_YAML_AUTHORITY_DRIFT: exact Helm consumer changed for ${context.sourcePath}#${fieldPath}`);
  }
  const runtimeProofConsumers = authority?.runtimeConsumerProof?.map((proof) => ({
    path: proof.path,
    line: proof.line,
    kind: proof.kind,
    direction: 'read',
    authority: proof.authority ?? `The checked-in runtime reads ${proof.environment} through ${proof.access}.`,
  })) ?? [];
  let semantics = authority ? {
    ...discoveredSemantics,
    consumers: [
      ...(authority.chartRoot ? discoveredSemantics.consumers.map((consumer) => ({
        ...consumer,
        exactValuePath: fieldPath.replace(/^\$\.?/u, ''),
      })) : discoveredSemantics.consumers),
      ...runtimeProofConsumers,
    ],
    constraints: [...new Set([...discoveredSemantics.constraints, authority.acceptedValues, `empty/omitted: ${authority.emptyBehavior}`])],
    runtimeOwner: runtimeProofConsumers.length
      ? `${discoveredSemantics.runtimeOwner}; checked-in runtime consumers linked below`
      : discoveredSemantics.runtimeOwner,
    precedence: runtimeProofConsumers.length
      ? [...discoveredSemantics.precedence, 'checked-in runtime parsing or effect']
      : discoveredSemantics.precedence,
    effectiveValueProof: runtimeProofConsumers.length
      ? `${discoveredSemantics.effectiveValueProof} -> ${runtimeProofConsumers[0].path}:${runtimeProofConsumers[0].line}`
      : discoveredSemantics.effectiveValueProof,
    changeImpact: authority.impact,
    failureMeaning: authority.failure,
  } : discoveredSemantics;
  if (!authority && context.resource && discoveredSemantics.deploymentBoundary === undefined
    && !['object', 'array'].includes(valueType)) {
    const apiContract = deploymentApiFieldContract(context.resource, exactPath);
    semantics = {
      ...semantics,
      constraints: [...new Set([...semantics.constraints, apiContract.acceptedValues])],
      changeImpact: apiContract.impact,
      failureMeaning: apiContract.failure,
      effectiveValueProof: `${context.sourcePath}#$.${exactPath} -> ${apiContract.apiAuthority}`,
    };
  }
  // The node range belongs to the exact scalar/sequence item, not to its parent
  // mapping.  Pass that context through so every API-field citation and digest is
  // bound to the leaf that the row describes.
  const meaning = yamlMeaning(fieldContext, exactPath, valueType, semantics, authority);
  result.push({
    path: fieldPath,
    type: valueType,
    required: semantics.required,
    requiredReason: semantics.requiredReason,
    defaultKind: semantics.defaultKind,
    value: valueType === 'object' || valueType === 'array' ? `<${valueType}>`
      : context.resource?.kind === 'Secret' && /^(?:data|stringData)\./u.test(exactPath) ? '<redacted:secret-payload>'
        : redactValue(fieldPath, value),
    constraints: semantics.constraints,
    ownerComponent: context.owner.component,
    ownerEvidence: context.owner.evidence,
    runtimeOwner: semantics.runtimeOwner,
    consumers: semantics.consumers,
    precedence: semantics.precedence,
    effectiveValueProof: semantics.effectiveValueProof,
    changeImpact: semantics.changeImpact,
    failureMeaning: semantics.failureMeaning,
    // Publish blocker metadata from the final meaning. An exact authority can
    // replace a discovered blocker, so the pre-authority metadata is stale at
    // this point.
    blockerOwner: meaning.blockerOwner,
    closureCondition: meaning.closureCondition,
    sourceLine: fieldLine,
    sourceLineSha256: sha256(read(context.sourcePath).split('\n')[fieldLine - 1] ?? ''),
    meaning,
  });
  if (Array.isArray(value)) {
    value.forEach((item, index) => yamlFields(item, context, `${fieldPath}[${index}]`, result, [...pathSegments, index]));
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value).sort()) {
      // Capability identifiers are map keys, not object path segments.  Quote
      // dotted identifiers at the map boundary so runtime.dispatch and
      // test.plan.execute remain one key in every public field path.
      const next = yamlFieldChildPath(fieldPath, key);
      yamlFields(value[key], context, next, result, [...pathSegments, key]);
    }
  }
  return result;
}

function buildYamlInventory() {
  assertYamlAuthorityRegistry(root);
  if (!allowLocalHelmAuthorityMaintenance) assertLocalHelmAuthorityRegistry(root);
  const consumerMap = chartConsumers();
  const valueBindings = gitOpsValueBindings();
  const externalProfiles = externalChartProfileBindings();
  const files = yamlSources().map((sourcePath) => {
    const text = read(sourcePath);
    const sourceDigest = sha256(text);
    const exactDeclaration = yamlAuthorityFile(sourcePath);
    const localDeclaration = localHelmAuthorityFile(sourcePath);
    const declaration = exactDeclaration ?? localDeclaration;
    if (declaration && declaration.sourceSha256 !== sourceDigest
      && !(localDeclaration && allowLocalHelmAuthorityMaintenance)) {
      throw new Error(`CONFIG_YAML_AUTHORITY_DRIFT: ${sourcePath} changed without an exact field-authority update; expected ${declaration.sourceSha256}, got ${sourceDigest}`);
    }
    const lineCounter = new YAML.LineCounter();
    const documents = YAML.parseAllDocuments(text, { prettyErrors: false, lineCounter });
    const errors = documents.flatMap((document, index) => document.errors.map((error) => ({ document: index, message: error.message })));
    const chartRootMatch = sourcePath.match(/^(charts\/[^/]+)\//);
    const sourceClass = yamlClass(sourcePath);
    const localBinding = localHelmBinding(sourcePath);
    const runtimeBindings = runtimeFileBindings(sourcePath);
    const directExternalBindings = directExternalChartBindings(sourcePath);
    return {
      path: sourcePath,
      sourceClass,
      sourceDigest,
      parseErrors: errors,
      documents: documents.map((document, index) => {
        const value = document.errors.length ? null : document.toJS();
        const resource = value?.apiVersion && value?.kind ? { apiVersion: value.apiVersion, kind: value.kind, name: value.metadata?.name ?? '<unnamed>' } : null;
        return {
        index,
        resource,
        fields: document.errors.length ? [] : yamlFields(value, {
          sourcePath,
          sourceDigest,
          chartRoot: chartRootMatch?.[1] ?? localBinding?.chartRoot ?? null,
          consumerMap,
          sourceClass,
          owner: sourceOwner(sourcePath),
          resource,
          document,
          documentValue: value,
          lineCounter,
          externalBindings: [...(valueBindings.get(sourcePath) ?? []), ...directExternalBindings, ...(externalProfiles.get(sourcePath) ?? []), ...(localBinding?.externalBinding ? [localBinding.externalBinding] : [])],
          runtimeBindings: sourcePath === 'gitops/platform/values/codex-ops.yaml'
            ? runtimeBindings
            : (chartRootMatch?.[1] ?? localBinding?.chartRoot) ? [] : runtimeBindings,
        }),
      };}),
    };
  });
  const allFields = files.flatMap((file) => file.documents.flatMap((document) => document.fields));
  for (const file of files) {
    const actualPaths = new Set(file.documents.flatMap((document) => document.fields)
      .filter((field) => !['object', 'array'].includes(field.type)).map((field) => field.path));
    const registeredPaths = [
      ...yamlAuthorityPaths(file.path),
      ...(allowLocalHelmAuthorityMaintenance ? [] : localHelmAuthorityPaths(file.path)),
    ];
    for (const registeredPath of registeredPaths) {
      assert(actualPaths.has(registeredPath), `CONFIG_YAML_AUTHORITY_DRIFT: obsolete exact authority ${file.path}#${registeredPath}`);
    }
  }
  const leafFields = allFields.filter((field) => field.type !== 'object' && field.type !== 'array');
  // A public path is an identity, not display prose. A literal key that contains
  // a dot must therefore remain one bracket-quoted segment. This also proves
  // that a literal `a.b` key cannot collide with nested `a: { b: ... }`.
  assert.notEqual(yamlFieldPath(['collision', 'a.b']), yamlFieldPath(['collision', 'a', 'b']),
    'CONFIG_YAML_PATH_COLLISION: literal dotted key and nested keys have the same identity');
  const dottedKeyLeaves = leafFields.filter((field) => yamlFieldPathTokens(field.path)
    .some((token) => typeof token === 'string' && token.includes('.')));
  for (const field of dottedKeyLeaves) {
    for (const token of yamlFieldPathTokens(field.path).filter((item) => typeof item === 'string' && item.includes('.'))) {
      assert(field.path.includes(`[${JSON.stringify(token)}]`),
        `CONFIG_YAML_DOTTED_KEY_FLATTENED: ${field.path} does not preserve literal key ${token}`);
    }
  }
  assert.equal(dottedKeyLeaves.length, 112,
    'CONFIG_YAML_DOTTED_KEY_COVERAGE: the checked-in dotted-key leaf set changed; inspect and classify every new or removed leaf');
  for (const [sourcePath, exactPath] of [
    ['my-values/infra/argocd-values.yaml', '$.configs.cm["application.resourceTrackingMethod"]'],
    ['my-values/infra/argocd-values.yaml', '$.configs.params["server.insecure"]'],
    ['examples/cilium/project-network-policy.yaml', '$.metadata.labels["pod-security.kubernetes.io/enforce"]'],
    ['my-values/infra/registry-local.yaml', '$.data["config.yml"]'],
    ['my-values/nova-values.yaml', '$.capabilityProviders.buster.capabilities["runtime.dispatch"].port'],
    ['my-values/nova-values.yaml', '$.capabilityProviders.buster.capabilities["test.plan.execute"].port'],
  ]) {
    assert(files.find((file) => file.path === sourcePath)?.documents.some((document) => document.fields.some((field) => field.path === exactPath)),
      `CONFIG_YAML_DOTTED_KEY_NAMED_REGRESSION: ${sourcePath}#${exactPath} is missing`);
  }
  const opsCilium = files.find((file) => file.path === 'gitops/platform/values/codex-ops.yaml')
    ?.documents.flatMap((document) => document.fields)
    .find((field) => field.path === '$.networkPolicy.cilium');
  assert(opsCilium, 'CONFIG_GITOPS_OPS_CILIUM_MISSING: exact GitOps Cilium field is missing');
  assert.equal(opsCilium.runtimeOwner, 'Helm release rendered from charts/ops-pod',
    'CONFIG_GITOPS_OPS_CILIUM_OWNER: the forwarding script was mistaken for the final runtime owner');
  assert(opsCilium.consumers.some((consumer) => consumer.path === 'charts/ops-pod/templates/network.yaml'
    && consumer.line === 37),
  'CONFIG_GITOPS_OPS_CILIUM_CONSUMER: the final chart template consumer is missing');
  assert(opsCilium.precedence.includes('charts/ops-pod/values.yaml chart defaults merged by Helm'),
    'CONFIG_GITOPS_OPS_CILIUM_PRECEDENCE: chart-default merge is missing');
  assert.match(`${opsCilium.meaning.text} ${opsCilium.meaning.emptyBehavior ?? ''}`,
    /networkPolicy\.enabled=true[\s\S]*parent false[\s\S]*neither policy/iu,
  'CONFIG_GITOPS_OPS_CILIUM_PARENT_GATE: the parent-child truth table is missing');
  const busterFields = files.find((file) => file.path === 'my-values/buster-values.yaml')
    ?.documents.flatMap((document) => document.fields) ?? [];
  for (const fieldPath of [
    '$.extraContainers[0].securityContext.allowPrivilegeEscalation',
    '$.extraContainers[0].securityContext.privileged',
    '$.extraContainers[0].securityContext.runAsNonRoot',
    '$.extraContainers[0].volumeMounts[2].readOnly',
  ]) {
    const field = busterFields.find((item) => item.path === fieldPath);
    assert(field?.consumers.some((consumer) => consumer.path === 'charts/kubeclaw/templates/_registry-clients.tpl'
      && consumer.line === 51 && consumer.helperCallProof?.path === 'charts/kubeclaw/templates/deployment.yaml'
      && consumer.helperCallProof?.line === 1525),
    `CONFIG_BUSTER_REGISTRY_HELPER_CONSUMER: ${fieldPath} lacks its exact helper serialization path`);
    assert(!field.consumers.some((consumer) => consumer.path === 'charts/kubeclaw/templates/deployment.yaml'
      && consumer.line === 1527),
    `CONFIG_BUSTER_REGISTRY_HELPER_BRANCH: ${fieldPath} incorrectly cites the non-Buster else branch`);
  }
  const apiLeafFields = leafFields.filter((field) => field.meaning.status.startsWith('deployment-'));
  const forbiddenApiPhrases = /where defined|states whether|uses pinned default|controller behavior|commonly/iu;
  for (const file of files) {
    const sourceLines = read(file.path).split('\n');
    for (const document of file.documents) {
      for (const field of document.fields.filter((item) => !['object', 'array'].includes(item.type))) {
        const sourceLine = sourceLines[field.sourceLine - 1] ?? '';
        assert.equal(field.sourceLineSha256, sha256(sourceLine),
          `CONFIG_YAML_LEAF_LINE_DRIFT: ${file.path}#${field.path} does not bind its exact AST leaf line`);
        if (!field.meaning.status.startsWith('deployment-')) continue;
        assert.equal(field.meaning.sourceLine, field.sourceLine,
          `CONFIG_YAML_API_LEAF_LINE_DRIFT: ${file.path}#${field.path} cites a different line from its exact AST leaf`);
        assert.equal(field.meaning.sourceLineSha256, field.sourceLineSha256,
          `CONFIG_YAML_API_LEAF_DIGEST_DRIFT: ${file.path}#${field.path} cites a different digest from its exact AST leaf`);
        assert(!forbiddenApiPhrases.test(`${field.meaning.text} ${field.meaning.emptyBehavior ?? ''}`),
          `CONFIG_YAML_API_VAGUE_CONTRACT: ${file.path}#${field.path} uses forbidden non-versioned omission wording`);
      }
    }
  }
  const authoredAuthorityStatuses = new Set([
    'embedded-payload-authority', 'external-chart-authority', 'implementation-authority', 'local-helm-field-authority',
  ]);
  let authoredAuthorityEvidenceCount = 0;
  for (const file of files) for (const document of file.documents) {
    for (const field of document.fields.filter((item) => authoredAuthorityStatuses.has(item.meaning.status))) {
      assert(field.sourceLine >= 1 && field.meaning.evidence.includes(`${file.path}:${field.sourceLine}`),
        `CONFIG_YAML_AUTHORITY_LINE_MISSING: ${file.path}#${field.path} has no exact supporting source line`);
      if (field.meaning.status === 'local-helm-field-authority') {
        assert(field.consumers.every((consumer) => consumer.line >= 1
          && field.meaning.evidence.includes(`${consumer.path}:${consumer.line}`)),
        `CONFIG_YAML_LOCAL_HELM_AUTHORITY_LINE_MISSING: ${file.path}#${field.path} has no exact template authority line`);
      }
      const registration = field.meaning.semanticAuthorityEvidence;
      const contractEvidence = field.meaning.semanticContractEvidence;
      assert(registration?.line > 1 && exists(registration.path),
        `CONFIG_YAML_SEMANTIC_AUTHORITY_LINE_MISSING: ${file.path}#${field.path}`);
      const authorityLines = read(registration.path).split('\n');
      assert.equal(sha256(authorityLines[registration.line - 1] ?? ''), registration.sourceLineSha256,
        `CONFIG_YAML_SEMANTIC_AUTHORITY_LINE_DRIFT: ${file.path}#${field.path}`);
      assert(contractEvidence?.path === registration.path && contractEvidence.line > 1
        && contractEvidence.endLine >= contractEvidence.line,
      `CONFIG_YAML_SEMANTIC_CONTRACT_RANGE_MISSING: ${file.path}#${field.path}`);
      assert.equal(sha256(authorityLines.slice(contractEvidence.line - 1, contractEvidence.endLine).join('\n')), contractEvidence.sourceRangeSha256,
        `CONFIG_YAML_SEMANTIC_CONTRACT_RANGE_DRIFT: ${file.path}#${field.path}`);
      authoredAuthorityEvidenceCount += 1;
    }
  }
  assert.equal(authoredAuthorityEvidenceCount, 1223,
    'CONFIG_YAML_SEMANTIC_AUTHORITY_COVERAGE: all 418 authored YAML and 805 local Helm authorities need exact semantic source ranges');
  assert.equal(apiLeafFields.length, leafFields.filter((field) => field.meaning.sourceLine !== undefined).length,
    'CONFIG_YAML_API_LEAF_LINE_DRIFT: every and only API leaves must carry an exact semantic source line');
  const unknownLeafConsumers = leafFields.filter((field) => field.consumers.some((consumer) => consumer === 'unknown')).length;
  const unknownLeafRuntimeOwners = leafFields.filter((field) => field.runtimeOwner === 'unknown').length;
  const unknownLeafRequired = leafFields.filter((field) => field.required === 'conditional-or-unknown').length;
  const semanticGapIds = files.flatMap((file) => file.documents.flatMap((document) => document.fields
    .filter((field) => !['object', 'array'].includes(field.type)
      && (/blocker/u.test(field.meaning?.status ?? '') || (file.sourceClass === 'helm-values' && field.meaning?.status === 'inactive-profile')))
    .map((field) => `${file.path}#${field.path}`)));
  if (!allowSemanticGaps && semanticGapIds.length) {
    throw new Error(`CONFIG_SEMANTIC_GAP: public YAML options lack qualified semantic authority: ${semanticGapIds.slice(0, 12).join(', ')}. Expected authority: exact source path + full field path with purpose, accepted values, default/empty behavior, impact, and failure symptom.`);
  }
  assert.equal(unknownLeafRuntimeOwners, 0, 'quality gate: leaf runtime ownership must be resolved, not mass-unknown');
  assert.equal(unknownLeafConsumers, 0, 'quality gate: leaf consumers must resolve to an authority or an explicit not-applicable binding');
  assert.equal(unknownLeafRequired, 0, 'quality gate: leaf required state must be source-backed, external-schema, or explicitly not applicable');
  assert.equal(leafFields.filter((field) => !field.meaning?.status || !field.meaning?.text || !field.meaning?.evidence).length, 0,
    'quality gate: every YAML leaf needs a semantic authority or an explicit owned documentation blocker');
  assert.equal(leafFields.filter((field) => /blocker/u.test(field.meaning.status) && (!field.meaning.blockerOwner || !field.meaning.closureCondition)).length, 0,
    'quality gate: every unresolved YAML meaning needs an owner and concrete closure condition');
  assert.equal(allFields.filter((field) => field.blockerOwner !== field.meaning.blockerOwner
    || field.closureCondition !== field.meaning.closureCondition).length, 0,
  'quality gate: top-level YAML blocker metadata must match the final field meaning');
  assert.equal(allFields.filter((field) => !/blocker/u.test(field.meaning.status)
    && field.meaning.status !== 'inactive-profile'
    && (field.blockerOwner !== null || field.closureCondition !== null)).length, 0,
  'quality gate: resolved YAML meanings must not retain stale blocker metadata');
  return {
    generatedBy: 'scripts/docs-configuration-inventory.mjs',
    discovery: {
      roots: SOURCE_ROOTS,
      rule: 'all YAML below examples, gitops, my-values, and releases/values; chart root values.yaml and ci-values.yaml',
    },
    files,
    totals: {
      files: files.length,
      documents: files.reduce((sum, file) => sum + file.documents.length, 0),
      fields: files.reduce((sum, file) => sum + file.documents.reduce((count, document) => count + document.fields.length, 0), 0),
      unresolvedSourceOwner: allFields.filter((field) => field.ownerComponent === 'unknown').length,
      unknownRuntimeOwner: allFields.filter((field) => field.runtimeOwner === 'unknown').length,
      unknownConsumer: allFields.filter((field) => field.consumers.includes('unknown')).length,
      conditionalOrUnknownRequired: allFields.filter((field) => field.required === 'conditional-or-unknown').length,
      leafFields: leafFields.length,
      kubernetesApiObjectLeaves: leafFields.filter((field) => field.meaning.status.startsWith('deployment-')).length,
      kubernetesOperationalLeaves: leafFields.filter((field) => field.meaning.status === 'deployment-operational-authority').length,
      kubernetesStructuralLeaves: leafFields.filter((field) => field.meaning.status === 'deployment-structural-authority').length,
      activeOperatorConfigurationLeaves: leafFields.filter((field) => !field.meaning.status.startsWith('deployment-') && field.meaning.status !== 'inactive-profile').length,
      unknownLeafRuntimeOwner: unknownLeafRuntimeOwners,
      unknownLeafConsumer: unknownLeafConsumers,
      unknownLeafRequired,
      explicitlyUnboundLeaves: leafFields.filter((field) => field.required === 'not-applicable-unused').length,
      authoredLeafMeanings: leafFields.filter((field) => field.meaning.status === 'authored-authority').length,
      implementationLeafMeanings: leafFields.filter((field) => field.meaning.status === 'implementation-authority').length,
      localHelmFieldMeanings: leafFields.filter((field) => field.meaning.status === 'local-helm-field-authority').length,
      mechanicalTemplateMeanings: leafFields.filter((field) => field.meaning.status === 'template-render-authority').length,
      embeddedPayloadAuthorities: leafFields.filter((field) => field.meaning.status === 'embedded-payload-authority').length,
      externalChartLeafMeanings: leafFields.filter((field) => field.meaning.status === 'external-chart-authority').length,
      externalSchemaLeafMeanings: leafFields.filter((field) => field.meaning.status === 'external-schema-authority').length,
      inactiveProfileLeaves: leafFields.filter((field) => field.meaning.status === 'inactive-profile').length,
      embeddedPayloadContractsNeedingConsumerProof: leafFields.filter((field) => field.meaning.status === 'embedded-payload-meaning-blocker').length,
      activeMeaningBlockers: leafFields.filter((field) => /blocker/u.test(field.meaning.status)).length,
      semanticGapBaselineEntries: 0,
      externalSchemaMeaningBlockers: leafFields.filter((field) => field.meaning.status === 'external-schema-meaning-blocker').length,
      implementationMeaningBlockers: leafFields.filter((field) => field.meaning.status === 'implementation-only-meaning-blocker').length,
    },
  };
}

function registeredSchemaAuthorities() {
  const authorities = new Map();
  const add = (key, authority) => {
    const current = authorities.get(key);
    if (current) current.registrations.push(...authority.registrations);
    else authorities.set(key, authority);
  };
  const platformSchema = 'skills/common/plugin-runtime/foundation/config/platform.schema.json';
  if (exists(platformSchema)) add(platformSchema, { path: platformSchema, schema: null, registrations: [{ manifest: platformSchema, pointer: '$' }] });
  for (const skillRoot of ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins']) {
    for (const manifest of walk(skillRoot, (absolutePath) => /\/(?:plugin|openclaw\.plugin)\.json$/.test(absolutePath))) {
      const visit = (item, pointer = '$') => {
        if (Array.isArray(item)) return item.forEach((child, index) => visit(child, `${pointer}[${index}]`));
        if (!item || typeof item !== 'object') return;
        for (const [key, child] of Object.entries(item)) {
          const childPointer = `${pointer}.${key}`;
          if (key === 'configSchema' && typeof child === 'string') {
            const schemaPath = relative(path.resolve(root, path.dirname(manifest), child));
            assert(fs.existsSync(path.join(root, schemaPath)), `${manifest}${childPointer} registers missing config schema ${schemaPath}`);
            add(schemaPath, { path: schemaPath, schema: null, registrations: [{ manifest, pointer: childPointer }] });
          } else if (key === 'configSchema' && child && typeof child === 'object') {
            const authorityKey = `${manifest}#${childPointer}`;
            add(authorityKey, { path: manifest, schema: child, registrations: [{ manifest, pointer: childPointer }] });
          } else visit(child, childPointer);
        }
      };
      visit(JSON.parse(read(manifest)));
    }
  }
  return [...authorities.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, authority]) => ({ key, ...authority }));
}

function schemaSources() {
  return registeredSchemaAuthorities().map((authority) => authority.path).filter((item, index, all) => all.indexOf(item) === index);
}

function nearestPackage(sourcePath) {
  let directory = path.dirname(path.join(root, sourcePath.split('#')[0]));
  while (directory.startsWith(root)) {
    const packagePath = path.join(directory, 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return { name: packageJson.name ?? '<unnamed-package>', path: relative(packagePath) };
    }
    if (directory === root) break;
    directory = path.dirname(directory);
  }
  return null;
}

function schemaRegistrationEvidence(sourcePath) {
  const pluginRoot = sourcePath === 'skills/common/plugin-runtime/foundation/config/platform.schema.json'
    ? 'skills/common/plugin-runtime/foundation'
    : sourcePath.includes('/schemas/') ? sourcePath.split('/schemas/')[0] : path.dirname(sourcePath);
  const candidates = ['plugin.json', 'manifest.json', 'package.json']
    .map((name) => `${pluginRoot}/${name}`)
    .filter(exists);
  const directConsumers = [];
  for (const candidate of walk(pluginRoot, (absolutePath) => /\.(?:ts|mts|js|mjs|json)$/.test(absolutePath))) {
    if (candidate === sourcePath || candidate.includes('/tests/')) continue;
    const text = read(candidate);
    if (/config\.schema\.json|schemas\/config|configSchema/.test(text)) directConsumers.push(candidate);
  }
  return { candidates, directConsumers: [...new Set(directConsumers)].sort() };
}

const SCHEMA_RUNTIME_CONTEXTS = new Map(Object.entries({
  'skills/buster/plugins/api-flow/schemas/config.schema.json': 'one bounded HTTP and WebSocket API flow',
  'skills/buster/plugins/axe/schemas/config.schema.json': 'one browser accessibility scan',
  'skills/buster/plugins/container-build/schemas/config.schema.json': 'one immutable container-image build',
  'skills/buster/plugins/coverage-budget/schemas/config.schema.json': 'one coverage-budget decision',
  'skills/buster/plugins/demo-auth-smoke/schemas/config.schema.json': 'one demo login and protected-route check',
  'skills/buster/plugins/direct-command/schemas/config.schema.json': 'one allowlisted test command',
  'skills/buster/plugins/http/schemas/config.schema.json': 'one bounded HTTP assertion',
  'skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json': 'one isolated Kubernetes deployment lease',
  'skills/buster/plugins/lighthouse/schemas/config.schema.json': 'one Lighthouse measurement set',
  'skills/buster/plugins/openapi/schemas/config.schema.json': 'one selected OpenAPI operation set',
  'skills/buster/plugins/playwright/schemas/config.schema.json': 'one Playwright test invocation',
  'skills/buster/plugins/security-providers/schemas/dependency.schema.json': 'one dependency vulnerability scan',
  'skills/buster/plugins/security-providers/schemas/headers.schema.json': 'one HTTP security-header check',
  'skills/buster/plugins/security-providers/schemas/image.schema.json': 'one container-image vulnerability scan',
  'skills/buster/plugins/security-providers/schemas/kubernetes-policy.schema.json': 'one static Kubernetes-policy scan',
  'skills/buster/plugins/security-providers/schemas/kubernetes-runtime.schema.json': 'one live Kubernetes runtime-security scan',
  'skills/buster/plugins/size-budget/schemas/config.schema.json': 'one repository size-budget decision',
  'skills/buster/plugins/tailscale-exposure/schemas/config.schema.json': 'one Tailscale HTTPS exposure lease',
  'skills/buster/plugins/visual/schemas/config.schema.json': 'one browser screenshot comparison',
  'skills/common/plugin-runtime/foundation/config/platform.schema.json': 'one Pipeline Core plugin-platform activation',
  'skills/common/plugins/artifact-store/schemas/config.schema.json': 'the immutable artifact store',
  'skills/common/plugins/command-runner/schemas/config.schema.json': 'the bounded command adapter',
  'skills/common/plugins/git-workspace/schemas/config.schema.json': 'the bounded Git workspace adapter',
  'skills/common/plugins/network-http/schemas/config.schema.json': 'the bounded HTTP capability adapter',
  'skills/common/plugins/notification-observer/schemas/config.schema.json': 'the lifecycle notification observer',
  'skills/common/plugins/openclaw-agent-events/schemas/config.schema.json': 'the OpenClaw event-ingress queue',
  'skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json': 'the OpenClaw-to-Redis host observer',
  'skills/common/plugins/operator-messaging/schemas/config.schema.json': 'the durable operator-message sender',
  'skills/common/plugins/redis-transport/schemas/config.schema.json': 'the Redis Streams transport',
  'skills/common/plugins/runtime-dispatch/schemas/config.schema.json': 'the generic remote-runtime dispatcher',
  'skills/common/plugins/runtime-dispatch/schemas/openclaw-config.schema.json': 'the OpenClaw runtime dispatcher',
  'skills/common/plugins/secret-resolver/schemas/config.schema.json': 'the confidential environment-backed secret resolver',
  'skills/common/plugins/state-store/schemas/config.schema.json': 'the append-only pipeline state store',
  'skills/common/plugins/telemetry-store/schemas/config.schema.json': 'the bounded telemetry store',
  'skills/common/plugins/transport-publisher/schemas/config.schema.json': 'the durable signed transport publisher',
  'skills/common/plugins/wait-store/schemas/config.schema.json': 'the durable wait store',
  'skills/nova/plugins/architecture-validator/schemas/config.schema.json': 'the architecture-validation agent stage',
  'skills/nova/plugins/buster-quality-gate/schemas/config.schema.json': 'the Buster quality-gate stage',
  'skills/nova/plugins/case-study/schemas/config.schema.json': 'the case-study agent stage',
  'skills/nova/plugins/demo-handoff/schemas/adapter.schema.json': 'the authenticated demo-readiness handoff',
  'skills/nova/plugins/human-approval/schemas/config.schema.json': 'the human-approval wait stage',
  'skills/nova/plugins/implementation-agent/schemas/config.schema.json': 'the implementation-agent stage',
  'skills/nova/plugins/lint/schemas/adapter-config.schema.json': 'the lint execution adapter',
  'skills/nova/plugins/lint/schemas/config.schema.json': 'the lint policy stage',
  'skills/nova/plugins/pipeline-review/schemas/config.schema.json': 'the compact pipeline-review agent stage',
  'skills/nova/plugins/pipeline-review/schemas/evidence-config.schema.json': 'the pipeline-review evidence store',
  'skills/nova/plugins/prism-design/schemas/config.schema.json': 'the Prism design and approval stage',
  'skills/nova/plugins/project-summary/schemas/config.schema.json': 'the final project-summary stage',
  'skills/nova/plugins/remote-test-gate/schemas/config.schema.json': 'the authenticated Nova-to-Buster test gate',
  'skills/nova/plugins/remote-test-gate/schemas/evidence-config.schema.json': 'the imported Buster evidence store',
  'skills/nova/plugins/repository-adapter/schemas/config.schema.json': 'the read-only repository snapshot adapter',
  'skills/nova/plugins/review/schemas/config.schema.json': 'the in-pipeline repository review stage',
  'skills/nova/plugins/review/schemas/repository-audit-config.schema.json': 'the independent repository-audit stage',
}));

function schemaAuthorityPath(authorityPath) {
  return authorityPath.split('#')[0];
}

function schemaRuntimeContext(authorityPath) {
  const sourcePath = schemaAuthorityPath(authorityPath);
  return SCHEMA_RUNTIME_CONTEXTS.get(sourcePath) ?? null;
}

function schemaNamedSegments(fieldPath) {
  return fieldPath.replace(/^\$\.?/u, '').split('.')
    .map((segment) => segment.replace(/\[\]|\[[0-9]+\]|\{[^}]+\}/gu, ''))
    .filter(Boolean);
}

function schemaAcceptedValues(field) {
  if (field.presence === 'forbidden') return `field must be absent when ${field.branches.join(' > ')} matches`;
  const rules = field.constraints.map((constraint) => `${constraint.name}=${JSON.stringify(constraint.value)}`);
  const branch = field.branches.length ? `; branch ${field.branches.join(' > ')}` : '';
  const accepted = `${field.type}${rules.length ? ` with ${rules.join(', ')}` : ' with no narrower scalar constraint'}${branch}`;
  return field.negated ? `any value except (${accepted})` : accepted;
}

const SCHEMA_RUNTIME_FALLBACK_AUTHORITIES = new Map(Object.entries({
  'skills/buster/plugins/openapi/schemas/config.schema.json::$.requestTimeoutMs': ['10000', 'skills/buster/plugins/openapi/src/provider.js', 'config.requestTimeoutMs ?? 10_000'],
  'skills/buster/plugins/openapi/schemas/config.schema.json::$.maximumResponseBytes': ['1048576', 'skills/buster/plugins/openapi/src/provider.js', 'config.maximumResponseBytes ?? 1_048_576'],
  'skills/buster/plugins/security-providers/schemas/dependency.schema.json::$.timeoutMs': ['300000', 'skills/buster/plugins/security-providers/src/dependency.js', 'integer(value.timeoutMs, 300_000'],
  'skills/buster/plugins/security-providers/schemas/image.schema.json::$.timeoutMs': ['300000', 'skills/buster/plugins/security-providers/src/image.js', 'integer(value.timeoutMs, 300_000'],
  'skills/buster/plugins/security-providers/schemas/kubernetes-policy.schema.json::$.timeoutMs': ['120000', 'skills/buster/plugins/security-providers/src/kubernetes-policy.js', 'integer(value.timeoutMs, 120_000'],
  'skills/buster/plugins/security-providers/schemas/kubernetes-runtime.schema.json::$.timeoutMs': ['120000', 'skills/buster/plugins/security-providers/src/kubernetes-runtime.js', 'integer(value.timeoutMs, 120_000'],
  'skills/buster/plugins/security-providers/schemas/headers.schema.json::$.requestTimeoutMs': ['10000', 'skills/buster/plugins/security-providers/src/headers.js', 'integer(value.requestTimeoutMs, 10_000'],
  'skills/buster/plugins/size-budget/schemas/config.schema.json::$.format': ['auto', 'skills/buster/plugins/size-budget/src/provider.js', "value.format ?? 'auto'"],
}));

function schemaRuntimeFallback(authorityPath, fieldPath) {
  const authority = SCHEMA_RUNTIME_FALLBACK_AUTHORITIES.get(`${authorityPath}::${fieldPath}`);
  if (!authority) return null;
  const [value, sourcePath, anchor] = authority;
  const text = read(sourcePath);
  const index = text.indexOf(anchor);
  assert(index >= 0, `${authorityPath}::${fieldPath}: runtime fallback anchor not found in ${sourcePath}`);
  return { value, evidence: `${sourcePath}:${lineAt(text, index)}` };
}

function schemaDefaultBehavior(authorityPath, field, runtimeFallback) {
  if (field.presence === 'forbidden') return `The field must be omitted when ${field.branches.join(' > ')} matches.`;
  if (field.default !== '<none>') {
    if (schemaAuthorityPath(authorityPath) === 'skills/common/plugin-runtime/foundation/config/platform.schema.json') {
      return `The schema annotates ${JSON.stringify(field.default)} as the default. The platform-file loader validates without default insertion, so the caller must supply or derive it.`;
    }
    return `The plugin registry clones the supplied configuration and inserts the schema default ${JSON.stringify(field.default)} before it invokes the registration.`;
  }
  if (field.required) return 'The immediate parent requires this field. Omitting it is invalid.';
  if (runtimeFallback) return `The schema has no default. When the field is absent, the linked runtime uses ${JSON.stringify(runtimeFallback.value)} (${runtimeFallback.evidence}).`;
  return 'The schema declares no default. When the field is omitted, it remains absent unless the linked runtime explicitly derives a value.';
}

function schemaEmptyBehavior(field) {
  const constraints = new Map(field.constraints.map((constraint) => [constraint.name, constraint.value]));
  if (field.type.includes('string')) {
    if (Number(constraints.get('minLength') ?? 0) > 0) return 'An empty string is invalid.';
    if (constraints.has('const') && constraints.get('const') !== '') return 'An empty string does not match the required constant.';
    if (constraints.has('enum') && !constraints.get('enum').includes('')) return 'An empty string is not one of the allowed values.';
    if (constraints.has('pattern')) {
      try {
        if (!new RegExp(constraints.get('pattern'), 'u').test('')) return 'An empty string does not match the required pattern.';
      } catch {
        return 'The schema pattern is the validation authority; its regular-expression dialect is not evaluated by this documentation generator.';
      }
    }
    return 'The schema accepts an empty string; the linked runtime can still reject it for a stronger operational reason.';
  }
  return 'A JSON empty string has the wrong type. Use a value of the declared type and satisfy every listed constraint.';
}

function schemaSpecificPurpose(authorityPath, fieldPath, context) {
  const pathWithoutRoot = fieldPath.replace(/^\$\.?/u, '');
  const segments = schemaNamedSegments(fieldPath);
  const leaf = segments.at(-1);
  const parent = segments.at(-2);
  if (!leaf) return null;

  if (/^(?:artifacts|coverage|reports)\[\]\./u.test(pathWithoutRoot)) {
    const declarationKind = pathWithoutRoot.split('[', 1)[0].replace(/s$/u, '');
    return {
      id: `Sets the unique evidence identifier for one declared ${declarationKind} produced by ${context}.`,
      path: `Selects the repository-relative output path copied for one declared ${declarationKind} in ${context}.`,
      mediaType: `Declares the exact media type accepted for one ${declarationKind} output in ${context}.`,
      format: `Declares the parser format used for one ${declarationKind} output in ${context}.`,
    }[leaf] ?? null;
  }
  if (/policy\.acceptances\[\]\./u.test(pathWithoutRoot)) {
    return {
      findingId: `Names the exact scanner finding suppressed by one time-bounded security-policy acceptance in ${context}.`,
      reason: `Records the operator reason for one time-bounded security-policy acceptance in ${context}.`,
      expiresAt: `Sets the instant after which one security-policy acceptance no longer suppresses its finding in ${context}.`,
    }[leaf] ?? null;
  }
  if (/policy\.profile$/u.test(pathWithoutRoot)) return `Pins the built-in strict security policy applied to findings from ${context}.`;
  if (/rules\.(?:add|replace)\[\]\./u.test(pathWithoutRoot)) {
    return {
      id: `Sets the unique security-header rule identifier used when ${context} merges rule overrides.`,
      header: `Names the HTTP response header checked by one configured rule in ${context}.`,
      severity: `Sets the finding severity emitted when one configured security-header rule fails in ${context}.`,
      kind: `Selects the exact presence, equality, containment, or HSTS-age comparison for one rule in ${context}.`,
      value: `Supplies the comparison value for a non-presence security-header rule in ${context}.`,
    }[leaf] ?? null;
  }
  if (authorityPath === 'skills/buster/plugins/container-build/schemas/config.schema.json' && fieldPath === '$.definition.target') {
    return `Selects the named Dockerfile build stage passed to the immutable container-image build.`;
  }
  if (authorityPath === 'skills/buster/plugins/visual/schemas/config.schema.json' && fieldPath === '$.masks[].target') {
    return `Names the selected visual target whose screenshots receive this mask selector set.`;
  }
  if (authorityPath === 'skills/buster/plugins/size-budget/schemas/config.schema.json' && fieldPath === '$.format') {
    return `Selects how ${context} decodes the input build artifact: infer from media type, one file, tar, or gzip-compressed tar.`;
  }
  if (/policy\.simplification\.enabled$/u.test(pathWithoutRoot)) {
    return `Controls whether the review policy emits bounded simplification recommendations in ${context}.`;
  }

  if (/operations\[\]\.headers\.\{\*\}$/u.test(pathWithoutRoot)) return `Supplies one request-header value for each configured header name in ${context}.`;
  if (/operations\[\]\.query\.\{\*\}$/u.test(pathWithoutRoot)) return `Supplies one scalar query-parameter value for each configured parameter name in ${context}.`;
  if (/operations\[\]\.pathParameters\.\{\*\}$/u.test(pathWithoutRoot)) return `Supplies one scalar path-parameter value for each OpenAPI path placeholder in ${context}.`;
  if (/definition\.buildArgs\.\{\*\}$/u.test(pathWithoutRoot)) return `Supplies one Docker build-argument value for each configured argument name in ${context}.`;
  if (/environment\.\{\*\}$/u.test(pathWithoutRoot)) return `Maps one declared environment name to the value given to ${context}; it does not grant ambient host-environment access.`;
  if (/executableCatalog\.\{\*\}$/u.test(pathWithoutRoot)) return `Maps one logical executable identifier to the exact executable path that ${context} can start.`;
  if (/stageLabels\.\{\*\}$/u.test(pathWithoutRoot)) return `Maps one stage identifier to the bounded label shown by ${context}.`;
  if (/externalTrust\.allowedSourceDigests\.\{\*\}\[\]$/u.test(pathWithoutRoot)) return `Adds one allowed package digest under a canonical external source reference for ${context}.`;
  if (/externalTrust\.verifiedAttestations\.\{\*\}$/u.test(pathWithoutRoot)) return `Maps one verified package digest to the attestation digest trusted by ${context}.`;
  if (/providers\.\{\*\}$/u.test(pathWithoutRoot)) return `Maps one capability identifier to the provider registration that ${context} activates.`;
  if (/targets\.\{(?:\*|pattern:[^}]+)\}$/u.test(pathWithoutRoot)) return `Selects the closed target variant used for each named target in ${context}.`;
  if (/targets\.\{(?:\*|pattern:[^}]+)\}\./u.test(pathWithoutRoot)) {
    const targetPurpose = {
      authentication: `Selects the authentication protocol that ${context} uses for one named target.`,
      endpoint: `Sets the exact network endpoint used for one named target in ${context}.`,
      endpointOrigin: `Restricts a named target to the expected origin before ${context} sends or checks a delivery.`,
      endpointSecret: `Names the confidential secret used to authenticate one named endpoint in ${context}.`,
      format: `Selects the serialized message format accepted by one named target in ${context}.`,
      maxPayloadBytes: `Limits the serialized message bytes sent to one named target by ${context}.`,
      maxRequestBytes: `Limits the serialized request bytes sent to one named target by ${context}.`,
      maxResponseBytes: `Limits response bytes retained from one named target by ${context}.`,
      receiptEndpoint: `Sets the same-origin endpoint that ${context} queries to reconcile an uncertain delivery.`,
      tokenSecret: `Names the confidential token or signing secret resolved for one named target in ${context}.`,
      agentId: `Selects the OpenClaw agent identity used for one named dispatch target.`,
      agentRole: `Sets the stable role label used in OpenClaw task identity and diagnostics for one named target.`,
      collectorMode: `Selects the OpenClaw collect-and-wait protocol instead of the announcing spawn path for one named target.`,
      controllerSessionKey: `Selects the OpenClaw controller session that owns spawn and task-control calls for one named target.`,
      cwd: `Sets the fixed working directory for dispatches that do not carry an attempt-owned workspace reference.`,
      maxContextTokens: `Limits the combined model context token estimate admitted for one named target.`,
      maxInputTokens: `Limits prompt and input tokens admitted for one named target.`,
      maxOutputTokens: `Limits requested model output tokens for one named target.`,
      maxPollMs: `Caps the delay between OpenClaw status polls for one named target.`,
      maxPolls: `Caps the number of OpenClaw status polls before the dispatch stops waiting.`,
      maxPromptBytes: `Limits UTF-8 prompt bytes sent to one named target.`,
      model: `Selects the model configured for one named OpenClaw dispatch target.`,
      pollMs: `Sets the initial delay between OpenClaw status polls for one named target.`,
      repositoryRoot: `Binds one named target to the canonical repository root allowed for workspace dispatch.`,
      resultEndpoint: `Sets the endpoint from which ${context} imports the durable result for one named target.`,
      resultPathPrefix: `Restricts imported local result files to this path prefix for one named target.`,
      resultTokenSecret: `Names the confidential token used only when importing a result from one named target.`,
      runtime: `Selects the runtime protocol implemented by one named dispatch target.`,
      sessionTimeoutMs: `Limits the complete OpenClaw session wait for one named target.`,
      spawnIntervalMs: `Sets the minimum delay between serialized OpenClaw spawn calls for one controller.`,
      thinking: `Selects the configured reasoning level for one named OpenClaw target.`,
      tokenizerEncoding: `Selects the tokenizer used to enforce token budgets for one named target.`,
      workspaceRoot: `Binds one named target to the canonical root that may contain attempt-owned workspaces.`,
    }[leaf];
    if (targetPurpose) return targetPurpose;
  }
  if (/policy\.ranking\.categoryWeights\./u.test(pathWithoutRoot)) return `Sets the ranking weight for the ${leaf} finding category; a larger value moves otherwise comparable findings earlier.`;
  if (/policy\.ranking\.priorityWeights\./u.test(pathWithoutRoot)) return `Sets the ranking weight for ${leaf} findings; a larger value moves otherwise comparable findings earlier.`;
  if (/assertions\[\]\.equals$/u.test(pathWithoutRoot)) return `Defines the exact Boolean, number, or string value expected at the assertion's JSON Pointer in ${context}.`;
  if (/assertions\[\]\.pointer$/u.test(pathWithoutRoot)) return `Selects the JSON Pointer read from the protected response for one assertion in ${context}.`;
  if (/acceptances\[\]\./u.test(pathWithoutRoot)) {
    return {
      audit: `Names the exact Lighthouse audit accepted for one route in ${context}.`,
      expiresAt: `Sets the calendar date after which one documented acceptance becomes invalid in ${context}.`,
      reason: `Records the human reason for one time-bounded acceptance in ${context}.`,
      route: `Limits one acceptance to the exact route where the finding is known in ${context}.`,
      rule: `Names the exact Axe rule accepted for one selector and route in ${context}.`,
      selector: `Limits one accessibility acceptance to the exact DOM selector where the finding is known.`,
    }[leaf] ?? null;
  }
  if (/matchingFiles\[\]\./u.test(pathWithoutRoot)) {
    return {
      id: `Gives one matching-file budget a stable evidence identifier in ${context}.`,
      maximumBytes: `Sets the largest allowed byte size for each file matched by one budget rule.`,
      pattern: `Selects repository-relative files for one size-budget rule.`,
      requireMatch: `Controls whether a size-budget rule fails when its pattern matches no file.`,
    }[leaf] ?? null;
  }
  if (/administrativeDecisionIssuers\[\]\./u.test(pathWithoutRoot)) return leaf === 'type'
    ? `Selects whether one trusted administrative-decision issuer acts as an operator or administrator in ${context}.`
    : `Sets the exact issuer identifier accepted for one administrative decision in ${context}.`;
  if (/image\./u.test(pathWithoutRoot)) return leaf === 'digest'
    ? `Pins the deployment image bytes to the SHA-256 digest that must also appear in the image reference.`
    : `Selects the immutable registry image reference deployed by ${context}.`;
  if (/retention\./u.test(pathWithoutRoot)) return leaf === 'mode'
    ? `Selects whether ${context} deletes or retains the leased namespace after the attempt.`
    : `Requests the bounded lifetime, in seconds, of the namespace lease created by ${context}.`;
  if (/testCredentials\./u.test(pathWithoutRoot)) return leaf === 'mode'
    ? `Requests lease-bound generated demo credentials from ${context}.`
    : `Names the Kubernetes Secret that receives generated lease-bound demo credentials.`;
  if (/rules\./u.test(pathWithoutRoot)) return {
    add: `Adds exact security-header rules to the selected built-in profile for ${context}.`,
    remove: `Removes named rules from the selected built-in security-header profile for ${context}.`,
    replace: `Replaces built-in security-header rules with explicitly supplied rules for ${context}.`,
  }[leaf] ?? null;
  if (/overrides\./u.test(pathWithoutRoot)) return {
    maximumDifferencePercent: `Overrides the largest changed-pixel percentage allowed by ${context}.`,
    pixelThreshold: `Overrides the per-pixel color-distance threshold used by ${context}.`,
    uncertaintyMarginPercent: `Overrides the uncertainty band applied around the visual difference limit in ${context}.`,
  }[leaf] ?? null;

  const purpose = {
    absoluteFileAllowance: `Sets the fixed number of additional changed files that the review governor permits before proportional growth rules apply.`,
    absoluteNonTestLocAllowance: `Sets the fixed number of additional non-test lines that the review governor permits before proportional growth rules apply.`,
    accept: `Sets the HTTP Accept header sent by ${context}.`,
    activeAdapters: `Lists the adapter registration IDs that ${context} starts; configured but inactive adapters receive no calls.`,
    add: `Adds entries to the selected rule set used by ${context}.`,
    agent: `Selects the configured runtime-agent target that ${context} dispatches.`,
    agentRole: `Sets the stable stage-role label emitted with ${context} decisions and lifecycle events.`,
    allowedExecutables: `Lists the canonical executable paths that ${context} is authorized to start.`,
    allowedHeaders: `Lists caller-controlled HTTP header names that ${context} permits.`,
    allowedMethods: `Lists the HTTP methods that ${context} permits.`,
    allowedOrigins: `Lists the exact URL origins that ${context} can contact.`,
    allowedPolicyRoots: `Lists canonical roots from which ${context} may load a lint policy.`,
    allowedRepositoryRoots: `Lists canonical repository roots that ${context} may read or modify within its declared capability.`,
    allowedWorkingRoots: `Lists canonical directory roots in which ${context} may start a command.`,
    args: `Supplies the ordered argument vector passed directly to ${context}, without a shell.`,
    artifactRoot: `Selects the private filesystem root where ${context} stores content-addressed blobs and metadata.`,
    artifacts: `Lists the bounded files that ${context} publishes as typed artifacts after the command completes.`,
    authentication: `Selects the closed authentication protocol used by ${context}.`,
    authorEmail: `Sets the explicit Git commit-author email used by ${context}; ambient Git identity is ignored.`,
    authorName: `Sets the explicit Git commit-author name used by ${context}; ambient Git identity is ignored.`,
    body: `Supplies the JSON request body for one selected operation in ${context}.`,
    budget: `Selects the named performance budget evaluated by ${context}.`,
    buildContext: `Selects the repository-relative build context sent to ${context}.`,
    candidateStageId: `Names the stage whose candidate artifact ${context} binds into the handoff.`,
    caPath: `Selects the CA certificate file used to verify the TLS peer contacted by ${context}.`,
    categories: `Lists the finding categories that can make the review decision blocking.`,
    cgroupRoot: `Selects the delegated Linux cgroup root used to isolate external plugin processes.`,
    cleanup: `Marks one OpenAPI operation as cleanup work that reverses state created by earlier selected operations.`,
    combine: `Controls whether ${context} combines coverage inputs before it compares line coverage with the budget.`,
    comparisonProfile: `Selects the named visual comparison policy used by ${context}.`,
    configFile: `Selects the repository-relative Playwright configuration file loaded by ${context}.`,
    controllerSessionKey: `Selects the OpenClaw controller session used by ${context}.`,
    controlWriteMaxAttempts: `Limits attempts to write one control record from ${context} to Redis.`,
    controlWriteRetryBaseMs: `Sets the initial retry delay after a failed Redis control-record write.`,
    controlWriteRetryMaxMs: `Caps the retry delay after repeated Redis control-record write failures.`,
    cookieName: `Names the session cookie that ${context} must receive after login and send to the protected route.`,
    coverage: `Lists coverage files that ${context} imports and converts to typed coverage evidence.`,
    deadLetterMaxLen: `Caps retained dead-letter records for the Redis stream written by ${context}.`,
    dedupTtlMs: `Sets how long ${context} retains a Redis idempotency key before it can be accepted again.`,
    definition: `Selects the closed Dockerfile or built-in template definition used by ${context}.`,
    deliveryManifestEncoding: `Pins the portable JSON encoding required for delivery-manifest input to ${context}.`,
    deliveryRoot: `Selects the private durable-record root used to reconcile sends after restart in ${context}.`,
    deliveryStageId: `Names the stage whose delivery artifact ${context} binds into the handoff.`,
    digest: `Pins content to the exact SHA-256 digest consumed by ${context}.`,
    directEvidenceBonus: `Adds this score when a finding has direct source or execution evidence.`,
    dockerfile: `Selects the Dockerfile path inside the build context used by ${context}.`,
    drainTimeoutMs: `Limits how long ${context} waits for admitted event deliveries during status or shutdown.`,
    effectLockTtlMs: `Sets the recovery lease duration for one external-effect lock before another owner can reconcile it.`,
    enabled: `Enables or disables the indicated optional behavior in ${context}.`,
    enabledRules: `Lists the simplification rules that the review policy permits.`,
    endpoint: `Sets the exact network endpoint contacted by ${context}.`,
    endpointName: `Selects an operator-approved typed endpoint by name instead of supplying an arbitrary URL to ${context}.`,
    endpointOrigin: `Restricts ${context} to the expected endpoint origin.`,
    endpointSecret: `Names the confidential endpoint credential resolved by ${context}.`,
    equals: `Defines the exact value that one assertion in ${context} must observe.`,
    exclude: `Lists selectors deliberately omitted from the accessibility scan performed by ${context}.`,
    executable: `Selects the logical executable that ${context} requests from the command capability.`,
    expectedContentType: `Requires the HTTP response from ${context} to have the specified content type.`,
    expectedHead: `Pins repository reads to the expected Git commit; ${context} rejects a changed head.`,
    expectedStatuses: `Lists the HTTP status codes that count as successful assertions in ${context}.`,
    expectedText: `Requires the HTTP response body from ${context} to contain the specified text.`,
    expiresAt: `Sets the date after which the configured acceptance in ${context} is rejected.`,
    fileGrowthMultiplier: `Sets the proportional changed-file growth limit enforced by the review governor.`,
    flowFile: `Selects the repository-relative API-flow document executed by ${context}.`,
    format: `Selects the closed output or message representation used by ${context}.`,
    gateStageId: `Names the remote test-gate stage whose verified decision ${context} imports.`,
    gitExecutable: `Selects the canonical Git executable path started directly by ${context}.`,
    hookPriority: `Sets the ordering priority used when OpenClaw registers ${context} hook handlers.`,
    hooks: `Lists the exact OpenClaw hook names that ${context} subscribes to.`,
    hookTimeoutMs: `Limits one OpenClaw hook callback before ${context} reports failure.`,
    hostname: `Selects the declared Tailscale hostname used for ${context}.`,
    id: `Sets the stable identifier used for the configured item in ${context}.`,
    includeDebt: `Controls whether ${context} includes policy rules classified as technical-debt checks.`,
    includeExperimental: `Controls whether ${context} includes experimental lint rules.`,
    installationRoots: `Lists package-discovery roots scanned by ${context}.`,
    insufficientFindingEvidence: `Selects the review outcome when a proposed finding lacks enough direct evidence.`,
    introducedByDiffBonus: `Adds this ranking score when evidence proves that the current diff introduced a finding.`,
    issuerId: `Sets the exact trusted decision issuer used by ${context}.`,
    largestFiles: `Sets how many largest repository files ${context} includes in diagnostic evidence.`,
    loginPath: `Sets the route where ${context} submits the demo login request.`,
    manifestFile: `Selects the repository-relative visual-target manifest loaded by ${context}.`,
    manifestStageId: `Names the stage whose manifest artifact ${context} verifies and imports.`,
    maxAdvisories: `Caps advisory findings retained in the final review report.`,
    maxArtifactBytes: `Caps the bytes accepted for one immutable artifact by ${context}.`,
    maxBundleBytes: `Caps the complete review-bundle bytes admitted by ${context}.`,
    maxChangedPaths: `Caps changed repository paths returned by ${context}.`,
    maxContextBytes: `Caps total source-context bytes selected across all review expansion rounds.`,
    maxContextFileBytes: `Caps bytes read from one source file for review context.`,
    maxContextFiles: `Caps source files selected across all review expansion rounds.`,
    maxDependencyDepth: `Caps dependency traversal depth used to expand review context.`,
    maxEntryBytes: `Caps bytes accepted for one durable state or wait record by ${context}.`,
    maxEventBytes: `Caps serialized bytes accepted for one OpenClaw hook event by ${context}.`,
    maxExecutionMs: `Limits one external process started by ${context}.`,
    maxExpansionFiles: `Caps files added by one review context-expansion proposal.`,
    maxFileBytes: `Caps bytes read from one repository file by ${context}.`,
    maximumArtifactBytes: `Caps artifact bytes imported into the pipeline-review evidence bundle.`,
    maximumBundleBytes: `Caps the complete pipeline-review evidence bundle before it is stored.`,
    maximumBytes: `Caps total bytes retained by the configured store in ${context}.`,
    maximumDeliveryBytes: `Caps total durable delivery-record bytes retained by ${context}.`,
    maximumDeliveryRecords: `Caps durable delivery records retained by ${context}.`,
    maximumFileCount: `Sets the largest repository file count accepted by ${context}.`,
    maximumGrowthBytes: `Sets the largest allowed byte increase relative to the size baseline in ${context}.`,
    maximumGrowthPercent: `Sets the largest allowed percentage increase relative to the size baseline in ${context}.`,
    maximumJournalBytes: `Caps journal bytes imported into the pipeline-review evidence bundle.`,
    maximumRecords: `Caps durable metadata records retained by ${context}.`,
    maximumResponseBytes: `Caps response bytes retained from one network operation in ${context}.`,
    maximumSteps: `Caps the combined setup, main, and cleanup steps executed by ${context}.`,
    maximumStoreBytes: `Caps aggregate durable-store bytes retained by ${context}.`,
    maximumTotalBytes: `Sets the largest total repository byte size accepted by ${context}.`,
    maxInitialContextBytes: `Caps source bytes selected for the initial review context.`,
    maxInitialContextFiles: `Caps source files selected for the initial review context.`,
    maxInstancesPerCluster: `Caps the number of related finding instances retained in one review root-cause cluster.`,
    maxItems: `Caps items retained in the configured bounded collection in ${context}.`,
    maxLen: `Sets the approximate Redis Stream MAXLEN trim target used by ${context}.`,
    maxMessageChars: `Caps the characters shown in one operator notification from ${context}.`,
    maxOutputBytes: `Caps combined stdout and stderr retained from one external process in ${context}.`,
    maxPayloadBytes: `Caps the serialized payload bytes sent by ${context}.`,
    maxProposals: `Caps context-expansion proposals accepted during one review.`,
    maxQueueBytes: `Caps serialized bytes held in the volatile event queue of ${context}.`,
    maxQueueEvents: `Caps admitted events held in the volatile queue of ${context}.`,
    maxQueuePerStream: `Caps pending Redis writes held for one source stream by ${context}.`,
    maxRecommendations: `Caps simplification recommendations retained in the review result.`,
    maxRecordBytes: `Caps bytes accepted for one telemetry or durable record by ${context}.`,
    maxRepairCycles: `Caps review-governor repair cycles before the review must stop.`,
    maxRequestBytes: `Caps request-body bytes accepted or sent by ${context}.`,
    maxResponseBytes: `Caps response-body bytes retained by ${context}.`,
    maxRootCauses: `Caps independent root causes retained after review clustering.`,
    method: `Selects the HTTP method used by ${context}.`,
    minimumConfidence: `Sets the lowest confidence accepted for a simplification recommendation.`,
    minimumExecutedTests: `Requires ${context} to observe at least this many executed Playwright tests.`,
    minimumLinePercent: `Sets the lowest accepted line-coverage percentage in ${context}.`,
    mode: `Selects the closed operating mode for the configured behavior in ${context}.`,
    modelLabel: `Sets the bounded display label used for the model in notifications from ${context}.`,
    namespacePrefix: `Requests the allowlisted namespace prefix used by ${context} when it creates a lease.`,
    nonTestLocGrowthMultiplier: `Sets the proportional non-test line-growth limit enforced by the review governor.`,
    operationId: `Selects the exact OpenAPI operation executed by ${context}.`,
    operations: `Lists exact OpenAPI operations executed by ${context}.`,
    operatorTarget: `Selects the configured operator-message target that receives the demo handoff.`,
    orchestratorIssuerId: `Sets the issuer identity required on orchestrator decisions accepted by ${context}.`,
    outputName: `Sets the stable logical name of the image output produced by ${context}.`,
    outsideScope: `Selects how the review treats a proposed finding outside the declared review scope.`,
    passwordKey: `Names the key in the confidential credential object that supplies the demo password.`,
    passwordSecret: `Names the confidential Redis password that ${context} resolves through the secret capability.`,
    path: `Sets the URL path used by ${context}.`,
    paths: `Lists the URL paths checked by ${context}.`,
    pattern: `Selects repository paths matched by the configured rule in ${context}.`,
    pipelineLabel: `Sets the bounded display label used for the pipeline in notifications from ${context}.`,
    platform: `Selects the target operating-system and architecture pair for ${context}.`,
    pointer: `Selects the JSON Pointer evaluated by one response assertion in ${context}.`,
    policy: `Supplies the closed policy object that ${context} enforces.`,
    policyPath: `Selects the policy file loaded by ${context}.`,
    policyProject: `Selects the project entry from the loaded lint policy.`,
    priorities: `Lists finding priorities that can make the review decision blocking.`,
    profile: `Selects the named built-in behavior profile used by ${context}.`,
    profileFile: `Selects the repository-relative browser profile file loaded by ${context}.`,
    profiles: `Lists browser profiles executed by ${context}.`,
    projectDirectory: `Selects the repository-relative project directory inspected by ${context}.`,
    protectedPath: `Sets the route that must reject an anonymous request and accept the authenticated demo session.`,
    protocol: `Pins the closed wire or document protocol interpreted by ${context}.`,
    purpose: `Selects the Lighthouse measurement purpose executed by ${context}.`,
    readinessTimeoutSeconds: `Limits how long ${context} waits for deployment or endpoint readiness.`,
    readyStageId: `Names the readiness stage whose artifact ${context} binds into the handoff.`,
    receiptEndpoint: `Sets the same-origin endpoint that ${context} queries to reconcile an uncertain delivery without sending it again.`,
    reason: `Records the human reason for the configured exception in ${context}.`,
    reference: `Selects the immutable image reference consumed by ${context}.`,
    registryVersion: `Pins the simplification-rule registry version used by the review policy.`,
    remove: `Removes entries from the selected rule set used by ${context}.`,
    replace: `Replaces entries in the selected rule set used by ${context}.`,
    reportArtifactEncoding: `Pins the portable JSON encoding required for the stored review report.`,
    reports: `Lists command-produced report files that ${context} parses as test evidence.`,
    resultMode: `Selects whether ${context} requires JUnit evidence or uses the command exit code as its result.`,
    redisCommandTimeoutMs: `Limits one Redis command issued by ${context}.`,
    redisHost: `Sets the Redis host contacted by ${context}.`,
    redisNetworkIsolation: `Selects the network-isolation binding passed to the Redis connection used by ${context}.`,
    redisPassword: `Supplies the Redis password used by ${context}; environment precedence is resolved before connection.`,
    redisPort: `Sets the Redis TCP port contacted by ${context}.`,
    redisTls: `Controls whether ${context} protects the Redis connection with TLS.`,
    redisUsername: `Supplies the Redis ACL username used by ${context}.`,
    repositoryRoot: `Binds ${context} to the canonical repository root it may inspect.`,
    requestTimeoutMs: `Limits one outbound network request made by ${context}.`,
    requireDirectEvidence: `Controls whether every blocking review finding must cite direct evidence.`,
    requiredTests: `Lists exact Playwright test titles that ${context} must observe as executed.`,
    requireIntroducedByDiff: `Controls whether a blocking finding must be proved as introduced by the current diff.`,
    requireMatch: `Controls whether an unmatched repository-file rule fails ${context}.`,
    retainedPriorities: `Lists priorities retained as follow-up items when they do not block the review.`,
    retainPreExisting: `Controls whether the review report retains findings proved to predate the current diff.`,
    retentionMode: `Selects whether ${context} releases exposure immediately or transfers ownership to readiness handoff.`,
    reviewerAgentId: `Selects the reviewer agent identity used by ${context}.`,
    reviewerModel: `Selects the reviewer model used by ${context}.`,
    reviewerRuntime: `Selects the supported reviewer execution runtime used by ${context}.`,
    reviewerThinking: `Selects the configured reviewer reasoning level used by ${context}.`,
    reviewSemanticEncoding: `Pins the portable encoding of review semantic evidence consumed by ${context}.`,
    root: `Selects the private filesystem root used by ${context} for durable records.`,
    route: `Limits the configured check or exception to one exact URL route in ${context}.`,
    routes: `Lists URL routes checked by ${context}.`,
    rule: `Names the exact rule affected by the configured exception in ${context}.`,
    runs: `Sets the number of independent measurement runs performed by ${context}.`,
    schemaVersion: `Pins the exact configuration contract version accepted by ${context}.`,
    seconds: `Sets the requested lifetime in seconds for the configured resource in ${context}.`,
    secretName: `Names the Kubernetes Secret used by ${context}.`,
    secretReferences: `Lists operator-allowlisted Kubernetes Secrets mounted into the deployment lease created by ${context}.`,
    selector: `Limits the configured accessibility exception to one exact DOM selector.`,
    selectors: `Lists DOM selectors masked for one visual-comparison target in ${context}.`,
    semanticVerifier: `Selects the verifier result required before a proposed review finding can be accepted.`,
    serviceName: `Sets the DNS service name created inside the namespace lease by ${context}.`,
    servicePort: `Sets the service port published in the typed endpoint returned by ${context}.`,
    serviceTargetPort: `Sets the workload target port when it differs from the published service port.`,
    settingsFile: `Selects the repository-relative Lighthouse settings file loaded by ${context}.`,
    shutdownTimeoutMs: `Limits graceful drain and shutdown for ${context} before remaining work is forced closed.`,
    signingSecret: `Names the confidential HMAC key used by ${context} to sign one target's request.`,
    sourceAuthority: `Sets the exact source-attestation authority accepted by ${context}.`,
    sourcePrivateKeySecret: `Names the confidential private key used to sign source attestations sent by ${context}.`,
    specFile: `Selects the repository-relative OpenAPI document loaded by ${context}.`,
    stateRoot: `Selects the private durable state root used by ${context}.`,
    storageRoot: `Selects the private Pipeline Core storage root used by ${context}.`,
    streamMaxLen: `Sets the approximate Redis Stream retention target used by ${context}.`,
    streamPrefix: `Sets the namespace prefix for Redis Stream and idempotency keys written by ${context}.`,
    suppressEventTypes: `Lists lifecycle event types that ${context} deliberately does not publish.`,
    tags: `Lists tags used to select checks or operations in ${context}.`,
    target: `Selects the named configured destination used by ${context}.`,
    targets: `Lists the exact named targets selected for ${context}.`,
    template: `Selects the built-in build template used by ${context}.`,
    terminationGraceMs: `Sets the time between SIGTERM and SIGKILL when ${context} stops an external process.`,
    testAgentEnabled: `Controls whether ${context} dispatches the optional agent evaluator after native Buster evidence passes.`,
    timeoutMinutes: `Limits how long ${context} waits for an external approval decision.`,
    timeoutMs: `Limits the complete ${context} operation before it is stopped or reported as timed out.`,
    tokenPath: `Selects the private bearer-token file read by ${context}.`,
    tokenSecret: `Names the confidential bearer token resolved by ${context}.`,
    trustedBuiltinRoots: `Lists package roots treated as built-in trust anchors by ${context}.`,
    type: `Selects the closed configured variant interpreted by ${context}.`,
    unknownScope: `Selects how the review treats a proposed finding whose diff scope cannot be proved.`,
    unverifiedRequirement: `Selects the review outcome when a stated requirement cannot be verified.`,
    url: `Sets the absolute target URL contacted by ${context} when no typed endpoint input supplies it.`,
    usernameKey: `Names the key in the confidential credential object that supplies the demo username.`,
    usernamePointer: `Selects the JSON Pointer that must equal the authenticated username in ${context}.`,
    workers: `Sets the number of Playwright workers used by ${context}.`,
    workingDirectory: `Selects the allowlisted repository-relative directory in which ${context} starts the command.`,
    workspaceRoot: `Selects the canonical root below which ${context} may create isolated Git worktrees.`,
  }[leaf];
  return purpose ?? null;
}

function schemaImplementationCandidates(authorityPath) {
  const sourcePath = schemaAuthorityPath(authorityPath);
  const pluginRoot = sourcePath === 'skills/common/plugin-runtime/foundation/config/platform.schema.json'
    ? 'skills/common/plugin-runtime/foundation'
    : sourcePath.includes('/schemas/') ? sourcePath.split('/schemas/')[0] : path.dirname(sourcePath);
  let candidates = walk(pluginRoot, (absolutePath) => /\.(?:ts|mts|js|mjs)$/u.test(absolutePath));
  if (sourcePath.includes('/security-providers/schemas/')) {
    const provider = path.basename(sourcePath, '.schema.json');
    const exact = `${pluginRoot}/src/${provider}.js`;
    candidates = [exact, `${pluginRoot}/src/common.js`, ...candidates].filter((item, index, all) => exists(item) && all.indexOf(item) === index);
  }
  if (sourcePath === 'skills/common/plugin-runtime/foundation/config/platform.schema.json') {
    candidates.push(...walk('skills/common/plugin-runtime/foundation/registry', (absolutePath) => /\.ts$/u.test(absolutePath)));
    candidates.push(...walk('skills/common/plugin-runtime/foundation/packages', (absolutePath) => /\.ts$/u.test(absolutePath)));
    candidates.push(...walk('skills/common/plugin-runtime/foundation/isolation', (absolutePath) => /\.ts$/u.test(absolutePath)));
  }
  candidates.push('skills/nova/core/execution/run-decisions.ts');
  return [...new Set(candidates)].filter(exists).sort();
}

const SCHEMA_IMPLEMENTATION_AUTHORITIES = new Map(Object.entries({
  'skills/buster/plugins/axe/schemas/config.schema.json::$.acceptances[].expiresAt': ['skills/buster/plugins/axe/src/provider.js', 'String(acceptance.expiresAt)'],
  'skills/buster/plugins/axe/schemas/config.schema.json::$.acceptances[].reason': ['skills/buster/plugins/axe/src/provider.js', 'acceptedFinding.reason'],
  'skills/buster/plugins/container-build/schemas/config.schema.json::$.definition.buildArgs.{*}': ['skills/buster/plugins/container-build/src/provider.js', 'const entries = Object.entries(buildArgs)'],
  'skills/buster/plugins/container-build/schemas/config.schema.json::$.definition.dockerfile': ['skills/buster/plugins/container-build/src/provider.js', "relative(definition.dockerfile, 'definition.dockerfile')"],
  'skills/buster/plugins/container-build/schemas/config.schema.json::$.definition.target': ['skills/buster/plugins/container-build/src/provider.js', 'target = definition.target'],
  'skills/buster/plugins/container-build/schemas/config.schema.json::$.definition.type': ['skills/buster/plugins/container-build/src/provider.js', "definition.type === 'dockerfile'"],
  'skills/buster/plugins/direct-command/schemas/config.schema.json::$.resultMode': ['skills/buster/plugins/direct-command/src/provider.js', 'const resultMode = value.resultMode'],
  'skills/buster/plugins/lighthouse/schemas/config.schema.json::$.acceptances[].reason': ['skills/buster/plugins/lighthouse/src/provider.js', 'acceptance.reason'],
  'skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json::$.testCredentials.mode': ['skills/buster/plugins/kubernetes-fixture/src/provider.js', "testCredentials.mode !== 'generate'"],
  'skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json::$.testCredentials.secretName': ['skills/buster/plugins/kubernetes-fixture/src/provider.js', 'testCredentials.secretName'],
  'skills/buster/plugins/openapi/schemas/config.schema.json::$.operations[].cleanup': ['skills/buster/plugins/openapi/src/provider.js', '!selected.cleanup'],
  'skills/buster/plugins/openapi/schemas/config.schema.json::$.operations[].expectedStatuses[]': ['skills/buster/plugins/openapi/src/provider.js', 'selected.expectedStatuses.includes(response.status)'],
  'skills/buster/plugins/openapi/schemas/config.schema.json::$.operations[].headers.{*}': ['skills/buster/plugins/openapi/src/provider.js', '...(selected.headers ?? {})'],
  'skills/buster/plugins/openapi/schemas/config.schema.json::$.operations[].pathParameters.{*}': ['skills/buster/plugins/openapi/src/provider.js', 'Object.entries(selected.pathParameters ?? {})'],
  'skills/buster/plugins/openapi/schemas/config.schema.json::$.operations[].query.{*}': ['skills/buster/plugins/openapi/src/provider.js', 'Object.entries(selected.query ?? {})'],
  'skills/buster/plugins/security-providers/schemas/image.schema.json::$.timeoutMs': ['skills/buster/plugins/security-providers/src/image.js', 'timeoutMs: config.timeoutMs'],
  'skills/buster/plugins/security-providers/schemas/kubernetes-policy.schema.json::$.timeoutMs': ['skills/buster/plugins/security-providers/src/kubernetes-policy.js', 'timeoutMs: config.timeoutMs'],
  'skills/buster/plugins/security-providers/schemas/kubernetes-runtime.schema.json::$.timeoutMs': ['skills/buster/plugins/security-providers/src/kubernetes-runtime.js', 'timeoutMs: config.timeoutMs'],
  'skills/buster/plugins/security-providers/schemas/headers.schema.json::$.profile': ['skills/buster/plugins/security-providers/src/headers.js', "value.profile === 'web-https-v1'"],
  'skills/buster/plugins/playwright/schemas/config.schema.json::$.timeoutMs': ['skills/buster/plugins/playwright/src/provider.js', 'Math.min(config.timeoutMs ?? invocation.timeoutMs'],
  'skills/buster/plugins/security-providers/schemas/headers.schema.json::$.rules.remove[]': ['skills/buster/plugins/security-providers/src/headers.js', 'base.filter((item) => !remove.includes(item.id))'],
  'skills/buster/plugins/size-budget/schemas/config.schema.json::$.matchingFiles[].id': ['skills/buster/plugins/size-budget/src/provider.js', "typeof rule.id !== 'string'"],
  'skills/buster/plugins/size-budget/schemas/config.schema.json::$.matchingFiles[].maximumBytes': ['skills/buster/plugins/size-budget/src/provider.js', 'safeInteger(rule.maximumBytes'],
  'skills/buster/plugins/size-budget/schemas/config.schema.json::$.matchingFiles[].pattern': ['skills/buster/plugins/size-budget/src/provider.js', "typeof rule.pattern !== 'string'"],
  'skills/buster/plugins/size-budget/schemas/config.schema.json::$.matchingFiles[].requireMatch': ['skills/buster/plugins/size-budget/src/provider.js', 'requireMatch: rule.requireMatch !== false'],
  'skills/buster/plugins/visual/schemas/config.schema.json::$.masks[].selectors[]': ['skills/buster/plugins/visual/src/provider.js', 'masks.set(value.target, value.selectors)'],
  'skills/buster/plugins/visual/schemas/config.schema.json::$.targets[]': ['skills/buster/plugins/visual/src/provider.js', 'const selected = config.targets.map'],
  'skills/common/plugin-runtime/foundation/config/platform.schema.json::$.activeAdapters[]': ['skills/nova/core/execution/engine-runtime.ts', 'platform.activeAdapters.forEach'],
  'skills/common/plugin-runtime/foundation/config/platform.schema.json::$.administrativeDecisionIssuers[].id': ['skills/nova/core/execution/engine-admin.ts', 'issuer.id === principal.id'],
  'skills/common/plugin-runtime/foundation/config/platform.schema.json::$.administrativeDecisionIssuers[].type': ['skills/nova/core/execution/engine-admin.ts', 'issuer.type === principal.type'],
  'skills/common/plugin-runtime/foundation/config/platform.schema.json::$.effectLockTtlMs': ['skills/nova/core/execution/engine-runtime.ts', 'platform.effectLockTtlMs ?? 300_000'],
  'skills/common/plugin-runtime/foundation/config/platform.schema.json::$.externalTrust.allowedSourceDigests.{*}[]': ['skills/common/plugin-runtime/foundation/registry/discovery.ts', 'trustPolicy.allowedSourceDigests.get(reference)'],
  'skills/common/plugin-runtime/foundation/config/platform.schema.json::$.externalTrust.verifiedAttestations.{*}': ['skills/common/plugin-runtime/foundation/registry/discovery.ts', 'trustPolicy.verifiedAttestations.get(digest)'],
  'skills/common/plugin-runtime/foundation/config/platform.schema.json::$.orchestratorIssuerId': ['skills/nova/core/execution/engine-run.ts', 'context.platform.orchestratorIssuerId'],
  'skills/common/plugin-runtime/foundation/config/platform.schema.json::$.shutdownTimeoutMs': ['skills/nova/core/execution/engine-runtime.ts', 'shutdownTimeoutMs: platform.shutdownTimeoutMs'],
  'skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#$.configSchema::$.redisCommandTimeoutMs': ['skills/common/plugins/openclaw-agent-observer/src/config.ts', "configuredValue(config, env, 'redisCommandTimeoutMs'"],
  'skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#$.configSchema::$.redisHost': ['skills/common/plugins/openclaw-agent-observer/src/config.ts', "configuredValue(config, env, 'redisHost'"],
  'skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#$.configSchema::$.redisNetworkIsolation': ['skills/common/plugins/openclaw-agent-observer/src/config.ts', "configuredValue(config, env, 'redisNetworkIsolation'"],
  'skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#$.configSchema::$.redisPassword': ['skills/common/plugins/openclaw-agent-observer/src/config.ts', "configuredValue(config, env, 'redisPassword'"],
  'skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#$.configSchema::$.redisPort': ['skills/common/plugins/openclaw-agent-observer/src/config.ts', "configuredValue(config, env, 'redisPort'"],
  'skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#$.configSchema::$.redisTls': ['skills/common/plugins/openclaw-agent-observer/src/config.ts', "configuredValue(config, env, 'redisTls'"],
  'skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#$.configSchema::$.redisUsername': ['skills/common/plugins/openclaw-agent-observer/src/config.ts', "configuredValue(config, env, 'redisUsername'"],
  'skills/common/plugins/operator-messaging/schemas/config.schema.json::$.targets.{pattern:^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$}.receiptEndpoint': ['skills/common/plugins/operator-messaging/src/config.ts', 'parseUrl(raw.receiptEndpoint'],
  'skills/common/plugins/network-http/schemas/config.schema.json::$.maxRequestBytes': ['skills/common/plugins/network-http/src/adapter.ts', "positiveInteger(config.maxRequestBytes, 'maxRequestBytes'"],
  'skills/common/plugins/network-http/schemas/config.schema.json::$.maxResponseBytes': ['skills/common/plugins/network-http/src/adapter.ts', "positiveInteger(config.maxResponseBytes, 'maxResponseBytes'"],
  'skills/common/plugins/network-http/schemas/config.schema.json::$.timeoutMs': ['skills/common/plugins/network-http/src/adapter.ts', "positiveInteger(config.timeoutMs, 'timeoutMs'"],
  'skills/common/plugins/notification-observer/schemas/config.schema.json::$.modelLabel': ['skills/common/plugins/notification-observer/src/observer.ts', "configuredText(context.contract.config, 'modelLabel'"],
  'skills/common/plugins/notification-observer/schemas/config.schema.json::$.pipelineLabel': ['skills/common/plugins/notification-observer/src/observer.ts', "configuredText(context.contract.config, 'pipelineLabel'"],
  'skills/common/plugins/notification-observer/schemas/config.schema.json::$.stageLabels.{*}': ['skills/common/plugins/notification-observer/src/observer.ts', 'const stageLabels = context.contract.config.stageLabels'],
  'skills/common/plugins/redis-transport/schemas/config.schema.json::$.passwordSecret': ['skills/common/plugins/redis-transport/src/adapter.ts', 'canonicalId: options.passwordSecret'],
  'skills/common/plugins/transport-publisher/schemas/config.schema.json::$.maximumDeliveryBytes': ['skills/common/plugins/transport-publisher/src/adapter.ts', 'storeLimit(config.maximumDeliveryBytes'],
  'skills/common/plugins/transport-publisher/schemas/config.schema.json::$.maximumDeliveryRecords': ['skills/common/plugins/transport-publisher/src/adapter.ts', 'storeLimit(config.maximumDeliveryRecords'],
  'skills/nova/plugins/lint/schemas/adapter-config.schema.json::$.allowedPolicyRoots[]': ['skills/nova/plugins/lint/src/adapter.ts', "configuredRoots(context.config, 'allowedPolicyRoots')"],
  'skills/nova/plugins/lint/schemas/adapter-config.schema.json::$.allowedRepositoryRoots[]': ['skills/nova/plugins/lint/src/adapter.ts', "configuredRoots(context.config, 'allowedRepositoryRoots')"],
  'skills/nova/plugins/remote-test-gate/schemas/config.schema.json::$.sourcePrivateKeySecret': ['skills/nova/plugins/remote-test-gate/src/adapter.ts', "string(context.config.sourcePrivateKeySecret, 'REMOTE_TEST_GATE_CONFIG_INVALID')"],
  'skills/nova/plugins/review/schemas/config.schema.json::$.policy.limits.maxInstancesPerCluster': ['skills/nova/plugins/review/src/review-policy-parser.ts', "integer(limits.maxInstancesPerCluster, 'limits.maxInstancesPerCluster'"],
  'skills/nova/plugins/review/schemas/repository-audit-config.schema.json::$.policy.limits.maxInstancesPerCluster': ['skills/nova/plugins/review/src/review-policy-parser.ts', "integer(limits.maxInstancesPerCluster, 'limits.maxInstancesPerCluster'"],
  'skills/nova/plugins/review/schemas/config.schema.json::$.policy': ['skills/nova/plugins/review/src/stage.ts', 'settingsFile: stageConfig.policy'],
  'skills/nova/plugins/review/schemas/repository-audit-config.schema.json::$.policy': ['skills/nova/plugins/review/src/repository-audit-stage.ts', 'settingsFile: config.policy'],
  'skills/nova/plugins/review/schemas/config.schema.json::$.profile': ['skills/nova/plugins/review/src/stage.ts', 'getReviewPolicyProfile(stageConfig.profile)'],
  'skills/nova/plugins/review/schemas/repository-audit-config.schema.json::$.profile': ['skills/nova/plugins/review/src/repository-audit-stage.ts', 'getReviewPolicyProfile(config.profile)'],
  'skills/nova/plugins/review/schemas/config.schema.json::$.policy.schemaVersion': ['skills/nova/plugins/review/src/review-policy-parser.ts', 'schemaVersion: REVIEW_POLICY_SCHEMA_VERSION'],
  'skills/nova/plugins/review/schemas/repository-audit-config.schema.json::$.policy.schemaVersion': ['skills/nova/plugins/review/src/review-policy-parser.ts', 'schemaVersion: REVIEW_POLICY_SCHEMA_VERSION'],
  'skills/nova/plugins/review/schemas/config.schema.json::$.policy.governor.maxRepairCycles': ['skills/nova/plugins/review/src/review-policy-parser.ts', "integer(value.maxRepairCycles, 'governor.maxRepairCycles'"],
  'skills/nova/plugins/review/schemas/repository-audit-config.schema.json::$.policy.governor.maxRepairCycles': ['skills/nova/plugins/review/src/review-policy-parser.ts', "integer(value.maxRepairCycles, 'governor.maxRepairCycles'"],
}));

for (const collection of ['artifacts', 'coverage', 'reports']) {
  for (const [field, anchor] of Object.entries({
    id: 'const id = item.id',
    path: 'relativePath(item.path',
    mediaType: 'item.mediaType',
    format: 'item.format',
  })) {
    SCHEMA_IMPLEMENTATION_AUTHORITIES.set(
      `skills/buster/plugins/direct-command/schemas/config.schema.json::$.${collection}[].${field}`,
      ['skills/buster/plugins/direct-command/src/provider.js', anchor],
    );
  }
}

for (const provider of ['dependency', 'headers', 'image', 'kubernetes-policy', 'kubernetes-runtime']) {
  const schemaPath = `skills/buster/plugins/security-providers/schemas/${provider}.schema.json`;
  for (const [field, anchor] of Object.entries({
    findingId: 'item.findingId',
    reason: 'item.reason.trim()',
    expiresAt: 'new Date(item.expiresAt).toISOString()',
    profile: 'item.profile !== POLICY.profile',
  })) {
    const fieldPath = field === 'profile' ? '$.policy.profile' : `$.policy.acceptances[].${field}`;
    SCHEMA_IMPLEMENTATION_AUTHORITIES.set(`${schemaPath}::${fieldPath}`,
      ['skills/buster/plugins/security-providers/src/common.js', anchor]);
  }
}

for (const operation of ['add', 'replace']) {
  for (const [field, anchor] of Object.entries({
    id: 'item.id',
    header: 'item.header',
    severity: 'item.severity',
    kind: 'item.kind',
    value: 'item.value',
  })) {
    SCHEMA_IMPLEMENTATION_AUTHORITIES.set(
      `skills/buster/plugins/security-providers/schemas/headers.schema.json::$.rules.${operation}[].${field}`,
      ['skills/buster/plugins/security-providers/src/headers.js', anchor],
    );
  }
}

for (const schemaPath of [
  'skills/nova/plugins/review/schemas/config.schema.json',
  'skills/nova/plugins/review/schemas/repository-audit-config.schema.json',
]) {
  SCHEMA_IMPLEMENTATION_AUTHORITIES.set(`${schemaPath}::$.policy.simplification.enabled`,
    ['skills/nova/plugins/review/src/review-policy-parser.ts', "boolean(value.enabled, 'simplification.enabled'"]);
}

for (const schemaPath of [
  'skills/nova/plugins/review/schemas/config.schema.json',
  'skills/nova/plugins/review/schemas/repository-audit-config.schema.json',
]) {
  for (const category of ['architecture', 'contract', 'correctness', 'security', 'simplification']) {
    SCHEMA_IMPLEMENTATION_AUTHORITIES.set(`${schemaPath}::$.policy.ranking.categoryWeights.${category}`,
      ['skills/nova/plugins/review/src/review-cluster-ranking.ts', 'ranking.categoryWeights[finding.category]']);
  }
  for (const priority of ['P0', 'P1', 'P2', 'P3']) {
    SCHEMA_IMPLEMENTATION_AUTHORITIES.set(`${schemaPath}::$.policy.ranking.priorityWeights.${priority}`,
      ['skills/nova/plugins/review/src/review-cluster-ranking.ts', 'ranking.priorityWeights[finding.priority]']);
  }
}

function explicitSchemaImplementationEvidence(authorityPath, fieldPath) {
  const authority = SCHEMA_IMPLEMENTATION_AUTHORITIES.get(`${authorityPath}::${fieldPath}`);
  if (!authority) return null;
  const [sourcePath, anchor] = authority;
  assert(anchor.length > 0, `${authorityPath}::${fieldPath}: implementation authority anchor must not be empty`);
  assert(exists(sourcePath), `${authorityPath}::${fieldPath}: missing implementation authority ${sourcePath}`);
  const text = read(sourcePath);
  const index = text.indexOf(anchor);
  assert(index >= 0, `${authorityPath}::${fieldPath}: implementation authority anchor not found in ${sourcePath}`);
  return { path: sourcePath, line: lineAt(text, index), score: Number.MAX_SAFE_INTEGER };
}

function schemaImplementationEvidence(authorityPath, fieldPath) {
  const explicit = explicitSchemaImplementationEvidence(authorityPath, fieldPath);
  if (explicit) return explicit;
  const segments = schemaNamedSegments(fieldPath);
  const anchor = segments.at(-1);
  if (!anchor) return null;
  const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const anchorPattern = new RegExp(`(?<![A-Za-z0-9_])${escapedAnchor}(?![A-Za-z0-9_])`, 'u');
  const scored = [];
  for (const candidate of schemaImplementationCandidates(authorityPath)) {
    const text = read(candidate);
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!anchorPattern.test(lines[index])) continue;
      const sourceLine = lines[index];
      if (/^\s*(?:readonly\s+)?[A-Za-z_$][A-Za-z0-9_$]*\??\s*:\s*(?:readonly\s+)?(?:string|number|boolean|unknown|Record|Readonly|Map|Set|[A-Z][A-Za-z0-9_$]*)(?:\b|<|\[)/u.test(sourceLine)) continue;
      if (/^\s*(?:import|export\s+type|interface|type)\b/u.test(sourceLine)) continue;
      const matchedSegments = segments.filter((segment) => {
        const alternatives = [segment, segment.endsWith('s') && segment.length > 3 ? segment.slice(0, -1) : null].filter(Boolean);
        return alternatives.some((item) => new RegExp(`(?<![A-Za-z0-9_])${item.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![A-Za-z0-9_])`, 'u').test(sourceLine));
      });
      const accessSignal = /(?:context\.(?:contract\.)?config|(?:config|configuration|settings|raw|values|options|policy|target|operation|item|value|input|limits|ranking|governor|blocking)\s*(?:\.|\[)|Object\.(?:entries|keys|values)|(?:parse|validate|integer|text|bounded|resolve|path\.resolve|selection|selections|boolean|weights|configuredRoots|configuredValue)\s*\(|\?\?|throw new Error|payload\s*[:=])/u.test(sourceLine);
      const minimumSegments = Math.min(segments.length, 2);
      if (matchedSegments.length < minimumSegments || !accessSignal) continue;
      scored.push({ path: candidate, line: index + 1, score: matchedSegments.length * 10 + 3 });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line);
  return scored[0] ?? null;
}

function schemaFieldMeaning(authorityPath, field, consumerEvidence) {
  const authorityKey = `${authorityPath}::${field.path}`;
  if (field.type === 'recursive-reference') {
    return {
      authorityKey,
      status: 'schema-meaning-blocker',
      text: `The local schema reference at ${field.path} is cyclic and cannot establish an effective public field contract.`,
      evidence: schemaAuthorityPath(authorityPath),
      schemaEvidence: schemaAuthorityPath(authorityPath),
      implementationEvidence: null,
      acceptedValues: schemaAcceptedValues(field),
      defaultBehavior: 'No effective default can be established through a cyclic reference.',
      emptyBehavior: 'No effective empty-value contract can be established through a cyclic reference.',
      changeImpact: 'Do not publish this field until the reference cycle is removed.',
      failureMeaning: 'The documentation inventory rejects the cycle instead of recursing or inventing a leaf contract.',
      blockerOwner: sourceOwner(schemaAuthorityPath(authorityPath)).component,
      closureCondition: `Replace the cyclic local reference for ${authorityKey} with a finite schema graph.`,
      consumerEvidence,
    };
  }
  if (field.path === '$' || ['object', 'array'].includes(field.type)) {
    return {
      authorityKey,
      status: 'structural-container',
      text: 'Structural schema container. Child fields define configurable behavior.',
      evidence: schemaAuthorityPath(authorityPath),
      schemaEvidence: schemaAuthorityPath(authorityPath),
      implementationEvidence: null,
      acceptedValues: schemaAcceptedValues(field),
      defaultBehavior: schemaDefaultBehavior(authorityPath, field, null),
      emptyBehavior: 'Not applicable to a structural container.',
      changeImpact: 'Child fields, not the container row, define runtime changes.',
      failureMeaning: 'Container shape and child constraints determine validation failure.',
      blockerOwner: null,
      closureCondition: null,
    };
  }
  const context = schemaRuntimeContext(authorityPath);
  const priorSchema = priorInventory('configuration-schemas.json');
  const priorAuthorityKeys = new Set((priorSchema?.files ?? []).flatMap((file) =>
    (file.fields ?? []).map((candidate) => candidate.meaning?.authorityKey ?? `${file.path}::${candidate.path}`)));
  const previouslyInventoried = priorSchema === null || priorAuthorityKeys.has(authorityKey);
  const inheritedThroughLocalReference = (field.resolvedReferences ?? []).length > 0;
  const authoredDescription = field.description?.trim() || null;
  // A newly added public field must not acquire a meaning merely because its
  // short name (for example `enabled`, `target`, or `timeoutMs`) occurs in an
  // unrelated provider. Existing rows are drift-controlled, while referenced
  // leaves inherit their identity from the resolved local schema definition.
  const permitsInferredAuthority = previouslyInventoried || inheritedThroughLocalReference || Boolean(authoredDescription);
  const purpose = context && permitsInferredAuthority ? schemaSpecificPurpose(authorityPath, field.path, context) : null;
  const implementation = permitsInferredAuthority ? schemaImplementationEvidence(authorityPath, field.path) : null;
  const runtimeFallback = schemaRuntimeFallback(authorityPath, field.path, implementation);
  const describedPurpose = authoredDescription || purpose;
  const acceptedValues = schemaAcceptedValues(field);
  const defaultBehavior = schemaDefaultBehavior(authorityPath, field, runtimeFallback);
  const emptyBehavior = schemaEmptyBehavior(field);
  if (describedPurpose && implementation) {
    const changeImpact = `Changing ${field.path} changes this exact configured behavior when ${context} next loads it: ${describedPurpose}`;
    const failureMeaning = `Schema validation rejects ${field.path} when it violates ${acceptedValues}. The linked consumer at ${implementation.path}:${implementation.line} owns any later operational rejection for this field; no unrelated target, path, secret, or resource failure is inferred.`;
    return {
      authorityKey,
      status: field.description?.trim() ? 'schema-and-runtime-authority' : 'qualified-runtime-authority',
      text: `${describedPurpose} Accepted values: ${acceptedValues}. Omission: ${defaultBehavior} Empty value: ${emptyBehavior} Change effect: ${changeImpact} Failure: ${failureMeaning}`,
      evidence: `${implementation.path}:${implementation.line}`,
      schemaEvidence: schemaAuthorityPath(authorityPath),
      implementationEvidence: `${implementation.path}:${implementation.line}`,
      runtimeDefault: runtimeFallback?.value ?? null,
      runtimeDefaultEvidence: runtimeFallback?.evidence ?? null,
      acceptedValues,
      defaultBehavior,
      emptyBehavior,
      changeImpact,
      failureMeaning,
      blockerOwner: null,
      closureCondition: null,
    };
  }
  const missing = [!context ? 'registered runtime context' : null, !describedPurpose ? 'concrete field purpose' : null, !implementation ? 'path-specific runtime data flow' : null].filter(Boolean);
  const readablePath = field.path.replace(/^\$\.?/u, '') || field.path;
  return {
    authorityKey,
    status: 'schema-meaning-blocker',
    text: `The schema accepts ${readablePath}, but the repository does not yet prove its complete operator meaning. Missing authority: ${missing.join(', ')}. Accepted values: ${acceptedValues}. Omission: ${defaultBehavior} Empty value: ${emptyBehavior}`,
    evidence: schemaAuthorityPath(authorityPath),
    schemaEvidence: schemaAuthorityPath(authorityPath),
    implementationEvidence: null,
    runtimeDefault: runtimeFallback?.value ?? null,
    runtimeDefaultEvidence: runtimeFallback?.evidence ?? null,
    acceptedValues,
    defaultBehavior,
    emptyBehavior,
    changeImpact: 'Do not change this field until its path-specific runtime effect is linked.',
    failureMeaning: 'Schema validation behavior is known; downstream runtime behavior is not proved.',
    blockerOwner: sourceOwner(schemaAuthorityPath(authorityPath)).component,
    closureCondition: `Add a path-specific runtime read or an exact authored Page + Section + table-row authority for ${authorityKey}; otherwise remove the unused public field.`,
    consumerEvidence,
  };
}

function schemaType(schema) {
  if (typeof schema === 'boolean') return schema ? 'any' : 'never';
  if (Array.isArray(schema.type)) return schema.type.join('|');
  if (schema.type) return schema.type;
  if (schema.const !== undefined) return typeOf(schema.const);
  if (Array.isArray(schema.enum) && schema.enum.length) return [...new Set(schema.enum.map(typeOf))].join('|');
  for (const keyword of ['oneOf', 'anyOf']) {
    if (Array.isArray(schema[keyword]) && schema[keyword].length) {
      const types = [...new Set(schema[keyword].map(schemaType).filter((item) => item !== 'unspecified'))];
      if (types.length) return types.join('|');
    }
  }
  if (schema.properties || schema.additionalProperties) return 'object';
  if (schema.items || schema.prefixItems) return 'array';
  return 'unspecified';
}

function schemaConstraints(schema, fieldPath) {
  if (!schema || typeof schema !== 'object') return [];
  const constraints = [];
  for (const key of SCHEMA_CONSTRAINTS) {
    if (!(key in schema)) continue;
    let value = schema[key];
    if (key === 'additionalProperties' && typeof value === 'object') value = '<schema>';
    constraints.push({
      name: key,
      value: key === 'const' || key === 'enum' ? redactValue(fieldPath, value) : value,
    });
  }
  if (schema.$ref) constraints.push({ name: '$ref', value: schema.$ref });
  if (schema.deprecated === true) constraints.push({ name: 'deprecated', value: true });
  return constraints;
}

function resolveLocalSchemaReference(rootSchema, reference) {
  if (typeof reference !== 'string' || !reference.startsWith('#/')) return null;
  let current = rootSchema;
  for (const encodedSegment of reference.slice(2).split('/')) {
    const segment = encodedSegment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) return null;
    current = current[segment];
  }
  return current && typeof current === 'object' ? current : null;
}

function flattenSchema(schema, fieldPath = '$', required = true, branches = [], output = [], rootSchema = schema, referenceStack = [], resolvedReferences = [], negated = false, forbiddenPresence = false) {
  if (typeof schema === 'boolean') {
    output.push({ path: fieldPath, type: schemaType(schema), required: negated ? false : required, presence: forbiddenPresence ? 'forbidden' : 'allowed', negated, default: '<none>', constraints: [], branches, resolvedReferences, ownerRole: 'unknown', consumers: ['schema validator; runtime consumer not proven by schema'] });
    return output;
  }
  if (schema.$ref) {
    const resolved = resolveLocalSchemaReference(rootSchema, schema.$ref);
    if (resolved) {
      if (referenceStack.includes(schema.$ref)) {
        output.push({
          path: fieldPath,
          type: 'recursive-reference',
          required: negated ? false : required,
          presence: forbiddenPresence ? 'forbidden' : 'allowed',
          negated,
          default: '<none>',
          description: schema.description ?? '',
          constraints: [{ name: '$ref', value: schema.$ref }],
          branches: [...branches, 'cyclic-reference'],
          resolvedReferences: [...resolvedReferences, schema.$ref],
          ownerRole: 'unknown',
          consumers: ['schema validator; recursive runtime consumer'],
        });
        return output;
      }
      const siblings = { ...schema };
      delete siblings.$ref;
      const merged = Object.keys(siblings).length === 0 ? resolved : {
        ...resolved,
        ...siblings,
        properties: resolved.properties || siblings.properties
          ? { ...(resolved.properties ?? {}), ...(siblings.properties ?? {}) }
          : undefined,
        required: [...new Set([...(resolved.required ?? []), ...(siblings.required ?? [])])],
      };
      return flattenSchema(merged, fieldPath, required, branches, output, rootSchema,
        [...referenceStack, schema.$ref], [...resolvedReferences, schema.$ref], negated, forbiddenPresence);
    }
  }
  output.push({
    path: fieldPath,
    type: schemaType(schema),
    required: negated ? false : required,
    presence: forbiddenPresence ? 'forbidden' : 'allowed',
    negated,
    default: 'default' in schema ? redactValue(fieldPath, schema.default) : '<none>',
    description: schema.description ?? '',
    constraints: [
      ...schemaConstraints(schema, fieldPath),
      ...resolvedReferences.map((reference) => ({ name: '$ref', value: reference })),
    ],
    branches,
    resolvedReferences,
    ownerRole: 'unknown',
    consumers: ['schema validator; runtime consumer not proven by schema'],
  });
  const requiredChildren = new Set(schema.required ?? []);
  for (const [key, child] of Object.entries(schema.properties ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const childForbidden = negated && requiredChildren.has(key);
    flattenSchema(child, fieldPath === '$' ? `$.${key}` : `${fieldPath}.${key}`, negated ? false : requiredChildren.has(key), branches, output, rootSchema, referenceStack, resolvedReferences, negated, childForbidden);
  }
  for (const [key, child] of Object.entries(schema.patternProperties ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    flattenSchema(child, `${fieldPath}.{pattern:${key}}`, false, branches, output, rootSchema, referenceStack, resolvedReferences, negated, false);
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    flattenSchema(schema.additionalProperties, `${fieldPath}.{*}`, false, branches, output, rootSchema, referenceStack, resolvedReferences, negated, false);
  }
  if (schema.items && typeof schema.items === 'object') flattenSchema(schema.items, `${fieldPath}[]`, negated ? false : true, branches, output, rootSchema, referenceStack, resolvedReferences, negated, false);
  (schema.prefixItems ?? []).forEach((child, index) => flattenSchema(child, `${fieldPath}[${index}]`, negated ? false : true, branches, output, rootSchema, referenceStack, resolvedReferences, negated, false));
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    (schema[keyword] ?? []).forEach((child, index) => flattenSchema(child, fieldPath, required, [...branches, `${keyword}[${index}]`], output, rootSchema, referenceStack, resolvedReferences, negated, forbiddenPresence));
  }
  for (const keyword of ['if', 'then', 'else']) {
    if (schema[keyword] && typeof schema[keyword] === 'object') flattenSchema(schema[keyword], fieldPath, required, [...branches, keyword], output, rootSchema, referenceStack, resolvedReferences, negated, forbiddenPresence);
  }
  if (schema.not && typeof schema.not === 'object') flattenSchema(schema.not, fieldPath, false, [...branches, 'not'], output, rootSchema, referenceStack, resolvedReferences, !negated, false);
  for (const [key, child] of Object.entries(schema.$defs ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    flattenSchema(child, `$defs.${key}`, false, [...branches, 'definition'], output, rootSchema, referenceStack, resolvedReferences, false, false);
  }
  return output;
}

function flattenDeployedPayload(value, fieldPath = '$', result = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenDeployedPayload(item, `${fieldPath}[${index}]`, result));
    return result;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) flattenDeployedPayload(item, fieldPath === '$' ? `$.${key}` : `${fieldPath}.${key}`, result);
    return result;
  }
  result.push({ path: fieldPath, type: value === null ? 'null' : typeof value, value: redactValue(fieldPath, value) });
  return result;
}

function parseConfigPayload(sourcePath) {
  const name = path.basename(sourcePath);
  const text = read(sourcePath);
  let parseMode = 'opaque-program-or-tool-config';
  let fields = [];
  try {
    if (/\.json$/u.test(name)) {
      fields = flattenDeployedPayload(JSON.parse(text));
      parseMode = 'recursive-json';
    } else if (/\.ya?ml$/u.test(name)) {
      fields = YAML.parseAllDocuments(text, { prettyErrors: false }).flatMap((document, documentIndex) => {
        assert.equal(document.errors.length, 0, `${sourcePath}: configuration payload does not parse`);
        return flattenDeployedPayload(document.toJS()).map((field) => ({ ...field, document: documentIndex }));
      });
      parseMode = 'recursive-yaml';
    }
  } catch (error) {
    throw new Error(`${sourcePath}: structured configuration payload parsing failed: ${error.message}`);
  }
  return { name, text, parseMode, fields };
}

function deployedConfigPayloads() {
  const templatePath = 'charts/kubeclaw/templates/configmap-swarm-config.yaml';
  const deploymentPath = 'charts/kubeclaw/templates/deployment.yaml';
  const templateText = read(templatePath);
  const deploymentText = read(deploymentPath);
  const deploymentLines = deploymentText.split('\n');
  const templateLines = templateText.split('\n');
  const exactLine = (sourcePath, sourceText, needle, kind, authority, occurrence = null) => {
    const matches = sourceText.split('\n').flatMap((line, index) => line.includes(needle) ? [{ line, index }] : []);
    if (occurrence === null) assert.equal(matches.length, 1, `${sourcePath}: expected one exact ${kind} line containing ${needle}, found ${matches.length}`);
    else assert(matches[occurrence], `${sourcePath}: expected ${kind} occurrence ${occurrence + 1} containing ${needle}`);
    const selected = matches[occurrence ?? 0];
    return {
      path: sourcePath,
      line: selected.index + 1,
      sourceLineSha256: sha256(selected.line),
      requiredToken: needle,
      kind,
      authority,
    };
  };
  const exactReaders = {
    '.semgrep.yml': ['skills/nova/plugins/lint/src/engine/tool-registry-semgrep.ts', 'semgrepArgs(ctx, config),', 'Semgrep tool adapter passes the policy-selected config path to the semgrep process'],
    '.yamllint.yml': ['skills/nova/plugins/lint/src/engine/container-yaml-tools.ts', "const args = ['-c', config, '-f', 'parsable', '--strict', ...yamlFiles]", 'yamllint tool adapter places the policy-selected config path after -c in the yamllint process arguments'],
    '.tflint.hcl': ['skills/nova/plugins/lint/src/engine/terraform-tools.ts', '`--config=${ctx.tool.config_path}`', 'TFLint tool adapter places the policy-selected config path in the --config process argument'],
    'knip.json': ['skills/nova/plugins/lint/src/engine/architecture-tools.ts', "'--config', ctx.tool.config_path", 'Knip tool adapter places the policy-selected config path after --config'],
    'jscpd.json': ['skills/nova/plugins/lint/src/engine/architecture-tools.ts', 'executeJscpd(ctx, ctx.tool.config_path', 'JSCPD adapter passes the policy-selected production config path to its process-argument builder'],
    'jscpd-tests.json': ['skills/nova/plugins/lint/src/engine/architecture-tools.ts', "path.join(path.dirname(ctx.tool.config_path), 'jscpd-tests.json')", 'JSCPD adapter derives the dedicated test calibration path from the policy-selected production path'],
    // lint-policy.json has a checked-in parser, but no checked-in binding proves
    // that request.policyPath selects /runtime-config/lint-policy.json.
    'lint-baseline.json': ['skills/nova/plugins/lint/src/engine/lint-governance.ts', "source = fs.readFileSync(baselinePath, 'utf8'); parsed = JSON.parse(source)", 'lint governance reads and parses the baseline path selected by the policy'],
    'eslint.config.mjs': ['skills/nova/plugins/lint/src/engine/tool-registry-language-tools.ts', "args.push('--config', config)", 'ESLint adapter places the policy-selected config path after --config'],
    'eslint-type-evidence-config.mjs': ['skills/nova/plugins/lint/src/engine/tool-registry-language-tools.ts', "args.push('--config', config)", 'ESLint adapter places this policy-selected production type-evidence path after --config'],
    'eslint-type-evidence-generated-config.mjs': ['skills/nova/plugins/lint/src/engine/tool-registry-language-tools.ts', "args.push('--config', config)", 'ESLint adapter places this policy-selected generated-code type-evidence path after --config'],
    'eslint-type-evidence-tests-config.mjs': ['skills/nova/plugins/lint/src/engine/tool-registry-language-tools.ts', "args.push('--config', config)", 'ESLint adapter places this policy-selected test type-evidence path after --config'],
    'type-evidence-eslint-plugin.mjs': ['charts/kubeclaw/files/config/eslint-type-evidence-config.mjs', "import typeEvidence from './type-evidence-eslint-plugin.mjs'", 'the deployed ESLint configuration imports this exact sibling module'],
    // The chart injects SWARM_CONFIG, but the image-owned runtime reader is not
    // present in this repository.  Do not turn path injection into field meaning.
  };
  const runtimeSourceFiles = walk('skills', (absolutePath) => /\.(?:[cm]?[jt]s|tsx)$/u.test(absolutePath))
    .filter((sourcePath) => !/(?:^|\/)(?:tests?|fixtures?|node_modules)(?:\/|$)/u.test(sourcePath));
  const lintCanonicalRequestBindings = runtimeSourceFiles.filter((sourcePath) => {
    const source = read(sourcePath);
    return source.includes('/runtime-config/lint-policy.json') && /request\.policyPath|policyPath/u.test(source);
  });
  assert.deepEqual(lintCanonicalRequestBindings, [],
    'CONFIG_PAYLOAD_REQUEST_PATH_BOUNDARY_CHANGED: a runtime lint-policy binding now exists; replace the documented gap with an exact chain');
  const checkedInSwarmRuntimeReaders = runtimeSourceFiles.filter((sourcePath) => /SWARM_CONFIG|\.openclaw\/swarm\.config\.json/u.test(read(sourcePath)));
  assert.deepEqual(checkedInSwarmRuntimeReaders, [],
    'CONFIG_PAYLOAD_SWARM_READER_BOUNDARY_CHANGED: a checked-in swarm runtime reader now exists; replace the documented gap with exact reader proof');
  const payloads = [];
  for (const match of templateText.matchAll(/\.Files\.Get\s+"files\/config\/([^"]+)"/gu)) {
    const name = match[1];
    const sourcePath = `charts/kubeclaw/files/config/${name}`;
    assert(exists(sourcePath), `${templatePath}: deployed config payload ${sourcePath} is missing`);
    const { text, parseMode, fields } = parseConfigPayload(sourcePath);
    const embeddingLine = lineAt(templateText, match.index);
    const reader = exactReaders[name] ?? null;
    const genericNames = 'eslint-type-evidence-config.mjs eslint-type-evidence-tests-config.mjs eslint-type-evidence-generated-config.mjs type-evidence-eslint-plugin.mjs knip.json jscpd.json jscpd-tests.json lint-baseline.json';
    const generic = genericNames.split(' ').includes(name);
    const firstCopyNeedle = generic ? `for lint_config in ${genericNames}` : name === 'swarm.config.json'
      ? 'cp -Lf "/init-swarm-config/swarm.config.json" "/config/swarm.config.json"'
      : `cp -Lf ${['.semgrep.yml', 'eslint.config.mjs'].includes(name) ? `"/init-swarm-config/${name}" "/config/${name}"` : name === 'lint-policy.json' ? '"/init-swarm-config/lint-policy.json" "/config/lint-policy.json"' : `"/init-swarm-config/${name}" "/config/${name}"`}`;
    const runtimeCopyNeedle = generic ? `for lint_config in ${genericNames}` : name === 'swarm.config.json'
      ? 'const source="/config/swarm.config.json"; const target="/runtime-config/swarm.config.json"'
      : name === 'lint-policy.json' ? 'cp -Lf /config/lint-policy.json /runtime-config/lint-policy.json'
        : `cp -Lf /config/${name} /runtime-config/${name}`;
    const deliveryChain = [
      exactLine(templatePath, templateText, `  ${name}: |`, 'configmap-key', `ConfigMap data key ${name} names the embedded payload`),
      exactLine(templatePath, templateText, `.Files.Get "files/config/${name}"`, 'helm-file-embedding', `the exact ${sourcePath} bytes populate ConfigMap key ${name}`),
      exactLine(deploymentPath, deploymentText, 'name: {{ include "kubeclaw.fullname" . }}-swarm-config', 'configmap-volume-object-reference', 'Pod volume init-swarm-config selects the rendered swarm ConfigMap object'),
      exactLine(deploymentPath, deploymentText, 'mountPath: /init-swarm-config', 'configmap-volume-mount', 'init container mounts the ConfigMap at /init-swarm-config'),
      exactLine(deploymentPath, deploymentText, firstCopyNeedle, generic ? 'first-copy-loop-membership' : 'first-config-copy', generic
        ? `${name} is an explicit member of the first-copy loop from /init-swarm-config to /config`
        : `${name} is copied from the ConfigMap mount into persistent /config`, generic ? 0 : null),
      ...(generic ? [exactLine(deploymentPath, deploymentText, 'cp -Lf "/init-swarm-config/$lint_config" "/config/$lint_config"', 'first-config-copy', 'the first-copy loop copies its exact named member from /init-swarm-config to /config')] : []),
      exactLine(deploymentPath, deploymentText, runtimeCopyNeedle, generic ? 'runtime-copy-loop-membership' : 'runtime-config-copy', generic
        ? `${name} is an explicit member of the runtime-copy loop from /config to /runtime-config`
        : `${name} is copied or rendered from /config into /runtime-config`, generic ? 1 : null),
      ...(generic ? [exactLine(deploymentPath, deploymentText, 'cp -Lf "/config/$lint_config" "/runtime-config/$lint_config"', 'runtime-config-copy', 'the runtime-copy loop copies its exact named member into /runtime-config')] : []),
    ];
    const selectionProof = [];
    let selectionPrecedence;
    if (name === '.semgrep.yml' || name === 'eslint.config.mjs') {
      selectionProof.push(
        exactLine(deploymentPath, deploymentText, `if [ -f "/init-swarm-config/${name}" ]; then`, 'chart-source-present-condition', `the chart source participates only when the mounted ${name} exists`),
        exactLine(deploymentPath, deploymentText, `if [ "${'${OVERRIDE_SWARM_CONFIG}'}" = "true" ] || [ ! -f "/config/${name}" ]; then`, 'override-or-absent-condition', `chart bytes replace persistent ${name} only when override is true or no persistent file exists`),
        exactLine(deploymentPath, deploymentText, `${name} exists, keeping (override=false)`, 'persistent-retention-branch', `an existing persistent ${name} is retained when override is false`),
      );
      selectionPrecedence = 'Mounted chart bytes replace the persistent file only when OVERRIDE_SWARM_CONFIG is true or the persistent file is absent. Otherwise the existing persistent file wins. The runtime copy uses the resulting persistent file.';
    } else if (generic) {
      selectionProof.push(exactLine(deploymentPath, deploymentText, 'if [ -f "/init-swarm-config/$lint_config" ]; then', 'chart-source-present-condition', `${name} is copied only when its explicit loop member exists in the mounted chart source`));
      selectionPrecedence = 'When the named chart file exists, the init loop replaces the persistent file. The runtime loop then copies that persistent result. No retained-file override branch exists for this payload.';
    } else {
      const mountedNeedle = `if [ -f ${name === 'swarm.config.json' || ['.semgrep.yml', 'eslint.config.mjs', '.yamllint.yml', '.tflint.hcl', 'lint-policy.json'].includes(name) ? `"/init-swarm-config/${name}"` : `/init-swarm-config/${name}`} ]; then`;
      // Quote spelling differs in three simple shell blocks; bind the exact
      // condition actually present rather than normalizing shell source.
      const conditionNeedle = name === 'swarm.config.json' ? 'if [ -f "/init-swarm-config/swarm.config.json" ]; then'
        : name === '.yamllint.yml' ? 'if [ -f "/init-swarm-config/.yamllint.yml" ]; then'
          : name === '.tflint.hcl' ? 'if [ -f "/init-swarm-config/.tflint.hcl" ]; then'
            : name === 'lint-policy.json' ? 'if [ -f "/init-swarm-config/lint-policy.json" ]; then' : mountedNeedle;
      selectionProof.push(exactLine(deploymentPath, deploymentText, conditionNeedle, 'chart-source-present-condition', `the chart source replaces persistent ${name} only when the mounted source file exists`));
      selectionPrecedence = 'When the mounted chart file exists, it replaces the persistent file. When it is absent, the existing persistent file remains. The runtime copy uses the resulting persistent file.';
    }
    const policyText = read('charts/kubeclaw/files/config/lint-policy.json');
    const policyConfigPaths = new Set(['.semgrep.yml', '.tflint.hcl', '.yamllint.yml', 'eslint-type-evidence-config.mjs',
      'eslint-type-evidence-generated-config.mjs', 'eslint-type-evidence-tests-config.mjs', 'eslint.config.mjs', 'jscpd.json', 'knip.json']);
    if (policyConfigPaths.has(name)) deliveryChain.push(exactLine(
      'charts/kubeclaw/files/config/lint-policy.json', policyText, `"config_path": "${name}"`, 'lint-policy-config-path', `the canonical lint policy selects ${name} as an exact tool config_path`,
    ));
    else if (name === 'lint-baseline.json') deliveryChain.push(exactLine(
      'charts/kubeclaw/files/config/lint-policy.json', policyText, '"baseline_path": "lint-baseline.json"', 'lint-policy-baseline-path', 'the canonical lint policy selects lint-baseline.json as its exact baseline path',
    ));
    else if (name === 'type-evidence-eslint-plugin.mjs') deliveryChain.push(exactLine(
      'charts/kubeclaw/files/config/eslint-type-evidence-config.mjs', read('charts/kubeclaw/files/config/eslint-type-evidence-config.mjs'), "import typeEvidence from './type-evidence-eslint-plugin.mjs'", 'module-import-path', 'the deployed ESLint configuration imports this exact sibling module',
    ));
    else if (name === 'jscpd-tests.json') deliveryChain.push(exactLine(
      'skills/nova/plugins/lint/src/engine/architecture-tools.ts', read('skills/nova/plugins/lint/src/engine/architecture-tools.ts'), "path.join(path.dirname(ctx.tool.config_path), 'jscpd-tests.json')", 'derived-tool-config-path', 'the JSCPD adapter derives this exact sibling test configuration from the policy-selected production path',
    ));
    else if (name === 'lint-policy.json') {
      // Keep these as a disconnected reader boundary.  No checked-in source
      // binds request.policyPath to the runtime copy produced above.
    } else if (name === 'swarm.config.json') {
      deliveryChain.push(exactLine(deploymentPath, deploymentText, 'value: "/home/node/.openclaw/swarm.config.json"', 'process-config-path', 'the main workload process receives the mounted runtime swarm configuration path', 1));
    }
    if (reader) deliveryChain.push(exactLine(reader[0], read(reader[0]), reader[1], 'process-argument-or-reader', reader[2],
      name === 'swarm.config.json' ? 1 : null));
    for (const edge of [...deliveryChain, ...selectionProof]) {
      const line = read(edge.path).split('\n')[edge.line - 1] ?? '';
      assert.equal(sha256(line), edge.sourceLineSha256, `${sourcePath}: ${edge.kind} digest does not match ${edge.path}:${edge.line}`);
      assert(line.includes(edge.requiredToken), `${sourcePath}: ${edge.kind} token is absent from ${edge.path}:${edge.line}`);
    }
    const unboundReaderEvidence = name === 'lint-policy.json' ? [
      exactLine('skills/nova/plugins/lint/src/engine/index.ts', read('skills/nova/plugins/lint/src/engine/index.ts'), 'const policyPath = fs.realpathSync(request.policyPath)', 'request-selected-policy-path', 'the lint request chooses a path, but checked-in source does not bind it to the chart runtime copy'),
      exactLine('skills/nova/plugins/lint/src/engine/policy.ts', read('skills/nova/plugins/lint/src/engine/policy.ts'), "source = fs.readFileSync(policyPath, 'utf8'); parsed = JSON.parse(source)", 'checked-in-config-parser', 'the lint engine parses whichever request-selected path it receives'),
    ] : name === 'swarm.config.json' ? [
      exactLine(deploymentPath, deploymentText, "JSON.parse(fs.readFileSync(source,\"utf8\"))", 'init-transform-parser', 'the init script parses the persistent file only to produce the runtime copy; this is not the workload field reader'),
    ] : [];
    for (const edge of unboundReaderEvidence) {
      const line = read(edge.path).split('\n')[edge.line - 1] ?? '';
      assert.equal(sha256(line), edge.sourceLineSha256, `${sourcePath}: ${edge.kind} digest does not match ${edge.path}:${edge.line}`);
      assert(line.includes(edge.requiredToken), `${sourcePath}: ${edge.kind} token is absent from ${edge.path}:${edge.line}`);
    }
    const runtimeSelectionProved = Boolean(reader) && !['lint-policy.json', 'swarm.config.json'].includes(name);
    const readerBoundary = name === 'lint-policy.json'
      ? 'The repository proves a parser for request.policyPath, but it does not bind that request field to /runtime-config/lint-policy.json. Materialization and parsing are separate proved boundaries, not a continuous runtime chain.'
      : name === 'swarm.config.json'
        ? 'The chart materializes the file and injects its mounted path through SWARM_CONFIG. The image-owned process reader and field behavior are not checked in, so path injection does not prove field-level runtime meaning.'
        : reader ? reader[2]
          : 'The chart deploys these bytes, but this repository does not prove field-level executable behavior. Treat the payload as image/tool-owned until a checked-in reader is linked.';
    payloads.push({
      path: sourcePath,
      sourceDigest: sha256(text),
      parseMode,
      fields,
      leafFields: fields.length,
      behaviorClassification: runtimeSelectionProved ? 'deployed-and-reader-bound'
        : name === 'lint-policy.json' ? 'materialized-request-path-binding-unproved'
          : name === 'swarm.config.json' ? 'materialized-and-path-injected-field-reader-unproved'
            : 'deployed-payload-without-checked-in-field-reader',
      executableBehaviorProved: runtimeSelectionProved,
      consumers: deliveryChain,
      deliveryChain,
      selectionPrecedence,
      selectionProof,
      unboundReaderEvidence,
      readerBoundary,
    });
  }
  const intentionallyUndeployed = new Set(['charts/kubeclaw/files/config/kubernetes-policy-pack-default.json']);
  const expectedPayloadPaths = walk('charts/kubeclaw/files/config').filter((sourcePath) => !intentionallyUndeployed.has(sourcePath)).sort();
  assert.deepEqual(payloads.map((payload) => payload.path).sort(), expectedPayloadPaths,
    'deployed config payload discovery differs from checked-in files; each file must have an exact .Files.Get edge or an explicit undeployed classification');
  return payloads.sort((left, right) => left.path.localeCompare(right.path));
}

function undeployedConfigPayloads(deployedPayloads) {
  const deployedPaths = new Set(deployedPayloads.map((payload) => payload.path));
  const policyText = read('charts/kubeclaw/files/config/lint-policy.json');
  const loaderPath = 'skills/nova/plugins/lint/src/engine/kubernetes-policy-pack.ts';
  const loaderText = read(loaderPath);
  return walk('charts/kubeclaw/files/config')
    .filter((sourcePath) => !deployedPaths.has(sourcePath))
    .map((sourcePath) => {
      const { name, text, parseMode, fields } = parseConfigPayload(sourcePath);
      const referenceIndex = policyText.indexOf(`"path": "${name}"`);
      const loaderIndex = name === 'kubernetes-policy-pack-default.json'
        ? loaderText.indexOf('fs.existsSync(sourcePath)')
        : -1;
      assert(referenceIndex >= 0, `${sourcePath}: checked-in but undeployed configuration lacks an exact checked-in reference`);
      assert(loaderIndex >= 0, `${sourcePath}: checked-in but undeployed configuration lacks an exact loader boundary`);
      return {
        path: sourcePath,
        sourceDigest: sha256(text),
        parseMode,
        fields,
        leafFields: fields.length,
        behaviorClassification: 'checked-in-reference-without-chart-delivery',
        executableBehaviorProved: false,
        references: [
          {
            path: 'charts/kubeclaw/files/config/lint-policy.json',
            line: lineAt(policyText, referenceIndex),
            sourceLineSha256: sha256(policyText.split('\n')[lineAt(policyText, referenceIndex) - 1] ?? ''),
            kind: 'checked-in-policy-reference',
            authority: `the lint policy selects ${name} by relative path`,
          },
          {
            path: loaderPath,
            line: lineAt(loaderText, loaderIndex),
            sourceLineSha256: sha256(loaderText.split('\n')[lineAt(loaderText, loaderIndex) - 1] ?? ''),
            kind: 'checked-in-loader-boundary',
            authority: 'the loader rejects the referenced policy-pack path when the file is absent',
          },
        ],
        deliveryGap: `The checked-in chart does not embed or copy ${name}. The deployed lint policy references this file, so the runtime loader rejects that reference unless another unsupported process supplies the missing file.`,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function buildSchemaInventory() {
  const files = registeredSchemaAuthorities().map((authority) => {
    const sourcePath = authority.key;
    const text = read(authority.path);
    const schema = authority.schema ?? JSON.parse(text);
    const packageOwner = nearestPackage(authority.path);
    const registration = schemaRegistrationEvidence(authority.path);
    const owner = packageOwner
      ? { component: packageOwner.name, evidence: packageOwner.path }
      : { component: 'unknown', evidence: 'no enclosing package.json' };
    const consumerEvidence = registration.directConsumers.length
      ? registration.directConsumers
      : registration.candidates.length ? registration.candidates : ['unknown'];
    const fields = flattenSchema(schema).map((field) => ({
      ...field,
      ownerRole: owner.component,
      ownerEvidence: owner.evidence,
      consumers: consumerEvidence,
      meaning: schemaFieldMeaning(authority.path, field, consumerEvidence),
    }));
    return {
      path: sourcePath,
      sourceClass: sourcePath.endsWith('/platform.schema.json') ? 'pipeline-platform-schema' : 'plugin-configuration-schema',
      sourceDigest: sha256(text),
      schemaId: schema.$id ?? null,
      registrationEvidence: authority.registrations,
      fields,
    };
  });
  const swarmPath = 'charts/kubeclaw/files/config/swarm.config.json';
  let swarm = null;
  if (exists(swarmPath)) {
    const text = read(swarmPath);
    swarm = {
      path: swarmPath,
      sourceDigest: sha256(text),
      fields: yamlFields(JSON.parse(text), { sourcePath: swarmPath, chartRoot: null, consumerMap: new Map(), sourceClass: 'swarm-authored-config', owner: sourceOwner(swarmPath), resource: null, externalBindings: [], runtimeBindings: [] }).map((field) => ({
        ...field,
        required: field.type === 'object' || field.type === 'array' ? 'not-applicable-container' : 'external-schema',
        requiredReason: field.type === 'object' || field.type === 'array'
          ? 'This row is a structural container; child leaf rows own loader semantics.'
          : 'The checked-in repository has no field schema; the OpenClaw/swarm loader owns acceptance.',
        defaultKind: field.type === 'object' || field.type === 'array' ? 'authored-container' : 'authored-runtime-base',
        constraints: field.type === 'object' || field.type === 'array' ? [] : ['valid JSON plus external OpenClaw/swarm loader contract'],
        runtimeOwner: 'OpenClaw gateway runtime configuration loader',
        consumers: [{ path: 'charts/kubeclaw/templates/configmap-swarm-config.yaml', line: 14, kind: 'helm-file-embedding', authority: '.Files.Get files/config/swarm.config.json' }, { path: 'charts/kubeclaw/templates/deployment.yaml', line: 674, kind: 'runtime-config-materialization', authority: 'JSON parse and runtime file write' }],
        precedence: ['checked-in swarm.config.json base', 'init normalization', 'runtime Secret/environment injection where implemented', 'more specific project progress configuration where implemented'],
        effectiveValueProof: `${swarmPath} -> charts/kubeclaw/templates/configmap-swarm-config.yaml:14 -> charts/kubeclaw/templates/deployment.yaml:674`,
        changeImpact: 'Changes the base runtime swarm configuration after the chart rematerializes the file.',
        failureMeaning: 'Invalid JSON stops materialization; a loader-rejected field prevents or degrades gateway startup.',
        blockerOwner: field.type === 'object' || field.type === 'array' ? null : 'OpenClaw/swarm loader contract owner',
        closureCondition: field.type === 'object' || field.type === 'array' ? null : 'Bind a versioned field schema when the loader publishes one.',
      })),
      schemaAuthority: 'external OpenClaw/swarm loader contract; repository proves JSON materialization but has no bound field schema',
    };
  }
  const allSchemaFields = files.flatMap((file) => file.fields);
  const publicSchemaLeaves = allSchemaFields.filter((field) => field.path !== '$' && !['object', 'array'].includes(field.type) && !field.branches.includes('definition'));
  assert.equal(publicSchemaLeaves.filter((field) => !field.meaning?.text || !field.meaning?.evidence || !field.meaning?.status).length, 0,
    'quality gate: every public schema leaf needs authored meaning or an explicit owned documentation blocker');
  const schemaMeaningBlockers = files.flatMap((file) => file.fields
    .filter((field) => field.path !== '$' && !['object', 'array'].includes(field.type) && !field.branches.includes('definition') && /blocker/u.test(field.meaning.status))
    .map((field) => `${file.path}::${field.path}`));
  if (schemaMeaningBlockers.length) {
    throw new Error(`CONFIG_SEMANTIC_GAP: public schema leaves lack qualified field-path and consumer authority: ${schemaMeaningBlockers.slice(0, 12).join(', ')}. A same-named field in another provider is not evidence.`);
  }
  const schemaByPath = new Map(files.map((file) => [file.path, file]));
  const securityTimeoutCases = [
    ['skills/buster/plugins/security-providers/schemas/image.schema.json', 'container-image vulnerability scan', '/src/image.js:'],
    ['skills/buster/plugins/security-providers/schemas/kubernetes-policy.schema.json', 'static Kubernetes-policy scan', '/src/kubernetes-policy.js:'],
    ['skills/buster/plugins/security-providers/schemas/kubernetes-runtime.schema.json', 'live Kubernetes runtime-security scan', '/src/kubernetes-runtime.js:'],
  ];
  for (const [sourcePath, purposeFragment, evidenceFragment] of securityTimeoutCases) {
    const timeout = schemaByPath.get(sourcePath)?.fields.find((field) => field.path === '$.timeoutMs');
    assert(timeout, `schema semantic regression: missing ${sourcePath} $.timeoutMs`);
    assert.match(timeout.meaning.text, new RegExp(purposeFragment.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
      `schema semantic regression: ${sourcePath} timeout purpose collided with another provider`);
    assert(timeout.meaning.implementationEvidence?.includes(evidenceFragment),
      `schema semantic regression: ${sourcePath} timeout evidence is not bound to its provider implementation`);
  }
  const openApi = schemaByPath.get('skills/buster/plugins/openapi/schemas/config.schema.json');
  for (const [fieldPath, purposeFragment] of [
    ['$.operations[].headers.{*}', 'request-header value'],
    ['$.operations[].pathParameters.{*}', 'path-parameter value'],
    ['$.operations[].query.{*}', 'query-parameter value'],
  ]) {
    const fields = openApi?.fields.filter((field) => field.path === fieldPath) ?? [];
    assert(fields.length > 0, `schema semantic regression: missing OpenAPI wildcard ${fieldPath}`);
    for (const field of fields) {
      assert.match(field.meaning.text, new RegExp(purposeFragment, 'u'),
        `schema semantic regression: OpenAPI wildcard ${fieldPath} lost its exact map-value purpose`);
      assert(field.meaning.implementationEvidence?.includes('/openapi/src/provider.js:'),
        `schema semantic regression: OpenAPI wildcard ${fieldPath} lacks provider data-flow evidence`);
      assert(!field.meaning.implementationEvidence?.endsWith(':1'),
        `schema semantic regression: OpenAPI wildcard ${fieldPath} matched an empty token`);
    }
  }
  const conditionalPresenceCases = [
    {
      sourcePath: 'skills/nova/plugins/remote-test-gate/schemas/config.schema.json',
      fieldPath: '$.tokenSecret',
      requiredBranch: 'allOf[0] > then',
      forbiddenBranch: 'allOf[0] > else > not',
    },
    {
      sourcePath: 'skills/common/plugins/runtime-dispatch/schemas/config.schema.json',
      fieldPath: '$.targets.{*}.tokenSecret',
      requiredBranch: 'allOf[0] > else',
      forbiddenBranch: 'allOf[0] > then > not',
    },
  ];
  for (const { sourcePath, fieldPath, requiredBranch, forbiddenBranch } of conditionalPresenceCases) {
    const fields = schemaByPath.get(sourcePath)?.fields.filter((field) => field.path === fieldPath) ?? [];
    const requiredField = fields.find((field) => field.branches.join(' > ') === requiredBranch);
    const forbiddenField = fields.find((field) => field.branches.join(' > ') === forbiddenBranch);
    assert.equal(requiredField?.required, true,
      `schema logical regression: ${sourcePath} ${requiredBranch} must require ${fieldPath}`);
    assert.equal(requiredField?.presence, 'allowed',
      `schema logical regression: ${sourcePath} ${requiredBranch} inverted ${fieldPath}`);
    assert.equal(forbiddenField?.required, false,
      `schema logical regression: ${sourcePath} ${forbiddenBranch} emitted forbidden ${fieldPath} as required`);
    assert.equal(forbiddenField?.presence, 'forbidden',
      `schema logical regression: ${sourcePath} ${forbiddenBranch} lost the not/absence constraint for ${fieldPath}`);
    assert.match(forbiddenField?.meaning?.acceptedValues ?? '', /must be absent/u,
      `schema logical regression: ${sourcePath} ${forbiddenBranch} documents ${fieldPath} with the wrong polarity`);
  }
  const syntheticUnknown = schemaFieldMeaning('skills/buster/plugins/openapi/schemas/config.schema.json', {
    path: '$.operations[].newPublicControl', type: 'string', required: false, default: '<none>', description: '', constraints: [], branches: [],
  }, ['skills/buster/plugins/openapi/plugin.json']);
  assert.equal(syntheticUnknown.status, 'schema-meaning-blocker',
    'schema semantic regression: a newly declared public nested field must fail closed without qualified meaning authority');
  const syntheticBareWildcard = schemaFieldMeaning('skills/buster/plugins/openapi/schemas/config.schema.json', {
    path: '$.{*}', type: 'string', required: false, default: '<none>', description: '', constraints: [], branches: [],
  }, ['skills/buster/plugins/openapi/plugin.json']);
  assert.equal(syntheticBareWildcard.status, 'schema-meaning-blocker',
    'schema semantic regression: a wildcard with no named path segment must never match an empty token');
  for (const field of allSchemaFields) {
    for (const constraint of field.constraints) {
      if (!['const', 'enum'].includes(constraint.name)) {
        assert.notEqual(constraint.value, '<redacted:sensitive-field>', `${field.path}: structural schema constraint ${constraint.name} was incorrectly redacted`);
      }
    }
  }
  const deployedPayloads = deployedConfigPayloads();
  const undeployedPayloads = undeployedConfigPayloads(deployedPayloads);
  return {
    generatedBy: 'scripts/docs-configuration-inventory.mjs',
    discovery: {
      platformSchema: 'skills/common/plugin-runtime/foundation/config/platform.schema.json',
      pluginRule: 'every string or inline object registered as configSchema in plugin.json or openclaw.plugin.json below skills/{common,nova,buster}/plugins',
      swarmConfig: swarmPath,
    },
    files,
    swarm,
    deployedPayloads,
    undeployedPayloads,
    totals: {
      schemaFiles: files.length,
      schemaFields: files.reduce((sum, file) => sum + file.fields.length, 0),
      swarmFields: swarm?.fields.length ?? 0,
      deployedConfigPayloads: deployedPayloads.length,
      deployedStructuredPayloadLeaves: deployedPayloads.reduce((sum, payload) => sum + payload.leafFields, 0),
      deployedPayloadsWithoutCheckedInReader: deployedPayloads.filter((payload) => !payload.executableBehaviorProved).length,
      undeployedConfigPayloads: undeployedPayloads.length,
      unresolvedSourceOwner: allSchemaFields.filter((field) => field.ownerRole === 'unknown').length + (swarm?.fields.filter((field) => field.ownerComponent === 'unknown').length ?? 0),
      unknownRuntimeOwner: swarm?.fields.filter((field) => field.runtimeOwner === 'unknown').length ?? 0,
      unknownConsumer: allSchemaFields.filter((field) => field.consumers.includes('unknown')).length + (swarm?.fields.filter((field) => field.consumers.includes('unknown')).length ?? 0),
      conditionalOrUnknownRequired: swarm?.fields.filter((field) => field.required === 'conditional-or-unknown').length ?? 0,
      publicSchemaLeaves: publicSchemaLeaves.length,
      schemaAndRuntimeAuthorities: publicSchemaLeaves.filter((field) => field.meaning.status === 'schema-and-runtime-authority').length,
      qualifiedRuntimeAuthorities: publicSchemaLeaves.filter((field) => field.meaning.status === 'qualified-runtime-authority').length,
      schemaMeaningBlockers: schemaMeaningBlockers.length,
    },
  };
}

function runtimeTextSources() {
  const files = new Set();
  for (const sourceRoot of RUNTIME_SCAN_ROOTS) {
    for (const file of walk(sourceRoot, (absolutePath) => TEXT_EXTENSIONS.has(path.extname(absolutePath))
      && !(path.extname(absolutePath) === '.go' && absolutePath.endsWith('_test.go')))) files.add(file);
  }
  return [...files].sort();
}

function maskQuotedShellHeredocs(text) {
  const lines = text.split('\n');
  let delimiter = null;
  return lines.map((line) => {
    if (delimiter !== null) {
      const closes = line.replace(/^\t+/u, '').trim() === delimiter;
      if (closes) delimiter = null;
      return ' '.repeat(line.length);
    }
    const starts = /<<-?\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1/u.exec(line);
    if (starts) delimiter = starts[2];
    return line;
  }).join('\n');
}

function nodeEnvironmentReads(file, text) {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith('.ts') || file.endsWith('.mts') || file.endsWith('.cts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const reads = [];
  const aliases = new Set();
  const stringConstants = new Map();
  const computedReaders = new Map();
  const processEnvironment = (node) => ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === 'process'
    && node.name.text === 'env';
  const aliasExpression = (node) => processEnvironment(node) || (ts.isIdentifier(node) && aliases.has(node.text));
  const functionName = (node) => node.name && ts.isIdentifier(node.name) ? node.name.text
    : ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) ? node.parent.name.text : null;
  const collectAliases = (node) => {
    if (ts.isParameter(node) && ts.isIdentifier(node.name)
      && (node.initializer && aliasExpression(node.initializer) || /(?:^|\.)ProcessEnv\b/u.test(node.type?.getText(sourceFile) ?? ''))) aliases.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.initializer && aliasExpression(node.initializer)) aliases.add(node.name.text);
      if (node.initializer && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
        && /^[A-Z][A-Z0-9_]*$/u.test(node.initializer.text)) stringConstants.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, collectAliases);
  };
  collectAliases(sourceFile);
  const collectComputedReaders = (node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node))) {
      const name = functionName(node);
      if (name) {
        const parameters = node.parameters.map((parameter) => ts.isIdentifier(parameter.name) ? parameter.name.text : null);
        const inspect = (child) => {
          if (ts.isElementAccessExpression(child) && ts.isIdentifier(child.argumentExpression)) {
            const keyIndex = parameters.indexOf(child.argumentExpression.text);
            if (keyIndex >= 0) {
              const environmentIndex = aliasExpression(child.expression) ? null
                : ts.isIdentifier(child.expression) ? parameters.indexOf(child.expression.text) : -1;
              if (environmentIndex === null || environmentIndex >= 0) {
                const readers = computedReaders.get(name) ?? [];
                readers.push({ environmentIndex, keyIndex });
                computedReaders.set(name, readers);
              }
            }
          }
          ts.forEachChild(child, inspect);
        };
        if (node.body) inspect(node.body);
      }
    }
    ts.forEachChild(node, collectComputedReaders);
  };
  collectComputedReaders(sourceFile);
  const add = (name, node, kind) => {
    if (/^[A-Z][A-Z0-9_]*$/u.test(name)) reads.push({ name, index: node.getStart(sourceFile), kind });
  };
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)
      && node.initializer && aliasExpression(node.initializer)) {
      for (const element of node.name.elements) {
        if (element.dotDotDotToken) continue;
        const key = element.propertyName ?? element.name;
        if (ts.isIdentifier(key) || ts.isStringLiteral(key)) add(key.text, element, 'node-process-env-destructure');
      }
    } else if (ts.isPropertyAccessExpression(node) && aliasExpression(node.expression)) {
      add(node.name.text, node, processEnvironment(node.expression) ? 'node-process-env' : 'node-process-env-alias');
    } else if (ts.isElementAccessExpression(node) && aliasExpression(node.expression)) {
      if (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)) {
        add(node.argumentExpression.text, node, 'node-process-env-computed');
      } else if (ts.isIdentifier(node.argumentExpression) && stringConstants.has(node.argumentExpression.text)) {
        add(stringConstants.get(node.argumentExpression.text), node, 'node-process-env-computed');
      }
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && computedReaders.has(node.expression.text)) {
      for (const reader of computedReaders.get(node.expression.text)) {
        const environmentArgument = reader.environmentIndex === null ? null : node.arguments[reader.environmentIndex];
        if (reader.environmentIndex !== null && (!environmentArgument || !aliasExpression(environmentArgument))) continue;
        const argument = node.arguments[reader.keyIndex];
        if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) add(argument.text, node, 'node-process-env-computed-helper');
        else if (argument && ts.isIdentifier(argument) && stringConstants.has(argument.text)) add(stringConstants.get(argument.text), node, 'node-process-env-computed-helper');
      }
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'get' && ts.isPropertyAccessExpression(node.expression.expression)
      && ts.isIdentifier(node.expression.expression.expression) && node.expression.expression.expression.text === 'Deno'
      && node.expression.expression.name.text === 'env' && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0]) && /^[A-Z][A-Z0-9_]*$/u.test(node.arguments[0].text)) {
      reads.push({ name: node.arguments[0].text, index: node.getStart(sourceFile), kind: 'deno-env' });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return reads;
}

function quotedProgramToken(token) {
  if (token.startsWith("'") && token.endsWith("'")) return { code: token.slice(1, -1), offset: 1 };
  if (token.startsWith('"') && token.endsWith('"')) {
    return { code: token.slice(1, -1).replace(/\\([\\"$`])/gu, '$1'), offset: 1 };
  }
  return { code: token, offset: 0 };
}

function inlineProgramEnvironmentReads(file, text) {
  const reads = [];
  const patterns = [
    { runtime: 'node', expression: /\bnode(?:\s+--?[A-Za-z][A-Za-z0-9-]*(?:=[^\s]+)?)?\s+(?:-e|--eval|-p|--print)\s+('(?:[^']*)'|"(?:\\.|[^"\\])*"|[^\s;|&]+)/gmu },
    { runtime: 'python', expression: /\bpython(?:[0-9]+(?:\.[0-9]+)?)?(?:\s+--?[A-Za-z][A-Za-z0-9-]*(?:=[^\s]+)?)?\s+(?:-c)\s+('(?:[^']*)'|"(?:\\.|[^"\\])*"|[^\s;|&]+)/gmu },
  ];
  for (const { runtime, expression } of patterns) {
    for (const match of text.matchAll(expression)) {
      const token = match[1];
      const parsed = quotedProgramToken(token);
      const tokenIndex = (match.index ?? 0) + match[0].lastIndexOf(token) + parsed.offset;
      const found = runtime === 'node' ? nodeEnvironmentReads(`${file}#node-inline-${lineAt(text, match.index ?? 0)}`, parsed.code)
        : pythonEnvironmentReads(parsed.code);
      for (const fact of found) reads.push({ ...fact, index: tokenIndex + fact.index, kind: `embedded-${fact.kind}` });
    }
  }
  return reads;
}

function pythonEnvironmentReads(text) {
  const reads = [];
  const patterns = [
    /\bos\.getenv\(\s*['"]([A-Z][A-Z0-9_]*)['"]/gu,
    /\bos\.environ\.get\(\s*['"]([A-Z][A-Z0-9_]*)['"]/gu,
    /\bos\.environ\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/gu,
  ];
  for (const expression of patterns) {
    for (const match of text.matchAll(expression)) reads.push({ name: match[1], index: match.index ?? 0, kind: 'python-process-env' });
  }
  return reads;
}

function embeddedNodeEnvironmentReads(file, text) {
  const lines = text.split('\n');
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const reads = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const opener = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*$/u.exec(lines[lineIndex]);
    if (!opener) continue;
    const command = lines[lineIndex].slice(0, opener.index);
    // Some chart block scalars write a JavaScript program to a .js/.mjs/.cjs
    // file and execute it later. It is still a checked-in environment reader,
    // even though the heredoc command itself is `cat`, not `node`.
    if (!/\bnode(?:\s|$)/u.test(command) && !/\.(?:mjs|cjs|js)(?:["']|\s|$)/u.test(command)) continue;
    const delimiter = opener[2];
    let endIndex = lineIndex + 1;
    while (endIndex < lines.length && lines[endIndex].trim() !== delimiter) endIndex += 1;
    if (endIndex >= lines.length) continue;
    const bodyStartLine = lineIndex + 1;
    const body = lines.slice(bodyStartLine, endIndex).join('\n');
    for (const readFact of nodeEnvironmentReads(`${file}#node-heredoc-${lineIndex + 1}`, body)) {
      reads.push({
        ...readFact,
        index: offsets[bodyStartLine] + readFact.index,
        kind: `embedded-${readFact.kind}`,
      });
    }
    lineIndex = endIndex;
  }
  return reads;
}

function embeddedPythonEnvironmentReads(file, text) {
  const lines = text.split('\n');
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const reads = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const opener = /\bpython(?:[0-9]+(?:\.[0-9]+)?)?(?:\s+[^<\n]*)?\s+<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*$/u.exec(lines[lineIndex]);
    if (!opener) continue;
    const delimiter = opener[2];
    let endIndex = lineIndex + 1;
    while (endIndex < lines.length && lines[endIndex].replace(/^\t+/u, '').trim() !== delimiter) endIndex += 1;
    if (endIndex >= lines.length) continue;
    const bodyStartLine = lineIndex + 1;
    const body = lines.slice(bodyStartLine, endIndex).join('\n');
    for (const readFact of pythonEnvironmentReads(body)) {
      reads.push({ ...readFact, index: offsets[bodyStartLine] + readFact.index, kind: `embedded-${readFact.kind}` });
    }
    lineIndex = endIndex;
  }
  return reads;
}

function environmentOccurrences(file, text) {
  const found = [];
  const assignments = new Map();
  const extension = path.extname(file);
  const shellSource = extension === '.sh' || /^(?:#![^\n]*(?:ba|z|da|k)?sh\b)/u.test(text);
  const yamlSource = extension === '.yaml' || extension === '.yml';
  const nodeSource = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(extension);
  const pythonSource = extension === '.py';
  const goSource = extension === '.go';
  const cSource = extension === '.c' || extension === '.h';
  const scanText = shellSource ? maskQuotedShellHeredocs(text) : text;
  if (goSource) {
    const splitGoArguments = (value) => {
      const result = [];
      let start = 0;
      let quote = null;
      let escaped = false;
      for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (escaped) { escaped = false; continue; }
        if (quote && character === '\\' && quote !== '`') { escaped = true; continue; }
        if (quote) { if (character === quote) quote = null; continue; }
        if (character === '"' || character === "'" || character === '`') { quote = character; continue; }
        if (character === ',') { result.push(value.slice(start, index).trim()); start = index + 1; }
      }
      result.push(value.slice(start).trim());
      return result;
    };
    const goLiteral = (value) => {
      if (/^-?[0-9]+$/u.test(value)) return value;
      if (value.startsWith('`') && value.endsWith('`')) return value.slice(1, -1);
      if (value.startsWith('"') && value.endsWith('"')) {
        try { return JSON.parse(value); } catch { return null; }
      }
      return null;
    };
    const wrappers = [];
    for (const declaration of text.matchAll(/\bfunc\s+([a-z][A-Za-z0-9_]*)\s*\(([^)]*)\)[^{]*\{/gu)) {
      const parameters = declaration[2].split(',').map((item) => item.trim().split(/\s+/u)[0]).filter(Boolean);
      const bodyStart = (declaration.index ?? 0) + declaration[0].length;
      let depth = 1;
      let bodyEnd = bodyStart;
      for (; bodyEnd < text.length && depth > 0; bodyEnd += 1) {
        if (text[bodyEnd] === '{') depth += 1;
        else if (text[bodyEnd] === '}') depth -= 1;
      }
      const body = text.slice(bodyStart, bodyEnd - 1);
      const reader = /os\.(?:Getenv|LookupEnv)\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/u.exec(body)?.[1];
      const environmentIndex = reader ? parameters.indexOf(reader) : -1;
      if (environmentIndex < 0) continue;
      wrappers.push({
        name: declaration[1],
        environmentIndex,
        fallbackIndex: parameters.indexOf('fallback'),
      });
    }
    for (const direct of text.matchAll(/os\.(?:Getenv|LookupEnv)\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/gu)) {
      found.push({ name: direct[1], kind: 'go-process-env', path: file, line: lineAt(text, direct.index), defaultOperator: null, sourceValueRole: 'none', default: '<none>', secretProvenance: false, filePathProvenance: false });
    }
    for (const wrapper of wrappers) {
      const callPattern = new RegExp(`\\b${wrapper.name}\\(([^)\\n]*)\\)`, 'gu');
      for (const call of text.matchAll(callPattern)) {
        const argumentsList = splitGoArguments(call[1]);
        const name = goLiteral(argumentsList[wrapper.environmentIndex] ?? '');
        if (!/^[A-Z][A-Z0-9_]*$/u.test(name ?? '')) continue;
        const fallback = wrapper.fallbackIndex >= 0 ? goLiteral(argumentsList[wrapper.fallbackIndex] ?? '') : null;
        found.push({
          name,
          kind: 'go-process-env-helper',
          path: file,
          line: lineAt(text, call.index),
          defaultOperator: fallback === null ? null : 'trimmed-empty-fallback',
          sourceValueRole: fallback === null ? 'none' : 'default',
          default: fallback ?? '<none>',
          secretProvenance: false,
          filePathProvenance: false,
        });
      }
    }
  }
  if (nodeSource) {
    for (const readFact of nodeEnvironmentReads(file, text)) {
      found.push({
        name: readFact.name,
        kind: readFact.kind,
        path: file,
        line: lineAt(text, readFact.index),
        defaultOperator: null,
        sourceValueRole: 'none',
        default: '<none>',
        secretProvenance: false,
        filePathProvenance: false,
      });
    }
  }
  if (shellSource || yamlSource) {
    for (const readFact of embeddedNodeEnvironmentReads(file, text)) {
      found.push({
        name: readFact.name,
        kind: readFact.kind,
        path: file,
        line: lineAt(text, readFact.index),
        defaultOperator: null,
        sourceValueRole: 'none',
        default: '<none>',
        secretProvenance: false,
        filePathProvenance: false,
      });
    }
    for (const readFact of embeddedPythonEnvironmentReads(file, text)) {
      found.push({
        name: readFact.name,
        kind: readFact.kind,
        path: file,
        line: lineAt(text, readFact.index),
        defaultOperator: null,
        sourceValueRole: 'none',
        default: '<none>',
        secretProvenance: false,
        filePathProvenance: false,
      });
    }
    for (const readFact of inlineProgramEnvironmentReads(file, text)) {
      found.push({
        name: readFact.name,
        kind: readFact.kind,
        path: file,
        line: lineAt(text, readFact.index),
        defaultOperator: null,
        sourceValueRole: 'none',
        default: '<none>',
        secretProvenance: false,
        filePathProvenance: false,
      });
    }
  }
  if (shellSource || yamlSource) {
    for (const assignment of scanText.matchAll(/^\s*(?:export\s+|readonly\s+|local\s+)?([A-Z][A-Z0-9_]*)=(.*)$/gmu)) {
      const name = assignment[1];
      const values = assignments.get(name) ?? [];
      values.push({ selfExternal: new RegExp(`\\$\\{?${name}(?::[-=?+]|[-=?+]|\\})`, 'u').test(assignment[2]), line: lineAt(text, assignment.index) });
      assignments.set(name, values);
    }
  }
  const patterns = [];
  // YAML templates can contain shell or Node programs in block scalars. Other
  // source languages must use their own environment API. This prevents a
  // JavaScript test string that contains `${NAME}` from becoming a shell input.
  if (shellSource || yamlSource) {
    patterns.push({ kind: 'shell-parameter', regex: /\$\{([A-Z][A-Z0-9_]*)(?:(:-|:=|:\?|:\+|-|=|\?|\+)([^}]*))?\}/g });
    // The first expression records an outer expansion. This zero-width pass
    // also records the innermost expansion when one fallback contains another.
    patterns.push({ kind: 'shell-parameter', regex: /(?=\$\{([A-Z][A-Z0-9_]*)(?:(:-|:=|:\?|:\+|-|=|\?|\+)([^{}]*))?\})/g });
  }
  // Embedded YAML programs are parsed by the runtime-specific scanners above.
  // Do not also scan arbitrary YAML text with language regexes: that duplicates
  // real readers and can turn documentation strings into runtime inputs.
  if (pythonSource) patterns.push({ kind: 'python-process-env', regex: /(?:os\.getenv\(|os\.environ(?:\.get\(|\[))['"]([A-Z][A-Z0-9_]*)['"]/g });
  if (cSource) patterns.push({ kind: 'c-getenv', regex: /(?:secure_)?getenv\(\s*"([A-Z][A-Z0-9_]*)"\s*\)/g });
  if (yamlSource) patterns.push({ kind: 'kubernetes-env', regex: /^\s*-?\s*name:\s*([A-Z][A-Z0-9_]*)\s*(?:#.*)?$/gm });
  if (yamlSource) patterns.push({ kind: 'kubernetes-env', regex: /^\s*-\s*\{\s*name\s*:\s*["']?([A-Z][A-Z0-9_]*)["']?\s*,\s*(?:value|valueFrom)\s*:/gm });
  if (yamlSource) patterns.push({ kind: 'kubernetes-env', regex: /\benv\s*:\s*\[\s*\{\s*name\s*:\s*["']?([A-Z][A-Z0-9_]*)["']?\s*,\s*(?:value|valueFrom)\s*:/g });
  for (const { kind, regex } of patterns) {
    for (const match of scanText.matchAll(regex)) {
      const name = match[1] ?? match[2];
      if (!name) continue;
      const line = lineAt(text, match.index);
      const precedingAssignments = (assignments.get(name) ?? []).filter((item) => item.line <= line);
      // A later child-process assignment must not hide an earlier process input.
      // Only the latest assignment that can reach this read decides whether the
      // uppercase name is a local shell value or an environment-derived value.
      if (precedingAssignments.length > 0 && !precedingAssignments.at(-1).selfExternal && kind !== 'kubernetes-env') continue;
      const operator = kind === 'shell-parameter' ? match[2] ?? null : null;
      const rawDefault = kind === 'shell-parameter' && match[2] ? match[3] : null;
      const sourceValue = shellParameterValue(operator, name, rawDefault);
      const sourceLines = text.split('\n');
      const startIndex = Math.max(0, line - 1);
      const startLine = sourceLines[startIndex] ?? '';
      const startIndent = startLine.match(/^\s*/u)?.[0].length ?? 0;
      let endIndex = Math.min(sourceLines.length, startIndex + 12);
      if (kind === 'kubernetes-env') {
        for (let index = startIndex + 1; index < Math.min(sourceLines.length, startIndex + 12); index += 1) {
          const next = sourceLines[index];
          const nextIndent = next.match(/^\s*/u)?.[0].length ?? 0;
          const nextEnvItem = /^\s*-\s*(?:\{\s*)?name\s*:/u.test(next) && nextIndent <= startIndent;
          const leftEnvItem = next.trim().length > 0 && nextIndent < startIndent;
          if (nextEnvItem || leftEnvItem) {
            endIndex = index;
            break;
          }
        }
      }
      const nearby = sourceLines.slice(startIndex, endIndex).join('\n');
      const secretProvenance = kind === 'kubernetes-env' && /(?:secretKeyRef|secretRef)\s*:/u.test(nearby);
      found.push({
        name,
        kind,
        path: file,
        line,
        defaultOperator: operator,
        sourceValueRole: sourceValue.role,
        default: sourceValue.display,
        secretProvenance,
        filePathProvenance: kind === 'kubernetes-env'
          && /value:\s*["']?\/(?:[^\s"']*\/)*[^\s"']+(?:["']|\s|$)/iu.test(nearby)
          && (SENSITIVE_ENV_NAME.test(name) || name === 'GOOGLE_APPLICATION_CREDENTIALS' || /value:\s*[^\n]*(?:\.key|\.pem|\.crt)(?:["']|\s|$)/iu.test(nearby)),
      });
    }
  }
  return found;
}

function ownedCliFlags(file, text) {
  // This executable contains literal mutation inputs and assertions about
  // options owned by other programs. None of those strings are parser facts
  // for the mutation runner itself.
  if (file === 'scripts/check-configuration-drift-mutations.mjs') return [];
  const flags = new Map();
  const add = (name, index, evidence, semantics = {}) => {
    if (!/^(?:--[a-z][a-z0-9-]*|-[A-Za-z])$/u.test(name)) return;
    const key = `${name}:${lineAt(text, index)}`;
    const line = lineAt(text, index);
    const sourceLine = text.split('\n')[line - 1] ?? '';
    flags.set(key, { name, path: file, line, evidence, sourceLine: sourceLine.trim(), ...semantics });
  };
  for (const match of text.matchAll(/^.*Usage:.*$/gm)) {
    const line = match[0];
    for (const nested of line.matchAll(/--[a-z][a-z0-9-]*|(?<![A-Za-z0-9])-([A-Za-z])(?![A-Za-z0-9-])/g)) add(nested[0], match.index + nested.index, 'usage declaration');
  }
  for (const match of text.matchAll(/^#\s+\.\/[^\n]*--[a-z][a-z0-9-]*.*$/gm)) {
    for (const nested of match[0].matchAll(/--[a-z][a-z0-9-]*/g)) add(nested[0], match.index + nested.index, 'shell usage declaration');
  }
  for (const match of text.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*(?:\s*(?:\[[^\]\n]+\]|\.[A-Za-z_$][A-Za-z0-9_$]*))*)\s*(?:===?|!==?)\s*['"]((?:--[a-z][a-z0-9-]*|-[A-Za-z]))['"]/g)) {
    const expression = match[1].replace(/\s+/gu, '');
    const line = text.split('\n')[lineAt(text, match.index) - 1] ?? '';
    const directArgumentRead = /(?:process\.)?argv|sys\.argv|os\.Args/u.test(line);
    const identifier = /^([A-Za-z_$][A-Za-z0-9_$]*)/u.exec(expression)?.[1];
    const escapedIdentifier = identifier?.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const prefix = text.slice(0, match.index);
    const assignedFromArguments = escapedIdentifier
      ? new RegExp(`(?:const|let|var)\\s+${escapedIdentifier}\\s*=\\s*(?:process\\.)?argv(?:\\.|\\[)|${escapedIdentifier}\\s*=\\s*sys\\.argv(?:\\.|\\[)|for\\s*\\([^\\n]*\\b${escapedIdentifier}\\b[^\\n]*\\b(?:process\\.)?argv\\b`, 'u').test(prefix)
      : false;
    const declarations = [...prefix.matchAll(/function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*(?::[^\{]+)?\{/gu)];
    const enclosing = declarations.at(-1);
    const parameters = enclosing?.[2].split(',').map((item) => item.trim().replace(/\??:\s*.*$/u, '')).filter(Boolean) ?? [];
    const assignedSource = escapedIdentifier
      ? new RegExp(`(?:const|let|var)\\s+${escapedIdentifier}\\s*=\\s*([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\[`, 'u').exec(prefix)?.[1]
      : null;
    const parserParameter = parameters.includes(identifier) ? identifier : parameters.includes(assignedSource) ? assignedSource : null;
    const invokedWithArguments = enclosing && parserParameter
      ? new RegExp(`\\b${enclosing[1]}\\(\\s*process\\.argv(?:\\.slice\\([^)]*\\))?\\s*\\)`, 'u').test(text)
      : false;
    if (directArgumentRead || assignedFromArguments || invokedWithArguments) add(match[2], match.index, 'argument comparison');
  }
  for (const match of text.matchAll(/(?:"?\$\{?[0-9]+(?::-[^}]*)?\}?"?)\s*(?:==|=)\s*(?:['"])?(--[a-z][a-z0-9-]*|-[A-Za-z])(?:['"])?/gu)) {
    add(match[1], match.index, 'argument comparison');
  }
  for (const match of text.matchAll(/(?:process\.argv|argv)\.includes\(['"]((?:--[a-z][a-z0-9-]*|-[A-Za-z]))['"]\)/g)) {
    const followingBranch = text.slice(match.index ?? 0, (match.index ?? 0) + 320);
    const delegatesCompleteArgv = /(?:await\s+)?[A-Za-z_$][A-Za-z0-9_$]*CLI\(process\.argv\.slice\(2\)\)/u.test(followingBranch);
    add(match[1], match.index, delegatesCompleteArgv ? 'argument delegation selector' : 'argument membership check', {
      ...(delegatesCompleteArgv ? { declaredValueTaking: true } : {}),
    });
  }
  for (const match of text.matchAll(/\bcase\s+['"]?((?:--[a-z][a-z0-9-]*|-[A-Za-z]))['"]?\s*:/g)) add(match[1], match.index, 'argument branch');
  for (const match of text.matchAll(/^[ \t]*((?:(?:--[a-z][a-z0-9-]*|-[A-Za-z])[ \t]*(?:\|[ \t]*(?:--[a-z][a-z0-9-]*|-[A-Za-z])[ \t]*)*))\)[ \t]*$/gm)) {
    const branchFlags = [...match[1].matchAll(/--[a-z][a-z0-9-]*|(?<![A-Za-z0-9])-([A-Za-z])(?![A-Za-z0-9-])/g)];
    for (const nested of branchFlags) add(nested[0], (match.index ?? 0) + nested.index, 'argument branch');
  }
  for (const match of text.matchAll(/(?:add_argument|\.option)\(\s*['"]((?:--[a-z][a-z0-9-]*|-[A-Za-z]))(?:\s+[^'"]+)?['"]/g)) add(match[1], match.index, 'parser declaration');
  for (const match of text.matchAll(/^\s*['"](--[a-z][a-z0-9-]*)['"]\s*:\s*['"][A-Za-z_][A-Za-z0-9_]*['"]\s*,?\s*$/gm)) add(match[1], match.index, 'parser declaration');

  // A literal choice list is a parser definition only when its membership
  // check reads the program's argv. Arrays used to build child-command argv
  // do not satisfy this shape.
  for (const match of text.matchAll(/\[([^\]]*['"](?:--[a-z][a-z0-9-]*|-[A-Za-z])['"][^\]]*)\]\.includes\(\s*(?:process\.)?argv\s*\[[^\]]+\]\s*\)/gs)) {
    for (const nested of match[1].matchAll(/['"]((?:--[a-z][a-z0-9-]*|-[A-Za-z]))['"]/g)) {
      add(nested[1], (match.index ?? 0) + nested.index, 'parser argv choice-list', { declaredValueTaking: false });
    }
  }

  for (const match of text.matchAll(/(?:process\.)?argv\.indexOf\(\s*['"]((?:--[a-z][a-z0-9-]*|-[A-Za-z]))['"]\s*\)/g)) {
    add(match[1], match.index, 'parser argv lookup', { declaredValueTaking: true });
  }

  // Bind a literal allow-list to the variable that the parser checks. A bare
  // string array is not sufficient: the adjacent-value reads and assignment
  // prove that this code owns the listed options and consumes their values.
  for (const match of text.matchAll(/\[([^\]]*['"]--[a-z][a-z0-9-]*['"][^\]]*)\]\.includes\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)/gs)) {
    const list = match[1];
    const listedFlags = [...list.matchAll(/['"](--[a-z][a-z0-9-]*)['"]/g)];
    const checkedVariable = match[2];
    const enclosingStart = Math.max(0, text.lastIndexOf('for (', match.index), text.lastIndexOf('while (', match.index));
    const structuralWindow = text.slice(enclosingStart, Math.min(text.length, (match.index ?? 0) + match[0].length + 500));
    const escapedVariable = checkedVariable.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const adjacentValueRead = /\[\s*(?:index|i)\s*\+\s*1\s*\]/u.test(structuralWindow);
    const storesByFlag = new RegExp(`\\[\\s*${escapedVariable}\\s*\\]\\s*=`, 'u').test(structuralWindow);
    const pairedIteration = /(?:index|i)\s*\+=\s*2/u.test(structuralWindow);
    const takesValue = adjacentValueRead && storesByFlag && pairedIteration;
    const allListedRequired = new RegExp(`Object\\.keys\\(\\s*args\\s*\\)\\.length\\s*!==?\\s*${listedFlags.length}`, 'u').test(text)
      && /ARGUMENTS?_REQUIRED/u.test(text);
    for (const nested of listedFlags) {
      add(nested[1], (match.index ?? 0) + nested.index, 'parser allow-list', {
        declaredValueTaking: takesValue ? true : null,
        ...(allListedRequired ? { declaredRequired: 'required', declaredDefault: '<none>' } : {}),
      });
    }
  }

  // Some small Node CLIs use a required-value helper such as argument('report')
  // and construct the flag as `--${name}` inside that helper. Record only calls
  // to a helper whose body proves both argv lookup and adjacent-value access.
  for (const helper of text.matchAll(/function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)\s*\{([\s\S]*?)^\}/gm)) {
    const helperName = helper[1];
    const parameter = helper[2];
    const body = helper[3];
    const escapedParameter = parameter.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const constructsFlag = new RegExp('`--\\$\\{' + escapedParameter + '\\}`', 'u').test(body);
    const consumesAdjacentValue = /(?:process\.)?argv\s*\[\s*index\s*\+\s*1\s*\]/u.test(body);
    if (!constructsFlag || !consumesAdjacentValue) continue;
    const required = /(?:throw|usage\s*\()[\s\S]{0,160}(?:required|index\s*<\s*0)/u.test(body)
      || /index\s*<\s*0[\s\S]{0,160}(?:throw|usage\s*\()/u.test(body);
    const callPattern = new RegExp(`\\b${helperName}\\(\\s*['"]([a-z][a-z0-9-]*)['"]\\s*\\)`, 'gu');
    for (const call of text.matchAll(callPattern)) {
      // Ignore the helper declaration itself; the call must be outside its body.
      if ((call.index ?? 0) >= (helper.index ?? 0) && (call.index ?? 0) < (helper.index ?? 0) + helper[0].length) continue;
      add(`--${call[1]}`, call.index, 'required-value helper call', {
        declaredValueTaking: true,
        declaredRequired: required ? 'required' : 'conditional',
        declaredDefault: '<none>',
      });
    }
  }
  return [...flags.values()];
}

function cliSurface(sourcePath) {
  if (/^(?:scripts\/deploy|my-values\/setup-secrets\.sh)|skills\/(?:nova\/core|nova\/project|buster\/.*(?:cli|runtime))/u.test(sourcePath)) return 'operator-runtime';
  if (/^scripts\/(?:ap\d+-|docs-|check-(?:ap\d+|configuration-|operator-task-registry|platform-specialist-guides|prism-guides|site-reader-boundary)|generate-suite-migration-status|pipeline-unit-parity-report|suite-parity-report|plugin-system-inventory)/u.test(sourcePath)) return 'documentation-internal';
  if (/^scripts\/(?:lint-baseline-prune|run-lint-report|runtime-tool-locks|scan-runtime-images|versions)\b/u.test(sourcePath)
    || /^skills\/[^/]+\/plugins\/[^/]+\/scripts\/generate-/u.test(sourcePath)) return 'maintainer-verification';
  if (/^(?:scripts\/(?:check-|docs-|generate-|verify-|.*test)|tools\/|packaging\/)/u.test(sourcePath)) return 'maintainer-verification';
  return 'internal-or-invocation';
}

const CLI_AUTHORED_PAGE_BINDINGS = [
  [/^skills\/nova\/core\/cli\.ts$/u, [{ page: 'docs/site/use/operate.md' }]],
  [/^skills\/nova\/project\/(?:cli|legacy-import-cli)\.ts$/u, [{ page: 'docs/site/reference/nova-project.md' }]],
  [/^skills\/nova\/project_setup\/tools\/progress-scaffold\.ts$/u, [{ page: 'docs/site/reference/project-pipeline-publication.md' }]],
  [/^skills\/buster\/engine\/remote-plan-cli\.ts$/u, [{ page: 'docs/site/reference/buster-runtime-configuration.md', section: '## Minimal Root Configuration', endBefore: '### Start one Nova remote-gate request' }]],
  [/^skills\/nova\/core\/test-gates\/remote-gate-cli\.ts$/u, [{ page: 'docs/site/reference/buster-runtime-configuration.md', section: '### Start one Nova remote-gate request' }]],
  [/^scripts\/deploy\.sh$/u, [{ page: 'docs/site/use/operate.md' }]],
];

function markdownSectionLines(lines, heading, endBefore = null) {
  if (!heading) return { start: 0, end: lines.length };
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;
  const level = heading.match(/^#+/u)?.[0].length ?? 1;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (endBefore && lines[index].trim() === endBefore) { end = index; break; }
    const nextLevel = lines[index].match(/^(#+)\s/u)?.[1].length;
    if (nextLevel && nextLevel <= level) { end = index; break; }
  }
  return { start, end };
}

function cliDocumentation(sourcePath, name, classification, surface) {
  if (classification !== 'definition') return {
    documentationStatus: 'not-applicable-invocation',
    documentationAuthority: null,
    documentationReason: 'This occurrence invokes another command and is not an owned option definition.',
  };
  if (surface !== 'operator-runtime') return {
    documentationStatus: 'not-required-in-operator-handbook',
    documentationAuthority: null,
    documentationReason: 'This definition is not part of the operator-runtime surface.',
  };
  const binding = CLI_AUTHORED_PAGE_BINDINGS.find(([pattern]) => pattern.test(sourcePath));
  if (!binding) return {
    documentationStatus: 'missing-authored-documentation',
    documentationAuthority: null,
    documentationReason: `No authored operator-page binding is registered for ${sourcePath}.`,
  };
  const semanticLanguage = /(?:accepts?|adds?|cannot|checks?|continues?|controls?|creates?|emits?|enables?|fails?|file|input|must|mutually|optional|output|path|prints?|reads?|required|resumes?|runs?|selects?|starts?|validates?|writes?)/iu;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const exactOption = new RegExp(`(?:^|[^A-Za-z0-9-])${escapedName}(?![A-Za-z0-9-])`, 'u');
  for (const pageBinding of binding[1]) {
    const page = pageBinding.page;
    if (!exists(page)) continue;
    const pageText = read(page);
    const lines = pageText.split('\n');
    const section = markdownSectionLines(lines, pageBinding.section, pageBinding.endBefore);
    if (!section) continue;
    for (let lineIndex = section.start; lineIndex < section.end; lineIndex += 1) {
      if (!exactOption.test(lines[lineIndex])) continue;
      const context = lines.slice(Math.max(0, lineIndex - 2), Math.min(lines.length, lineIndex + 6)).join(' ');
      if (semanticLanguage.test(context)) return {
        documentationStatus: 'authored-documentation',
        documentationAuthority: `${page}:${lineIndex + 1}`,
        documentationReason: `The bound authored page explains ${name} in operator context.`,
      };
    }
  }
  return {
    documentationStatus: 'missing-authored-documentation',
    documentationAuthority: null,
    documentationReason: `${name} needs an explanation in the source-bound command section on ${binding[1].map((item) => item.page).join(' or ')}; a same-named option for another command is not authority.`,
  };
}

const CLI_SEMANTIC_OVERRIDES = new Map(Object.entries({
  'scripts/pipeline-light-watchdog.sh::--status-file': { required: 'required', default: '<none>', requiredReason: 'The parser rejects an empty status_file after option parsing.' },
  'scripts/pipeline-light-watchdog.sh::--run-pid': { required: 'required', default: '<none>', requiredReason: 'The parser rejects an empty run_pid after option parsing.' },
  'scripts/pipeline-light-watchdog.sh::--log-file': { required: 'required', default: '<none>', requiredReason: 'The parser rejects an empty log_file after option parsing.' },
  'scripts/pipeline-light-watchdog.sh::--notify-command': { required: 'conditional', default: '', requiredReason: 'Notification is optional; the initialized empty string suppresses a notification command.' },
  'scripts/pipeline-light-watchdog.sh::--poll-seconds': { required: 'conditional', default: 'PIPELINE_LIGHT_WATCHDOG_POLL_SECONDS when non-empty, otherwise 15', requiredReason: 'The option overrides the environment-derived polling interval.' },
  'scripts/pipeline-light-watchdog.sh::--heartbeat-seconds': { required: 'conditional', default: 'PIPELINE_LIGHT_WATCHDOG_HEARTBEAT_SECONDS when non-empty, otherwise 300', requiredReason: 'The option overrides the environment-derived heartbeat interval.' },
  'skills/nova/project_setup/tools/progress-scaffold.ts::--project': { required: 'alternative-required', default: '<none>', requiredReason: 'Exactly one location selector is needed: --project or --swarm, unless --help is selected.' },
  'skills/nova/project_setup/tools/progress-scaffold.ts::--swarm': { required: 'alternative-required', default: '<none>', requiredReason: 'Exactly one location selector is needed: --project or --swarm, unless --help is selected.' },
  'skills/nova/project_setup/tools/progress-scaffold.ts::--repo': { required: 'conditional', default: 'nearest parent containing .git', requiredReason: 'The parser discovers the repository root when this option is omitted.' },
  'skills/nova/project_setup/tools/progress-scaffold.ts::--scaffold': { required: 'conditional', default: '<selected .swarm directory>/progress.scaffold.json', requiredReason: 'The selected swarm directory and DEFAULT_SCAFFOLD_FILE determine the path when omitted.' },
}));

for (const name of ['--import-legacy', '--authoring', '--platform', '--output']) {
  CLI_SEMANTIC_OVERRIDES.set(`skills/nova/project/legacy-import-cli.ts::${name}`, {
    required: 'required',
    default: '<none>',
    requiredReason: 'The allow-list parser rejects duplicates and Object.keys(args).length !== 4 rejects any set missing one of the four required options.',
  });
}

const CLI_PARSER_CONTRACTS = new Map(Object.entries({
  'skills/nova/core/cli.ts': {
    unknownOptionBehavior: 'An arbitrary paired `--name value` option is accepted and ignored when no returned field reads its name.',
    duplicateOptionBehavior: 'The last value for a repeated option name wins.',
    failureMeaning: 'A missing paired value, a required-mode omission, or an invalid option combination calls usage; an unknown paired option alone is accepted and ignored.',
  },
  'skills/nova/core/test-gates/remote-gate-cli.ts': {
    unknownOptionBehavior: 'An arbitrary paired `--name value` option is accepted and ignored when no returned field reads its name.',
    duplicateOptionBehavior: 'The last value for a repeated option name wins.',
    failureMeaning: 'A missing or empty paired value, a missing required option, or a non-positive/non-integer timeout fails; an unknown paired option alone is accepted and ignored.',
  },
  'skills/nova/project/legacy-import-cli.ts': {
    unknownOptionBehavior: 'Any option outside the four-name allow-list fails.',
    duplicateOptionBehavior: 'A repeated option fails before import.',
    failureMeaning: 'Unknown, repeated, missing-value, or incomplete four-option input fails before output is written.',
  },
  'skills/nova/project/cli.ts': {
    unknownOptionBehavior: 'The project parser rejects any option outside its five-name allow-list. Without --project, this entry point delegates the complete argv to the Core CLI.',
    duplicateOptionBehavior: 'The project parser rejects a repeated option before it reads project configuration.',
    failureMeaning: 'An unknown or repeated option, a missing or option-shaped value, a missing required project/platform pair, or conflicting compile/recover/signal modes fails before execution.',
  },
  'skills/nova/project_setup/tools/progress-scaffold.ts': {
    unknownOptionBehavior: 'Any argument outside the four value options, three action switches, --help, and -h fails.',
    duplicateOptionBehavior: 'A repeated value option uses its last value. Repeated boolean switches are idempotent.',
    failureMeaning: 'An unknown argument, a missing value, conflicting apply/check switches, or absence of both project and swarm selectors fails before scaffold work; --help and -h bypass the selector requirement.',
  },
  'scripts/deploy.sh': {
    unknownOptionBehavior: 'The agent command rejects an unrecognized first optional argument. Other deploy commands have their own positional command contracts.',
    duplicateOptionBehavior: 'The top-level dispatcher passes only the first optional agent argument; later trailing arguments are ignored by the current shell dispatch.',
    failureMeaning: 'For the agent command, an unknown first option fails; --with-code is rejected for Prism and enables code-bundle deployment only for Nova or Buster.',
  },
  'skills/buster/engine/remote-plan-cli.ts': {
    unknownOptionBehavior: 'Any option other than the single `--config` pair fails.',
    duplicateOptionBehavior: 'Repeating `--config` makes the argument count invalid and fails.',
    failureMeaning: 'Any input other than exactly one non-empty `--config` value fails before runtime startup.',
  },
}));

function classifyCliFacts(facts) {
  const grouped = new Map();
  for (const fact of facts) {
    const key = `${fact.path}:${fact.name}`;
    const values = grouped.get(key) ?? [];
    values.push(fact);
    grouped.set(key, values);
  }
  return [...grouped.values()].map((occurrences) => {
    const first = occurrences[0];
    const text = read(first.path);
    const parserEvidence = occurrences.filter((item) => [
      'argument comparison', 'argument membership check', 'argument branch', 'parser declaration',
      'argument delegation selector', 'parser allow-list', 'required-value helper call',
      'parser argv choice-list', 'parser argv lookup',
    ].includes(item.evidence));
    const definitionEvidence = parserEvidence;
    const classification = definitionEvidence.length ? 'definition' : 'invocation';
    const evidence = definitionEvidence[0] ?? first;
    const escapedFlag = first.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const evidenceLine = evidence.line;
    const parserWindow = text.split('\n').slice(Math.max(0, evidenceLine - 1), evidenceLine + 8).join('\n').split(/;;/u)[0];
    const usageValueEvidence = occurrences.find((item) => new RegExp(`${escapedFlag}(?:=|\\s)(?:<[^>]+>|[A-Z][A-Z0-9_-]*|["']?\\$)`, 'u').test(String(item.sourceLine)));
    const parserConsumesNext = /(?:\$\{?2\}?|shift\s+2|argv\s*\[\s*(?:index|i)\s*\+\s*1\s*\]|argv\[(?:index|i)\s*\+\s*1\])/u.test(parserWindow);
    const declarationTakesValue = evidence.evidence === 'parser declaration'
      && (new RegExp(`${escapedFlag}\\s+(?:<[^>]+>|[A-Z][A-Z0-9_-]*)`, 'u').test(evidence.sourceLine) || !/(?:store_true|store_false|boolean)/iu.test(evidence.sourceLine));
    const explicitBoolean = evidence.evidence === 'argument membership check'
      || (evidence.evidence === 'parser declaration' && /(?:store_true|store_false|boolean)/iu.test(evidence.sourceLine));
    const branchWithoutValue = classification === 'definition' && !parserConsumesNext && !declarationTakesValue;
    const declaredArity = definitionEvidence.map((item) => item.declaredValueTaking).find((value) => value !== undefined && value !== null);
    const dynamicAdjacentValueParser = classification === 'invocation'
      && /(?:parsed\s*\[\s*flag\.slice\(2\)\s*\]\s*=\s*value|!flag\?\.startsWith\(['"]--['"]\)[\s\S]{0,180}value\s*===\s*undefined)/u.test(text)
      && occurrences.some((item) => item.evidence === 'usage declaration');
    const valueTaking = declaredArity ?? (parserConsumesNext || declarationTakesValue || usageValueEvidence || dynamicAdjacentValueParser
      ? true : explicitBoolean || branchWithoutValue ? false : null);
    const effectiveClassification = classification === 'invocation' && dynamicAdjacentValueParser ? 'definition' : classification;
    const longName = first.name.startsWith('--');
    const requiredGuardPatterns = longName ? [
      new RegExp(`!parsed(?:\\.${first.name.slice(2).replace(/-([a-z])/gu, (_whole, letter) => letter.toUpperCase())}|\\[['"]${escapedFlag.slice(2)}['"]\\])`, 'u'),
      new RegExp(`!args\\[['"]${escapedFlag}['"]\\]`, 'u'),
    ] : [];
    const matchingRequiredGuard = requiredGuardPatterns.find((pattern) => pattern.test(text));
    const accessSource = matchingRequiredGuard?.source;
    const conditionalAbsence = accessSource
      ? new RegExp(`(?:${accessSource})[\\s)]*&&|&&[\\s(]*(?:${accessSource})`, 'u').test(text)
      : false;
    const propertyName = longName ? first.name.slice(2) : null;
    const numericBinding = propertyName ? text.match(new RegExp(`const\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*Number\\(parsed\\[['"]${propertyName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}['"]\\]\\)`, 'u')) : null;
    const requiredNumericBinding = numericBinding
      ? new RegExp(`!Number\\.isSafeInteger\\(\\s*${numericBinding[1]}\\s*\\)`, 'u').test(text)
      : false;
    const singlePairParser = occurrences.some((item) => item.evidence === 'argument comparison')
      && /values\.length\s*!==?\s*2/u.test(text)
      && new RegExp(`values\\[0\\]\\s*!==?\\s*['"]${escapedFlag}['"]`, 'u').test(text);
    const sourceProvesRequired = (Boolean(matchingRequiredGuard) && !conditionalAbsence) || requiredNumericBinding || singlePairParser;
    const declaredRequired = definitionEvidence.map((item) => item.declaredRequired).find(Boolean);
    const declaredDefault = definitionEvidence.map((item) => item.declaredDefault).find((value) => value !== undefined);
    const surface = cliSurface(first.path);
    const owner = sourceOwner(first.path);
    const documentation = cliDocumentation(first.path, first.name, effectiveClassification, surface);
    const semanticOverride = CLI_SEMANTIC_OVERRIDES.get(`${first.path}::${first.name}`);
    const parserContract = CLI_PARSER_CONTRACTS.get(first.path);
    const aliasFor = first.name === '-h' && /['"]--help['"]/u.test(text) ? '--help' : null;
    return {
      name: first.name,
      path: evidence.path,
      line: evidence.line,
      evidence: evidence.evidence,
      occurrenceCount: occurrences.length,
      classification: effectiveClassification,
      surface,
      valueTaking,
      type: valueTaking === true ? 'value-taking argument; source does not prove a narrower type'
        : valueTaking === false ? 'boolean switch or command selector'
          : 'value-taking behavior is not proved by the discovered syntax; inspect the linked parser',
      required: semanticOverride?.required ?? declaredRequired ?? (sourceProvesRequired ? 'required' : 'conditional'),
      requiredReason: semanticOverride?.requiredReason ?? (sourceProvesRequired
        ? 'The linked parser rejects absence after parsing.'
        : 'No unconditional absence rejection is proved by the linked parser.'),
      default: semanticOverride?.default ?? declaredDefault ?? (valueTaking === true ? '<none>' : valueTaking === false ? 'false/not selected' : '<source does not prove a default>'),
      aliasFor,
      unknownOptionBehavior: parserContract?.unknownOptionBehavior ?? (effectiveClassification === 'definition'
        ? 'The linked parser decides whether an unrecognized option fails.' : 'Not applicable to an invocation occurrence.'),
      duplicateOptionBehavior: parserContract?.duplicateOptionBehavior ?? (effectiveClassification === 'definition'
        ? 'The linked parser decides whether a repeated option fails or wins.' : 'Not applicable to an invocation occurrence.'),
      ownerComponent: owner.component,
      ownerEvidence: owner.evidence,
      runtimeOwner: owner.component,
      consumers: [{ path: evidence.path, line: evidence.line, kind: effectiveClassification === 'definition' ? 'argument-parser' : 'command-invocation' }],
      precedence: effectiveClassification === 'definition' ? ['explicit command-line flag', parserContract?.duplicateOptionBehavior ?? 'parser-specific duplicate handling', 'environment or source default when the consumer declares one', 'built-in behavior'] : ['not applicable; this source invokes another command'],
      changeImpact: effectiveClassification === 'definition' ? 'Selects the parser branch or value used by this command.' : 'Changes the arguments passed to the invoked command; it is not an operator-facing definition here.',
      failureMeaning: effectiveClassification === 'definition' ? parserContract?.failureMeaning ?? 'Missing or invalid values fail only when the linked parser branch rejects them; inspect its unknown-option and duplicate-option fields.' : 'The invoked command can reject the argument or fail its selected operation.',
      ...documentation,
    };
  }).filter((fact) => fact.classification === 'definition')
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

function shellFunctionScopes(text) {
  const lines = text.split('\n');
  const scopes = Array(lines.length).fill('<top-level>');
  let active = null;
  for (let index = 0; index < lines.length; index += 1) {
    // Repository shell functions are top-level declarations with an
    // unindented closing brace. Using those grammar landmarks avoids counting
    // braces inside multiline awk/sed programs or parameter expansions.
    const declaration = lines[index].match(/^(?:function\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(\s*\))?\s*\{/u);
    if (!active && declaration) active = declaration[1];
    if (active) scopes[index] = active;
    if (active && /^\}\s*(?:#.*)?$/u.test(lines[index])) active = null;
  }
  return scopes;
}

function shellAssignmentStatements(text) {
  const lines = text.split('\n');
  const offsets = [];
  let offset = 0;
  for (const line of lines) { offsets.push(offset); offset += line.length + 1; }
  const statements = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const prefix = lines[lineIndex].match(/^\s*((?:(?:export|readonly|local)\s+)*)([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!prefix) continue;
    const startLine = lineIndex;
    const rhsStart = offsets[startLine] + lines[startLine].length - prefix[3].length;
    let single = false;
    let double = false;
    let commandDepth = 0;
    let parameterDepth = 0;
    let parsedEndLine = lineIndex;
    let cursor = rhsStart;
    for (; cursor < text.length; cursor += 1) {
      const character = text[cursor];
      const next = text[cursor + 1];
      if (character === '\\' && !single) {
        if (next === '\n') parsedEndLine += 1;
        cursor += 1;
        continue;
      }
      if (single) { if (character === "'") single = false; continue; }
      if (character === "'") { single = true; continue; }
      if (character === '"') { double = !double; continue; }
      if (character === '$' && next === '(' && text[cursor + 2] !== '(') { commandDepth += 1; cursor += 1; continue; }
      if (character === '$' && next === '{') { parameterDepth += 1; cursor += 1; continue; }
      if (character === '(' && commandDepth > 0) { commandDepth += 1; continue; }
      if (character === ')' && commandDepth > 0) { commandDepth -= 1; continue; }
      if (character === '}' && parameterDepth > 0) { parameterDepth -= 1; continue; }
      if (character === '\n') {
        if (double || commandDepth > 0 || parameterDepth > 0) { parsedEndLine += 1; continue; }
        break;
      }
      if (!double && commandDepth === 0 && parameterDepth === 0 && (/[\t ]/u.test(character) || character === ';')) break;
    }
    const rhs = text.slice(rhsStart, cursor);
    const source = text.slice(offsets[startLine], cursor);
    statements.push({
      name: prefix[2],
      rhs,
      source,
      start: offsets[startLine] + (lines[startLine].indexOf(prefix[2])),
      end: cursor,
      line: startLine + 1,
      endLine: parsedEndLine + 1,
      sameLineRemainder: cursor <= offsets[startLine] + lines[startLine].length
        ? text.slice(cursor, offsets[startLine] + lines[startLine].length)
        : '',
      exported: /(?:^|\s)export\s/u.test(prefix[1]),
      local: /(?:^|\s)local\s/u.test(prefix[1]),
    });
  }
  return statements;
}

function shellFormulaFacts(formula) {
  const references = [];
  const unsupportedReasons = [];
  let single = false;
  let double = false;
  let commandSubstitution = false;
  const addReference = (name) => references.push(/^\d+$|^[@*#?]$/u.test(name) ? `shell positional $${name}` : name);
  for (let index = 0; index < formula.length; index += 1) {
    const character = formula[index];
    const next = formula[index + 1];
    if (character === '\\' && !single) { index += 1; continue; }
    if (single) { if (character === "'") single = false; continue; }
    if (character === "'" && !double) { single = true; continue; }
    if (character === '"') { double = !double; continue; }
    if (!double && character === '#' && (index === 0 || /\s/u.test(formula[index - 1]))) break;
    if (character === '`') unsupportedReasons.push('legacy backtick command substitution');
    if (!double && (character === '<' || character === '>') && next === '(') unsupportedReasons.push('process substitution');
    if (!double && character === '<' && next === '<') unsupportedReasons.push('here-document');
    if (character !== '$') continue;
    if (next === '(' && formula[index + 2] === '(') { unsupportedReasons.push('arithmetic expansion'); continue; }
    if (next === '(') { commandSubstitution = true; continue; }
    let tail = formula.slice(index + (next === '{' ? 2 : 1));
    // `${#NAME}` is the length of NAME. `#` is an operator here, not the
    // special positional parameter `$#`.
    if (next === '{' && tail.startsWith('#')) tail = tail.slice(1);
    const reference = tail.match(/^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*#?])/u);
    if (reference) addReference(reference[1]);
  }
  if (commandSubstitution) references.push('command substitution');
  return { references: [...new Set(references)].sort(), unsupportedReasons: [...new Set(unsupportedReasons)] };
}

function shellChildProcessPrefixConsumer(lines, assignment) {
  const startIndex = assignment.line - 1;
  const firstLine = lines[startIndex] ?? '';
  const remainder = assignment.sameLineRemainder;
  const stripEnvironmentPrefixes = (value) => {
    let rest = value.trim();
    while (/^[A-Z][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+/u.test(rest)) {
      rest = rest.replace(/^[A-Z][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+/u, '');
    }
    return rest;
  };
  const sameLineCommand = stripEnvironmentPrefixes(remainder);
  if (sameLineCommand && sameLineCommand !== '\\' && !sameLineCommand.startsWith('#')) {
    return { line: assignment.line, kind: 'child-process-environment-edge' };
  }
  if (!/\\\s*$/u.test(firstLine)) return null;
  let finalIndex = startIndex;
  while (finalIndex < lines.length - 1 && /\\\s*$/u.test(lines[finalIndex])) finalIndex += 1;
  const command = stripEnvironmentPrefixes(lines[finalIndex] ?? '');
  if (!command || command === '\\' || command.startsWith('#')) return null;
  return { line: finalIndex + 1, kind: 'child-process-environment-edge' };
}

function shellFunctionInvocations(lines, scopes, functionName) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const invocation = new RegExp(`(?:^|[;&|]\\s*)${escaped}(?:\\s|$)`, 'u');
  const declaration = new RegExp(`^(?:function\\s+)?${escaped}\\s*(?:\\(\\s*\\))?\\s*\\{`, 'u');
  const found = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (scopes[index] === functionName || declaration.test(lines[index])) continue;
    if (invocation.test(lines[index].replace(/^\s+/u, ''))) found.push(index);
  }
  return found;
}

function derivedAssignments(file, text) {
  const derived = [];
  const lines = text.split('\n');
  const scopes = shellFunctionScopes(text);
  const assignments = shellAssignmentStatements(text);
  for (let assignmentIndex = 0; assignmentIndex < assignments.length; assignmentIndex += 1) {
    const assignment = assignments[assignmentIndex];
    if (!assignment.rhs.includes('$') && !assignment.rhs.includes('`')) continue;
    const scope = scopes[assignment.line - 1];
    const scopeLocal = assignment.local || assignments.slice(0, assignmentIndex).some((candidate) => candidate.name === assignment.name
      && candidate.local && scopes[candidate.line - 1] === scope);
    const facts = shellFormulaFacts(assignment.rhs);
    if (facts.references.includes(assignment.name)) continue;
    const nextReassignment = assignments.slice(assignmentIndex + 1).find((candidate) => candidate.name === assignment.name
      && scopes[candidate.line - 1] === scope);
    const stopLine = nextReassignment?.line ?? lines.length + 1;
    const downstream = [];
    for (let lineIndex = assignment.endLine; lineIndex < stopLine - 1; lineIndex += 1) {
      if (scope !== '<top-level>' && scopes[lineIndex] !== scope) continue;
      const sourceLine = lines[lineIndex];
      if (shellFormulaFacts(sourceLine).references.includes(assignment.name)) {
        downstream.push({ path: file, line: lineIndex + 1, kind: 'shell-derived-value-use' });
      }
    }
    if (!scopeLocal && scope !== '<top-level>') {
      const functionEnd = scopes.lastIndexOf(scope);
      const nextSameScope = assignments.slice(assignmentIndex + 1).find((candidate) => candidate.name === assignment.name
        && scopes[candidate.line - 1] === scope);
      const boundaryEnd = (nextSameScope?.line ?? functionEnd + 2) - 1;
      const boundaryText = lines.slice(assignment.endLine, boundaryEnd).join('\n');
      const canReturnWithValue = !nextSameScope || /^\s*return(?:\s|$)|^\s*(?:else|elif\b)|^\s*;;\s*$/mu.test(boundaryText);
      if (canReturnWithValue) {
        const invocations = shellFunctionInvocations(lines, scopes, scope);
        for (let invocationIndex = 0; invocationIndex < invocations.length; invocationIndex += 1) {
          const callIndex = invocations[invocationIndex];
          downstream.push({
            path: file,
            line: callIndex + 1,
            kind: 'shell-global-conditional-return-edge',
            condition: `${scope} reaches this assignment and returns before another ${assignment.name} assignment`,
          });
          const callerScope = scopes[callIndex];
          const nextCall = invocations[invocationIndex + 1] ?? lines.length;
          const nextGlobalAssignment = assignments.find((candidate) => candidate.name === assignment.name
            && candidate.line - 1 > callIndex && scopes[candidate.line - 1] !== scope)?.line ?? lines.length + 1;
          const scanEnd = Math.min(nextCall, nextGlobalAssignment - 1, callIndex + 80);
          let postCallUses = 0;
          for (let lineIndex = callIndex + 1; lineIndex < scanEnd && postCallUses < 3; lineIndex += 1) {
            if (scopes[lineIndex] !== callerScope) continue;
            if (!shellFormulaFacts(lines[lineIndex]).references.includes(assignment.name)) continue;
            downstream.push({
              path: file,
              line: lineIndex + 1,
              kind: 'shell-global-conditional-post-call-use',
              condition: `${scope} returned through this assignment at the call on line ${callIndex + 1}`,
            });
            postCallUses += 1;
          }
        }
      }
    }
    const escapedName = assignment.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    for (let lineIndex = assignment.endLine; lineIndex < stopLine - 1; lineIndex += 1) {
      if (scope !== '<top-level>' && scopes[lineIndex] !== scope) continue;
      if (new RegExp(`^\\s*export\\s+${escapedName}(?:\\s|$)`, 'u').test(lines[lineIndex])) {
        downstream.push({ path: file, line: lineIndex + 1, kind: 'exported-child-process-environment-edge' });
      }
    }
    const childPrefix = shellChildProcessPrefixConsumer(lines, assignment);
    if (childPrefix) downstream.push({ path: file, ...childPrefix });
    if (assignment.exported) {
      // Export establishes a real environment edge, but static source order
      // does not prove which later command forks a child (a shell function can
      // defer that command). Point at the export itself and do not invent a
      // specific child-command consumer.
      downstream.push({ path: file, line: assignment.line, kind: 'exported-child-process-environment-edge' });
    }
    const uniqueDownstream = [...new Map(downstream.map((consumer) => [`${consumer.path}:${consumer.line}:${consumer.kind}`, consumer])).values()];
    const presentation = /^(?:BLUE|GREEN|YELLOW|RED|NC|TODO_PREFIX)$/u.test(assignment.name);
    const unsupported = facts.unsupportedReasons.length > 0;
    const exportedFlow = assignment.exported || uniqueDownstream.some((consumer) => consumer.kind === 'exported-child-process-environment-edge');
    const classification = presentation ? 'presentation-internal'
      : unsupported ? 'unsupported-derived'
        : uniqueDownstream.length ? exportedFlow ? 'exported-runtime-derived' : 'runtime-derived' : 'unused-derived';
    const inputText = facts.references.length ? facts.references.join(', ') : 'no external input proved';
    derived.push({
      name: assignment.name,
      path: file,
      line: assignment.line,
      formula: unsupported ? '<unsupported shell syntax; inspect source>' : redactValue(assignment.name, assignment.rhs.trim()),
      inputs: facts.references,
      analysisStatus: unsupported ? 'unsupported' : 'analyzed',
      unsupportedReason: unsupported ? facts.unsupportedReasons.join('; ') : null,
      ownerComponent: sourceOwner(file).component,
      ownerEvidence: sourceOwner(file).evidence,
      runtimeOwner: sourceOwner(file).component,
      consumers: uniqueDownstream.length ? uniqueDownstream : [{ path: file, line: assignment.line, kind: 'definition-without-proved-downstream-use' }],
      classification,
      precedence: ['referenced environment or shell inputs', 'this derived assignment', 'next reassignment in the same shell function or top-level scope'],
      changeImpact: unsupported
        ? `${assignment.name} uses ${facts.unsupportedReasons.join(', ')}. The generator does not claim a formula or complete data flow for this syntax.`
        : uniqueDownstream.length
          ? `Combines ${inputText} into ${assignment.name}; the listed same-scope use sites receive this assignment before reassignment.`
          : `${assignment.name} has no proved downstream use before reassignment in the same shell scope.`,
      failureMeaning: unsupported
        ? 'The source must be inspected before this derived value is changed.'
        : uniqueDownstream.length
          ? `An absent or malformed ${inputText} can produce an empty or invalid ${assignment.name} at the listed use sites.`
          : 'No runtime failure is proved because no same-scope downstream use was found.',
      closureCondition: classification === 'unused-derived' ? 'Remove the assignment or add a source-backed downstream use in the same shell scope.'
        : classification === 'unsupported-derived' ? 'Add parser support for this shell syntax before publishing a calculated formula.' : null,
    });
  }
  return derived;
}

function secretFactsFromYaml(sourcePath, value, documentIndex, document, lineCounter) {
  const facts = [];
  const resourceNamespace = value?.metadata?.namespace ?? '<runtime namespace>';
  const exactLine = (segments) => {
    const node = document.getIn(segments, true);
    return Array.isArray(node?.range) ? lineCounter.linePos(node.range[0]).line : null;
  };
  const recurse = (item, fieldPath = '$', segments = []) => {
    if (Array.isArray(item)) {
      item.forEach((child, index) => recurse(child, `${fieldPath}[${index}]`, [...segments, index]));
      return;
    }
    if (!item || typeof item !== 'object') return;
    if (item.kind === 'Secret' && item.metadata?.name) {
      facts.push({ kind: 'declaration', name: item.metadata.name, keys: [...new Set([...Object.keys(item.data ?? {}), ...Object.keys(item.stringData ?? {})])].sort(), namespace: item.metadata?.namespace ?? '<runtime namespace>', path: sourcePath, document: documentIndex, fieldPath, line: exactLine([...segments, 'metadata', 'name']) ?? exactLine([...segments, 'kind']) });
    }
    for (const [key, child] of Object.entries(item)) {
      const nextPath = yamlFieldChildPath(fieldPath, key);
      if (key === 'secretKeyRef' && child && typeof child === 'object') {
        facts.push({ kind: 'key-reference', name: child.name ?? '<dynamic>', key: child.key ?? '<unknown>', namespace: resourceNamespace, optionalState: child.optional === true ? 'optional' : 'required unless enclosing field is conditional', path: sourcePath, document: documentIndex, fieldPath: nextPath, line: exactLine([...segments, key, 'name']) ?? exactLine([...segments, key]) });
      } else if (key === 'secretRef' && child && typeof child === 'object') {
        facts.push({ kind: 'reference', name: child.name ?? '<dynamic>', namespace: resourceNamespace, optionalState: child.optional === true ? 'optional' : 'required unless enclosing field is conditional', path: sourcePath, document: documentIndex, fieldPath: nextPath, line: exactLine([...segments, key, 'name']) ?? exactLine([...segments, key]) });
      } else if ((key === 'existingSecret' || key === 'secretName') && typeof child === 'string' && child) {
        facts.push({ kind: 'reference', name: child, namespace: resourceNamespace, optionalState: 'chart/application condition at linked field', path: sourcePath, document: documentIndex, fieldPath: nextPath, line: exactLine([...segments, key]) });
      } else if (key === 'name' && /\.imagePullSecrets\[[0-9]+\]$/u.test(fieldPath) && typeof child === 'string' && child) {
        facts.push({ kind: 'reference', name: child, namespace: resourceNamespace, optionalState: 'required for private image pulls by the enclosing workload', path: sourcePath, document: documentIndex, fieldPath: nextPath, line: exactLine([...segments, key]) });
      }
      recurse(child, nextPath, [...segments, key]);
    }
  };
  recurse(value);
  return facts;
}

function helmValuesAt(values, dottedPath) {
  return dottedPath.split('.').filter(Boolean).reduce((current, segment) => current?.[segment], values);
}

function helmExpressionPath(expression) {
  return /\$?\.Values\.([A-Za-z0-9_.]+)/u.exec(expression)?.[1] ?? null;
}

function cleanHelmExpression(expression) {
  return expression.trim().replace(/^['"]|['"]$/gu, '').replace(/^\{\{-?\s*/u, '').replace(/\s*-?\}\}$/u, '').trim();
}

function describeHelmConditions(conditions) {
  if (conditions.length === 0) return 'rendered whenever this template is selected';
  if (conditions.length === 1) return `rendered only when Helm expression \`${conditions[0]}\` is true`;
  return `rendered only when all of these Helm expressions are true: ${conditions.map((condition) => `\`${condition}\``).join('; ')}`;
}

const HELM_HELPER_BINDINGS = new Map(Object.entries({
  'kubeclaw.gatewaySecretName': { authorityId: 'kubeclaw-gateway-secret', name: '<configured auth Secret or release gateway Secret>' },
  'kubeclaw.litellmSecretName': { authorityId: 'kubeclaw-litellm-secret', name: '<configured LiteLLM Secret or release gateway Secret>' },
  'kubeclaw.discordSecretName': { authorityId: 'kubeclaw-discord-secret', name: '<configured Discord Secret or release gateway Secret>' },
  'kubeclaw.stitchSecretName': { authorityId: 'kubeclaw-stitch-secret', name: '<configured Stitch Secret>' },
  'kubeclaw.gatewaySecretKey': { value: 'gatewayToken' },
  'kubeclaw.litellmSecretKey': { value: 'litellmApiKey' },
  'kubeclaw.discordSecretKey': { value: 'discordToken' },
  'kubeclaw.stitchSecretKey': { value: 'stitchApiKey' },
}));

function helmTemplateValue(expression, values, chartName, valueKind) {
  const cleaned = cleanHelmExpression(expression);
  const primary = cleaned.split('|', 1)[0].trim();
  const helper = /include\s+"([^"]+)"/u.exec(cleaned)?.[1];
  if (helper && HELM_HELPER_BINDINGS.has(helper)) return HELM_HELPER_BINDINGS.get(helper);
  if (primary === '$postgresSecret') {
    const selected = helmValuesAt(values, 'postgresql.existingSecret');
    return { name: selected || '<required Prism PostgreSQL Secret>', authorityId: 'prism-postgresql-auth' };
  }
  if (primary === '$client.caSecretName') return { name: '<configured registry client CA Secret>', authorityId: 'kubeclaw-registry-ca-secret' };
  if (primary === '$config.signingSecretName') return { name: '<configured Prism product signing Secret>', authorityId: 'prism-product-signing-secret' };
  if (primary === '$config.controllerCaSecretName') return { name: '<configured Prism product controller CA Secret>', authorityId: 'prism-product-controller-ca-secret' };
  const valuePath = helmExpressionPath(cleaned);
  if (valuePath) {
    const selected = helmValuesAt(values, valuePath);
    if (typeof selected === 'string' && selected) return valueKind === 'name' ? { name: selected } : { value: selected };
    const configuredAuthorities = {
      'githubSecret': 'ops-github-secret',
      'codeBundle.auth.existingSecret': 'github-bundle-reader',
      'discordWebhook.secretName': 'kubeclaw-discord-webhook-secret',
      'agent.git.secretName': 'kubeclaw-git-deploy-secret',
      'archviewer.existingSecret': 'nova-archviewer-auth',
      'busterNamespaceBroker.controller.readiness.tlsSecretName': 'kubeclaw-ready-tls-secret',
      'busterNamespaceBroker.readyClient.caSecretName': 'kubeclaw-ready-client-ca-secret',
      'control.productDecisions.signingSecretName': 'prism-product-signing-secret',
      'control.productDecisions.controllerCaSecretName': 'prism-product-controller-ca-secret',
      'postgresql.existingSecret': 'prism-postgresql-auth',
    };
    if (valueKind === 'name') return { name: `<configured ${chartName} $.${valuePath}>`, authorityId: configuredAuthorities[valuePath] ?? `${chartName}-configured-${valuePath.replaceAll('.', '-')}` };
    const fallback = /\|\s*default\s+"([^"]+)"/u.exec(cleaned)?.[1];
    if (fallback) return { value: fallback };
    return { value: `<configured $.${valuePath}>` };
  }
  const literal = /^['"]?([A-Za-z0-9_.-]+)['"]?$/u.exec(cleaned)?.[1];
  if (literal) return valueKind === 'name' ? { name: literal } : { value: literal };
  return valueKind === 'name'
    ? { name: `<Helm expression: ${cleaned}>`, authorityId: `${chartName}-template-${cleaned.replace(/[^A-Za-z0-9]+/gu, '-').replace(/^-|-$/gu, '').toLowerCase()}` }
    : { value: `<Helm expression: ${cleaned}>` };
}

function helmSecretAuthority(authorityId) {
  const authorities = {
    'ops-github-secret': { purpose: 'Supplies the optional GitHub token mounted only in the Ops Codex container.', requiredWhen: 'Required only when the Ops Codex workflow needs authenticated GitHub access.', producer: 'The operator names an existing Secret through `githubSecret`; the Ops chart never generates the token.', rotationOwner: 'source-control security', rotation: 'Create a replacement least-privilege token in the selected Secret key `token`, restart the Ops pod, verify GitHub access, and revoke the old token.', failure: 'Authenticated GitHub commands in the Ops Codex container fail; Ops MCP does not consume this token.', consumerAuthority: 'The Ops StatefulSet injects key `token` as `GH_TOKEN` only into the Codex container.' },
    'ops-tailscale-secret': { purpose: 'Supplies the optional Tailscale auth key used by the Ops userspace sidecar.', requiredWhen: 'Required when `tailscale.enabled` is true.', producer: 'The operator or Ops deployment bootstrap creates the named Secret with key `authkey`.', rotationOwner: 'tailnet security owner', rotation: 'Issue a replacement tagged auth key, replace `authkey`, restart the Ops pod, verify tailnet registration, and revoke the old key.', failure: 'The Tailscale sidecar cannot register and the private Ops endpoint is unavailable.', consumerAuthority: 'The Ops Tailscale sidecar injects `authkey` as `TS_AUTHKEY`.' },
    'ops-bearer-secret': { purpose: 'Authenticates local HTTP requests from the Ops Codex environment to the Ops MCP sidecar.', requiredWhen: 'Required for every Ops pod.', producer: 'The Ops deployment bootstrap creates the Secret or the operator supplies an equivalent existing Secret.', rotationOwner: 'platform-security', rotation: 'Replace key `token`, restart both containers in the single Ops pod, and verify an authenticated and a denied MCP request.', failure: 'The Ops MCP server refuses startup or Codex requests receive an authentication failure.', consumerAuthority: 'The Ops pod mounts key `token` into the bearer volume read by Ops MCP; the Codex client uses the same local trust boundary.' },
    'kubeclaw-gateway-secret': { purpose: 'Supplies the OpenClaw gateway authentication token.', requiredWhen: 'Required for a rendered agent workload.', producer: 'A configured existing Secret is authoritative; otherwise the chart-managed release gateway Secret contains the configured direct token.', rotationOwner: 'platform-security', rotation: 'Replace `gatewayToken` in the selected Secret, restart every gateway client and server in the release, and verify authorized and denied requests.', failure: 'Gateway clients cannot authenticate or the workload does not start with its required Secret reference.', consumerAuthority: 'The rendered KubeClaw workload injects the resolved gateway key into the exact container environment shown by each template fact.' },
    'kubeclaw-chart-managed-gateway-secret': { purpose: 'Creates the chart-managed fallback Secret that can hold the OpenClaw gateway token, LiteLLM API key, and Discord bot token.', requiredWhen: 'Rendered only when at least one direct credential value is non-empty and that credential does not select an existing Secret.', producer: 'The KubeClaw Helm chart renders this Secret from the direct values whose exact per-key conditions are listed in the declaration fact.', rotationOwner: 'platform-security with the applicable integration owner', rotation: 'Replace only the affected direct chart value, upgrade the release, restart every consumer of that key, verify its authentication boundary, and revoke the old external credential.', failure: 'A missing or stale rendered key prevents the corresponding gateway, LiteLLM, or Discord authentication path from working.', consumerAuthority: '`gatewayToken` feeds the OpenClaw gateway binding, `litellmApiKey` feeds memory-search authentication, and `discordToken` feeds enabled Discord integration.' },
    'kubeclaw-litellm-secret': { purpose: 'Supplies the LiteLLM API key used by OpenClaw memory search.', requiredWhen: 'Required when the configured remote embedding path uses LiteLLM authentication.', producer: 'A configured existing Secret is authoritative; otherwise the chart-managed gateway Secret contains the direct chart value.', rotationOwner: 'platform-security', rotation: 'Replace the selected key, restart all consuming agents, verify embedding requests, and retire the old key.', failure: 'Memory embedding requests are rejected by LiteLLM.', consumerAuthority: 'The rendered KubeClaw workload injects the resolved LiteLLM key into its runtime environment.' },
    'kubeclaw-discord-secret': { purpose: 'Supplies the Discord bot token for enabled agent Discord integration.', requiredWhen: 'Required when Discord integration is enabled.', producer: 'A configured existing Secret is authoritative; otherwise the chart-managed gateway Secret contains the configured direct token.', rotationOwner: 'integration security owner', rotation: 'Replace the selected key, restart the enabled Discord consumer, verify bot authentication, and revoke the old token.', failure: 'The Discord integration cannot authenticate.', consumerAuthority: 'The rendered KubeClaw workload injects the resolved Discord token only into enabled agent paths.' },
    'kubeclaw-stitch-secret': { purpose: 'Supplies the Google Stitch API key used by the configured design integration.', requiredWhen: 'Required only when the Stitch integration is enabled.', producer: 'The operator names an existing Secret; the chart does not generate this credential.', rotationOwner: 'integration security owner', rotation: 'Replace the selected key, restart the consumer, verify Stitch access, and revoke the old key.', failure: 'Stitch API requests fail authentication.', consumerAuthority: 'The rendered KubeClaw workload injects the selected Stitch key into the enabled integration.' },
    'kubeclaw-discord-webhook-secret': { purpose: 'Supplies the optional Discord webhook credential.', requiredWhen: 'Required only when `discordWebhook.secretName` is non-empty.', producer: 'The operator creates the selected Secret and key outside the chart.', rotationOwner: 'integration security owner', rotation: 'Replace the webhook value, restart the consumer, verify delivery, and revoke the old webhook.', failure: 'Webhook notification delivery fails.', consumerAuthority: 'The exact KubeClaw template fact identifies each container that receives the configured webhook key.' },
    'kubeclaw-git-deploy-secret': { purpose: 'Supplies the SSH private deploy key used by chart-managed repository synchronization.', requiredWhen: 'Required when `agent.git.enabled` is true.', producer: 'The secret setup helper or source-control authority creates the role-specific deploy-key Secret.', rotationOwner: 'source-control security', rotation: 'Authorize the replacement public key, replace `id_rsa`, verify a new clone, and revoke the old key.', failure: 'Repository initialization cannot clone the configured Git repository.', consumerAuthority: 'The agent init path mounts the Secret as the read-only SSH credential volume.' },
    'kubeclaw-registry-ca-secret': { purpose: 'Supplies a private CA certificate for one configured OCI registry client.', requiredWhen: 'Required when that registry endpoint uses a custom CA.', producer: 'The registry trust owner creates the configured Secret and CA key.', rotationOwner: 'registry trust owner', rotation: 'Publish the replacement CA with an overlap period, update the Secret, restart clients, verify TLS, and retire the old CA.', failure: 'The affected registry client rejects the endpoint TLS chain.', consumerAuthority: 'The KubeClaw workload mounts the selected CA key at the registry-client trust path.' },
    'kubeclaw-ready-tls-secret': { purpose: 'Supplies the TLS server certificate and private key for the Buster namespace-controller readiness endpoint.', requiredWhen: 'Required when the namespace controller is enabled.', producer: 'The platform trust owner pre-creates the selected TLS Secret.', rotationOwner: 'platform trust owner', rotation: 'Replace the certificate and key together, restart the controller, and verify the pinned readiness client.', failure: 'The controller readiness endpoint cannot establish its required TLS identity.', consumerAuthority: 'The namespace-controller pod mounts the selected Secret as its readiness TLS volume.' },
    'kubeclaw-ready-client-ca-secret': { purpose: 'Supplies the CA certificate that verifies the Buster readiness endpoint.', requiredWhen: 'Required when the readiness client is enabled.', producer: 'The platform trust owner pre-creates the configured CA Secret.', rotationOwner: 'platform trust owner', rotation: 'Publish the new CA with an overlap period, update the Secret, verify readiness, and retire the old CA.', failure: 'The readiness client rejects the controller certificate.', consumerAuthority: 'The rendered readiness client mounts the selected CA key.' },
    'prism-product-signing-secret': { purpose: 'Supplies the dedicated Ed25519 private key used to sign Prism product decisions.', requiredWhen: 'Required when product decisions are enabled.', producer: 'The product authority creates the separately named signing Secret.', rotationOwner: 'product decision authority', rotation: 'Publish the replacement verification authority, replace the private key, restart Control, verify signed decisions, and retire the old key.', failure: 'Control cannot load the signing key and product-decision composition stops.', consumerAuthority: 'Prism Control mounts the configured signing key at the product-authority private-key path.' },
    'prism-product-controller-ca-secret': { purpose: 'Supplies the CA certificate used to verify the external product controller.', requiredWhen: 'Required when product decisions are enabled.', producer: 'The product controller trust owner creates the selected CA Secret.', rotationOwner: 'product controller trust owner', rotation: 'Publish the new CA with overlap, update the Secret, restart Control, verify controller TLS, and retire the old CA.', failure: 'Control cannot verify or connect to the product controller.', consumerAuthority: 'Prism Control mounts the configured CA key through the projected controller-authority volume.' },
  };
  return authorities[authorityId] ?? null;
}

function helmTemplateSecretFacts() {
  const facts = [];
  const templates = walk('charts', (absolutePath) => /\/templates\/.*\.(?:yaml|yml|tpl)$/u.test(absolutePath));
  for (const sourcePath of templates) {
    const text = read(sourcePath);
    const lines = text.split('\n');
    const chartRoot = sourcePath.split('/templates/')[0];
    const chartName = path.basename(chartRoot);
    const valuesPath = `${chartRoot}/values.yaml`;
    const values = exists(valuesPath) ? YAML.parse(read(valuesPath)) : {};
    const add = (kind, nameExpression, keyExpression, line, fieldPath, optionalState, keys = null, keyConditions = null) => {
      const resolvedName = helmTemplateValue(nameExpression, values, chartName, 'name');
      const resolvedKey = keyExpression ? helmTemplateValue(keyExpression, values, chartName, 'key') : null;
      let authorityId = resolvedName.authorityId ?? resolvedName.name;
      let authorityIds = null;
      let publishedName = resolvedName.name;
      if (sourcePath === 'charts/kubeclaw/templates/secret.yaml' && /include\s+"kubeclaw\.fullname"[^\n]*-gateway/u.test(nameExpression)) {
        authorityId = 'kubeclaw-chart-managed-gateway-secret';
        authorityIds = ['kubeclaw-gateway-secret', 'kubeclaw-litellm-secret', 'kubeclaw-discord-secret'];
        publishedName = '<release full name>-gateway';
      }
      if (sourcePath === 'charts/ops-pod/templates/workload.yaml' && resolvedName.name === 'codex-ops-tailscale') authorityId = 'ops-tailscale-secret';
      if (sourcePath === 'charts/ops-pod/templates/workload.yaml' && resolvedName.name === 'codex-ops-bearer') authorityId = 'ops-bearer-secret';
      facts.push({ kind, name: publishedName, authorityId, authorityIds: authorityIds ?? undefined,
        key: resolvedKey?.value, keys: keys ? [...new Set(keys)].sort() : undefined,
        keyConditions: keyConditions ?? undefined,
        namespace: '<runtime namespace>', optionalState,
        path: sourcePath, line, fieldPath, templateExpression: cleanHelmExpression(nameExpression),
        literalNameResolved: !publishedName.startsWith('<'), authorityResolved: Boolean(helmSecretAuthority(authorityId) || SECRET_AUTHORITIES?.has?.(authorityId)),
        nameSource: publishedName.startsWith('<')
          ? `Runtime-rendered name from ${authorityId === 'kubeclaw-chart-managed-gateway-secret' ? 'helper `kubeclaw.fullname` plus literal suffix `-gateway`' : `template expression \`${cleanHelmExpression(nameExpression)}\``}; semantic authority \`${authorityId}\` remains stable.`
          : `Literal or values-resolved template name; semantic authority \`${authorityId}\`.`,
        resolved: !publishedName.startsWith('<') });
    };
    const conditionStack = [];
    const renderCondition = () => describeHelmConditions(conditionStack);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const conditionStart = /\{\{-?\s*(?:if|with)\s+(.+?)\s*-?\}\}/u.exec(line);
      if (conditionStart) conditionStack.push(cleanHelmExpression(conditionStart[1]));
      if (/^\s*kind:\s*Secret\s*$/u.test(line)) {
        const nameIndex = lines.slice(index + 1, index + 12).findIndex((candidate) => /^\s*name:\s*/u.test(candidate));
        if (nameIndex >= 0) {
          const absoluteNameIndex = index + 1 + nameIndex;
          const nameExpression = lines[absoluteNameIndex].replace(/^\s*name:\s*/u, '');
          const keys = [];
          const keyConditions = {};
          const declarationConditions = [...conditionStack];
          const payloadConditions = [...declarationConditions];
          let dataIndent = null;
          for (let cursor = absoluteNameIndex + 1; cursor < lines.length; cursor += 1) {
            if (/^---\s*$/u.test(lines[cursor]) || (cursor > absoluteNameIndex + 1 && /^\s*kind:\s*/u.test(lines[cursor]))) break;
            const nestedCondition = /\{\{-?\s*(?:if|with)\s+(.+?)\s*-?\}\}/u.exec(lines[cursor]);
            if (nestedCondition) payloadConditions.push(cleanHelmExpression(nestedCondition[1]));
            const dataMatch = /^(\s*)(?:data|stringData):\s*$/u.exec(lines[cursor]);
            if (dataMatch) {
              dataIndent = dataMatch[1].length;
              continue;
            }
            if (dataIndent !== null) {
              const keyMatch = /^(\s*)([A-Za-z0-9_.-]+):\s*/u.exec(lines[cursor]);
              if (keyMatch && keyMatch[1].length > dataIndent) {
                keys.push(keyMatch[2]);
                keyConditions[keyMatch[2]] = describeHelmConditions(payloadConditions);
              }
              else if (lines[cursor].trim() && !/^\s*\{\{/u.test(lines[cursor]) && (lines[cursor].match(/^\s*/u)?.[0].length ?? 0) <= dataIndent) dataIndent = null;
            }
            if (/\{\{-?\s*end\s*-?\}\}/u.test(lines[cursor]) && payloadConditions.length > declarationConditions.length) payloadConditions.pop();
          }
          add('helm-template-declaration', nameExpression, null, absoluteNameIndex + 1,
            `template line ${absoluteNameIndex + 1} Secret declaration`, renderCondition(), keys, keyConditions);
        }
      }
      if (/secretKeyRef\s*:/u.test(line)) {
        const inline = /secretKeyRef\s*:\s*\{\s*name:\s*(.+?)\s*,\s*key:\s*(.+?)\s*\}\s*\}?\s*$/u.exec(line);
        if (inline) add('helm-template-key-reference', inline[1], inline[2], index + 1, `template line ${index + 1} secretKeyRef`, 'required when the enclosing Helm condition renders this environment binding');
        else {
          const window = lines.slice(index + 1, index + 7);
          const nameOffset = window.findIndex((item) => /^\s*name:\s*/u.test(item));
          const keyOffset = window.findIndex((item) => /^\s*key:\s*/u.test(item));
          if (nameOffset >= 0 && keyOffset >= 0) add('helm-template-key-reference', window[nameOffset].replace(/^\s*name:\s*/u, ''), window[keyOffset].replace(/^\s*key:\s*/u, ''), index + 1, `template line ${index + 1} secretKeyRef`, 'required when the enclosing Helm condition renders this environment binding');
        }
      }
      if (/\bsecretRef\s*:/u.test(line) && !/secretKeyRef\s*:/u.test(line)) {
        const inline = /secretRef\s*:\s*\{\s*name:\s*(.+?)\s*(?:,\s*optional:\s*([^}\s]+))?\s*\}/u.exec(line);
        if (inline) add('helm-template-reference', inline[1], null, index + 1, `template line ${index + 1} envFrom Secret`, inline[2] === 'true' ? 'optional' : renderCondition());
        else {
          const window = lines.slice(index + 1, index + 6);
          const nameOffset = window.findIndex((item) => /^\s*name:\s*/u.test(item));
          const optional = window.some((item) => /^\s*optional:\s*true\s*$/u.test(item));
          if (nameOffset >= 0) add('helm-template-reference', window[nameOffset].replace(/^\s*name:\s*/u, ''), null, index + 1,
            `template line ${index + 1} envFrom Secret`, optional ? 'optional' : renderCondition());
        }
      }
      if (/^\s*secretName:\s*/u.test(line) && lines.slice(Math.max(0, index - 3), index).some((item) => /^\s*(?:-\s*)?secret:\s*$/u.test(item))) {
        add('helm-template-volume-reference', line.replace(/^\s*secretName:\s*/u, ''), null, index + 1, `template line ${index + 1} Secret volume`, 'required when the enclosing Helm condition renders this volume');
      }
      if (/^\s*name:\s*/u.test(line) && lines.slice(Math.max(0, index - 2), index).some((item) => /^\s*-\s*secret:\s*$/u.test(item))) {
        add('helm-template-volume-reference', line.replace(/^\s*name:\s*/u, ''), null, index + 1, `template line ${index + 1} projected Secret volume`, 'required when the enclosing Helm condition renders this projected volume');
      }
      if (/imagePullSecrets\s*:\s*\{\{[^\n]*toYaml/u.test(line) || (/^\s*imagePullSecrets:\s*$/u.test(line) && lines.slice(index, index + 3).some((item) => /toYaml/u.test(item)))) {
        for (const selected of values.imagePullSecrets ?? []) {
          if (selected?.name) facts.push({ kind: 'helm-template-image-pull-reference', name: selected.name, authorityId: selected.name,
            namespace: '<runtime namespace>', optionalState: 'required for private image pulls when the chart values keep this list entry', path: sourcePath,
            line: index + 1, fieldPath: `template line ${index + 1} imagePullSecrets`, literalNameResolved: true,
            authorityResolved: Boolean(helmSecretAuthority(selected.name) || SECRET_AUTHORITIES?.has?.(selected.name)),
            nameSource: `Literal name from ${chartName} chart values; semantic authority \`${selected.name}\`.`, resolved: true });
        }
      }
      if (/^\s*-\s*name:\s*/u.test(line) && lines.slice(Math.max(0, index - 3), index).some((item) => /^\s*imagePullSecrets:\s*$/u.test(item))) {
        add('helm-template-image-pull-reference', line.replace(/^\s*-\s*name:\s*/u, ''), null, index + 1,
          `template line ${index + 1} imagePullSecrets`, `${renderCondition()}; required when the selected image is private`);
      }
      if (/\{\{-?\s*end\s*-?\}\}/u.test(line) && conditionStack.length) conditionStack.pop();
    }
  }
  return facts;
}

function shellFunctionScope(text, index) {
  const prefix = text.slice(0, index);
  const declarations = [...prefix.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\{/gmu)];
  const declaration = declarations.at(-1);
  if (!declaration) return { name: '<top-level>', start: 0, end: text.length };
  const start = declaration.index ?? 0;
  const next = /^([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\{/gmu;
  next.lastIndex = index + 1;
  const following = next.exec(text);
  return { name: declaration[1], start, end: following?.index ?? text.length };
}

function resolveShellSecretName(expression, functionName) {
  const normalized = expression.replace(/^['"]|['"]$/gu, '');
  if (!normalized.startsWith('$')) return [{ name: normalized, nameSource: 'literal command argument' }];
  const fixedVariables = {
    '$SECRET_NAME': ['openclaw-shared-secrets', 'script constant `SECRET_NAME`'],
    '$TAILSCALE_OAUTH_SECRET_NAME': ['operator-oauth', 'default of `TAILSCALE_OAUTH_SECRET_NAME`; an operator override changes the effective name'],
    '$PRISM_DATABASE_SECRET_NAME': ['prism-postgresql-auth', 'default of `PRISM_DATABASE_SECRET_NAME`; an operator override changes the effective name'],
    '$PRISM_RUNTIME_SECRET_NAME': ['prism-runtime', 'default of `PRISM_RUNTIME_SECRET_NAME`; an operator override changes the effective name'],
  };
  if (fixedVariables[normalized]) return [{ name: fixedVariables[normalized][0], nameSource: fixedVariables[normalized][1] }];
  if (normalized === '$name' || normalized === '${name}') {
    if (functionName === 'setup_git_deploy_key') return [
      { name: 'git-deploy-key-nova', nameSource: 'literal call argument to `setup_git_deploy_secret`' },
      { name: 'git-deploy-key-buster', nameSource: 'literal call argument to `setup_git_deploy_secret`' },
    ];
    if (functionName === 'setup_pipeline_source_attestation_secret') return [{ name: 'pipeline-test-gate-source-attestation', nameSource: 'literal call argument to `setup_pipeline_source_attestation_secret`' }];
    if (functionName === 'setup_fixture_preflight_secret') return [{ name: 'kubeclaw-fixture-preflight', nameSource: 'literal call argument to `setup_fixture_preflight_secret`' }];
  }
  return [{ name: normalized, nameSource: 'unresolved shell expression', unresolved: true }];
}

function shellSecretFacts(sourcePath, text) {
  const facts = [];
  const lines = text.split('\n');
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const direct = /^\s*(?:(?:printf|openssl)\b[^|]*\|\s*)?kubectl\s+create\s+secret\s+(?:generic|docker-registry|tls)\s+/u.test(line);
    if (direct) {
      const startOffset = offset;
      const commandLines = [line];
      while (/\\\s*$/u.test(commandLines.at(-1)) && index + 1 < lines.length) {
        index += 1;
        commandLines.push(lines[index]);
      }
      const command = commandLines.join('\n');
      const secretType = /kubectl\s+create\s+secret\s+(generic|docker-registry|tls)\s+/u.exec(command)?.[1] ?? 'generic';
      const nameExpression = /kubectl\s+create\s+secret\s+(?:generic|docker-registry|tls)\s+((?:"[^"]+"|'[^']+'|[^\s\\]+))/u.exec(command)?.[1] ?? '<shell command authority unresolved>';
      const scope = shellFunctionScope(text, startOffset);
      const names = resolveShellSecretName(nameExpression, scope.name);
      const keys = secretType === 'docker-registry' ? ['.dockerconfigjson']
        : secretType === 'tls' ? ['tls.crt', 'tls.key']
          : [...command.matchAll(/--from-(?:literal|file)=?["']?([A-Za-z0-9_.-]+)=/gu)].map((match) => match[1]);
      const namespaceExpression = /(?:--namespace|-n)\s+((?:"[^"]+"|'[^']+'|[^\s\\]+))/u.exec(command)?.[1]?.replace(/^['"]|['"]$/gu, '') ?? '<runtime namespace>';
      for (const resolved of names) facts.push({
        kind: resolved.unresolved ? 'unresolved-shell-secret-command' : 'declared-keys-in-script',
        name: resolved.name,
        nameSource: resolved.nameSource,
        keys: [...new Set(keys)].sort(),
        namespace: namespaceExpression,
        optionalState: `conditional command in \`${scope.name}\`; use its documented setup condition`,
        path: sourcePath,
        line: lineAt(text, startOffset),
        commandEvidence: `kubectl create secret ${secretType}`,
        nameEvidence: nameExpression,
        fieldPath: `<shell function ${scope.name}>`,
        resolved: !resolved.unresolved,
        blockerOwner: resolved.unresolved ? `operator script ${sourcePath}` : null,
        closureCondition: resolved.unresolved ? 'Bind the shell name expression to a declared Secret authority or a finite literal call set.' : null,
      });
      offset += commandLines.reduce((sum, item) => sum + item.length + 1, 0);
      continue;
    }
    offset += line.length + 1;
  }

  for (const array of text.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)=\(\s*\n([\s\S]*?)^\s*\)/gmu)) {
    if (!/\bcreate\s+secret\s+generic\b/u.test(array[2])) continue;
    const scope = shellFunctionScope(text, array.index ?? 0);
    const scopeText = text.slice(array.index ?? 0, scope.end);
    const commandMatch = /create\s+secret\s+generic\s+((?:"[^"]+"|'[^']+'|[^\s\\]+))/u.exec(array[2]);
    const nameExpression = commandMatch?.[1] ?? '<shell command authority unresolved>';
    const commandOffset = (array.index ?? 0) + array[0].indexOf(commandMatch?.[0] ?? 'create secret generic');
    const names = resolveShellSecretName(nameExpression, scope.name);
    const keys = [...scopeText.matchAll(/--from-(?:literal|file)=?["']?([A-Za-z0-9_.-]+)=/gu)].map((match) => match[1]);
    const namespaceExpression = /(?:--namespace|-n)\s+((?:"[^"]+"|'[^']+'|[^\s\\)]+))/u.exec(array[2])?.[1]?.replace(/^['"]|['"]$/gu, '') ?? '<runtime namespace>';
    for (const resolved of names) facts.push({
      kind: resolved.unresolved ? 'unresolved-shell-secret-command' : 'declared-keys-in-script',
      name: resolved.name,
      nameSource: resolved.nameSource,
      keys: [...new Set(keys)].sort(),
      namespace: namespaceExpression,
      optionalState: `conditional array command in \`${scope.name}\`; use its documented setup condition`,
      path: sourcePath,
      line: lineAt(text, commandOffset),
      commandEvidence: 'create secret generic',
      nameEvidence: nameExpression,
      fieldPath: `<shell function ${scope.name}>`,
      resolved: !resolved.unresolved,
      blockerOwner: resolved.unresolved ? `operator script ${sourcePath}` : null,
      closureCondition: resolved.unresolved ? 'Bind the shell name expression to a declared Secret authority or a finite literal call set.' : null,
    });
  }
  return facts;
}

const SECRET_AUTHORITIES = new Map(Object.entries({
  'kubeclaw-shared-secrets': { purpose: 'Supplies the gateway, LiteLLM, Discord, and webhook credentials selected by the two stand-alone example values files.', requiredWhen: 'Required only when an operator deliberately deploys `examples/nova-values.yaml` or `examples/buster-values.yaml` without first changing their Secret references.', producer: 'No checked-in setup path creates this legacy example name. The operator must pre-create the Secret with every key selected by the chosen example or replace the references with a maintained Secret name.', rotationOwner: 'the operator who owns the stand-alone example deployment', rotation: 'Create replacement key values in the same Secret, restart every example workload that reads them, verify gateway and integration authentication, and then revoke the old credentials at their external authorities.', failure: 'The example Pods cannot materialize required environment values, or gateway, LiteLLM, Discord, and webhook authentication fails.' },
  'openclaw-shared-secrets': { purpose: 'Authenticates OpenClaw gateways and selected providers, Discord integrations, LiteLLM access, and the Buster v2 handoff.', requiredWhen: 'Required for each enabled consumer represented by its named key.', producer: 'The secret setup helper reuses the target Secret or resolves values from SOPS, source-namespace copies, or interactive input.', rotationOwner: 'platform-security', rotation: 'Replace only the affected keys through the external credential authority, apply the Secret deliberately, restart affected consumers, and verify gateway/provider authentication.', failure: 'Missing or stale keys cause gateway authentication, provider, Discord, LiteLLM, or Buster handoff failures.' },
  'redis-secrets': { purpose: 'Authenticates clients to the platform Redis service.', requiredWhen: 'Required when Redis authentication is enabled for the selected release.', producer: 'The secret setup helper reuses, copies, or generates the password; an external secret authority can pre-create it.', rotationOwner: 'platform-security with platform-operations', rotation: 'Coordinate the Redis server password and every client, then restart and verify clients before retiring the old value.', failure: 'Redis clients report authentication or connection failures; telemetry transport can stop while pipeline job authority remains separate.' },
  'postgresql-secrets': { purpose: 'Holds the PostgreSQL administrator password and the LiteLLM database-role password.', requiredWhen: 'Required when the managed PostgreSQL path is enabled.', producer: 'The secret setup helper reuses, copies, or generates the two passwords.', rotationOwner: 'database-operations with platform-security', rotation: 'Rotate database roles and Secret keys as one maintenance operation, refresh derived connection data, then verify both PostgreSQL and LiteLLM.', failure: 'PostgreSQL chart initialization or LiteLLM database authentication fails.' },
  'litellm-secrets': { purpose: 'Supplies the LiteLLM master key and credential-bearing PostgreSQL connection URL.', requiredWhen: 'Required when LiteLLM is enabled.', producer: 'The secret setup helper derives or collects the values after PostgreSQL credential resolution.', rotationOwner: 'platform-security with database-operations', rotation: 'Rotate the master key and database credential under a planned compatibility boundary; update the Secret and verify LiteLLM before accepting the change.', failure: 'LiteLLM cannot decrypt protected state, authenticate clients, or connect to PostgreSQL.' },
  'google-sa-key': { purpose: 'Supplies the Google service-account JSON file mounted by LiteLLM integrations.', requiredWhen: 'Required only when an enabled provider uses Google service-account authentication.', producer: 'The secret setup helper imports an operator-selected JSON file or reuses an existing Secret.', rotationOwner: 'platform-security', rotation: 'Issue a replacement service-account key, update `credentials.json`, restart the consumer, verify provider access, and revoke the old key.', failure: 'The Google-backed provider rejects requests or the credential file is absent.' },
  'ghcr-secret': { purpose: 'Supplies Docker registry authentication for pulling private GHCR workload images.', requiredWhen: 'Required when any selected image is private and no other node-level pull authority can access it.', producer: 'The secret setup helper creates the Docker registry Secret from operator-provided GHCR credentials or reuses an existing Secret.', rotationOwner: 'source registry security', rotation: 'Issue a replacement least-privilege registry token, replace `.dockerconfigjson`, verify image pulls in each target namespace, and revoke the old token.', failure: 'Pods report `ImagePullBackOff` or `ErrImagePull`.' },
  'git-deploy-key-nova': { purpose: 'Supplies Nova with its SSH private deploy key for the configured Git checkout.', requiredWhen: 'Required when Nova uses the Git clone path.', producer: 'The secret setup helper imports the operator-selected private-key file or reuses an existing Secret.', rotationOwner: 'source-control security', rotation: 'Install the replacement public key at the Git authority, update `id_rsa`, verify a fresh clone, and then revoke the old key.', failure: 'The Nova init container cannot clone its repository.' },
  'git-deploy-key-buster': { purpose: 'Supplies Buster with its SSH private deploy key for the configured Git checkout.', requiredWhen: 'Required when Buster uses the Git clone path.', producer: 'The secret setup helper imports the operator-selected private-key file or reuses an existing Secret.', rotationOwner: 'source-control security', rotation: 'Install the replacement public key at the Git authority, update `id_rsa`, verify a fresh clone, and then revoke the old key.', failure: 'The Buster init container cannot clone its repository.' },
  'github-bundle-reader': { purpose: 'Supplies an optional bearer token for private GitHub release bundle downloads.', requiredWhen: 'Required only when the selected bundle archive is private and anonymous download is unavailable.', producer: 'An external GitHub credential authority must pre-create this Secret; the checked-in helper does not generate its token.', rotationOwner: 'source-control security', rotation: 'Create a least-privilege replacement token, update the Secret key selected by the bundle settings, verify a bundle preflight, and revoke the old token.', failure: 'The code-bundle init container receives an authorization error and the workload remains unready.' },
  'pipeline-test-gate-source-attestation': { purpose: 'Holds the Ed25519 private signing key used by Nova and the public verification key used by Buster for source attestations.', requiredWhen: 'Required when the remote test-gate source-attestation path is enabled.', producer: 'The secret setup helper generates the key pair with OpenSSL or reuses an existing Secret.', rotationOwner: 'pipeline trust owner', rotation: 'Publish the new private and public keys together, restart both signer and verifier, run a signed handoff test, and retain no mixed-key state.', failure: 'Nova cannot sign a source attestation or Buster rejects the attestation signature.' },
  'kubeclaw-fixture-preflight': { purpose: 'Provides isolated proof bytes mounted only by the Kubernetes production preflight fixture.', requiredWhen: 'Required for the Kubernetes and combined production preflight commands.', producer: 'The secret setup helper generates 32 random bytes unless the Secret already exists.', rotationOwner: 'platform-operations', rotation: 'Delete or replace the fixture Secret, rerun setup, and repeat the preflight. No production credential depends on this value.', failure: 'The fixture pod cannot mount the proof key and the production preflight fails.' },
  'operator-oauth': { purpose: 'Authenticates the Tailscale Kubernetes Operator to the tailnet with an OAuth client identity and secret.', requiredWhen: 'Required when the Tailscale operator is enabled.', producer: 'Secret setup or deployment can create it from paired bootstrap values; an external authority can pre-create it.', rotationOwner: 'tailnet security owner', rotation: 'Issue a replacement OAuth client, update both keys together, verify operator authentication and ingress, then revoke the old client.', failure: 'The operator cannot authenticate, and Tailscale-backed ingress or preview URLs are unavailable.' },
  'prism-postgresql-auth': { purpose: 'Supplies Prism PostgreSQL administrator, migrator, runtime, and read-only credentials and connection URLs.', requiredWhen: 'Required for a Prism deployment that uses the bundled PostgreSQL release.', producer: 'The deploy script creates random role passwords and derived URLs when the Secret is absent; an external authority can pre-create the complete key set.', rotationOwner: 'database-operations with platform-security', rotation: 'Rotate each database role with its matching URL, update the complete Secret, restart dependants in a controlled order, and run database acceptance.', failure: 'Prism migration or service startup fails at the missing-key or database-authentication check.' },
  'prism-runtime': { purpose: 'Supplies Prism session, ingress, dispatch, worker, and ingestion authentication secrets.', requiredWhen: 'Required for every Prism deployment.', producer: 'The deploy script generates each value with OpenSSL when the Secret is absent; an external authority can pre-create it.', rotationOwner: 'platform-security', rotation: 'Rotate one trust boundary at a time, restart all producers and consumers for that key, and repeat authenticated request and worker-dispatch checks.', failure: 'Sessions, ingress verification, dispatch, worker communication, or ingestion authentication fails.' },
  'prism-test-postgresql-auth': { purpose: 'Provides an isolated copy of Prism database credentials for the end-to-end lease namespace.', requiredWhen: 'Required only for the leased Prism end-to-end journey.', producer: 'The deploy script generates temporary role passwords and derived URLs before it requests the test lease.', rotationOwner: 'test operator', rotation: 'Recreate the isolated test Secret for each clean journey and remove it with the lease cleanup.', failure: 'The isolated Prism migration or test services cannot connect to PostgreSQL.' },
  'prism-test-runtime': { purpose: 'Provides isolated Prism runtime authentication values for the end-to-end lease namespace.', requiredWhen: 'Required only for the leased Prism end-to-end journey.', producer: 'The deploy script generates fresh temporary values before it requests the test lease.', rotationOwner: 'test operator', rotation: 'Recreate the test Secret for each clean journey and remove it with the lease cleanup.', failure: 'The isolated session, ingress, dispatch, worker, or ingestion checks fail.' },
  'prism-test-ghcr': { purpose: 'Copies image-pull authentication into the isolated Prism end-to-end lease namespace.', requiredWhen: 'Required when the selected Prism test images need GHCR authentication.', producer: 'The deploy script copies `.dockerconfigjson` from the bound source namespace `ghcr-secret` without printing it.', rotationOwner: 'source registry security', rotation: 'Rotate the source GHCR Secret, recreate the test copy, and verify an authenticated image pull.', failure: 'The test runner or Prism workloads report `ImagePullBackOff`.' },
  'nova-archviewer-auth': { purpose: 'Authenticates access to the Nova architecture viewer.', requiredWhen: 'Required when the architecture viewer is enabled with Secret-backed authentication.', producer: 'An external access authority must pre-create the Secret; the checked-in helper does not generate it.', rotationOwner: 'platform-security', rotation: 'Update the external credential, replace the Secret data, restart the viewer, and verify authorized and denied access.', failure: 'The architecture viewer rejects valid users or becomes exposed without the intended authentication gate.' },
  'prometheus-grafana': { purpose: 'Supplies the Grafana administrator credential used by the Prometheus stack.', requiredWhen: 'Required when the selected monitoring values enable Grafana with this existing Secret.', producer: 'An external monitoring credential authority must pre-create it.', rotationOwner: 'monitoring operations', rotation: 'Replace the Grafana credential in the authority and Secret, restart or reconcile Grafana, and verify administrator login.', failure: 'Grafana cannot initialize or administrator login fails.' },
}));

const SECRET_CONSUMER_AUTHORITIES = new Map(Object.entries({
  'kubeclaw-shared-secrets': 'The stand-alone Nova and Buster example profiles pass the selected keys to their rendered gateway, LiteLLM, Discord, and webhook consumers.',
  'openclaw-shared-secrets': 'Nova, Buster, Prism, and OpenClaw containers read only the keys enabled by their rendered environment bindings.',
  'redis-secrets': 'The Redis release reads `redis-password`; Nova, Buster, and platform services use the same effective password through their rendered client bindings.',
  'postgresql-secrets': 'The PostgreSQL release reads both role passwords; secret setup derives the LiteLLM connection authority from the LiteLLM role password.',
  'litellm-secrets': 'The LiteLLM deployment reads `LITELLM_MASTER_KEY` and `DATABASE_URL` from this Secret.',
  'google-sa-key': 'The LiteLLM deployment mounts `credentials.json` for enabled Google-backed providers.',
  'ghcr-secret': 'Kubernetes kubelets use `.dockerconfigjson` through each workload imagePullSecrets reference.',
  'git-deploy-key-nova': 'The Nova repository initialization path mounts `id_rsa` for its authenticated Git checkout.',
  'git-deploy-key-buster': 'The Buster repository initialization path mounts `id_rsa` for its authenticated Git checkout.',
  'github-bundle-reader': 'Nova and Buster code-bundle initialization paths read the selected token key for private GitHub release downloads.',
  'pipeline-test-gate-source-attestation': 'Nova reads `privateKey` to sign source attestations; Buster reads `publicKey` to verify them.',
  'kubeclaw-fixture-preflight': 'The Kubernetes and combined production preflight fixture pod mounts the `proof` key.',
  'operator-oauth': 'The Tailscale Kubernetes Operator reads `client_id` and `client_secret` to authenticate to the tailnet.',
  'prism-postgresql-auth': 'Prism migration, control, studio, ingestion, and read-only paths read the role-specific passwords or URLs selected by their workload bindings.',
  'prism-runtime': 'Prism control, studio, worker, and ingestion workloads read their corresponding session, ingress, dispatch, worker, or ingestion key.',
  'prism-test-postgresql-auth': 'The leased Prism end-to-end migration and service pods read the isolated role-specific passwords and URLs.',
  'prism-test-runtime': 'The leased Prism end-to-end control, studio, worker, and ingestion pods read the isolated runtime keys.',
  'prism-test-ghcr': 'Kubernetes kubelets in the leased Prism test namespace use the copied `.dockerconfigjson` to pull private test images.',
  'nova-archviewer-auth': 'The Nova architecture-viewer authentication boundary reads this Secret before it permits protected viewer access.',
  'prometheus-grafana': 'The Grafana deployment reads its administrator credential through the selected existing-Secret binding.',
}));

function enrichSecretFacts(secrets) {
  const declarations = secrets.filter((fact) => ['declaration', 'declared-keys-in-script', 'helm-template-declaration'].includes(fact.kind));
  const references = secrets.filter((fact) => ['reference', 'key-reference', 'helm-template-key-reference', 'helm-template-reference', 'helm-template-volume-reference', 'helm-template-image-pull-reference'].includes(fact.kind));
  const authoritySet = (fact) => new Set([fact.authorityId ?? fact.name, ...(fact.authorityIds ?? [])]);
  const sharesAuthority = (left, right) => [...authoritySet(left)].some((authority) => authoritySet(right).has(authority));
  for (const fact of secrets) {
    const authority = SECRET_AUTHORITIES.get(fact.authorityId ?? fact.name) ?? (fact.authorityId ? helmSecretAuthority(fact.authorityId) : null);
    if (!authority) {
      fact.semanticStatus = 'secret-authority-blocker';
      fact.blockerOwner ??= sourceOwner(fact.path).component;
      fact.closureCondition ??= `Define the purpose, condition, producer, consumer, rotation owner and method, and failure symptom for Secret ${fact.name}.`;
      continue;
    }
    fact.semanticStatus = 'authored-secret-authority';
    fact.purpose = authority.purpose;
    fact.requiredWhen = authority.requiredWhen;
    fact.producer = authority.producer;
    fact.rotationOwner = authority.rotationOwner;
    fact.rotation = authority.rotation;
    fact.failure = authority.failure;
    fact.consumerAuthority = SECRET_CONSUMER_AUTHORITIES.get(fact.authorityId ?? fact.name) ?? authority.consumerAuthority;
    assert(fact.consumerAuthority, `Secret ${fact.name} lacks an explicit consumer authority`);
    fact.namespaceMeaning = fact.namespace === '$NAMESPACE' ? 'the effective primary application namespace'
      : fact.namespace === '$PRISM_NAMESPACE' ? 'the effective Prism namespace'
        : fact.namespace === '$TAILSCALE_OPERATOR_NAMESPACE' ? 'the effective Tailscale operator namespace'
          : fact.namespace === '<runtime namespace>' ? 'the namespace of the rendered Helm release or Kubernetes resource'
            : `the literal or rendered namespace \`${fact.namespace}\``;
    fact.producers = declarations.filter((candidate) => sharesAuthority(candidate, fact)).map((candidate) => ({ path: candidate.path, line: candidate.line ?? null, keys: candidate.keys ?? [] }));
    fact.consumers = references.filter((candidate) => sharesAuthority(candidate, fact)).map((candidate) => ({ path: candidate.path, line: candidate.line ?? null, fieldPath: candidate.fieldPath, key: candidate.key ?? null }));
    fact.consumerStatus = fact.consumerAuthority;
    fact.blockerOwner = null;
    fact.closureCondition = null;
  }
  return secrets;
}

function buildRuntimeInputInventory(yamlInventory) {
  const environment = [];
  const cliFlags = [];
  const derivedValues = [];
  for (const sourcePath of runtimeTextSources()) {
    const text = read(sourcePath);
    environment.push(...environmentOccurrences(sourcePath, text));
    cliFlags.push(...ownedCliFlags(sourcePath, text));
    const shellSource = path.extname(sourcePath) === '.sh' || /^#![^\n]*\b(?:ba|da|k|z)?sh\b/u.test(text);
    if (shellSource) {
      derivedValues.push(...derivedAssignments(sourcePath, text));
    }
  }
  const groupedEnvironment = new Map();
  for (const occurrence of environment) {
    const entry = groupedEnvironment.get(occurrence.name) ?? {
      name: occurrence.name,
      sensitive: false,
      sensitivityClass: 'ordinary-value',
      sensitivityReasons: [],
      sourceOwners: [],
      runtimeOwner: 'unknown',
      consumers: [],
      precedence: [],
    };
    const publicSecretClass = /^(?:DISABLE_IMAGE_PULL_SECRETS|KUBECLAW_RUN_SECRET_SETUP|KUBECLAW_SECRET_SETUP_MODE|KUBECLAW_SECRETS_OVERWRITE|OPS_COPY_PULL_SECRET)$/u.test(occurrence.name) ? 'secret-setup-control'
      : occurrence.name === 'BUSTER_SECRET_ROLE_NAME' ? 'rbac-role-reference'
        : /_AUTH_SECRET_KEY$/u.test(occurrence.name) ? 'secret-key-name-reference'
          : /(?:_AUTH_SECRET|_PREFLIGHT_SECRET|_SECRET_NAME)$/u.test(occurrence.name) ? 'secret-object-name-reference'
            : /(?:ALLOWED|SOURCE).*SECRETS?$/u.test(occurrence.name) ? 'secret-object-name-list'
              : /SECRET.*(?:NAMESPACE|REF)$/u.test(occurrence.name) ? 'secret-authority-reference'
                : null;
    const authorityReference = /(?:CREDENTIAL_AUTHORITY_REF)$/u.test(occurrence.name);
    const publicVerificationMaterial = /(?:_VERIFY_KEY|_PUBLIC_KEY)$/u.test(occurrence.name);
    const publicCertificatePath = /(?:_TLS_CERT|_CA_FILE)$/u.test(occurrence.name);
    const identityReference = /(?:_CLIENT_ID|_USER|_USERNAME|_ACCOUNT|_PRODUCER|_AUDIENCE|_ISSUER)$/u.test(occurrence.name)
      || ['PGUSER', 'REDIS_USERNAME'].includes(occurrence.name);
    if (publicVerificationMaterial) {
      entry.sensitivityClass = 'public-verification-material';
      entry.sensitivityReasons.push('public verification material; it cannot create signatures or credentials');
    } else if (publicCertificatePath) {
      entry.sensitivityClass = 'public-verification-file-path';
      entry.sensitivityReasons.push('path to public certificate or trust material; it does not contain a private key');
    } else if (identityReference) {
      entry.sensitivityClass = 'identity-reference';
      entry.sensitivityReasons.push('identity or routing selector; it is not authentication proof');
    } else if (occurrence.secretProvenance) {
      entry.sensitivityClass = 'secret-value';
      entry.sensitivityReasons.push('Kubernetes valueFrom/secretKeyRef provenance');
    } else if (publicSecretClass) {
      entry.sensitivityClass = publicSecretClass;
      entry.sensitivityReasons.push('public control or authority identifier; it does not carry Secret payload data');
    } else if (authorityReference) {
      entry.sensitivityClass = 'public-authority-reference';
      entry.sensitivityReasons.push('public authority reference; it does not carry credential bytes');
    } else if (occurrence.filePathProvenance) {
      if (entry.sensitivityClass !== 'secret-value') entry.sensitivityClass = 'secret-file-path';
      entry.sensitivityReasons.push('literal path to key/certificate material; file contents are sensitive');
    } else if (/_FILE$/u.test(occurrence.name) && SENSITIVE_ENV_NAME.test(occurrence.name.replace(/_FILE$/u, ''))) {
      if (entry.sensitivityClass !== 'secret-value') entry.sensitivityClass = 'secret-file-path';
      entry.sensitivityReasons.push('path to sensitive material; the path is publishable but file contents are not');
    } else if (SENSITIVE_ENV_NAME.test(occurrence.name)) {
      entry.sensitivityClass = 'secret-value';
      entry.sensitivityReasons.push('sensitive environment-variable name');
    }
    entry.sensitive = entry.sensitivityClass === 'secret-value';
    entry.consumers.push({ path: occurrence.path, line: occurrence.line, access: occurrence.kind });
    const owner = sourceOwner(occurrence.path);
    if (!entry.sourceOwners.some((item) => item.component === owner.component && item.evidence === owner.evidence)) entry.sourceOwners.push(owner);
    if (occurrence.kind === 'shell-parameter') {
      entry.precedence.push({
        order: 1,
        source: 'process environment',
        condition: occurrence.defaultOperator?.includes(':') ? 'set and non-empty' : 'set',
        evidence: `${occurrence.path}:${occurrence.line}`,
      });
      if (occurrence.sourceValueRole === 'default') {
        entry.precedence.push({ order: 2, source: 'source default', condition: `parameter operator ${occurrence.defaultOperator}`, value: occurrence.default, evidence: `${occurrence.path}:${occurrence.line}` });
      } else if (occurrence.sourceValueRole === 'required-guard') {
        entry.precedence.push({ order: 2, source: 'required-value guard', condition: `parameter operator ${occurrence.defaultOperator}`, value: occurrence.default, evidence: `${occurrence.path}:${occurrence.line}` });
      } else if (occurrence.sourceValueRole === 'alternate') {
        entry.precedence.push({ order: 2, source: 'alternate expansion value', condition: `parameter operator ${occurrence.defaultOperator}`, value: occurrence.default, evidence: `${occurrence.path}:${occurrence.line}` });
      }
    } else if (occurrence.kind === 'go-process-env' || occurrence.kind === 'go-process-env-helper') {
      entry.precedence.push({
        order: 1,
        source: 'process environment',
        condition: occurrence.kind === 'go-process-env-helper' ? 'trimmed value is non-empty' : 'reader is called',
        evidence: `${occurrence.path}:${occurrence.line}`,
      });
      if (occurrence.sourceValueRole === 'default') {
        entry.precedence.push({
          order: 2,
          source: 'Go helper fallback',
          condition: 'environment value is absent, empty, or whitespace',
          value: occurrence.default,
          evidence: `${occurrence.path}:${occurrence.line}`,
        });
      }
    }
    groupedEnvironment.set(occurrence.name, entry);
  }
  for (const entry of groupedEnvironment.values()) {
    entry.sensitivityReasons = [...new Set(entry.sensitivityReasons)].sort();
    entry.consumers = [...new Map(entry.consumers.map((consumer) => [`${consumer.path}:${consumer.line}:${consumer.access}`, consumer])).values()]
      .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
    entry.precedence = [...new Map(entry.precedence.map((step) => [JSON.stringify(step), step])).values()];
    if (!entry.precedence.length) entry.precedence = [{ order: 1, source: 'process environment or injected Kubernetes env', condition: 'no source default was found', evidence: 'see consumers' }];
    entry.runtimeOwner = [...new Set(entry.sourceOwners.map((owner) => owner.component))].join('; ');
    entry.required = entry.precedence.some((step) => /\?|required/iu.test(step.condition)) ? 'required' : 'conditional-or-external';
    const accessKinds = new Set(entry.consumers.map((consumer) => consumer.access));
    const consumerPaths = entry.consumers.map((consumer) => consumer.path);
    const onlyInjection = [...accessKinds].every((access) => access === 'kubernetes-env');
    entry.producers = entry.consumers.filter((consumer) => consumer.access === 'kubernetes-env');
    entry.readers = entry.consumers.filter((consumer) => consumer.access !== 'kubernetes-env');
    entry.direction = onlyInjection ? 'injection-only; receiving runtime reader is external or unproved'
      : entry.producers.length ? 'injected by checked-in manifest and read by checked-in runtime source'
        : 'read as process input; producer is the operator, CI host, or external runtime';
    const ciContext = /^(?:CI(?:$|_)|GITHUB_|GITLAB_|BUILDKITE_|JENKINS_|RUNNER_)/u.test(entry.name);
    const externalStandard = /^(?:HOME|PATH|PWD|TMPDIR|XDG_CACHE_HOME|XDG_RUNTIME_DIR|NODE_PATH|NODE_OPTIONS|KUBECONFIG|GOOGLE_APPLICATION_CREDENTIALS)$/u.test(entry.name);
    const maintainerOnly = consumerPaths.every((sourcePath) => /^(?:scripts\/(?:docs-|check-|test-|verify-|generate-)|packaging\/)/u.test(sourcePath));
    const operatorAuthored = entry.producers.length === 0 && consumerPaths.some(operatorEnvironmentSource);
    const directOperatorReader = consumerPaths.some(operatorEnvironmentSource);
    entry.surface = directOperatorReader ? 'operator-authored-input'
      : entry.producers.length ? (onlyInjection ? 'kubernetes-injected-transport' : 'checked-in-injected-transport')
        : ciContext ? 'ci-build-host-input'
        : externalStandard ? 'external-runtime-standard'
          : maintainerOnly ? 'maintainer-verification-input'
            : operatorAuthored ? 'operator-authored-input' : 'runtime-process-boundary';
    entry.setDirectly = entry.surface === 'operator-authored-input';
    if (entry.setDirectly && entry.producers.length) entry.direction = 'read directly by an operator command and also injected at separate checked-in runtime boundaries';
    if (onlyInjection) entry.runtimeOwner = 'external receiving image/runtime; no checked-in reader proved';
    entry.acceptedForm = /(?:^|_)(?:ENABLED|DISABLED|ALLOW|REQUIRE|STRICT|DRY_RUN|OVERWRITE|CREATE|COPY)(?:_|$)/u.test(entry.name)
      ? '`true` or `false` unless the linked consumer states a narrower form'
      : /(?:^|_)(?:PORT|NODE_PORT)$/u.test(entry.name) ? 'integer TCP/UDP port accepted by the linked consumer'
        : /(?:TIMEOUT|INTERVAL|DURATION|TTL|POLL_MS|_MS$|_SECONDS$|_MINUTES$)/u.test(entry.name) ? 'non-negative duration or count in the unit named by the variable'
          : /(?:_URL|_URI|_ENDPOINT|_ORIGIN)$/u.test(entry.name) ? 'absolute URL, URI, endpoint, or origin accepted by the linked consumer'
            : /(?:_JSON)$/u.test(entry.name) ? 'valid JSON with the shape enforced by the linked consumer'
              : /(?:_FILE|_DIR|_ROOT|_PATH)$/u.test(entry.name) ? 'filesystem path available to the linked process'
                : 'string accepted by the linked consumer; use its source validation and listed default';
    if (entry.name === 'KUBECLAW_RUN_SECRET_SETUP') entry.acceptedForm = '`auto`, `true`, or `false`';
    if (entry.name === 'KUBECLAW_SECRET_SETUP_MODE') entry.acceptedForm = '`auto`, `interactive`, or `noninteractive`';
    if (['KUBECLAW_SECRETS_OVERWRITE', 'DISABLE_IMAGE_PULL_SECRETS', 'OPS_COPY_PULL_SECRET'].includes(entry.name)) entry.acceptedForm = '`true` or `false`';
    entry.changeImpact = 'Changes the behavior of each listed runtime consumer when that process receives the variable.';
    entry.failureMeaning = entry.required === 'required' ? 'The consumer stops with its source-defined missing-value error.' : 'An absent value selects the listed default or leaves behavior to the external runtime binding.';
    const meaning = environmentMeaning(entry.name, entry.consumers, entry.surface);
    entry.meaningStatus = meaning.status;
    entry.meaning = meaning.text;
    entry.meaningEvidence = meaning.evidence;
    entry.blockerOwner = meaning.blockerOwner;
    entry.closureCondition = meaning.closureCondition;
    if (meaning.contract) {
      entry.acceptedForm = meaning.contract.acceptedForm;
      entry.required = meaning.contract.required;
      entry.defaultBehavior = meaning.contract.defaultBehavior;
      entry.emptyBehavior = meaning.contract.emptyBehavior;
      entry.invalidBehavior = meaning.contract.invalidBehavior;
      entry.precedenceExplanation = meaning.contract.precedence;
      entry.changeImpact = meaning.contract.impact;
      entry.failureMeaning = meaning.contract.failure;
      if (meaning.contract.precedenceSteps) entry.precedence = meaning.contract.precedenceSteps;
    } else {
      entry.defaultBehavior = 'Use the producer or external authority named by the surface classification.';
      entry.emptyBehavior = 'The owning producer or runtime defines empty-value behavior.';
      entry.invalidBehavior = 'The owning producer or runtime reports invalid input; this inventory does not invent that external contract.';
      entry.precedenceExplanation = 'Use the listed producer or owning interface. Direct operator setting is not supported from this reference.';
    }
    entry.consumerContracts = entry.readers.flatMap((consumer) => {
      const contract = ENVIRONMENT_CONSUMER_CONTRACTS.get(`${entry.name}:${consumer.path}`);
      return contract ? [{ path: consumer.path, line: consumer.line, access: consumer.access, ...contract }] : [];
    }).filter((contract, index, contracts) => contracts.findIndex((candidate) => candidate.path === contract.path) === index);
    const distinctConsumerContracts = new Set(entry.consumerContracts.map((contract) => JSON.stringify({
      acceptedForm: contract.acceptedForm,
      defaultBehavior: contract.defaultBehavior,
      emptyBehavior: contract.emptyBehavior,
      invalidBehavior: contract.invalidBehavior,
      required: contract.required,
      purpose: contract.purpose,
      failure: contract.failure,
    })));
    if (distinctConsumerContracts.size > 1) {
      entry.meaningStatus = 'authored-consumer-specific-contracts';
      entry.meaning = `The meaning of ${entry.name} differs by receiving process. Use the contract attached to the exact consumer source.`;
      entry.meaningEvidence = `${entry.consumerContracts[0].path}:${entry.consumerContracts[0].line}`;
      entry.acceptedForm = 'Varies by receiving process; see the consumer-specific contracts.';
      entry.required = 'varies by receiving process';
      entry.defaultBehavior = 'Varies by receiving process; no merged default is valid.';
      entry.emptyBehavior = 'Varies by receiving process; an empty string can be rejected, retained, or converted to a value.';
      entry.invalidBehavior = 'Varies by receiving process; use the exact reader validation below.';
      entry.precedenceExplanation = 'Each receiving process captures and interprets its own environment. No consumer contract overrides another consumer.';
      entry.changeImpact = 'Changes only the processes that receive the variable, according to each listed consumer contract.';
      entry.failureMeaning = 'Use the exact consumer failure below; a single merged symptom would be incorrect.';
      entry.blockerOwner = null;
      entry.closureCondition = null;
    } else if (entry.consumerContracts.length === 1 && !meaning.contract
      && [...new Set(entry.readers.map((reader) => reader.path))].every((readerPath) => entry.consumerContracts.some((contract) => contract.path === readerPath))) {
      const [contract] = entry.consumerContracts;
      entry.meaningStatus = 'authored-consumer-specific-contract';
      entry.meaning = contract.purpose;
      entry.meaningEvidence = `${contract.path}:${contract.line}`;
      entry.acceptedForm = contract.acceptedForm;
      entry.required = contract.required;
      entry.defaultBehavior = contract.defaultBehavior;
      entry.emptyBehavior = contract.emptyBehavior;
      entry.invalidBehavior = contract.invalidBehavior;
      entry.precedenceExplanation = contract.precedence;
      entry.changeImpact = contract.impact;
      entry.failureMeaning = contract.failure;
      if (contract.precedenceSteps) entry.precedence = contract.precedenceSteps;
      entry.blockerOwner = null;
      entry.closureCondition = null;
    }
    if (entry.name === 'BUNDLE_TMP_ROOT') {
      entry.producers = [{ path: 'charts/kubeclaw/templates/deployment.yaml', line: 944, access: 'internal-shell-assignment', value: '/tmp/code-bundle' }];
      entry.direction = 'internal shell assignment passed to one child Node process; not operator-authored or externally configurable';
      entry.meaningEvidence = 'charts/kubeclaw/templates/deployment.yaml:944';
      entry.precedence = [
        { order: 1, source: 'fixed internal shell assignment', condition: 'code-bundle initialization is enabled', value: '/tmp/code-bundle', evidence: 'charts/kubeclaw/templates/deployment.yaml:944' },
        { order: 2, source: 'command-local child-process export', condition: 'the validator Node process starts', evidence: 'charts/kubeclaw/templates/deployment.yaml:1023' },
      ];
    }
  }
  assert.equal([...groupedEnvironment.values()].filter((entry) => /blocker/u.test(entry.meaningStatus) && (!entry.blockerOwner || !entry.closureCondition)).length, 0,
    'quality gate: every unresolved environment meaning needs an owner and concrete closure condition');
  const environmentContractGaps = [...groupedEnvironment.values()].filter((entry) => entry.surface === 'operator-authored-input' && /blocker/u.test(entry.meaningStatus));
  if (!allowSemanticGaps && environmentContractGaps.length) {
    throw new Error(`CONFIG_SEMANTIC_GAP: operator environment inputs lack qualified semantic authority: ${environmentContractGaps.slice(0, 20).map((entry) => entry.name).join(', ')}. Expected authority: owning reader plus purpose, accepted form, default and empty behavior, precedence, impact, and failure symptom.`);
  }
  const controllerWrapperInputs = [
    'KUBECLAW_NAMESPACE', 'KUBERNETES_SERVICE_PORT', 'BUSTER_LEASE_API_GROUP', 'BUSTER_LEASE_API_VERSION',
    'BUSTER_ALLOWED_NAMESPACE_PREFIXES', 'BUSTER_DEFAULT_TTL_SECONDS', 'BUSTER_MAX_TTL_SECONDS',
    'BUSTER_CONTROLLER_SERVICE_ACCOUNT', 'BUSTER_SECRET_ROLE_NAME', 'BUSTER_DEPLOYER_ROLE_NAME',
    'BUSTER_TESTER_ROLE_NAME', 'BUSTER_ALLOWED_ACCESS_JSON',
  ];
  for (const name of controllerWrapperInputs) {
    const entry = groupedEnvironment.get(name);
    assert(entry?.readers.some((reader) => reader.path === busterControllerSource && reader.access === 'go-process-env-helper'),
      `quality gate: ${name} lost its Buster controller helper-call reader`);
  }
  for (const name of [
    'KUBECLAW_NAMESPACE', 'BUSTER_ALLOWED_NAMESPACE_PREFIXES', 'BUSTER_DEFAULT_TTL_SECONDS',
    'BUSTER_MAX_TTL_SECONDS', 'BUSTER_CONTROLLER_SERVICE_ACCOUNT', 'BUSTER_SECRET_ROLE_NAME',
    'BUSTER_DEPLOYER_ROLE_NAME', 'BUSTER_TESTER_ROLE_NAME', 'BUSTER_ALLOWED_ACCESS_JSON',
  ]) {
    const entry = groupedEnvironment.get(name);
    assert.equal(entry.surface, 'checked-in-injected-transport', `quality gate: ${name} is not a proved injected runtime input`);
    assert.equal(entry.meaningStatus, 'authored-source-backed-contract', `quality gate: ${name} lacks its exact controller contract`);
    assert.doesNotMatch(`${entry.direction} ${entry.meaning}`, /external or unproved|external authority/iu,
      `quality gate: ${name} regressed to an unproved external boundary`);
  }
  for (const [sourcePath, names] of [
    [busterReadinessSource, Object.keys(busterReadinessContracts)],
    [busterProductSource, Object.keys(busterProductContracts)],
  ]) {
    for (const name of names) {
      const entry = groupedEnvironment.get(name);
      assert(entry, `quality gate: ${name} is missing from the runtime inventory`);
      assert.equal(entry.surface, 'checked-in-injected-transport',
        `quality gate: ${name} is not bound to its checked-in chart producer`);
      assert(entry.readers.some((reader) => reader.path === sourcePath),
        `quality gate: ${name} lost its exact runtime reader`);
      const contract = entry.consumerContracts.find((candidate) => candidate.path === sourcePath);
      assert(contract, `quality gate: ${name} lacks its exact consumer contract`);
      for (const field of ['purpose', 'acceptedForm', 'defaultBehavior', 'emptyBehavior', 'invalidBehavior', 'precedence', 'impact', 'failure']) {
        assert.equal(typeof contract[field], 'string', `quality gate: ${name} contract lacks ${field}`);
        assert(contract[field].trim(), `quality gate: ${name} contract has an empty ${field}`);
      }
      assert(contract.evidence?.length, `quality gate: ${name} contract lacks downstream implementation evidence`);
      assert.equal(entry.meaningStatus, 'authored-consumer-specific-contract',
        `quality gate: ${name} still publishes a generic transport description`);
      assert.doesNotMatch(`${entry.meaning} ${entry.defaultBehavior} ${entry.failureMeaning}`,
        /owning producer or runtime|external authority/iu,
        `quality gate: ${name} regressed to generic external-authority wording`);
    }
  }
  for (const name of Object.keys(busterRuntimeContracts)) {
    const entry = groupedEnvironment.get(name);
    assert(entry?.readers.some((reader) => reader.path === busterRuntimeSource),
      `quality gate: ${name} lost its Buster runtime entrypoint reader`);
    const contract = entry.consumerContracts.find((candidate) => candidate.path === busterRuntimeSource);
    assert(contract, `quality gate: ${name} lacks its Buster runtime entrypoint contract`);
    for (const field of ['purpose', 'acceptedForm', 'defaultBehavior', 'emptyBehavior', 'invalidBehavior', 'precedence', 'impact', 'failure']) {
      assert.equal(typeof contract[field], 'string', `quality gate: ${name} runtime contract lacks ${field}`);
      assert(contract[field].trim(), `quality gate: ${name} runtime contract has an empty ${field}`);
    }
    assert(contract.evidence?.length, `quality gate: ${name} runtime contract lacks downstream implementation evidence`);
    for (const authority of contract.evidence) {
      assert(exists(authority.path), `quality gate: ${name} evidence source is missing: ${authority.path}`);
      const sourceLines = read(authority.path).split('\n').length;
      assert(Number.isInteger(authority.line) && Number.isInteger(authority.endLine)
        && authority.line > 0 && authority.endLine >= authority.line && authority.endLine <= sourceLines
        && authority.endLine - authority.line + 1 <= 60,
      `quality gate: ${name} has an invalid evidence range at ${authority.path}`);
    }
    assert.match(entry.meaningStatus, /^authored-consumer-specific-contracts?$/u,
      `quality gate: ${name} still publishes a generic Buster runtime description`);
  }
  for (const entry of groupedEnvironment.values()) {
    if (!entry.readers.some((reader) => reader.path === busterRuntimeSource) || ['HOME', 'XDG_RUNTIME_DIR'].includes(entry.name)) continue;
    assert(entry.consumerContracts.some((contract) => contract.path === busterRuntimeSource),
      `quality gate: ${entry.name} is read by the Buster runtime entrypoint but lacks an exact consumer contract`);
  }
  const requireSensitivity = (name, expectedClass) => {
    const entry = groupedEnvironment.get(name);
    assert(entry, `quality gate: representative environment variable is missing: ${name}`);
    assert.equal(entry.sensitivityClass, expectedClass, `quality gate: ${name} sensitivity must be ${expectedClass}`);
  };
  if (!allowSensitivityFixture) {
    requireSensitivity('TS_AUTHKEY', 'secret-value');
    requireSensitivity('LITELLM_MASTER_KEY', 'secret-value');
    requireSensitivity('LITELLM_SALT_KEY', 'secret-value');
    requireSensitivity('OPS_TAILSCALE_AUTHKEY_FILE', 'secret-file-path');
    requireSensitivity('BUSTER_READY_TLS_KEY', 'secret-file-path');
    requireSensitivity('GOOGLE_APPLICATION_CREDENTIALS', 'secret-file-path');
    requireSensitivity('BUSTER_PRODUCT_VERIFY_KEY', 'public-verification-material');
    requireSensitivity('BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY', 'public-verification-material');
    requireSensitivity('BUSTER_READY_TLS_CERT', 'public-verification-file-path');
    requireSensitivity('TAILSCALE_OAUTH_CLIENT_ID', 'identity-reference');
    requireSensitivity('PRISM_E2E_USER', 'identity-reference');
    requireSensitivity('PGUSER', 'identity-reference');
    requireSensitivity('REDIS_USERNAME', 'identity-reference');
    for (const controlName of ['DISABLE_IMAGE_PULL_SECRETS', 'KUBECLAW_RUN_SECRET_SETUP', 'KUBECLAW_SECRET_SETUP_MODE', 'KUBECLAW_SECRETS_OVERWRITE', 'OPS_COPY_PULL_SECRET']) if (groupedEnvironment.has(controlName)) requireSensitivity(controlName, 'secret-setup-control');
    if (groupedEnvironment.has('BUSTER_SECRET_ROLE_NAME')) requireSensitivity('BUSTER_SECRET_ROLE_NAME', 'rbac-role-reference');
    for (const keyName of ['BUSTER_CODE_BUNDLE_AUTH_SECRET_KEY', 'NOVA_CODE_BUNDLE_AUTH_SECRET_KEY', 'PRISM_CODE_BUNDLE_AUTH_SECRET_KEY']) if (groupedEnvironment.has(keyName)) requireSensitivity(keyName, 'secret-key-name-reference');
    for (const objectName of ['BUSTER_CODE_BUNDLE_AUTH_SECRET', 'NOVA_CODE_BUNDLE_AUTH_SECRET', 'PRISM_CODE_BUNDLE_AUTH_SECRET', 'KUBECLAW_KUBERNETES_PREFLIGHT_SECRET']) if (groupedEnvironment.has(objectName)) requireSensitivity(objectName, 'secret-object-name-reference');
    if (groupedEnvironment.has('BUSTER_ALLOWED_SOURCE_SECRETS')) requireSensitivity('BUSTER_ALLOWED_SOURCE_SECRETS', 'secret-object-name-list');
    if (groupedEnvironment.has('BACKUP_CREDENTIAL_AUTHORITY_REF')) requireSensitivity('BACKUP_CREDENTIAL_AUTHORITY_REF', 'public-authority-reference');
    for (const ordinaryName of ['CLUSTER_ID', 'KUBECLAW_CAPABILITY_PROVIDERS', 'LITELLM_URL', 'NODE_PATH', 'OPENCLAW_GATEWAY_URL', 'REDIS_PORT', 'STORE_MODEL_IN_DB', 'SWARM_CONFIG']) {
      if (groupedEnvironment.has(ordinaryName)) requireSensitivity(ordinaryName, 'ordinary-value');
    }
  }
  for (const representative of ['BACKUP_EXPECTED_SERVER_VERSION', 'REDIS_SERVER', 'REDIS_CLI', 'REDIS_CHECK_RDB', 'PIPELINE_LIGHT_WATCHDOG_POLL_SECONDS']) {
    const entry = groupedEnvironment.get(representative);
    if (!entry) continue;
    assert.equal(entry.surface, 'operator-authored-input', `quality gate: ${representative} must remain an operator-owned command input`);
    assert.equal(entry.setDirectly, true, `quality gate: ${representative} must remain directly settable at its owning command`);
  }
  for (const [name, requiredPaths] of Object.entries({
    DATABASE_URL: ['skills/prism/server/control-config.ts', 'skills/prism/server/migrate.ts', 'skills/prism/server/worker-config.ts'],
    PRISM_WORKER_SECRET: ['skills/prism/server/control-config.ts', 'skills/prism/server/worker-config.ts', 'skills/prism/config/native-worker.ts'],
    ARTIFACT_ROOT: ['skills/prism/server/control-config.ts', 'charts/prism/files/prism-backup.sh'],
    PORT: ['skills/prism/server/studio-config.ts', 'skills/prism/server/control-config.ts', 'skills/prism/server/worker-config.ts', 'skills/prism/server/ingestion.ts', 'skills/prism/server/agent-bridge.mjs', 'tools/ops-mcp/src/config.mjs'],
  })) {
    const entry = groupedEnvironment.get(name);
    assert(entry, `quality gate: consumer-specific variable is missing: ${name}`);
    for (const sourcePath of requiredPaths) assert(entry.consumerContracts.some((contract) => contract.path === sourcePath),
      `quality gate: ${name} lacks its exact consumer contract for ${sourcePath}`);
    assert.equal(entry.meaningStatus, 'authored-consumer-specific-contracts', `quality gate: ${name} must not publish one merged behavior`);
  }
  for (const internalName of ['BLUE', 'AGENT_CAPITALIZED']) {
    assert.equal(groupedEnvironment.has(internalName), false, `quality gate: internal shell local leaked into operator environment inventory: ${internalName}`);
  }
  if (groupedEnvironment.has('BUNDLE_TMP_ROOT')) {
    const bundleTemporaryRoot = groupedEnvironment.get('BUNDLE_TMP_ROOT');
    assert.equal(bundleTemporaryRoot.surface, 'runtime-process-boundary',
      'quality gate: an internal shell-to-Node environment edge was misclassified as an operator-authored input');
    assert.equal(bundleTemporaryRoot.setDirectly, false,
      'quality gate: an internal shell-to-Node environment edge became directly settable');
    assert.deepEqual(bundleTemporaryRoot.producers, [{ path: 'charts/kubeclaw/templates/deployment.yaml', line: 944, access: 'internal-shell-assignment', value: '/tmp/code-bundle' }],
      'quality gate: BUNDLE_TMP_ROOT lost its fixed internal producer');
    assert(bundleTemporaryRoot.precedence.some((step) => step.evidence === 'charts/kubeclaw/templates/deployment.yaml:1023'),
      'quality gate: BUNDLE_TMP_ROOT lost its command-local shell-to-Node export');
    assert(bundleTemporaryRoot.readers.some((reader) => reader.path === 'charts/kubeclaw/templates/deployment.yaml'
      && reader.line === 1027 && reader.access === 'embedded-node-process-env'),
    'quality gate: BUNDLE_TMP_ROOT lost its exact embedded Node reader');
    assert.equal(bundleTemporaryRoot.acceptedForm, 'The internal fixed path `/tmp/code-bundle`; this is not an operator or external runtime input.',
      'quality gate: BUNDLE_TMP_ROOT was presented as externally configurable');
  }
  for (const computedName of ['KUBECLAW_HEALTH_CHECK_GATEWAY', 'KUBECLAW_CODE_BUNDLE_ENABLED']) {
    const entry = groupedEnvironment.get(computedName);
    assert(entry?.consumers.some((consumer) => consumer.path === 'charts/kubeclaw/templates/deployment.yaml'
      && consumer.access === 'embedded-node-process-env-computed-helper'),
    `quality gate: embedded YAML JavaScript computed reader is missing for ${computedName}`);
  }
  const secrets = [];
  for (const file of yamlInventory.files) {
    const text = read(file.path);
    const lineCounter = new YAML.LineCounter();
    const documents = YAML.parseAllDocuments(text, { prettyErrors: false, lineCounter });
    documents.forEach((document, index) => {
      if (!document.errors.length) secrets.push(...secretFactsFromYaml(file.path, document.toJS(), index, document, lineCounter));
    });
  }
  secrets.push(...helmTemplateSecretFacts());
  for (const sourcePath of ['my-values/setup-secrets.sh', 'scripts/deploy.sh']) {
    if (!exists(sourcePath)) continue;
    const text = read(sourcePath);
    secrets.push(...shellSecretFacts(sourcePath, text));
  }
  enrichSecretFacts(secrets);
  const shellSecretFactsForEvidence = secrets.filter((fact) => fact.kind === 'declared-keys-in-script');
  for (const fact of shellSecretFactsForEvidence) {
    const evidenceLine = read(fact.path).split('\n')[fact.line - 1] ?? '';
    assert(evidenceLine.trim(), `${fact.path}:${fact.line} ${fact.fieldPath}: shell Secret evidence line is blank`);
    assert(fact.commandEvidence && evidenceLine.includes(fact.commandEvidence),
      `${fact.path}:${fact.line} ${fact.fieldPath}: shell Secret evidence line does not contain command evidence ${fact.commandEvidence}`);
    assert(fact.nameEvidence && evidenceLine.includes(fact.nameEvidence),
      `${fact.path}:${fact.line} ${fact.fieldPath}: shell Secret evidence line does not contain name evidence ${fact.nameEvidence}`);
  }
  const yamlSecretFacts = secrets.filter((fact) => ['declaration', 'reference', 'key-reference'].includes(fact.kind));
  for (const fact of yamlSecretFacts) {
    assert(Number.isInteger(fact.line) && fact.line > 0, `${fact.path} ${fact.fieldPath}: YAML Secret fact lacks an exact source line`);
    const evidenceLine = read(fact.path).split('\n')[fact.line - 1] ?? '';
    const expectedToken = typeof fact.name === 'string' && !fact.name.startsWith('<') ? fact.name
      : typeof fact.key === 'string' && !fact.key.startsWith('<') ? fact.key : null;
    if (expectedToken) assert(evidenceLine.includes(expectedToken),
      `${fact.path}:${fact.line} ${fact.fieldPath}: YAML Secret evidence line does not contain ${expectedToken}`);
  }
  const helmSecretFacts = secrets.filter((fact) => fact.kind.startsWith('helm-template-'));
  assert(helmSecretFacts.length > 0, 'quality gate: Helm Secret references were not scanned');
  assert.equal(helmSecretFacts.filter((fact) => !Number.isInteger(fact.line) || fact.line < 1).length, 0,
    'quality gate: every Helm Secret fact needs an exact template line');
  assert.equal(helmSecretFacts.filter((fact) => fact.semanticStatus === 'authored-secret-authority' && fact.authorityResolved !== true).length, 0,
    'quality gate: a documented Helm Secret fact lacks a stable semantic authority distinct from its rendered name');
  const requireHelmSecretFact = (sourcePath, authorityId, key = null, kind = null) => assert(helmSecretFacts.some((fact) => fact.path === sourcePath
    && (fact.authorityId ?? fact.name) === authorityId && (key === null || fact.key === key) && (kind === null || fact.kind === kind)),
  `quality gate: missing exact Helm Secret fact ${sourcePath} ${authorityId}${key ? ` key ${key}` : ''}`);
  requireHelmSecretFact('charts/ops-pod/templates/workload.yaml', 'ops-github-secret', 'token', 'helm-template-key-reference');
  requireHelmSecretFact('charts/ops-pod/templates/workload.yaml', 'ops-tailscale-secret', 'authkey', 'helm-template-key-reference');
  requireHelmSecretFact('charts/ops-pod/templates/workload.yaml', 'ops-bearer-secret', null, 'helm-template-volume-reference');
  requireHelmSecretFact('charts/prism/templates/workloads.yaml', 'prism-runtime', 'worker-secret', 'helm-template-key-reference');
  requireHelmSecretFact('charts/prism/templates/workloads.yaml', 'prism-postgresql-auth', 'runtime-url', 'helm-template-key-reference');
  requireHelmSecretFact('charts/kubeclaw/templates/deployment.yaml', 'kubeclaw-gateway-secret', 'gatewayToken', 'helm-template-key-reference');
  requireHelmSecretFact('charts/kubeclaw/templates/deployment.yaml', 'redis-secrets', 'redis-password', 'helm-template-key-reference');
  const chartManagedGateway = helmSecretFacts.find((fact) => fact.path === 'charts/kubeclaw/templates/secret.yaml'
    && fact.kind === 'helm-template-declaration' && fact.authorityId === 'kubeclaw-chart-managed-gateway-secret');
  assert(chartManagedGateway, 'quality gate: chart-managed gateway Secret declaration is missing');
  assert.deepEqual(chartManagedGateway.keys, ['discordToken', 'gatewayToken', 'litellmApiKey'],
    'quality gate: chart-managed gateway Secret keys changed without an inventory update');
  for (const [key, conditionPattern] of Object.entries({
    gatewayToken: /auth\.token.*auth\.existingSecret/u,
    litellmApiKey: /litellm\.apiKey.*litellm\.existingSecret/u,
    discordToken: /discord\.enabled.*discord\.token.*discord\.existingSecret/u,
  })) assert.match(chartManagedGateway.keyConditions?.[key] ?? '', conditionPattern,
    `quality gate: chart-managed gateway Secret key ${key} lacks its exact render condition`);
  const secretIdentity = (fact) => `${fact.kind}:${fact.name}:${fact.key ?? ''}:${(fact.keys ?? []).join(',')}:${fact.path}:${fact.fieldPath ?? ''}`;
  const secretSemanticGaps = secrets.filter((fact) => fact.semanticStatus !== 'authored-secret-authority');
  if (!allowSemanticGaps && secretSemanticGaps.length) {
    throw new Error(`CONFIG_SEMANTIC_GAP: Secret declarations or references lack maintained operator authority: ${secretSemanticGaps.slice(0, 8).map(secretIdentity).join(', ')}. Expected authority: purpose, namespace, keys, optionality, producer, consumer, rotation owner and method, and failure symptom.`);
  }
  const configurationConsumerSources = schemaSources().flatMap((schemaPath) => {
    const pluginRoot = schemaPath.includes('/schemas/') ? schemaPath.split('/schemas/')[0] : path.dirname(schemaPath);
    return walk(`${pluginRoot}/src`, (absolutePath) => /\.(?:ts|mts|js|mjs)$/.test(absolutePath));
  }).filter((sourcePath, index, all) => all.indexOf(sourcePath) === index).sort().map((sourcePath) => ({
    path: sourcePath,
    sourceDigest: sha256(read(sourcePath)),
    purpose: 'candidate runtime consumer of a discovered configuration schema; field-level ownership requires source inspection',
  }));
  const classifiedCliFlags = classifyCliFacts(cliFlags);
  return {
    generatedBy: 'scripts/docs-configuration-inventory.mjs',
    discovery: { roots: RUNTIME_SCAN_ROOTS, excludedSegments: [...EXCLUDED_SEGMENTS].sort() },
    environment: [...groupedEnvironment.values()].sort((a, b) => a.name.localeCompare(b.name)),
    cliFlags: classifiedCliFlags,
    secrets: secrets.sort((a, b) => a.path.localeCompare(b.path) || String(a.name).localeCompare(String(b.name)) || String(a.key ?? '').localeCompare(String(b.key ?? ''))),
    derivedValues: derivedValues.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)),
    configurationConsumerSources,
    precedenceRules: {
      helm: [
        'chart values.yaml supplies the base value',
        'each --values or -f file overrides the preceding source from left to right',
        '--set and --set-string override files in the same Helm invocation',
        'a template default expression applies only when its Helm emptiness condition is true',
      ],
      environment: [
        'an explicitly exported value wins before the shell parameter default',
        'the colon form treats an empty value as absent; the form without a colon treats an empty value as set',
        'a Kubernetes env value or valueFrom source becomes the process environment inside the container',
      ],
      limitation: 'These rules describe source semantics. An authored operator page must connect each effective runtime value to its exact invocation and consumer; unknown consumers remain unknown here.',
    },
    totals: {
      environmentVariables: groupedEnvironment.size,
      environmentConsumers: [...groupedEnvironment.values()].reduce((sum, item) => sum + item.consumers.length, 0),
      environmentMeaningBlockers: [...groupedEnvironment.values()].filter((item) => /blocker/u.test(item.meaningStatus)).length,
      injectionOnlyEnvironmentVariables: [...groupedEnvironment.values()].filter((item) => item.surface === 'kubernetes-injected-transport').length,
      operatorAuthoredEnvironmentInputs: [...groupedEnvironment.values()].filter((item) => item.surface === 'operator-authored-input').length,
      operatorAuthoredMeaningBlockers: [...groupedEnvironment.values()].filter((item) => item.surface === 'operator-authored-input' && /blocker/u.test(item.meaningStatus)).length,
      cliOccurrences: cliFlags.length,
      cliFlags: classifiedCliFlags.length,
      cliDefinitions: classifiedCliFlags.filter((flag) => flag.classification === 'definition').length,
      cliInvocations: classifiedCliFlags.filter((flag) => flag.classification === 'invocation').length,
      secretFacts: secrets.length,
      secretAuthorityBlockers: secrets.filter((fact) => fact.semanticStatus !== 'authored-secret-authority').length,
      derivedValues: derivedValues.length,
      configurationConsumerSources: configurationConsumerSources.length,
      unresolvedSourceOwner: [...groupedEnvironment.values()].filter((item) => item.sourceOwners.length === 0).length + derivedValues.filter((item) => item.ownerComponent === 'unknown').length,
      unknownRuntimeOwner: [...groupedEnvironment.values()].filter((item) => item.runtimeOwner === 'unknown').length + derivedValues.filter((item) => item.runtimeOwner === 'unknown').length,
      unknownConsumer: derivedValues.filter((item) => item.consumers.includes('unknown')).length,
    },
  };
}

export function buildConfigurationInventories() {
  const yaml = buildYamlInventory();
  return new Map([
    ['configuration-values.json', yaml],
    ['configuration-schemas.json', buildSchemaInventory()],
    ['configuration-runtime-inputs.json', buildRuntimeInputInventory(yaml)],
  ]);
}

if (argv.includes('--check-payload-delivery-only')) {
  const payloads = deployedConfigPayloads();
  console.log(`Exact deployed payload delivery chains are current (${payloads.length} payloads).`);
  process.exit(0);
}

const stale = [];
for (const [fileName, inventory] of buildConfigurationInventories()) {
  const target = path.join(outputDirectory, fileName);
  const expected = stableJson(inventory);
  if (checkOnly) {
    const actual = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (actual !== expected) stale.push(path.relative(root, target));
  } else {
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(target, expected);
    console.log(`wrote ${path.relative(root, target)}`);
  }
}

if (stale.length) {
  console.error('DOC_DRIFT_CONFIG: Configuration documentation inventory is stale:');
  stale.forEach((file) => console.error(`- ${file}`));
  console.error('Run: npm run docs:inventory:config');
  process.exitCode = 1;
} else if (checkOnly) {
  const externalAuthorityCheck = spawnSync(process.execPath, [path.join(root, 'scripts/vendor-external-helm-authorities.mjs')], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(externalAuthorityCheck.status, 0,
    `offline external Helm authority verification failed\n${externalAuthorityCheck.stdout}\n${externalAuthorityCheck.stderr}`);
  console.log('Configuration documentation inventory is current.');
}
