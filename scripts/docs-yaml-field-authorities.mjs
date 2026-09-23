import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const externalChartLockBytes = fs.readFileSync(new URL('./docs-external-helm-authority-lock.json', import.meta.url));
const externalChartLock = JSON.parse(externalChartLockBytes);
const externalChartLockChecksum = fs.readFileSync(new URL('./docs-external-helm-authority-lock.sha256', import.meta.url), 'utf8').trim();
const [externalChartLockSha256, externalChartLockName] = externalChartLockChecksum.split(/\s+/u);
const externalSnapshotBytes = fs.readFileSync(new URL('./external-helm-authority-snapshots.json', import.meta.url));
const externalSnapshots = JSON.parse(externalSnapshotBytes);
const externalSnapshotChecksum = fs.readFileSync(new URL('./external-helm-authority-snapshots.sha256', import.meta.url), 'utf8').trim();
const [externalSnapshotSha256, externalSnapshotName] = externalSnapshotChecksum.split(/\s+/u);
const stableObject = (value) => {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableObject(item)]));
  return value;
};

// Exact, offline authority for operator-authored YAML leaves that are not owned
// by a checked-in Helm template. A source-file digest makes every change fail
// closed. External chart entries also pin the chart archive and the values file
// that was inspected when the field contract was written.

const profiles = {
  booleanFeature: ({ subject }) => ({
    purpose: `Controls whether ${subject}.`,
    acceptedValues: '`true` enables the behavior. `false` disables it.',
    emptyBehavior: 'An empty YAML scalar is not a Boolean. Remove the key to use the pinned chart default.',
    impact: `Changes whether ${subject}.`,
    failure: 'A non-Boolean value fails chart schema or template processing. A valid value can still leave the selected component unready.',
  }),
  replicas: ({ subject, zero = 'disables the component in this profile' }) => ({
    purpose: `Sets the desired replica count for ${subject}.`,
    acceptedValues: `A non-negative integer. Zero ${zero}.`,
    emptyBehavior: 'Do not use an empty scalar. Remove the key to use the pinned chart default.',
    impact: `Changes availability, scheduling demand, and resource use for ${subject}.`,
    failure: 'A negative, fractional, or wrongly typed value fails rendering or API admission. Too few replicas reduce availability; too many can remain Pending.',
  }),
  cpuRequest: ({ subject }) => ({
    purpose: `Reserves schedulable CPU for ${subject}.`,
    acceptedValues: 'A Kubernetes CPU quantity, for example `50m` or `1`.',
    emptyBehavior: 'Do not use an empty scalar. Remove the field only when the chart should omit the request.',
    impact: `Changes scheduling feasibility and guaranteed CPU share for ${subject}.`,
    failure: 'An invalid quantity fails API admission. A request above node capacity leaves the Pod Pending; a request below real demand permits contention.',
  }),
  cpuLimit: ({ subject }) => ({
    purpose: `Sets the maximum CPU allocation for ${subject}.`,
    acceptedValues: 'A positive Kubernetes CPU quantity, for example `200m` or `2`.',
    emptyBehavior: 'Do not use an empty scalar. Remove the field only when the chart should omit the CPU limit.',
    impact: `Changes the CPU ceiling and throttling point for ${subject}.`,
    failure: 'An invalid quantity fails API admission. A low limit causes throttling; an unschedulable request/limit combination prevents readiness.',
  }),
  memoryRequest: ({ subject }) => ({
    purpose: `Reserves schedulable memory for ${subject}.`,
    acceptedValues: 'A positive Kubernetes memory quantity, for example `128Mi` or `1Gi`.',
    emptyBehavior: 'Do not use an empty scalar. Remove the field only when the chart should omit the request.',
    impact: `Changes scheduling feasibility and the memory reserved for ${subject}.`,
    failure: 'An invalid quantity fails API admission. A request above node capacity leaves the Pod Pending; a request below real use permits overcommit.',
  }),
  memoryLimit: ({ subject }) => ({
    purpose: `Sets the memory limit for ${subject}.`,
    acceptedValues: 'A positive Kubernetes memory quantity, for example `256Mi` or `4Gi`.',
    emptyBehavior: 'Do not use an empty scalar. Remove the field only when the chart should omit the memory limit.',
    impact: `Changes the memory ceiling at which ${subject} is terminated by the container runtime.`,
    failure: 'An invalid quantity fails API admission. A low limit causes OOM termination; an excessive request can prevent scheduling.',
  }),
  pvcSize: ({ subject }) => ({
    purpose: `Requests persistent storage capacity for ${subject}.`,
    acceptedValues: 'A positive Kubernetes storage quantity, for example `20Gi`.',
    emptyBehavior: 'An empty scalar is invalid. Removing the key uses the pinned chart default and can silently select a different size.',
    impact: `Changes the requested PVC capacity for ${subject}. Existing volumes do not shrink when this value decreases.`,
    failure: 'An invalid or unsupported size fails admission or provisioning. Insufficient capacity causes application write failures; an unavailable storage class leaves the claim Pending.',
  }),
  imageRegistry: ({ subject }) => ({
    purpose: `Selects the container registry host for ${subject}.`,
    acceptedValues: 'A registry hostname with an optional port. Do not include an image name or URL scheme.',
    emptyBehavior: 'An empty value delegates registry selection to the chart image helper and is not equivalent to the selected explicit registry.',
    impact: `Changes the registry from which nodes pull ${subject}.`,
    failure: 'An invalid or unreachable registry produces an invalid image reference or an ImagePullBackOff condition.',
  }),
  imageRepository: ({ subject }) => ({
    purpose: `Selects the repository path for ${subject}.`,
    acceptedValues: 'A container repository path without a tag or digest.',
    emptyBehavior: 'An empty repository cannot identify the selected image.',
    impact: `Changes the image repository used for ${subject}.`,
    failure: 'An invalid or unavailable repository causes image reference validation or image pull failure.',
  }),
  imageTag: ({ subject }) => ({
    purpose: `Supplies the display tag for ${subject}; the digest remains the immutable content authority when it is set.`,
    acceptedValues: 'A valid OCI image tag without `@sha256:`.',
    emptyBehavior: 'An empty tag delegates to chart behavior and must not be used as an immutable release selection.',
    impact: `Changes the tag portion of the ${subject} image reference.`,
    failure: 'An invalid tag fails image reference validation. A mutable tag without a digest can select different content later.',
  }),
  imageDigest: ({ subject }) => ({
    purpose: `Pins the immutable image content for ${subject}.`,
    acceptedValues: 'A lowercase `sha256:` digest with 64 hexadecimal characters.',
    emptyBehavior: 'An empty digest removes immutable content selection and leaves the tag as the image selector.',
    impact: `Changes the exact image bytes executed by ${subject}.`,
    failure: 'A malformed digest fails rendering or image parsing. A valid but unavailable digest causes ImagePullBackOff.',
  }),
  secretName: ({ subject }) => ({
    purpose: `Names the existing Kubernetes Secret that supplies ${subject}.`,
    acceptedValues: 'A DNS-compatible Secret name in the release namespace.',
    emptyBehavior: 'An empty name disables this existing-Secret reference and can make the chart use another credential source.',
    impact: `Changes which Secret object supplies ${subject}.`,
    failure: 'A missing Secret prevents the workload from starting or makes its authentication preflight fail.',
  }),
  secretKey: ({ subject }) => ({
    purpose: `Selects the key inside the configured Secret that supplies ${subject}.`,
    acceptedValues: 'A non-empty Kubernetes Secret data key.',
    emptyBehavior: 'An empty key cannot select credential data.',
    impact: `Changes which value inside the Secret is exposed as ${subject}.`,
    failure: 'A missing key prevents environment or volume materialization and leaves the workload unready.',
  }),
  serviceType: ({ subject, allowed = '`ClusterIP`, `NodePort`, or `LoadBalancer`, as supported by the pinned chart' }) => ({
    purpose: `Selects how Kubernetes exposes ${subject}.`,
    acceptedValues: allowed,
    emptyBehavior: 'Do not use an empty scalar. Remove the field to use the pinned chart default.',
    impact: `Changes the network exposure boundary and Service fields for ${subject}.`,
    failure: 'An unsupported value fails API admission or chart validation. A valid but unsuitable type can expose the service or make it unreachable.',
  }),
  tolerationKey: ({ subject }) => ({
    purpose: `Selects the node taint key that ${subject} may tolerate.`,
    acceptedValues: 'A Kubernetes qualified name.',
    emptyBehavior: 'An empty key is valid only with an operator that intentionally matches all keys; this profile uses explicit keys.',
    impact: `Changes which tainted nodes can schedule ${subject}.`,
    failure: 'A malformed key fails API admission. A wrong key leaves the workload unschedulable during the condition that required the toleration.',
  }),
  tolerationOperator: ({ subject }) => ({
    purpose: `Selects how the toleration for ${subject} compares a taint.`,
    acceptedValues: '`Exists` or `Equal`.',
    emptyBehavior: 'Do not use an empty scalar. Kubernetes defaults an omitted operator, which is different from this explicit profile.',
    impact: `Changes whether ${subject} matches the named taint without a value comparison.`,
    failure: 'An unsupported operator fails API admission. A valid but wrong operator leaves the workload unschedulable or broadens placement.',
  }),
  tolerationEffect: ({ subject }) => ({
    purpose: `Restricts the toleration for ${subject} to one taint effect.`,
    acceptedValues: '`NoSchedule`, `PreferNoSchedule`, or `NoExecute`.',
    emptyBehavior: 'An omitted effect matches all effects. This profile uses an explicit effect to avoid that broader match.',
    impact: `Changes which scheduling or eviction effect ${subject} tolerates.`,
    failure: 'An unsupported effect fails API admission. A valid but wrong effect does not permit the intended scheduling path.',
  }),
  nativeCpu: ({ subject }) => ({
    purpose: `Sets the CPU budget for ${subject} in millicores.`,
    acceptedValues: 'A positive safe integer. Pool values must also remain below the source limit that permits conversion to cgroup quota microseconds.',
    emptyBehavior: 'Missing, null, zero, fractional, and negative values fail policy validation.',
    impact: `Changes the generated cgroup CPU quota or kubelet reservation for ${subject}.`,
    failure: 'Validation stops with `NATIVE_NODE_POLICY_LIMIT_INVALID`, `NATIVE_NODE_CPU_RANGE_INVALID`, or `NATIVE_NODE_TOTAL_RANGE_INVALID` before host files are written.',
  }),
  nativeMemory: ({ subject }) => ({
    purpose: `Sets the memory budget for ${subject} in bytes.`,
    acceptedValues: 'A positive safe integer divisible by 4096.',
    emptyBehavior: 'Missing, null, zero, fractional, and negative values fail policy validation.',
    impact: `Changes the generated cgroup memory ceiling or kubelet reservation for ${subject}.`,
    failure: 'Validation stops with `NATIVE_NODE_POLICY_LIMIT_INVALID`, `NATIVE_NODE_MEMORY_ALIGNMENT_INVALID`, or `NATIVE_NODE_TOTAL_RANGE_INVALID` before host files are written.',
  }),
  nativeTasks: ({ subject }) => ({
    purpose: `Sets the process/task budget for ${subject}.`,
    acceptedValues: 'A positive safe integer.',
    emptyBehavior: 'Missing, null, zero, fractional, and negative values fail policy validation.',
    impact: `Changes the generated cgroup task limit or kubelet PID reservation for ${subject}.`,
    failure: 'Validation stops with `NATIVE_NODE_POLICY_LIMIT_INVALID` or `NATIVE_NODE_TOTAL_RANGE_INVALID` before host files are written.',
  }),
};

const files = new Map();
const fieldAuthorities = new Map();

function file(path, sourceSha256, externalChart = null) {
  assert.match(sourceSha256, /^[a-f0-9]{64}$/u);
  files.set(path, { path, sourceSha256, externalChart });
}

function add(path, fieldPath, profile, options = {}) {
  const key = `${path}#${fieldPath}`;
  assert(!fieldAuthorities.has(key), `duplicate YAML field authority: ${key}`);
  assert(files.has(path), `YAML field authority has no file declaration: ${key}`);
  assert(profiles[profile], `unknown YAML semantic profile ${profile}: ${key}`);
  fieldAuthorities.set(key, { profile, ...options });
}

function special(path, fieldPath, authority) {
  const key = `${path}#${fieldPath}`;
  assert(!fieldAuthorities.has(key), `duplicate YAML field authority: ${key}`);
  assert(files.has(path), `YAML field authority has no file declaration: ${key}`);
  for (const name of ['purpose', 'acceptedValues', 'emptyBehavior', 'impact', 'failure']) {
    const minimum = name === 'acceptedValues' ? 8 : 20;
    assert(typeof authority[name] === 'string' && authority[name].length >= minimum, `incomplete ${name}: ${key}`);
  }
  fieldAuthorities.set(key, authority);
}

function addResourceSet(path, prefix, subject) {
  add(path, `${prefix}.requests.cpu`, 'cpuRequest', { subject });
  add(path, `${prefix}.requests.memory`, 'memoryRequest', { subject });
  add(path, `${prefix}.limits.cpu`, 'cpuLimit', { subject });
  add(path, `${prefix}.limits.memory`, 'memoryLimit', { subject });
}

function cloneAuthorities(sourcePath, targetPath, excludedPaths = new Set()) {
  const prefix = `${sourcePath}#`;
  for (const [key, authority] of [...fieldAuthorities]) {
    if (!key.startsWith(prefix)) continue;
    const fieldPath = key.slice(prefix.length);
    if (excludedPaths.has(fieldPath)) continue;
    const targetKey = `${targetPath}#${fieldPath}`;
    assert(!fieldAuthorities.has(targetKey), `duplicate YAML field authority: ${targetKey}`);
    fieldAuthorities.set(targetKey, { ...authority });
  }
}

function clonePrefixedAuthorities(sourcePath, targetPath, targetPrefix) {
  const prefix = `${sourcePath}#$.`;
  for (const [key, authority] of [...fieldAuthorities]) {
    if (!key.startsWith(prefix)) continue;
    const targetKey = `${targetPath}#${targetPrefix}.${key.slice(prefix.length)}`;
    assert(!fieldAuthorities.has(targetKey), `duplicate YAML field authority: ${targetKey}`);
    fieldAuthorities.set(targetKey, { ...authority });
  }
}

const charts = externalChartLock.charts;

const alloy = 'gitops/platform/values/alloy.yaml';
file(alloy, '29e18d6d49210bfe193f21e43aaac00ecea5bacc3175d7f3efe7d8be6d1b2c61', charts.alloy);
special(alloy, '$.alloy.configMap.content', { purpose: 'Defines the complete Grafana Alloy River configuration that discovers Pod logs, relabels them, reads CRI files, and sends records to Loki.', acceptedValues: 'Valid River configuration text accepted by the pinned Alloy image. Helm evaluates the text with `tpl` before it stores the ConfigMap.', emptyBehavior: 'Empty text creates a configuration with no declared logging pipeline and prevents the selected log path from operating.', impact: 'Changes log discovery, labels, file paths, processing stages, and the Loki write endpoint for every Alloy Pod.', failure: 'A Helm template error stops rendering. Invalid River syntax or an unreachable endpoint makes Alloy unready or stops log delivery.' });
add(alloy, '$.alloy.enableReporting', 'booleanFeature', { subject: 'Alloy sends anonymous usage statistics to Grafana Labs' });
special(alloy, '$.alloy.mounts.varlog', { purpose: 'Mounts the host `/var/log` tree into each Alloy Pod so the configured file source can read Pod log files.', acceptedValues: '`true` creates the host mount. `false` omits it.', emptyBehavior: 'An empty scalar is not a Boolean. Removing the key uses the pinned chart default of `false`.', impact: 'Controls whether the log collector can reach host Pod log paths.', failure: 'Without the mount, the selected `loki.source.file` path cannot read Pod log files. A non-Boolean value fails rendering or schema processing.' });
special(alloy, '$.alloy.storagePath', { purpose: 'Selects Alloy persistent working storage, including write-ahead-log data.', acceptedValues: 'An absolute writable container path. This profile uses `/var/lib/alloy`, backed by the `positions` hostPath mount.', emptyBehavior: 'An empty path does not identify usable storage. Removing the key uses the pinned chart default `/tmp/alloy`.', impact: 'Changes where Alloy keeps restart-sensitive local state.', failure: 'A missing or unwritable path causes Alloy startup or write failures; an ephemeral path loses local state at restart.' });
special(alloy, '$.alloy.securityContext.runAsUser', { purpose: 'Runs Alloy with the numeric user ID needed to read the selected host log paths.', acceptedValues: 'A non-negative Linux user ID. This profile uses `0` because host log ownership is not normalized.', emptyBehavior: 'Remove the key to let the chart or Kubernetes choose the image user. Do not use an empty scalar.', impact: 'Changes the Unix identity and host-file read permissions of the Alloy container.', failure: 'An invalid ID fails admission. A non-privileged ID without matching file permissions produces log read errors.' });
addResourceSet(alloy, '$.alloy.resources', 'each Alloy log-collector Pod');
special(alloy, '$.controller.type', { purpose: 'Selects the Kubernetes workload type that runs Alloy.', acceptedValues: '`daemonset`, `deployment`, or `statefulset`. This profile uses `daemonset` to place one collector on each eligible node.', emptyBehavior: 'An empty value is not supported. Removing the key uses the pinned chart default `daemonset`.', impact: 'Changes Alloy placement, identity, update behavior, and access to node-local logs.', failure: 'An unsupported value fails chart validation. A non-DaemonSet mode does not provide one node-local collector by default.' });
add(alloy, '$.controller.tolerations[0].operator', 'tolerationOperator', { subject: 'the Alloy DaemonSet' });
for (const [index, name, hostPath, mountPath] of [[0, 'positions', '/var/lib/kubeclaw-alloy', '/var/lib/alloy'], [1, 'promtail-positions', '/run/promtail', '/run/promtail']]) {
  special(alloy, `$.controller.volumes.extra[${index}].name`, { purpose: `Names the extra Alloy volume that exposes ${hostPath}.`, acceptedValues: `The DNS-label volume name \`${name}\`, which must match the corresponding mount name.`, emptyBehavior: 'An empty name is invalid and cannot be matched by a volume mount.', impact: `Binds the ${hostPath} hostPath volume to its Alloy mount.`, failure: 'A malformed or unmatched name fails API admission or leaves the Pod with an unresolved volume mount.' });
  special(alloy, `$.controller.volumes.extra[${index}].hostPath.path`, { purpose: `Selects the node path ${hostPath} for the ${name} Alloy volume.`, acceptedValues: 'An absolute host filesystem path.', emptyBehavior: 'An empty path is invalid for a hostPath volume.', impact: `Changes which node files appear at ${mountPath} inside Alloy.`, failure: 'A missing path fails Pod setup when the selected hostPath type requires it; a wrong path hides the intended state or logs.' });
  special(alloy, `$.controller.volumes.extra[${index}].hostPath.type`, { purpose: `Selects the Kubernetes hostPath existence rule for ${hostPath}.`, acceptedValues: index === 0 ? '`DirectoryOrCreate`.' : '`Directory`.', emptyBehavior: 'An omitted type performs no pre-mount type check; this profile uses an explicit rule.', impact: index === 0 ? 'Allows Kubernetes to create the Alloy state directory when it does not exist.' : 'Requires the existing Promtail state directory before the Alloy Pod starts.', failure: 'A path with the wrong type or a missing required directory prevents Pod volume setup.' });
  special(alloy, `$.alloy.mounts.extra[${index}].name`, { purpose: `Selects the extra volume named ${name} for an Alloy container mount.`, acceptedValues: `Exactly \`${name}\`, matching the declared controller volume.`, emptyBehavior: 'An empty or omitted name cannot resolve the volume mount.', impact: `Connects the declared ${name} volume to the Alloy container.`, failure: 'A name without a matching volume makes the Pod specification invalid.' });
  special(alloy, `$.alloy.mounts.extra[${index}].mountPath`, { purpose: `Mounts the ${name} volume at ${mountPath} inside Alloy.`, acceptedValues: `The absolute container path \`${mountPath}\`.`, emptyBehavior: 'An empty mount path is invalid.', impact: `Changes the path where Alloy reads or writes ${name} data.`, failure: 'A malformed or conflicting path fails API admission or hides data required by the configured log pipeline.' });
}
special(alloy, '$.alloy.mounts.extra[1].readOnly', { purpose: 'Keeps the legacy Promtail positions volume read-only while Alloy imports its position data.', acceptedValues: '`true` or `false`; this profile requires `true`.', emptyBehavior: 'An empty scalar is not a Boolean. Removing it uses Kubernetes writable-mount behavior.', impact: 'Controls whether Alloy can modify the Promtail state directory.', failure: 'Setting `false` permits unintended writes to migration evidence; a non-Boolean value fails rendering or admission.' });
add(alloy, '$.crds.create', 'booleanFeature', { subject: 'the Alloy chart installs its monitoring CRDs' });

const csi = 'gitops/platform/values/csi-driver-smb.yaml';
file(csi, 'eb4f496fc2a16fb739e69cf032d127a19fcbf895cad79a58916fafcdcec94542', charts.csi);
add(csi, '$.controller.replicas', 'replicas', { subject: 'the SMB CSI controller', zero: 'stops controller reconciliation' });

const loki = 'gitops/platform/values/loki.yaml';
file(loki, '7795a3ee39b969422b037d546a5ffbf0ab5152e8310772fb46b216d661332e76', charts.loki);
special(loki, '$.deploymentMode', { purpose: 'Selects the Loki chart topology.', acceptedValues: 'A deployment mode supported by Loki chart 18.13.1. This profile uses `Monolithic` with the single-binary workload.', emptyBehavior: 'An empty value cannot select a topology. Removing the key uses the pinned chart default, which must not be assumed equivalent.', impact: 'Changes which Loki workloads and storage contracts the chart renders.', failure: 'An unsupported or internally inconsistent mode makes Helm validation fail or renders a topology whose components cannot become ready.' });
add(loki, '$.loki.auth_enabled', 'booleanFeature', { subject: 'Loki requires tenant authentication on requests' });
special(loki, '$.loki.commonConfig.replication_factor', { purpose: 'Sets how many replicas store each Loki data item.', acceptedValues: 'A positive integer that does not exceed the usable replica count for the selected topology. This single-node profile uses `1`.', emptyBehavior: 'An empty scalar is invalid. Removing the key uses the pinned chart default `3`, which is not valid for this one-replica profile.', impact: 'Changes data redundancy and the number of healthy replicas required for writes.', failure: 'A factor above available replicas causes write or ring errors; zero, negative, or wrongly typed values fail configuration validation.' });
special(loki, '$.loki.limits_config.max_query_length', { purpose: 'Limits the largest time interval one Loki query can cover.', acceptedValues: 'A positive Loki duration such as `721h`.', emptyBehavior: 'Remove the field to use Loki default behavior. Do not use an empty duration.', impact: 'Controls the maximum historical span and cost of one query.', failure: 'An invalid duration prevents Loki configuration loading. A value below required investigations rejects those queries.' });
special(loki, '$.loki.limits_config.retention_period', { purpose: 'Sets the retention period for stored Loki log data.', acceptedValues: 'A positive Loki duration. This profile uses `720h`.', emptyBehavior: 'Removing the field uses Loki default retention behavior; an empty duration is invalid.', impact: 'Changes storage growth and the time for which logs remain queryable.', failure: 'An invalid duration prevents configuration loading. A short period removes required logs; a long period can exhaust storage.' });
for (const [pathName, purpose, allowed] of [
  ['from', 'sets the UTC date on which this Loki schema period starts', 'An ISO date in `YYYY-MM-DD` form'],
  ['store', 'selects the Loki index store for this schema period', 'A store supported by Loki v13; this profile uses `tsdb`'],
  ['object_store', 'selects the chunk object store for this schema period', 'A Loki-supported object store; this profile uses local `filesystem`'],
  ['schema', 'selects the Loki storage schema version', 'A Loki-supported schema identifier; this profile uses `v13`'],
  ['index.prefix', 'sets the prefix for generated Loki index tables', 'A non-empty table-name prefix; this profile uses `index_`'],
  ['index.period', 'sets the duration covered by each Loki index table', 'A positive Loki duration; this profile uses `24h`'],
]) special(loki, `$.loki.schemaConfig.configs[0].${pathName}`, { purpose: `The first schema entry ${purpose}.`, acceptedValues: `${allowed}.`, emptyBehavior: 'An empty value makes the schema entry incomplete; do not remove it from an active schema period.', impact: 'Changes the on-disk data contract. Changing it after data exists requires a compatible migration plan.', failure: 'An invalid or incompatible schema entry prevents Loki startup or makes existing data unreadable.' });
special(loki, '$.loki.storage.type', { purpose: 'Selects the Loki storage backend used by the chart configuration.', acceptedValues: 'A storage type supported by chart 18.13.1. This monolithic lab profile uses `filesystem`.', emptyBehavior: 'An empty value cannot select a backend. Removing the key uses the pinned chart default, which is not this local-storage contract.', impact: 'Changes where Loki stores chunks and indexes and therefore changes backup and recovery requirements.', failure: 'An unsupported type prevents rendering or startup; selecting remote storage without credentials leaves Loki unready.' });
add(loki, '$.singleBinary.replicas', 'replicas', { subject: 'the monolithic Loki single-binary workload' });
for (const component of ['backend', 'read', 'write']) add(loki, `$.${component}.replicas`, 'replicas', { subject: `the Loki ${component} workload`, zero: 'disables that distributed-mode workload in this monolithic profile' });
for (const [pathName, subject] of [['chunksCache.enabled', 'the Loki chunks Memcached cache is deployed'], ['resultsCache.enabled', 'the Loki results Memcached cache is deployed'], ['gateway.enabled', 'the Loki gateway is deployed'], ['lokiCanary.enabled', 'the Loki write-and-query canary is deployed'], ['test.enabled', 'the Loki Helm test resources are rendered'], ['singleBinary.persistence.enabled', 'the single-binary Loki workload uses a PVC'], ['singleBinary.persistence.enableStatefulSetAutoDeletePVC', 'Kubernetes may delete Loki PVCs when the StatefulSet is scaled down or removed']]) add(loki, `$.${pathName}`, 'booleanFeature', { subject });
add(loki, '$.singleBinary.persistence.size', 'pvcSize', { subject: 'monolithic Loki data' });
addResourceSet(loki, '$.singleBinary.resources', 'the monolithic Loki Pod');

const postgresql = 'gitops/platform/values/postgresql.yaml';
file(postgresql, '6e317137b18b6888c99d872a9cd58509aeb1ebf77b001d42eaab448f2bcddb7b', charts.postgresql);
special(postgresql, '$.architecture', { purpose: 'Selects the PostgreSQL chart topology.', acceptedValues: '`standalone` or `replication`. This profile uses `standalone`.', emptyBehavior: 'An empty value cannot select a topology. Removing the key uses the pinned chart default.', impact: 'Changes the number and roles of PostgreSQL workloads and the applicable persistence contract.', failure: 'An unsupported value fails chart validation. Changing topology without a data migration can make the existing database unavailable.' });
special(postgresql, '$.auth.database', { purpose: 'Names the application database created for LiteLLM on first initialization.', acceptedValues: 'A valid PostgreSQL database identifier accepted by the pinned image initialization scripts.', emptyBehavior: 'An empty value skips this named application database and is not a valid LiteLLM database contract.', impact: 'Changes the database that initialization creates and that application connection settings must target.', failure: 'An invalid name fails initialization; changing it after initialization does not rename existing data and can cause connection failures.' });
special(postgresql, '$.auth.username', { purpose: 'Names the PostgreSQL application user created for LiteLLM on first initialization.', acceptedValues: 'A valid PostgreSQL role name accepted by the pinned image initialization scripts.', emptyBehavior: 'An empty value skips the selected application user and breaks the LiteLLM credential contract.', impact: 'Changes the database role expected by application connections and Secret data.', failure: 'An invalid name fails initialization; changing it after initialization does not rename an existing role and can cause authentication failures.' });
add(postgresql, '$.auth.existingSecret', 'secretName', { subject: 'PostgreSQL administrator and LiteLLM user credentials' });
add(postgresql, '$.auth.secretKeys.adminPasswordKey', 'secretKey', { subject: 'the PostgreSQL administrator password' });
add(postgresql, '$.auth.secretKeys.userPasswordKey', 'secretKey', { subject: 'the LiteLLM PostgreSQL user password' });
for (const [part, profile] of [['registry', 'imageRegistry'], ['repository', 'imageRepository'], ['tag', 'imageTag'], ['digest', 'imageDigest']]) add(postgresql, `$.image.${part}`, profile, { subject: 'PostgreSQL' });
add(postgresql, '$.primary.persistence.size', 'pvcSize', { subject: 'PostgreSQL primary data' });
addResourceSet(postgresql, '$.primary.resources', 'the PostgreSQL primary Pod');

const prometheus = 'gitops/platform/values/prometheus.yaml';
file(prometheus, '4fd5cddf6469e535f6d44a4903eef8781218cbbc2f65595cddf58ce3a1270509', charts.prometheus);
add(prometheus, '$.alertmanager.enabled', 'booleanFeature', { subject: 'the Alertmanager workload and related resources are deployed' });
add(prometheus, '$.grafana.persistence.enabled', 'booleanFeature', { subject: 'Grafana stores state on a PVC' });
add(prometheus, '$.grafana.persistence.size', 'pvcSize', { subject: 'Grafana state' });
add(prometheus, '$.grafana.admin.existingSecret', 'secretName', { subject: 'Grafana administrator credentials' });
add(prometheus, '$.grafana.admin.userKey', 'secretKey', { subject: 'the Grafana administrator user name' });
add(prometheus, '$.grafana.admin.passwordKey', 'secretKey', { subject: 'the Grafana administrator password' });
for (const [key, purpose, accepted, impact, failure] of [
  ['name', 'Sets the display and provisioning name of the additional Grafana data source.', 'A non-empty Grafana data-source name; this profile uses `Loki`.', 'Changes the name users and dashboards use to select the data source.', 'An empty or duplicate name makes provisioning ambiguous or fail.'],
  ['type', 'Selects the Grafana data-source plugin used for the additional source.', 'A provisioned Grafana data-source type; this profile uses `loki`.', 'Changes the query protocol and editor used for the source.', 'An unavailable plugin or wrong type makes queries fail.'],
  ['access', 'Selects whether Grafana proxies queries to the data source.', '`proxy` or another access mode supported by the pinned Grafana chart; this profile uses `proxy`.', 'Changes whether browsers or the Grafana server connect to Loki.', 'A wrong mode can expose an internal URL to browsers or make the source unreachable.'],
  ['isDefault', 'Controls whether this is Grafana’s default data source.', '`true` or `false`; this profile uses `false`.', 'Changes which data source new panels and Explore select by default.', 'More than one default data source can make provisioning fail.'],
  ['url', 'Sets the internal Loki endpoint used by Grafana.', 'An absolute HTTP or HTTPS URL reachable from the Grafana Pod.', 'Changes the Loki instance queried by Grafana.', 'A malformed or unreachable URL makes the data source unhealthy and log queries fail.'],
]) special(prometheus, `$.grafana.additionalDataSources[0].${key}`, { purpose, acceptedValues: accepted, emptyBehavior: 'An empty value does not satisfy this selected data-source contract.', impact, failure });
special(prometheus, '$.grafana.envValueFrom.GOMEMLIMIT.resourceFieldRef.resource', { purpose: 'Selects the Grafana container resource value used to derive the Go `GOMEMLIMIT` environment variable.', acceptedValues: 'A downward-API resource selector such as `limits.memory`; this profile uses `limits.memory`.', emptyBehavior: 'An empty selector cannot resolve a resource value.', impact: 'Binds the Go runtime memory target to the configured Grafana memory limit.', failure: 'An unsupported selector prevents Pod environment materialization or leaves `GOMEMLIMIT` unset.' });
special(prometheus, '$.grafana.envValueFrom.GOMEMLIMIT.resourceFieldRef.divisor', { purpose: 'Selects the unit divisor applied to Grafana’s memory limit before it becomes `GOMEMLIMIT`.', acceptedValues: 'A positive Kubernetes quantity. This profile uses `1` to expose bytes.', emptyBehavior: 'An empty divisor is invalid for a resource field reference.', impact: 'Changes the numeric scale passed to the Go runtime.', failure: 'An invalid divisor fails API admission; the wrong scale can cause premature garbage collection or memory pressure.' });
add(prometheus, '$.grafana.service.type', 'serviceType', { subject: 'Grafana', allowed: '`ClusterIP`, `NodePort`, or `LoadBalancer`; this profile explicitly uses `NodePort`' });
special(prometheus, '$.grafana.service.nodePort', { purpose: 'Reserves the node port through which this lab exposes Grafana.', acceptedValues: 'An integer in the cluster NodePort range; this profile uses `30030`.', emptyBehavior: 'When omitted, Kubernetes can allocate a port for a NodePort Service. An empty scalar is invalid.', impact: 'Changes the port reachable on every applicable node and can conflict with another Service.', failure: 'An out-of-range or already allocated port fails API admission or Service creation.' });
addResourceSet(prometheus, '$.grafana.resources', 'the Grafana Pod');
addResourceSet(prometheus, '$.kube-state-metrics.resources', 'the kube-state-metrics Pod');
addResourceSet(prometheus, '$.prometheus-node-exporter.resources', 'each Prometheus node-exporter Pod');
addResourceSet(prometheus, '$.prometheus.prometheusSpec.resources', 'the Prometheus Pod');
special(prometheus, '$.prometheus.prometheusSpec.retention', { purpose: 'Sets how long Prometheus keeps time-series samples.', acceptedValues: 'A positive Prometheus duration such as `15d`.', emptyBehavior: 'Remove the field to use Prometheus Operator defaults. Do not use an empty duration.', impact: 'Changes historical query depth and persistent-storage growth.', failure: 'An invalid duration prevents Prometheus startup. Excessive retention can fill the volume; short retention removes needed evidence.' });
special(prometheus, '$.prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.accessModes[0]', { purpose: 'Selects the first Kubernetes access mode for the Prometheus data claim.', acceptedValues: 'A Kubernetes PVC access mode. This single-Pod profile uses `ReadWriteOnce`.', emptyBehavior: 'An empty access mode is invalid; removing all modes makes the claim incomplete.', impact: 'Changes which nodes and Pods can mount Prometheus storage.', failure: 'An unsupported mode leaves the PVC Pending or makes the Pod unable to mount it.' });
add(prometheus, '$.prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage', 'pvcSize', { subject: 'Prometheus time-series data' });

const promtail = 'gitops/platform/values/promtail-retired.yaml';
file(promtail, 'c4edda32fa411091e79a5bcc3bed0f22faa6d6d5de8ecd5144b3042840eb0160', charts.promtail);
special(promtail, '$.config.clients[0].url', { purpose: 'Sets the Loki push endpoint used by the retired Promtail client.', acceptedValues: 'An absolute HTTP or HTTPS URL ending in the Loki push API path.', emptyBehavior: 'An empty URL leaves Promtail without a usable client destination.', impact: 'Changes where any remaining Promtail Pod sends logs.', failure: 'A malformed URL prevents configuration loading; an unreachable endpoint causes repeated send failures and buffered or lost logs.' });
special(promtail, '$.nodeSelector.kubeclaw.io/log-collector', { purpose: 'Selects only nodes labeled for the retired Promtail collector.', acceptedValues: 'A Kubernetes label value. This retirement profile uses `promtail-retired` and expects no node to carry it.', emptyBehavior: 'Removing the selector permits normal chart scheduling and can restart Promtail.', impact: 'Keeps the retired DaemonSet at zero Pods while preserving its release for controlled handover.', failure: 'If a node gains the label, Promtail schedules there and can duplicate Alloy log collection.' });
addResourceSet(promtail, '$.resources', 'each Promtail Pod if the retirement selector matches a node');

const redis = 'gitops/platform/values/redis.yaml';
file(redis, 'e0523d1b0ca368d5567e9be9275c6a8ce54793315d346805b41b8979bb69d8ca', charts.redis);
special(redis, '$.architecture', { purpose: 'Selects the Redis chart topology.', acceptedValues: '`standalone` or `replication`. This profile uses `standalone`.', emptyBehavior: 'An empty value cannot select a topology. Removing the key uses the pinned chart default `replication`.', impact: 'Changes Redis workload count, service names, replication behavior, and recovery requirements.', failure: 'An unsupported value fails chart validation. Changing topology without a migration can make stream and dedup state unavailable.' });
add(redis, '$.auth.enabled', 'booleanFeature', { subject: 'Redis requires password authentication' });
add(redis, '$.auth.existingSecret', 'secretName', { subject: 'the Redis password' });
add(redis, '$.auth.existingSecretPasswordKey', 'secretKey', { subject: 'the Redis password' });
for (const [part, profile] of [['registry', 'imageRegistry'], ['repository', 'imageRepository'], ['tag', 'imageTag'], ['digest', 'imageDigest']]) add(redis, `$.image.${part}`, profile, { subject: 'Redis' });
add(redis, '$.master.persistence.size', 'pvcSize', { subject: 'Redis stream, acknowledgement, and deduplication state' });
addResourceSet(redis, '$.master.resources', 'the standalone Redis master Pod');

const spire = 'gitops/platform/values/spire.yaml';
file(spire, 'db05f3500b2c234434a105fdc8db83d4003f940cf62003872a1ce776a3fba48d', charts.spire);
special(spire, '$.global.k8s.clusterDomain', { purpose: 'Sets the Kubernetes DNS cluster domain used when SPIRE builds service names.', acceptedValues: 'A DNS domain without a URL scheme; this cluster uses `cluster.local`.', emptyBehavior: 'An empty value cannot form the expected service DNS names.', impact: 'Changes SPIRE internal service discovery names.', failure: 'A value that differs from cluster DNS makes SPIRE components unable to resolve each other.' });
special(spire, '$.global.spire.clusterName', { purpose: 'Names the Kubernetes cluster in SPIRE workload-attestation selectors and generated registration context.', acceptedValues: 'A stable non-empty SPIRE cluster name.', emptyBehavior: 'An empty cluster name removes the selected identity boundary and is not supported by this profile.', impact: 'Changes identity selector context and can invalidate existing registrations.', failure: 'A mismatch prevents workloads from matching intended SPIFFE ID entries.' });
special(spire, '$.global.spire.trustDomain', { purpose: 'Sets the SPIFFE trust domain used in every workload identity issued by this SPIRE deployment.', acceptedValues: 'A valid SPIFFE trust-domain name; this platform uses `kubeclaw.internal`.', emptyBehavior: 'An empty trust domain is invalid.', impact: 'Changes the root namespace of all SPIFFE IDs and trust bundles.', failure: 'Changing it invalidates identity expectations and causes mTLS authorization failure until every relying party is migrated.' });
for (const [part, label] of [['country', 'country'], ['organization', 'organization'], ['commonName', 'common name']]) special(spire, `$.global.spire.caSubject.${part}`, { purpose: `Sets the ${label} in the SPIRE server certificate-authority subject.`, acceptedValues: 'A non-empty subject string accepted by the SPIRE chart and certificate tooling.', emptyBehavior: 'An empty value omits meaningful subject identity and is not the selected platform contract.', impact: 'Changes CA certificate metadata when CA material is created or rotated.', failure: 'Malformed subject data prevents certificate generation; changing it alone does not rotate existing CA material.' });
for (const [area, label] of [['system', 'SPIRE system agents'], ['server', 'SPIRE server']]) {
  special(spire, `$.global.spire.namespaces.${area}.name`, { purpose: `Names the Kubernetes namespace for ${label}.`, acceptedValues: 'A DNS-label Kubernetes namespace name.', emptyBehavior: 'An empty namespace cannot locate or create the component resources.', impact: `Changes where ${label} resources and namespace-scoped identities exist.`, failure: 'A malformed name fails admission; changing it without migration separates workloads, Secrets, and RBAC.' });
  add(spire, `$.global.spire.namespaces.${area}.create`, 'booleanFeature', { subject: `the chart creates the ${label} namespace` });
}
add(spire, '$.global.spire.namespaces.create', 'booleanFeature', { subject: 'the chart creates all configured SPIRE namespaces' });
for (const [key, subject] of [['enabled', 'the SPIRE chart recommendation bundle is applied'], ['namespaceLayout', 'the recommended SPIRE namespace layout is applied'], ['namespacePSS', 'recommended Pod Security Standards are applied to SPIRE namespaces'], ['priorityClassName', 'recommended SPIRE priority classes are selected'], ['prometheus', 'SPIRE Prometheus exporters and monitoring integration are enabled'], ['securityContexts', 'recommended SPIRE Pod and container security contexts are applied'], ['strictMode', 'strict SPIRE recommendation validation is enforced']]) add(spire, `$.global.spire.recommendations.${key}`, 'booleanFeature', { subject });
for (const [pathName, subject] of [['global.installAndUpgradeHooks.enabled', 'the SPIRE chart runs install and upgrade repair hooks'], ['global.deleteHooks.enabled', 'the SPIRE chart runs deletion hooks'], ['spiffe-oidc-discovery-provider.enabled', 'the SPIFFE OIDC discovery provider is deployed'], ['spire-server.controllerManager.identities.clusterSPIFFEIDs.default.enabled', 'the default workload ClusterSPIFFEID registration is active'], ['spire-server.controllerManager.identities.clusterSPIFFEIDs.oidc-discovery-provider.enabled', 'the OIDC discovery provider receives its dedicated ClusterSPIFFEID'], ['spire-server.controllerManager.identities.clusterSPIFFEIDs.test-keys.enabled', 'the test-key workload receives a ClusterSPIFFEID'], ['spire-server.controllerManager.installAndUpgradeHook.enabled', 'the SPIRE server subchart install and upgrade hook runs'], ['spire-server.jwtSVIDSupport', 'the SPIRE server issues JWT-SVID identities'], ['tornjak-frontend.enabled', 'the Tornjak administration frontend is deployed']]) add(spire, `$.${pathName}`, 'booleanFeature', { subject });
special(spire, '$.spiffe-csi-driver.image.tag', { purpose: 'Selects the SPIFFE CSI driver image tag within the pinned SPIRE chart.', acceptedValues: 'A valid image tag. This profile pins `0.2.13`, which includes the selected security updates.', emptyBehavior: 'An empty tag produces an incomplete or chart-default image selection.', impact: 'Changes the CSI driver code that exposes the SPIRE agent socket to Pods.', failure: 'An unavailable tag causes ImagePullBackOff; an incompatible driver prevents workload identity mounts.' });
special(spire, '$.spire-server.controllerManager.identities.clusterSPIFFEIDs.default.podSelector.matchLabels.kubeclaw.dev/worker-trust', { purpose: 'Selects only Pods labeled as KubeClaw trusted workers for the default SPIFFE ID registration.', acceptedValues: 'A Kubernetes label value. The platform contract uses the string `true`.', emptyBehavior: 'Removing this selector broadens identity issuance beyond explicitly labeled worker Pods.', impact: 'Changes which Pods can receive the default workload identity.', failure: 'A wrong value prevents trusted workers from receiving identities; a broader selector grants identities to unintended Pods.' });
special(spire, '$.spire-server.controllerManager.identities.clusterSPIFFEIDs.default.spiffeIDTemplate', { purpose: 'Builds each trusted worker SPIFFE ID from its namespace and ServiceAccount.', acceptedValues: 'A valid SPIRE Controller Manager SPIFFE ID template beginning with `spiffe://{{ .TrustDomain }}/`.', emptyBehavior: 'An empty template cannot issue the selected workload identity.', impact: 'Changes the identity string used by mTLS authorization at worker boundaries.', failure: 'An invalid template prevents registration. A changed path breaks authorization policies that expect the existing ID form.' });

const tailscale = 'gitops/platform/values/tailscale-operator.yaml';
file(tailscale, '6cc7ea4c8f9b0c29eb35d040dad23e9ecd4ac324bf8993e9bd43b2f8be5a160b', charts.tailscale);
special(tailscale, '$.oauth.clientId', { purpose: 'Supplies a literal Tailscale OAuth client ID only when the operator is not using its mounted OAuth Secret.', acceptedValues: 'A Tailscale OAuth client ID string. This profile intentionally leaves it empty so the official Secret path owns credentials.', emptyBehavior: 'Empty selects the mounted `operator-oauth` Secret path and avoids storing the credential in Git.', impact: 'Changing it to a literal value moves credential ownership into Helm release values.', failure: 'A missing Secret with an empty value or an invalid literal ID prevents operator authentication.' });
special(tailscale, '$.oauth.clientSecret', { purpose: 'Supplies a literal Tailscale OAuth client secret only when the operator is not using its mounted OAuth Secret.', acceptedValues: 'A Tailscale OAuth client secret string. This profile intentionally leaves it empty.', emptyBehavior: 'Empty selects the mounted `operator-oauth` Secret path and avoids storing the credential in Git.', impact: 'Changing it to a literal value creates or exposes a credential through Helm-managed Secret state.', failure: 'A missing mounted Secret with an empty value or an invalid literal secret prevents operator authentication.' });
add(tailscale, '$.installCRDs', 'booleanFeature', { subject: 'the chart installs and upgrades Tailscale custom-resource definitions' });
add(tailscale, '$.ingressClass.enabled', 'booleanFeature', { subject: 'the Tailscale IngressClass is registered' });
special(tailscale, '$.ingressClass.name', { purpose: 'Names the IngressClass handled by the Tailscale operator.', acceptedValues: 'A DNS-label IngressClass name; this platform uses `tailscale`.', emptyBehavior: 'An empty name cannot register or select the class.', impact: 'Changes the `ingressClassName` that application Ingress resources must use.', failure: 'A mismatch leaves private ingress resources without a controller.' });
special(tailscale, '$.operatorConfig.defaultTags[0]', { purpose: 'Assigns the default Tailscale ACL tag to the operator device.', acceptedValues: 'A Tailscale ACL tag in `tag:name` form that the OAuth client is permitted to own.', emptyBehavior: 'An empty or absent tag removes the selected ACL identity and can prevent policy access.', impact: 'Changes tailnet ACL membership and permissions for the operator device.', failure: 'An unauthorized or malformed tag prevents device registration.' });
special(tailscale, '$.proxyConfig.defaultTags', { purpose: 'Assigns default Tailscale ACL tags to proxy devices created by the operator.', acceptedValues: 'One `tag:name` value or a comma-separated list of tags owned by the operator OAuth client.', emptyBehavior: 'An empty value creates proxies without the selected ACL tag contract.', impact: 'Changes tailnet ACL membership and reachability for Kubernetes proxy devices.', failure: 'Unauthorized tags prevent proxy registration; incorrect tags make services unreachable or too broadly reachable.' });
addResourceSet(tailscale, '$.operatorConfig.resources', 'the Tailscale operator Pod');

const argocd = 'my-values/infra/argocd-values.yaml';
file(argocd, 'eb0a7cdadf4bab951724dafa6ec48f5d4e07152cb3d41929c59d3c2899247dac', charts.argocd);
special(argocd, '$.configs.cm.application.resourceTrackingMethod', { purpose: 'Selects how Argo CD records ownership of Kubernetes resources.', acceptedValues: 'A tracking method supported by Argo CD 10.8.0; this profile uses `annotation`.', emptyBehavior: 'An empty or omitted value falls back to chart/application-controller defaults and is not the selected ownership contract.', impact: 'Changes how Argo CD identifies resources during diff, prune, and reconciliation.', failure: 'Changing the method without migration can make existing resources appear orphaned or shared and can cause incorrect pruning.' });
special(argocd, '$.configs.params.server.insecure', { purpose: 'Runs the Argo CD API server without internal TLS because the private Tailscale ingress terminates TLS.', acceptedValues: '`true` or `false`; this topology requires `true` behind the selected TLS terminator.', emptyBehavior: 'An empty scalar is invalid. Removing it returns to chart defaults and changes the ingress-to-server protocol.', impact: 'Changes whether the Argo CD server listens for HTTP or HTTPS inside the cluster.', failure: 'A mismatch with the ingress backend protocol causes connection or TLS handshake failures.' });
add(argocd, '$.server.ingress.enabled', 'booleanFeature', { subject: 'the Argo CD chart creates its own Ingress resource' });
add(argocd, '$.server.service.type', 'serviceType', { subject: 'the Argo CD API server', allowed: '`ClusterIP`, `NodePort`, or `LoadBalancer`; this private-ingress topology uses `ClusterIP`' });

const cilium = 'my-values/infra/cilium-values.yaml';
file(cilium, 'f2ffb47f76defc4375cd4e87d30c3ee001f49512d3408846cc305625cc6f7a8e', charts.cilium);
special(cilium, '$.namespaceOverride', { purpose: 'Places Cilium resources in the dedicated `cilium` namespace.', acceptedValues: 'A DNS-label Kubernetes namespace name or null when the chart release namespace should be used.', emptyBehavior: 'Empty or null uses the Helm release namespace and is not equivalent if the release command changes.', impact: 'Changes resource names, RBAC subjects, service DNS, and the namespace used by operational checks.', failure: 'A mismatch creates resources in the wrong namespace and makes rollout or policy checks target stale objects.' });
add(cilium, '$.operator.replicas', 'replicas', { subject: 'the Cilium operator', zero: 'stops IPAM and other operator reconciliation' });
special(cilium, '$.operator.hostNetwork', { purpose: 'Runs the Cilium operator in the host network namespace during CNI bootstrap.', acceptedValues: '`true` or `false`; this cutover profile uses `true`.', emptyBehavior: 'An empty scalar is not a Boolean. Removing the key uses the pinned chart default.', impact: 'Changes operator network reachability and port-sharing behavior before Pod networking is healthy.', failure: 'Disabling it during the selected cutover can leave the operator unable to reach required endpoints; port conflicts can prevent startup.' });
for (let index = 0; index < 4; index += 1) {
  add(cilium, `$.operator.tolerations[${index}].key`, 'tolerationKey', { subject: 'the Cilium operator' });
  add(cilium, `$.operator.tolerations[${index}].operator`, 'tolerationOperator', { subject: 'the Cilium operator' });
  add(cilium, `$.operator.tolerations[${index}].effect`, 'tolerationEffect', { subject: 'the Cilium operator' });
}
special(cilium, '$.kubeProxyReplacement', { purpose: 'Controls whether Cilium replaces kube-proxy service handling.', acceptedValues: '`true` or `false`. This first migration keeps kube-proxy and uses `false`.', emptyBehavior: 'Removing the key uses the pinned chart default, which must not be assumed safe for this staged migration.', impact: 'Changes cluster Service dataplane ownership and the required K3s startup flags.', failure: 'Enabling replacement before its separate migration can break Service routing; a type outside the chart schema fails validation.' });
special(cilium, '$.ipam.mode', { purpose: 'Selects the Cilium IP address management backend.', acceptedValues: 'A mode supported by Cilium 1.20.1. This K3s migration uses `cluster-pool`.', emptyBehavior: 'An empty mode is invalid; removing it uses the pinned chart default and can change address ownership.', impact: 'Changes how Pod CIDRs are allocated and which operator settings apply.', failure: 'A mode that conflicts with cluster networking prevents Pod address allocation.' });
special(cilium, '$.ipam.operator.clusterPoolIPv4PodCIDRList[0]', { purpose: 'Defines the IPv4 Pod CIDR from which the Cilium operator allocates per-node ranges.', acceptedValues: 'A valid IPv4 CIDR. This profile uses the existing K3s Pod CIDR `10.42.0.0/16`.', emptyBehavior: 'An empty or missing list leaves cluster-pool IPAM without the selected address pool.', impact: 'Changes all future Pod address allocation and must not overlap node, Service, or external networks.', failure: 'An invalid or overlapping CIDR prevents allocation or causes routing conflicts.' });
special(cilium, '$.ipam.operator.clusterPoolIPv4MaskSize', { purpose: 'Sets the prefix size delegated from the cluster Pod CIDR to each node.', acceptedValues: 'An IPv4 prefix length compatible with the cluster pool; this profile uses `24`.', emptyBehavior: 'An empty scalar is invalid. Removing it uses the pinned chart default.', impact: 'Changes Pod address capacity per node and how the pool is divided.', failure: 'An incompatible mask prevents allocation or provides too few Pod addresses.' });
special(cilium, '$.routingMode', { purpose: 'Selects whether Cilium routes Pod traffic natively or through an overlay tunnel.', acceptedValues: '`native`, `tunnel`, or the chart-supported empty default. This profile explicitly uses `tunnel`.', emptyBehavior: 'Removing the field uses the chart default. Do not use an empty scalar when an explicit migration contract is required.', impact: 'Changes node routing requirements, packet encapsulation, and MTU considerations.', failure: 'A mode that does not match node routes prevents cross-node Pod connectivity.' });
special(cilium, '$.tunnelProtocol', { purpose: 'Selects the encapsulation protocol for Cilium tunnel routing.', acceptedValues: 'A protocol supported by Cilium 1.20.1; this profile uses `vxlan`.', emptyBehavior: 'An empty value delegates protocol selection to chart defaults.', impact: 'Changes the overlay packet format and required network allowances.', failure: 'An unsupported or blocked protocol prevents cross-node Pod traffic.' });
special(cilium, '$.policyEnforcementMode', { purpose: 'Selects when Cilium enforces network policy on endpoints.', acceptedValues: '`default`, `always`, or `never`; this platform uses `default`.', emptyBehavior: 'An empty value is invalid. Removing it uses the pinned chart default.', impact: 'Changes whether endpoints without selected policy remain open or are denied.', failure: 'A permissive mode weakens isolation; an unexpectedly strict mode blocks required platform traffic.' });
special(cilium, '$.cni.exclusive', { purpose: 'Makes Cilium own the node CNI configuration directory and move competing CNI files aside.', acceptedValues: '`true` or `false`; this replacement cutover uses `true`.', emptyBehavior: 'An empty scalar is invalid. Removing it uses the pinned chart default.', impact: 'Prevents Pods from starting with a second CNI during the Flannel-to-Cilium cutover.', failure: 'Disabling exclusivity can produce mixed CNI allocation; enabling it without cutover preparation can disrupt new Pod networking.' });
special(cilium, '$.cni.uninstall', { purpose: 'Controls whether Cilium removes its CNI files when the agent stops.', acceptedValues: '`true` or `false`; this upgrade-safe profile uses `false`.', emptyBehavior: 'An empty scalar is invalid. Removing it uses the pinned chart default.', impact: 'Changes whether an agent restart can remove the node CNI configuration.', failure: 'Enabling removal during an upgrade can leave the node unable to create Pod sandboxes.' });
for (const [pathName, subject] of [['hubble.enabled', 'Hubble flow observation is enabled in Cilium'], ['hubble.relay.enabled', 'the Hubble Relay aggregation service is deployed'], ['hubble.relay.tls.server.enabled', 'Hubble Relay accepts TLS from its in-cluster clients'], ['hubble.ui.enabled', 'the Hubble UI is deployed']]) add(cilium, `$.${pathName}`, 'booleanFeature', { subject });
add(cilium, '$.hubble.relay.service.type', 'serviceType', { subject: 'Hubble Relay', allowed: '`ClusterIP`, `NodePort`, or `LoadBalancer`; this platform keeps Relay private with `ClusterIP`' });
add(cilium, '$.hubble.ui.service.type', 'serviceType', { subject: 'Hubble UI', allowed: '`ClusterIP` or `NodePort`; this platform keeps the UI private with `ClusterIP`' });
special(cilium, '$.hubble.relay.servicePort', { purpose: 'Sets the in-cluster gRPC port exposed by the Hubble Relay Service.', acceptedValues: 'An integer from 1 through 65535; this profile uses `4245`.', emptyBehavior: 'An empty or zero port is invalid.', impact: 'Changes the endpoint that Hubble UI and Ops clients must use.', failure: 'A mismatch with client configuration causes connection failures; a conflicting port prevents Service or container startup.' });
special(cilium, '$.hubble.ui.backend.extraEnv[0].name', { purpose: 'Names the Hubble UI backend environment variable that selects the Relay endpoint.', acceptedValues: 'Exactly `FLOWS_API_ADDR` for the pinned Hubble UI backend.', emptyBehavior: 'An empty name is invalid for a container environment entry.', impact: 'Binds the following value to Hubble UI flow API discovery.', failure: 'A wrong name leaves the backend on another default and prevents flow queries.' });
special(cilium, '$.hubble.ui.backend.extraEnv[0].value', { purpose: 'Sets the Hubble Relay host and port used by the Hubble UI backend.', acceptedValues: 'A reachable `host:port` pair; this profile uses `hubble-relay:4245`.', emptyBehavior: 'An empty value leaves the flow API endpoint unusable.', impact: 'Changes which Relay instance supplies UI flow data.', failure: 'An invalid or unreachable address makes Hubble UI flow queries fail.' });

for (const [pathName, digest] of [['my-values/infra/native-worker-pools-ax41.yaml', '47b2aa2f998dd741a31a914cf3fb3a293a335863679734656de1a5b1c366696c'], ['my-values/infra/native-worker-pools.yaml', '3fdf392b1e755b7b3a5b29954b0feb786140956209de6f6011adc2412aeb0888']]) {
  file(pathName, digest);
  special(pathName, '$.schemaVersion', { purpose: 'Selects the native worker node-policy schema understood by the checked-in validator and renderer.', acceptedValues: 'Exactly the integer `1`.', emptyBehavior: 'Missing, null, string, or empty values fail validation.', impact: 'Selects how every other field is interpreted before any host artifact is generated.', failure: 'Any value other than integer `1` stops with `NATIVE_NODE_IDENTITY_REQUIRED` before output is written.' });
  special(pathName, '$.nodeName', { purpose: 'Binds the generated native worker policy and Prism scheduling values to one Kubernetes node.', acceptedValues: 'A non-empty lowercase Kubernetes node name matching `^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$`.', emptyBehavior: 'Null, empty, or missing values fail policy validation.', impact: 'Changes the sole host on which the native Prism worker can run and the node identity checked during activation.', failure: 'An invalid value stops with `NATIVE_NODE_IDENTITY_REQUIRED`; a valid but wrong node fails preflight or targets the wrong host.' });
  special(pathName, '$.runtime.containerdVersion', { purpose: 'Records the exact selected host containerd version for the generated NRI policy and activation preflight.', acceptedValues: 'A containerd version matching `v?2.<minor>=2.<patch>` with an optional build suffix, for example `2.3.4-k3s1.36`.', emptyBehavior: 'Null, empty, or missing values fail NRI policy rendering.', impact: 'Binds the generated host policy to the runtime version whose NRI behavior was checked.', failure: 'An invalid value stops with `NATIVE_NODE_SELECTED_CONTAINERD_VERSION_REQUIRED`; a mismatch with the host stops activation.' });
  for (const [scope, subject] of [['systemReserve', 'the host operating system plus both native worker pools'], ['kubernetesReserve', 'Kubernetes daemons and ordinary node services']]) {
    add(pathName, `$.${scope}.cpuMillicores`, 'nativeCpu', { subject });
    add(pathName, `$.${scope}.memoryBytes`, 'nativeMemory', { subject });
    add(pathName, `$.${scope}.tasks`, 'nativeTasks', { subject });
  }
  for (const role of ['buster', 'prism']) {
    special(pathName, `$.pools.${role}.namespace`, { purpose: `Selects the Kubernetes namespace whose ${role} containers are assigned to the native ${role} cgroup pool.`, acceptedValues: 'A DNS-label namespace matching `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`.', emptyBehavior: 'Missing, null, or empty values fail policy validation.', impact: `Changes which namespace is bound to the ${role} NRI role and generated worker values.`, failure: 'An invalid value stops with `NATIVE_NODE_NAMESPACE_REQUIRED`; a wrong namespace prevents intended containers from receiving the pool.' });
    add(pathName, `$.pools.${role}.cpuMillicores`, 'nativeCpu', { subject: `the native ${role} worker pool` });
    add(pathName, `$.pools.${role}.memoryBytes`, 'nativeMemory', { subject: `the native ${role} worker pool` });
    add(pathName, `$.pools.${role}.tasks`, 'nativeTasks', { subject: `the native ${role} worker pool` });
    special(pathName, `$.pools.${role}.maximumActiveScopes`, { purpose: `Limits concurrent active execution scopes in the native ${role} worker pool.`, acceptedValues: 'A positive safe integer.', emptyBehavior: 'Missing, null, zero, fractional, and negative values fail policy validation.', impact: `Changes the maximum parallel work admitted to the fixed ${role} host resource budget.`, failure: 'Validation stops with `NATIVE_NODE_POLICY_LIMIT_INVALID`; a value above measured capacity permits contention and timeouts.' });
  }
}

const opsRelease = 'releases/values/ops.yaml';
file(opsRelease, '3b3aed1c7bfecd96dbc107bd373815adf72e962012f837497c25d259276f2964');
for (const [fieldPath, subject] of [['$.codexImage', 'Codex Ops container'], ['$.mcpImage', 'Ops MCP container']]) special(opsRelease, fieldPath, { purpose: `Selects the immutable release image for the ${subject}.`, acceptedValues: 'A complete OCI image reference ending in `@sha256:` and 64 lowercase hexadecimal characters.', emptyBehavior: 'An empty value fails the ops chart image guard and cannot be deployed.', impact: `Changes the exact executable bytes for the ${subject}; explicit command-line overrides win after this file.`, failure: 'A tag-only or malformed reference fails Helm rendering. An unavailable digest causes ImagePullBackOff.' });

const directPostgresql = 'my-values/infra/postgresql-values.yaml';
file(directPostgresql, 'b7c1445d47350c6fcae2fc7de901e930dec1f8309331bf0db69c70c1f3404994', charts.postgresqlDirect);
cloneAuthorities(postgresql, directPostgresql);

const directRedis = 'my-values/infra/redis-values.yaml';
file(directRedis, '929dec7ffac0922517188e0fb318b746e276292acad2723c59da802e5962c9b2', charts.redis);
cloneAuthorities(redis, directRedis);
special(directRedis, '$.commonConfiguration', { purpose: 'Defines the Redis server persistence and memory policy used for stream, acknowledgement, and deduplication state.', acceptedValues: 'Valid Redis configuration directives. This profile requires append-only persistence, refuses truncated AOF loading, disables snapshot saves, and uses `maxmemory-policy noeviction`.', emptyBehavior: 'Empty text removes the selected durability and no-eviction contract and must not be used for pipeline state.', impact: 'Changes write durability, restart recovery, maximum memory, and behavior at capacity.', failure: 'Invalid directives prevent Redis startup. Weaker persistence can lose acknowledged state; an eviction policy can silently remove deduplication keys.' });

const directSpire = 'my-values/infra/spire-values.yaml';
file(directSpire, 'dad3b9a5f3815773de1c49acfe1ea982f97bb076fcd312fb99155a5a083a06fd', charts.spire);
cloneAuthorities(spire, directSpire, new Set([
  '$.global.deleteHooks.enabled',
  '$.global.installAndUpgradeHooks.enabled',
  '$.spire-server.controllerManager.installAndUpgradeHook.enabled',
]));

const directTailscale = 'my-values/infra/tailscale-operator-values.yaml';
file(directTailscale, '8c8f44a3f243b519973ea250d283da3c6a08b31a9224ee3b34012b4e28f36110', charts.tailscale);
cloneAuthorities(tailscale, directTailscale);
for (const [prefix, subject] of [['$.operatorConfig.image', 'Tailscale Kubernetes operator'], ['$.proxyConfig.image', 'Tailscale proxy workload']]) {
  add(directTailscale, `${prefix}.repository`, 'imageRepository', { subject });
  add(directTailscale, `${prefix}.digest`, 'imageDigest', { subject });
}

const codexOpsValues = 'gitops/platform/values/codex-ops.yaml';
file(codexOpsValues, '3a3fe462c285c48c6bc54e6fffc9ff6640daec3507e5dfdb5a382e16605c8e02');
for (const index of [0, 1]) special(codexOpsValues, `$.networkPolicy.apiServerCIDRs[${index}]`, { purpose: 'Allows the Ops Pod to reach one explicit Kubernetes API server address through its egress policy.', acceptedValues: 'A valid IPv4 or IPv6 CIDR accepted by the selected NetworkPolicy renderer.', emptyBehavior: 'An empty entry is invalid. Removing an actual API address can cut off Ops cluster access.', impact: 'Changes the destination addresses reachable on the configured Kubernetes API port.', failure: 'A malformed CIDR stops rendering or API admission; a missing actual endpoint causes Ops Kubernetes requests to time out.' });
special(codexOpsValues, '$.networkPolicy.apiServerPort', { purpose: 'Sets the Kubernetes API TCP port allowed by the Ops Pod egress policy.', acceptedValues: 'An integer from 1 through 65535; this cluster uses `6443`.', emptyBehavior: 'An empty, zero, or missing port does not define the required egress rule.', impact: 'Changes the only API-server port the Ops containers can reach.', failure: 'A wrong port passes policy admission but makes Kubernetes API connections fail.' });
special(codexOpsValues, '$.networkPolicy.cilium', { purpose: 'Selects whether the generated Ops network policy includes the Cilium-specific API-server entity rule.', acceptedValues: '`true` or `false`; the bootstrap generator can replace this discovered value for the target cluster.', emptyBehavior: 'An empty scalar is not a Boolean. Removing it uses the ops chart default.', impact: 'Changes whether Cilium identity-based API-server egress accompanies CIDR rules.', failure: 'A false value on a cluster that requires the entity rule blocks API access; enabling it without Cilium produces an unsupported policy object.' });
for (let index = 0; index < 7; index += 1) special(codexOpsValues, `$.rbac.namespaces[${index}]`, { purpose: 'Adds one namespace to the generated Ops observer and execution RBAC scope.', acceptedValues: 'A DNS-label Kubernetes namespace name that exists or is intentionally managed by the platform.', emptyBehavior: 'An empty list item is invalid. Removing a required namespace removes Ops visibility or permitted actions there.', impact: 'Changes namespace-scoped Roles, RoleBindings, and the set available to Ops tooling.', failure: 'A malformed or absent namespace makes RBAC generation fail or leaves later operations forbidden.' });

const litellmConfig = 'my-values/infra/litellm-config.yaml';
file(litellmConfig, '70356ac84fef937d6cfad5ea54583a16342784d8299406e155524128542baa6d');
special(litellmConfig, '$.general_settings.master_key', { purpose: 'Tells LiteLLM to read its administrative master key from the runtime environment instead of storing the credential in this file.', acceptedValues: 'Exactly `os.environ/LITELLM_MASTER_KEY` for the checked-in credential authority.', emptyBehavior: 'An empty value removes the required environment reference and is rejected by the recovery credential preflight.', impact: 'Changes the source of LiteLLM administrative authentication.', failure: 'Any other value stops recovery rendering with `POSTGRES_RECOVERY_CREDENTIAL_AUTHORITY_UNSUPPORTED` or makes LiteLLM use an unintended credential source.' });
special(litellmConfig, '$.litellm_settings.drop_params', { purpose: 'Allows LiteLLM to remove request parameters that the selected upstream model does not support.', acceptedValues: '`true` or `false`; this profile uses `true` for the embedding provider.', emptyBehavior: 'An empty scalar is not a Boolean. Removing it uses LiteLLM default behavior.', impact: 'Changes whether incompatible optional request parameters are dropped or forwarded.', failure: 'Disabling it can make the upstream reject otherwise valid embedding requests; a non-Boolean value can prevent configuration loading.' });
special(litellmConfig, '$.litellm_settings.set_verbose', { purpose: 'Controls verbose LiteLLM diagnostic logging.', acceptedValues: '`true` or `false`; this profile keeps verbose logging disabled.', emptyBehavior: 'An empty scalar is not a Boolean. Removing it uses LiteLLM default logging.', impact: 'Changes log volume and the amount of request diagnostic detail emitted.', failure: 'Verbose logs can expose more operational metadata and consume storage; a non-Boolean value can prevent configuration loading.' });
special(litellmConfig, '$.model_list[0].model_name', { purpose: 'Defines the public LiteLLM model alias used by KubeClaw for embeddings.', acceptedValues: 'A non-empty LiteLLM model name; this platform uses `gemini-embedding-001`.', emptyBehavior: 'An empty name cannot be selected by OpenAI-compatible model requests.', impact: 'Changes the model identifier clients send to LiteLLM.', failure: 'A mismatch with client configuration produces model-not-found responses.' });
special(litellmConfig, '$.model_list[0].litellm_params.model', { purpose: 'Selects the LiteLLM provider route and upstream embedding model.', acceptedValues: 'A provider-qualified LiteLLM model string; this profile uses `vertex_ai/gemini-embedding-001`.', emptyBehavior: 'An empty value leaves the model alias without an upstream route.', impact: 'Changes the external model provider, model behavior, and credential requirements.', failure: 'An unsupported route or unavailable model causes LiteLLM request failures.' });
special(litellmConfig, '$.model_list[0].litellm_params.vertex_location', { purpose: 'Selects the Google Vertex AI location used for the embedding model.', acceptedValues: 'A Vertex AI region or the supported `global` location.', emptyBehavior: 'An empty value prevents selection of the intended Vertex endpoint.', impact: 'Changes the upstream endpoint, regional availability, and data-location boundary.', failure: 'An unsupported or unauthorized location causes provider request failures.' });
special(litellmConfig, '$.model_list[0].litellm_params.vertex_project', { purpose: 'Selects the Google Cloud project billed and authorized for Vertex AI embedding requests.', acceptedValues: 'A non-empty Google Cloud project ID authorized for the mounted service account.', emptyBehavior: 'An empty value leaves the provider route without a project.', impact: 'Changes quota, billing, audit ownership, and IAM checks for embeddings.', failure: 'A missing or unauthorized project causes Vertex authentication or permission errors.' });

const postgresqlRecovery = 'my-values/infra/postgresql-recovery.yaml';
file(postgresqlRecovery, '5f0ffb0cdf5acdbd814da726060d5125c5cae912554f27de57251ea90ae8d438');
special(postgresqlRecovery, '$.schemaVersion', { purpose: 'Selects the PostgreSQL recovery-policy contract understood by render-postgresql-recovery.mjs.', acceptedValues: 'Exactly the integer `1`.', emptyBehavior: 'Missing, null, string, or empty values fail validation.', impact: 'Selects how every backup, retention, verification, resource, and storage field is interpreted.', failure: 'Any other value stops rendering with `POSTGRES_RECOVERY_CONFIGURATION_INVALID` before resources are emitted.' });
for (const [fieldName, purpose, limit] of [
  ['backupIntervalMinutes', 'Sets the interval between scheduled PostgreSQL backups.', 'A positive safe integer no greater than 60 minutes.'],
  ['verificationIntervalMinutes', 'Sets the interval between backup freshness and database verification runs.', 'A positive safe integer no greater than 30 minutes and no greater than the backup interval.'],
  ['maximumAgeSeconds', 'Sets the maximum accepted age of the newest verified backup.', 'A positive safe integer larger than the complete worst-case verification and backup timing budget.'],
  ['maximumDurationSeconds', 'Sets the maximum runtime allowed for one backup operation.', 'A positive safe integer smaller than maximumAgeSeconds.'],
  ['verificationDeadlineSeconds', 'Sets how long Kubernetes may delay a scheduled verification Job before it is missed.', 'A positive safe integer that keeps the complete RPO timing formula below maximumAgeSeconds.'],
]) special(postgresqlRecovery, `$.${fieldName}`, { purpose, acceptedValues: limit, emptyBehavior: 'Missing, empty, zero, fractional, or negative values fail recovery-policy validation.', impact: 'Changes the backup schedule or the time window used to prove recoverability.', failure: 'An invalid individual value stops with `POSTGRES_RECOVERY_POLICY_INVALID`; an unsafe combination stops with `POSTGRES_RECOVERY_SCHEDULE_RPO_INVALID`.' });
for (const [fieldName, subject] of [['maximumBackupBytes', 'one PostgreSQL backup'], ['maximumRetainedBytes', 'all retained PostgreSQL backup material']]) special(postgresqlRecovery, `$.${fieldName}`, { purpose: `Sets the byte ceiling for ${subject}.`, acceptedValues: 'A positive safe integer. The retained ceiling must exceed the per-backup ceiling by more than 64 MiB.', emptyBehavior: 'Missing, empty, zero, fractional, or negative values fail recovery-policy validation.', impact: `Changes the storage guard applied to ${subject}.`, failure: 'An invalid value stops with `POSTGRES_RECOVERY_POLICY_INVALID`; an unsafe relationship stops with `POSTGRES_RECOVERY_BUDGET_INVALID`.' });
add(postgresqlRecovery, '$.persistence.size', 'pvcSize', { subject: 'retained PostgreSQL backup data' });
special(postgresqlRecovery, '$.persistence.storageClass', { purpose: 'Selects the Kubernetes StorageClass for the PostgreSQL backup PVC.', acceptedValues: 'Null to use the cluster default, or a DNS-label StorageClass name.', emptyBehavior: 'An empty string is not accepted by the checked-in validator; use null for the cluster default.', impact: 'Changes the storage provider, binding behavior, and recovery availability of backup data.', failure: 'An invalid name stops rendering; an unavailable class leaves the backup PVC Pending.' });
addResourceSet(postgresqlRecovery, '$.resources', 'each PostgreSQL backup and verification Job');

// Kubernetes validates the outer type of these fields, but their receiving
// controller or process owns the embedded value. Keep an exact, digest-pinned
// contract so an opaque payload can never pass as generic API-schema evidence.
const childApplicationFiles = [
  ['gitops/platform/bootstrap/alloy.yaml', 'b2c06f6acba94c24edd5b30980376675ba920a9ea6f92c403577d2a236073434'],
  ['gitops/platform/bootstrap/argocd.yaml', 'f657afba943a76efc66d093a257eac141fce940a88a1e3e0f533e2fbec12d6b8'],
  ['gitops/platform/bootstrap/codex-ops.yaml', 'b7e8780eac84b1638be814588244b32f6e71e7c29e2f1dad76b4807a0d955e0e'],
  ['gitops/platform/bootstrap/csi-driver-smb.yaml', 'ce561dc5a9a2b5f8b06fbb80c59f5590fcab9b43906a6acc5df12ca62122c99e'],
  ['gitops/platform/bootstrap/litellm.yaml', 'f2fef2026978872c4b27bcef37722e981c3498e816514feff66bf989acb858f6'],
  ['gitops/platform/bootstrap/loki.yaml', '2b3721a57154eb14e92ebccd1e9cabf82499cddf9c98369b88b195e042958c6e'],
  ['gitops/platform/bootstrap/postgresql.yaml', '97755ce4b6dfe852cf5492d27c8ab7e33a7dd3d9278cb755d184b72239ea0256'],
  ['gitops/platform/bootstrap/prometheus.yaml', 'd9c81c5644d744237997d336031cce970159da626024f3573cd7b4d0b55a7d44'],
  ['gitops/platform/bootstrap/promtail.yaml', 'f6d4fe2568c154f4db415d404cb9c4087d05ea373492eb7fa7160830de169855'],
  ['gitops/platform/bootstrap/redis.yaml', '79b2c61df2d6feee7a3946da486ebaefc64af6365c5655600c514971bc4dc47d'],
  ['gitops/platform/bootstrap/registry-local.yaml', '8218528022125386b1c9c86f0bf07c2e2f8856d9689d47ad8eca3d252e766e7b'],
  ['gitops/platform/bootstrap/registry-mirror.yaml', '8e8122ad4994b2dbd4690303caf7e2d0cb0f02c92cae7d35dff39c3e101c7f3e'],
  ['gitops/platform/bootstrap/spire-crds.yaml', '0e4d2e2b54c905eaa372749b99a8a2a65585a238875e5fa7c5ea880869276278'],
  ['gitops/platform/bootstrap/spire.yaml', 'b6bb6863509706131898ce576c14249e1d483209ce99f201142dc758ba3521dd'],
  ['gitops/platform/bootstrap/tailscale-operator.yaml', '9e3ffe47b3650d62633debc56b5dcf71b2f4d123b1e4c733e51ee3d7333dfb11'],
];
for (const [pathName, digest] of childApplicationFiles) {
  file(pathName, digest);
  special(pathName, '$.metadata.annotations.argocd.argoproj.io/ignore-healthcheck', {
    purpose: 'Tells Argo CD not to use this child Application as an implicit health dependency of its parent resource.',
    acceptedValues: 'The string `true` for this platform child-Application contract.',
    emptyBehavior: 'Removing or emptying the annotation restores the controller default and can make parent health depend on the child.',
    impact: 'Separates parent reconciliation health from the child workload-health decision made by the installed Application health script.',
    failure: 'A different value can leave the parent waiting on child health or report a parent state that does not match the selected platform policy.',
  });
  special(pathName, '$.metadata.annotations.kubeclaw.io/health-mode', {
    purpose: 'Selects the observed-workload branch in the checked-in Argo CD Application health script.',
    acceptedValues: 'Exactly `observed` for platform child Applications; absence selects the strict selected-revision branch.',
    emptyBehavior: 'An empty or missing value does not select observed mode and therefore keeps the strict revision and sync checks.',
    impact: 'Makes the child report its observed workload health independently of manual sync status while comparison and sync errors remain degraded.',
    failure: 'A misspelled value silently selects strict mode and can keep a manually managed child Progressing even when its workload is healthy.',
  });
}

for (const [pathName, digest] of [
  ['gitops/platform/bootstrap/data-project.yaml', 'a64e95139407ba0008268b6ad6640d78a005b18680a3c79e3c7ffd3bb4a4f534'],
  ['gitops/platform/bootstrap/identity-project.yaml', 'c602ae37208eed48b471e01f1e0bf6393fb243ef8f21f2ca947d450172e6a3b3'],
  ['gitops/platform/bootstrap/infra-project.yaml', 'af21e05ff744cf9db78d2801827b0250af4bd3ce36c3e23062c43be234a58097'],
  ['gitops/platform/bootstrap/monitoring-project.yaml', '80c720536148b9d3be29f334611bb7dc07c272651e8284a8b013011c3c23cc11'],
  ['gitops/platform/bootstrap/storage-drivers-project.yaml', '9e8f462b13b16a35a76e6c31d68941cf9d87f23d6d71751871bf2bd38e919d50'],
]) {
  file(pathName, digest);
  special(pathName, '$.metadata.annotations.argocd.argoproj.io/sync-wave', {
    purpose: 'Places the Argo CD AppProject in the bootstrap wave that runs before Applications which reference that project.',
    acceptedValues: 'A base-10 integer encoded as a string; this contract uses `-1`.',
    emptyBehavior: 'An empty or missing annotation uses Argo CD wave zero and loses the required project-before-Application ordering.',
    impact: 'Controls bootstrap ordering, not Kubernetes admission or the order of later workload reconciliation.',
    failure: 'A later wave can make child Application creation fail because its named AppProject does not yet exist.',
  });
}

special('gitops/platform/bootstrap/spire.yaml', '$.metadata.annotations.argocd.argoproj.io/compare-options', {
  purpose: 'Selects Argo CD server-side diff for the SPIRE Application so comparison uses Kubernetes field ownership and defaulting.',
  acceptedValues: 'Exactly `ServerSideDiff=true` for this checked-in SPIRE comparison contract.',
  emptyBehavior: 'Removing the annotation restores normal Argo CD diff behavior and can reintroduce false drift for server-defaulted fields.',
  impact: 'Changes how Argo CD calculates SPIRE drift; it does not change the manifest applied to the cluster by itself.',
  failure: 'An unsupported option is ignored or rejected by Argo CD and can leave persistent false OutOfSync reports.',
});

special('gitops/platform/bootstrap/argocd.yaml', '$.spec.sources[0].helm.valuesObject.configs.cm.resource.customizations.health.argoproj.io_Application', {
  purpose: 'Installs the Lua health evaluator that separates observed platform children from runtime children that require selected-revision proof.',
  acceptedValues: 'Lua code accepted by Argo CD resource health customization and returning a status and message for an Application object.',
  emptyBehavior: 'Empty or missing code removes the platform-specific child health contract and leaves Argo CD default Application health behavior.',
  impact: 'Controls parent and child health reporting, including degraded comparison errors, observed workload health, and strict revision matching.',
  failure: 'Invalid Lua makes Application health evaluation fail. Incorrect conditions can report a stale or failed child as healthy or block a healthy rollout.',
});

clonePrefixedAuthorities(codexOpsValues, 'gitops/platform/bootstrap/codex-ops.yaml', '$.spec.source.helm.valuesObject');
clonePrefixedAuthorities(opsRelease, 'gitops/platform/bootstrap/codex-ops.yaml', '$.spec.source.helm.valuesObject');

const liteLLMProcessAuthorities = [
  ['$.spec.template.spec.containers[0].args[0]', 'Selects the LiteLLM command-line option that identifies its configuration file.', 'Exactly `--config` for the selected LiteLLM image.', 'Removing it stops the following path from being interpreted as the configuration file.', 'Controls whether LiteLLM loads the mounted platform configuration.', 'A missing or unsupported option prevents startup or starts LiteLLM without the selected configuration.'],
  ['$.spec.template.spec.containers[0].args[1]', 'Supplies the mounted LiteLLM configuration path to the preceding command-line option.', 'Exactly the absolute path `/app/config.yaml`, matching the ConfigMap volume mount.', 'An empty or missing path leaves `--config` without a readable file.', 'Selects the model, database, and provider configuration loaded by LiteLLM.', 'A wrong or unreadable path makes LiteLLM startup fail.'],
  ['$.spec.template.spec.containers[0].args[2]', 'Selects the LiteLLM command-line option that sets the HTTP listen port.', 'Exactly `--port` for the selected LiteLLM image.', 'Removing it makes the following value lose its port meaning and returns port choice to the image.', 'Controls whether the declared container and Service port match the LiteLLM listener.', 'A missing or unsupported option makes the Service health checks unable to reach LiteLLM.'],
  ['$.spec.template.spec.containers[0].args[3]', 'Sets the LiteLLM HTTP listen port consumed by the preceding command-line option.', 'A decimal TCP port from 1 through 65535; this deployment uses `4000`.', 'An empty or missing value leaves `--port` incomplete.', 'Changes the process listener and must stay equal to the declared container and Service target port.', 'An invalid port prevents startup; a valid but mismatched port makes readiness and client connections fail.'],
  ['$.spec.template.spec.containers[0].env[0].name', 'Names the environment variable through which Google client libraries find the mounted service-account file.', 'Exactly `GOOGLE_APPLICATION_CREDENTIALS` for the selected Google client libraries.', 'An empty or changed name leaves the credential path unavailable to the Google provider.', 'Binds the following file path to Google Vertex AI authentication.', 'A wrong name causes Vertex AI authentication to fail even when the Secret is mounted.'],
  ['$.spec.template.spec.containers[0].env[0].value', 'Sets the mounted Google service-account file read by Google client libraries.', 'Exactly the readable absolute path `/keys/credentials.json`, matching the Secret volume mount.', 'An empty or missing path prevents credential discovery through this environment contract.', 'Selects the credential file used for Vertex AI requests.', 'A wrong, unreadable, or invalid file path causes Google authentication failures.'],
  ['$.spec.template.spec.containers[0].env[1].name', 'Names the LiteLLM environment switch that enables database-backed model storage.', 'Exactly `STORE_MODEL_IN_DB` for the selected LiteLLM image.', 'An empty or changed name leaves database-backed model storage at image default behavior.', 'Binds the following Boolean-like string to LiteLLM database storage behavior.', 'A wrong name can make LiteLLM ignore the setting and use a different model-storage mode.'],
  ['$.spec.template.spec.containers[0].env[1].value', 'Enables LiteLLM storage of model configuration in PostgreSQL.', 'The case-sensitive string `True` used by the selected LiteLLM configuration parser.', 'An empty or missing value does not enable the selected database-backed storage behavior.', 'Changes whether model configuration survives LiteLLM Pod replacement through PostgreSQL.', 'An unsupported value can disable persistence or make configuration loading fail.'],
];
for (const [pathName, digest] of [
  ['gitops/platform/litellm/resources.yaml', 'faf5a32f91568604ee1726ac60a58c7490fb95802d61a0019171006423474637'],
  ['my-values/infra/litellm-deployment.yaml', '21136d7cc63b549db0d9e1f3a32d449c5bf3c2644790d144d47d476372c56bab'],
]) {
  file(pathName, digest);
  for (const [fieldPath, purpose, acceptedValues, emptyBehavior, impact, failure] of liteLLMProcessAuthorities) {
    special(pathName, fieldPath, { purpose, acceptedValues, emptyBehavior, impact, failure });
  }
}

const registryDeleteName = { purpose: 'Names the Distribution environment switch that permits registry blob deletion.', acceptedValues: 'Exactly `REGISTRY_STORAGE_DELETE_ENABLED` for Distribution 3.0.0.', emptyBehavior: 'An empty or changed name leaves deletion at the image configuration default.', impact: 'Binds the following value to registry deletion and garbage-collection preparation.', failure: 'A wrong name makes the registry ignore the setting and prevents the selected delete workflow.' };
const registryDeleteValue = { purpose: 'Enables Distribution delete operations required before the documented offline garbage-collection procedure.', acceptedValues: 'The lower-case string `true` or `false`; this deployment selects `true`.', emptyBehavior: 'An empty or missing value returns behavior to the image configuration and does not prove delete support.', impact: 'Controls whether clients can delete manifests before offline garbage collection.', failure: 'A false or ignored value makes delete requests fail; unrestricted deletion without the maintenance procedure can remove required content.' };

const gitOpsRegistryLocal = 'gitops/platform/registry-local/resources.yaml';
file(gitOpsRegistryLocal, 'f728da90b05f3185afce2d7de85484ff4bab8f29e7db88d797ce1dcbf78916a7');
special(gitOpsRegistryLocal, '$.spec.template.spec.containers[0].env[0].name', registryDeleteName);
special(gitOpsRegistryLocal, '$.spec.template.spec.containers[0].env[0].value', registryDeleteValue);

const registryLocalManifest = 'my-values/infra/registry-local.yaml';
file(registryLocalManifest, '3fe00107c5ee2387313626219668bdc02d994a96c32776a7dd2138bdd16f10ae');
special(registryLocalManifest, '$.data.config.yml', { purpose: 'Defines the complete Distribution 3.0.0 configuration for the anonymous local HTTP lab registry.', acceptedValues: 'Valid Distribution YAML with filesystem storage, deletion and upload purging disabled, and the HTTP listener on port 5000.', emptyBehavior: 'Empty configuration makes the registry image fall back or fail and does not preserve this storage and maintenance contract.', impact: 'Controls the storage root, deletion behavior, upload cleanup, logging, and clear-text listener used by the local lab registry.', failure: 'Invalid YAML or unsupported settings prevent registry startup; unsafe deletion or purging settings can remove content outside the offline maintenance procedure.' });
special(registryLocalManifest, '$.spec.template.spec.containers[0].args[0]', { purpose: 'Selects the Distribution subcommand that starts the registry server.', acceptedValues: 'Exactly `serve` for Distribution 3.0.0.', emptyBehavior: 'Removing it returns command selection to the image and no longer proves use of the mounted configuration.', impact: 'Starts the registry server rather than a maintenance subcommand.', failure: 'An unsupported subcommand makes the container exit.' });
special(registryLocalManifest, '$.spec.template.spec.containers[0].args[1]', { purpose: 'Supplies the mounted Distribution configuration file to the serve subcommand.', acceptedValues: 'Exactly `/etc/kubeclaw-registry/config.yml`, matching the ConfigMap volume mount.', emptyBehavior: 'An empty or missing path leaves the serve command without this repository configuration.', impact: 'Selects the storage and listener configuration used by the local registry.', failure: 'A wrong or unreadable path makes the registry container exit.' });
special(registryLocalManifest, '$.spec.template.spec.containers[0].env[0].name', { purpose: 'Names the OpenTelemetry exporter selector consumed by the Distribution image.', acceptedValues: 'Exactly `OTEL_TRACES_EXPORTER` for the selected image.', emptyBehavior: 'An empty or changed name does not disable the image tracing exporter.', impact: 'Binds the following value to trace-export behavior.', failure: 'A wrong name can make the image initialize an unwanted exporter and emit connection errors.' });
special(registryLocalManifest, '$.spec.template.spec.containers[0].env[0].value', { purpose: 'Disables trace export from the anonymous local registry.', acceptedValues: 'Exactly `none` for the selected OpenTelemetry SDK.', emptyBehavior: 'An empty or missing value permits SDK default exporter selection.', impact: 'Prevents the lab registry from attempting to send traces to an undeclared collector.', failure: 'An unsupported value can cause exporter initialization errors or repeated failed export attempts.' });

const registryMirrorManifest = 'my-values/infra/registry-mirror.yaml';
file(registryMirrorManifest, '19673e314634c078740c21094e2de9a3db3fe9a5eaccc5be1b597f4454a11645');
special(registryMirrorManifest, '$.spec.template.spec.containers[0].env[0].name', { purpose: 'Names the Distribution environment setting that selects a pull-through cache upstream.', acceptedValues: 'Exactly `REGISTRY_PROXY_REMOTEURL` for Distribution 3.0.0.', emptyBehavior: 'An empty or changed name leaves this registry without the selected proxy upstream.', impact: 'Binds the following URL to pull-through cache behavior.', failure: 'A wrong name makes the registry operate without the intended Docker Hub mirror contract.' });
special(registryMirrorManifest, '$.spec.template.spec.containers[0].env[0].value', { purpose: 'Selects Docker Hub as the upstream registry for the pull-through cache.', acceptedValues: 'Exactly the HTTPS URL `https://registry-1.docker.io` for this mirror.', emptyBehavior: 'An empty or missing URL disables the selected upstream proxy contract.', impact: 'Changes the external registry contacted on a cache miss and the content namespace accepted by the mirror.', failure: 'A malformed or unreachable URL makes uncached pulls fail.' });
special(registryMirrorManifest, '$.spec.template.spec.containers[0].env[1].name', registryDeleteName);
special(registryMirrorManifest, '$.spec.template.spec.containers[0].env[1].value', registryDeleteValue);

export function yamlAuthorityFile(sourcePath) {
  return files.get(sourcePath) ?? null;
}

export function yamlFieldAuthority(sourcePath, fieldPath) {
  const declaration = files.get(sourcePath);
  const registered = fieldAuthorities.get(`${sourcePath}#${fieldPath}`);
  if (!declaration || !registered) return null;
  const expanded = registered.profile ? { ...profiles[registered.profile](registered), ...registered } : { ...registered };
  delete expanded.profile;
  return { ...expanded, sourceFileSha256: declaration.sourceSha256, externalChart: declaration.externalChart };
}

export function yamlAuthorityStats() {
  return { files: files.size, fields: fieldAuthorities.size };
}

export function yamlAuthorityPaths(sourcePath) {
  const prefix = `${sourcePath}#`;
  return [...fieldAuthorities.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)).sort();
}

export function assertYamlAuthorityRegistry(repositoryRoot = process.cwd(), { verifyBytes = true } = {}) {
  assert.equal(externalChartLockName, 'docs-external-helm-authority-lock.json', 'external Helm lock checksum names the wrong artifact');
  assert.match(externalChartLockSha256, /^[a-f0-9]{64}$/u, 'external Helm lock checksum is invalid');
  assert.equal(crypto.createHash('sha256').update(externalChartLockBytes).digest('hex'), externalChartLockSha256,
    'external Helm authority lock bytes do not match the checked-in checksum');
  assert.equal(externalSnapshotName, 'external-helm-authority-snapshots.json', 'external Helm snapshot checksum names the wrong artifact');
  assert.match(externalSnapshotSha256, /^[a-f0-9]{64}$/u, 'external Helm snapshot checksum is invalid');
  assert.equal(crypto.createHash('sha256').update(externalSnapshotBytes).digest('hex'), externalSnapshotSha256,
    'external Helm extracted authority bytes do not match the checked-in checksum');
  assert.equal(externalSnapshots.lockSha256, crypto.createHash('sha256').update(externalChartLockBytes).digest('hex'),
    'external Helm extracted authority was not produced from the checked-in lock');
  assert.equal(externalChartLock.version, 1, 'unsupported external Helm authority lock version');
  assert(typeof externalChartLock.captureMethod === 'string' && externalChartLock.captureMethod.length >= 80,
    'external Helm authority lock does not explain its reproducible capture method');
  assert.deepEqual(Object.keys(charts).sort(), ['alloy', 'argocd', 'cilium', 'csi', 'loki', 'postgresql', 'postgresqlDirect', 'prometheus', 'promtail', 'redis', 'spire', 'tailscale'],
    'external Helm authority lock chart set changed');
  let externalFieldCount = 0;
  for (const [key, entry] of fieldAuthorities) {
    for (const name of ['purpose', 'acceptedValues', 'emptyBehavior', 'impact', 'failure']) {
      const value = entry.profile ? profiles[entry.profile](entry)[name] : entry[name];
      const minimum = name === 'acceptedValues' ? 8 : 20;
      assert(typeof value === 'string' && value.length >= minimum, `incomplete YAML authority ${name}: ${key}`);
    }
    const fieldSourcePath = key.slice(0, key.indexOf('#'));
    const externalChart = files.get(fieldSourcePath)?.externalChart;
    if (externalChart) {
      externalFieldCount += 1;
      const extracted = externalSnapshots.fields[key];
      assert(extracted, `${key}: content-addressed external Helm authority input is missing`);
      const locked = externalSnapshots.charts[extracted.chartKey];
      assert(locked, `${key}: extracted chart coordinate is missing`);
      assert.equal(locked.chart, externalChart.chart, `${key}: extracted chart name differs`);
      assert.equal(locked.version, externalChart.version, `${key}: extracted chart version differs`);
      assert.equal(locked.archiveSha256, externalChart.archiveSha256, `${key}: extracted archive digest differs`);
      assert.equal(locked.extractedValuesSha256, externalChart.valuesSha256, `${key}: extracted values digest differs`);
      assert.match(extracted.upstreamValue?.valueSha256 ?? '', /^[a-f0-9]{64}$/u, `${key}: upstream values fragment is not content-addressed`);
      assert(extracted.templateContextIds.length || extracted.schema || extracted.upstreamValue, `${key}: no extracted upstream contract remains`);
      for (const id of extracted.templateContextIds) {
        const template = externalSnapshots.templateContexts[id];
        assert(template, `${key}: extracted template context ${id} is missing`);
        assert.equal(crypto.createHash('sha256').update(JSON.stringify(stableObject(template))).digest('hex'), id,
          `${key}: extracted template context identity changed`);
        assert.equal(crypto.createHash('sha256').update(template.context).digest('hex'), template.contextSha256,
          `${key}: extracted template context bytes changed`);
      }
    }
  }
  assert.equal(Object.keys(externalSnapshots.fields).length, externalFieldCount,
    'external Helm extracted authority contains stale or missing field inputs');
  for (const declaration of files.values()) {
    if (verifyBytes) {
      const absoluteSource = path.join(repositoryRoot, declaration.path);
      assert(fs.existsSync(absoluteSource), `${declaration.path}: YAML authority source is missing`);
      const actual = crypto.createHash('sha256').update(fs.readFileSync(absoluteSource)).digest('hex');
      assert.equal(actual, declaration.sourceSha256, `${declaration.path}: YAML authority source bytes changed`);
    }
    if (!declaration.externalChart) continue;
    assert.match(declaration.externalChart.archiveSha256, /^[a-f0-9]{64}$/u);
    assert.match(declaration.externalChart.valuesSha256, /^[a-f0-9]{64}$/u);
    assert(declaration.externalChart.chart && declaration.externalChart.version && declaration.externalChart.repository);
    const locked = Object.values(charts).find((candidate) => candidate === declaration.externalChart);
    assert(locked, `${declaration.path}: external chart metadata is not the checked-in lock object`);
  }
}

// Import-time validation checks structure. The inventory calls this again with
// its selected --root so mutations and alternate worktrees cannot reuse the
// main checkout's authority bytes.
assertYamlAuthorityRegistry(process.cwd(), { verifyBytes: false });
