#!/usr/bin/env node
import fs from 'node:fs';
import https from 'node:https';

const namespace = process.env.KUBECLAW_NAMESPACE || readFile('/var/run/secrets/kubernetes.io/serviceaccount/namespace', 'kubeclaw');
const apiGroup = process.env.BUSTER_LEASE_API_GROUP || 'kubeclaw.forgestack.ai';
const apiVersion = process.env.BUSTER_LEASE_API_VERSION || 'v1alpha1';
const busterServiceAccountName = process.env.BUSTER_SERVICE_ACCOUNT_NAME || 'agent-buster';
const busterServiceAccountNamespace = process.env.BUSTER_SERVICE_ACCOUNT_NAMESPACE || namespace;
const additionalRunnerServiceAccounts = parseServiceAccountRefs(process.env.BUSTER_ADDITIONAL_RUNNER_SERVICE_ACCOUNTS || '');
const allowedPrefixes = new Set((process.env.BUSTER_ALLOWED_NAMESPACE_PREFIXES || 'test').split(',').map((value) => value.trim()).filter(Boolean));
const defaultTtlSeconds = Number(process.env.BUSTER_DEFAULT_TTL_SECONDS || 7200);
const pollIntervalMs = Number(process.env.BUSTER_CONTROLLER_POLL_MS || 3000);
const finalizer = `${apiGroup}/buster-namespace-cleanup`;
const plural = 'busternamespaceleases';

const token = readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', '');
const ca = fs.existsSync('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt')
  ? fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt')
  : undefined;
const apiHost = process.env.KUBERNETES_SERVICE_HOST;
const apiPort = process.env.KUBERNETES_SERVICE_PORT || '443';
const agent = new https.Agent({ ca });

if (!apiHost || !token) {
  throw new Error('Kubernetes service host and ServiceAccount token are required');
}

function readFile(filePath, fallback) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim() || fallback;
  } catch (_error) {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(level, message, detail = null) {
  const record = { ts: new Date().toISOString(), level, component: 'buster-namespace-controller', message };
  if (detail) record.detail = detail;
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function kubePath(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

async function kube(path, { method = 'GET', body = null, contentType = 'application/json' } = {}) {
  const payload = body === null ? null : JSON.stringify(body);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (payload !== null) {
    headers['Content-Type'] = contentType;
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = https.request({
      host: apiHost,
      port: apiPort,
      path: kubePath(path),
      method,
      headers,
      agent,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const parsed = data ? safeJson(data) : null;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
          return;
        }
        const reason = parsed?.message || data || `HTTP ${res.statusCode}`;
        const error = new Error(reason);
        error.statusCode = res.statusCode;
        error.body = parsed;
        reject(error);
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function leasePath(name = '') {
  const base = `/apis/${apiGroup}/${apiVersion}/namespaces/${namespace}/${plural}`;
  return name ? `${base}/${name}` : base;
}

function statusPath(name) {
  return `${leasePath(name)}/status`;
}

function hasAllowedPrefix(namespaceName) {
  for (const prefix of allowedPrefixes) {
    if (namespaceName === prefix || namespaceName.startsWith(`${prefix}-`)) return true;
  }
  return false;
}

function preferredNamespacePrefix() {
  if (allowedPrefixes.has('test')) return 'test';
  return [...allowedPrefixes][0] || 'test';
}

function sanitizeLabelValue(value, fallback = 'unknown') {
  const normalized = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return normalized || fallback;
}

function parseServiceAccountRefs(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [namespacePart, namePart] = entry.includes('/') ? entry.split('/', 2) : [busterServiceAccountNamespace, entry];
      const namespaceName = sanitizeDnsLabel(namespacePart, '');
      const serviceAccountName = sanitizeDnsLabel(namePart, '');
      if (!namespaceName || !serviceAccountName) {
        throw new Error(`invalid BUSTER_ADDITIONAL_RUNNER_SERVICE_ACCOUNTS entry: ${entry}`);
      }
      return { namespace: namespaceName, name: serviceAccountName };
    });
}

function ownerLabels(lease, namespaceName) {
  return {
    'app.kubernetes.io/name': 'kubeclaw',
    'kubeclaw/managed-by': 'buster-namespace-controller',
    'kubeclaw/buster-lease': lease.metadata.name,
    'kubeclaw/buster-purpose': sanitizeLabelValue(lease.spec?.purpose || 'pretest'),
    'openclaw.io/buster-scope': sanitizeLabelValue(lease.metadata.labels?.['openclaw.io/buster-scope'] || lease.metadata.name),
  };
}

function sanitizeDnsLabel(value, fallback = 'preview') {
  const normalized = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 63)
    .replace(/-+$/g, '');
  return normalized || fallback;
}

function normalizeLeaseNamespaceName(requestedName) {
  const sanitized = sanitizeDnsLabel(requestedName, '');
  if (!sanitized) return '';
  const matchedPrefix = [...allowedPrefixes].find((prefix) => sanitized === prefix || sanitized.startsWith(`${prefix}-`));
  const prefix = matchedPrefix || preferredNamespacePrefix();
  const rawSegment = matchedPrefix
    ? sanitized.slice(matchedPrefix.length).replace(/^-+/, '')
    : sanitized;
  const maxSegmentLength = Math.max(1, 63 - prefix.length - 1);
  const segment = rawSegment.slice(0, maxSegmentLength).replace(/-+$/g, '') || 'namespace';
  return `${prefix}-${segment}`;
}

function parseSecretNameFromRef(ref) {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const trimmed = ref.trim();
  const secretPrefix = trimmed.match(/^secret\/([A-Za-z0-9._-]+)$/);
  if (secretPrefix) return secretPrefix[1];
  if (/^[A-Za-z0-9._-]+$/.test(trimmed)) return trimmed;
  return null;
}

function secretHasCredentialKeys(secret, keys = []) {
  const allowed = new Set(Array.isArray(keys) ? keys.filter(Boolean) : []);
  for (const [key, value] of Object.entries(secret?.data || {})) {
    if (allowed.size > 0 && !allowed.has(key)) continue;
    if (String(value || '')) return true;
  }
  for (const [key, value] of Object.entries(secret?.stringData || {})) {
    if (allowed.size > 0 && !allowed.has(key)) continue;
    if (String(value ?? '')) return true;
  }
  return false;
}

async function patchLease(name, patch) {
  return kube(leasePath(name), {
    method: 'PATCH',
    body: patch,
    contentType: 'application/merge-patch+json',
  });
}

async function patchStatus(name, status) {
  return kube(statusPath(name), {
    method: 'PATCH',
    body: { status },
    contentType: 'application/merge-patch+json',
  });
}

async function ensureFinalizer(lease) {
  const finalizers = lease.metadata.finalizers || [];
  if (finalizers.includes(finalizer)) return lease;
  return patchLease(lease.metadata.name, {
    metadata: { finalizers: [...finalizers, finalizer] },
  });
}

async function removeFinalizer(lease) {
  const finalizers = (lease.metadata.finalizers || []).filter((value) => value !== finalizer);
  await patchLease(lease.metadata.name, { metadata: { finalizers } });
}

async function createOrPatch({ createPath, patchPath, manifest }) {
  try {
    return await kube(createPath, { method: 'POST', body: manifest });
  } catch (error) {
    if (error.statusCode !== 409) throw error;
    return kube(patchPath, {
      method: 'PATCH',
      body: manifest,
      contentType: 'application/merge-patch+json',
    });
  }
}

async function ensureNamespace(lease, namespaceName) {
  const manifest = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespaceName,
      labels: ownerLabels(lease, namespaceName),
    },
  };
  return createOrPatch({
    createPath: '/api/v1/namespaces',
    patchPath: `/api/v1/namespaces/${namespaceName}`,
    manifest,
  });
}

function namespaceRole(namespaceName) {
  return {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'Role',
    metadata: {
      name: 'buster-namespace-runner',
      namespace: namespaceName,
    },
    rules: [
      {
        apiGroups: [''],
        resources: ['pods', 'pods/log', 'services', 'endpoints', 'configmaps', 'persistentvolumeclaims'],
        verbs: ['create', 'get', 'list', 'watch', 'delete', 'patch', 'update'],
      },
      {
        apiGroups: [''],
        resources: ['secrets'],
        verbs: ['get'],
      },
      {
        apiGroups: ['apps'],
        resources: ['deployments', 'replicasets', 'statefulsets'],
        verbs: ['create', 'get', 'list', 'watch', 'delete', 'patch', 'update'],
      },
      {
        apiGroups: ['batch'],
        resources: ['jobs', 'cronjobs'],
        verbs: ['create', 'get', 'list', 'watch', 'delete', 'patch', 'update'],
      },
      {
        apiGroups: ['networking.k8s.io'],
        resources: ['ingresses'],
        verbs: ['create', 'get', 'list', 'watch', 'delete', 'patch', 'update'],
      },
    ],
  };
}

function namespaceRoleBinding(namespaceName) {
  const subjects = [
    {
      kind: 'ServiceAccount',
      name: busterServiceAccountName,
      namespace: busterServiceAccountNamespace,
    },
    ...additionalRunnerServiceAccounts.map((serviceAccount) => ({
      kind: 'ServiceAccount',
      name: serviceAccount.name,
      namespace: serviceAccount.namespace,
    })),
  ];

  return {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: {
      name: 'buster-namespace-runner',
      namespace: namespaceName,
    },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'Role',
      name: 'buster-namespace-runner',
    },
    subjects,
  };
}

async function ensureNamespaceAccess(namespaceName) {
  await createOrPatch({
    createPath: `/apis/rbac.authorization.k8s.io/v1/namespaces/${namespaceName}/roles`,
    patchPath: `/apis/rbac.authorization.k8s.io/v1/namespaces/${namespaceName}/roles/buster-namespace-runner`,
    manifest: namespaceRole(namespaceName),
  });
  await createOrPatch({
    createPath: `/apis/rbac.authorization.k8s.io/v1/namespaces/${namespaceName}/rolebindings`,
    patchPath: `/apis/rbac.authorization.k8s.io/v1/namespaces/${namespaceName}/rolebindings/buster-namespace-runner`,
    manifest: namespaceRoleBinding(namespaceName),
  });
}

function previewExposureSpec(lease, namespaceName) {
  const exposure = lease.spec?.exposure && typeof lease.spec.exposure === 'object'
    ? lease.spec.exposure
    : {};
  if ((lease.spec?.purpose || 'pretest') !== 'final-preview') return null;
  if ((exposure.provider || 'off') !== 'tailscale-ingress') return null;
  const serviceName = sanitizeDnsLabel(exposure.serviceName || lease.spec?.serviceName || 'app');
  const servicePort = Number(exposure.servicePort || 80);
  if (!Number.isInteger(servicePort) || servicePort < 1 || servicePort > 65535) {
    throw new Error(`invalid final-preview servicePort: ${exposure.servicePort}`);
  }
  const hostname = sanitizeDnsLabel(
    exposure.hostname || `${namespaceName}-${serviceName}`,
    `${namespaceName}-${serviceName}`,
  );
  const path = typeof exposure.path === 'string' && exposure.path.startsWith('/')
    ? exposure.path
    : '/';
  return {
    provider: 'tailscale-ingress',
    ingressName: 'buster-final-preview',
    hostname,
    serviceName,
    servicePort,
    path,
    credentialsRef: typeof exposure.credentialsRef === 'string' ? exposure.credentialsRef : null,
    credentialsSecretName: typeof exposure.credentialsSecretName === 'string'
      ? exposure.credentialsSecretName
      : parseSecretNameFromRef(exposure.credentialsRef),
    credentialsKeys: Array.isArray(exposure.credentialsKeys) ? exposure.credentialsKeys : [],
    revealCredentials: exposure.revealCredentials === true || exposure.credentialsDelivery === 'discord',
  };
}

function previewIngress(lease, namespaceName, exposure) {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: exposure.ingressName,
      namespace: namespaceName,
      labels: ownerLabels(lease, namespaceName),
    },
    spec: {
      ingressClassName: 'tailscale',
      tls: [
        {
          hosts: [exposure.hostname],
        },
      ],
      rules: [
        {
          host: exposure.hostname,
          http: {
            paths: [
              {
                path: exposure.path,
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: exposure.serviceName,
                    port: { number: exposure.servicePort },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };
}

function ingressPreviewUrl(ingress, exposure) {
  const entries = ingress?.status?.loadBalancer?.ingress;
  const host = Array.isArray(entries)
    ? entries.map((entry) => entry?.hostname || entry?.ip).find(Boolean)
    : null;
  if (!host) return null;
  return `https://${host}${exposure.path === '/' ? '' : exposure.path}`;
}

async function ensurePreviewExposure(lease, namespaceName) {
  const exposure = previewExposureSpec(lease, namespaceName);
  if (!exposure) {
    return {
      exposurePhase: 'Off',
      previewUrl: null,
      exposureHostname: null,
      credentialsRef: null,
      credentialsAvailable: false,
      message: 'Preview exposure disabled',
    };
  }

  let credentialsAvailable = false;
  if (exposure.revealCredentials) {
    if (!exposure.credentialsSecretName) {
      throw new Error('preview credential reveal requested but no credentialsSecretName or credentialsRef secret was provided');
    }
    const secret = await kube(`/api/v1/namespaces/${namespace}/secrets/${exposure.credentialsSecretName}`);
    credentialsAvailable = secretHasCredentialKeys(secret, exposure.credentialsKeys);
    if (!credentialsAvailable) {
      throw new Error(`preview credential secret ${exposure.credentialsSecretName} did not contain any readable credential keys`);
    }
  }

  try {
    await kube(`/api/v1/namespaces/${namespaceName}/services/${exposure.serviceName}`);
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    return {
      exposurePhase: 'Pending',
      previewUrl: null,
      exposureHostname: exposure.hostname,
      credentialsRef: exposure.credentialsRef,
      credentialsAvailable,
      message: `Waiting for Service/${exposure.serviceName} before creating Tailscale ingress`,
    };
  }

  const ingress = await createOrPatch({
    createPath: `/apis/networking.k8s.io/v1/namespaces/${namespaceName}/ingresses`,
    patchPath: `/apis/networking.k8s.io/v1/namespaces/${namespaceName}/ingresses/${exposure.ingressName}`,
    manifest: previewIngress(lease, namespaceName, exposure),
  });
  const previewUrl = ingressPreviewUrl(ingress, exposure);
  return {
    exposurePhase: previewUrl ? 'Ready' : 'Pending',
    previewUrl,
    exposureHostname: exposure.hostname,
    credentialsRef: exposure.credentialsRef,
    credentialsAvailable,
    message: previewUrl ? 'Tailscale preview URL ready' : 'Waiting for Tailscale ingress status',
  };
}

function sanitizeSecret(secret, targetNamespace) {
  const copy = JSON.parse(JSON.stringify(secret));
  copy.metadata ||= {};
  copy.metadata.namespace = targetNamespace;
  for (const field of ['resourceVersion', 'uid', 'creationTimestamp', 'managedFields', 'selfLink', 'generation']) {
    delete copy.metadata[field];
  }
  return copy;
}

async function copySecrets(names, targetNamespace) {
  for (const name of names) {
    const source = await kube(`/api/v1/namespaces/${namespace}/secrets/${name}`);
    const secret = sanitizeSecret(source, targetNamespace);
    await createOrPatch({
      createPath: `/api/v1/namespaces/${targetNamespace}/secrets`,
      patchPath: `/api/v1/namespaces/${targetNamespace}/secrets/${name}`,
      manifest: secret,
    });
  }
}

function expiresAt(lease) {
  const ttl = Number(lease.spec?.ttlSeconds || defaultTtlSeconds);
  const created = Date.parse(lease.metadata.creationTimestamp || new Date().toISOString());
  return new Date(created + ttl * 1000).toISOString();
}

async function deleteNamespace(namespaceName) {
  try {
    await kube(`/api/v1/namespaces/${namespaceName}`, { method: 'DELETE', body: { gracePeriodSeconds: 0 } });
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
}

async function reconcileDeletedLease(lease, namespaceName) {
  if ((lease.spec?.cleanupPolicy || 'delete') !== 'keep') {
    await patchStatus(lease.metadata.name, {
      phase: 'Deleting',
      namespaceName,
      message: 'Lease deleted; deleting broker-owned namespace',
    });
    await deleteNamespace(namespaceName);
  }
  await removeFinalizer(lease);
}

async function reconcileLease(lease) {
  const name = lease.metadata.name;
  const requestedNamespaceName = lease.spec?.namespaceName;
  const namespaceName = normalizeLeaseNamespaceName(requestedNamespaceName);
  if (!namespaceName || !hasAllowedPrefix(namespaceName)) {
    await patchStatus(name, {
      phase: 'Rejected',
      namespaceName: requestedNamespaceName || null,
      message: 'namespaceName must normalize to a valid broker-owned namespace',
    });
    return;
  }

  lease = await ensureFinalizer(lease);

  if (lease.metadata.deletionTimestamp) {
    await reconcileDeletedLease(lease, namespaceName);
    return;
  }

  if ((lease.spec?.cleanupPolicy || 'delete') === 'delete' && lease.status?.phase === 'Ready' && lease.status?.expiresAt) {
    if (Date.now() > Date.parse(lease.status.expiresAt)) {
      await patchStatus(name, {
        phase: 'Expired',
        namespaceName,
        message: 'Lease TTL expired; deleting broker-owned namespace',
      });
      await deleteNamespace(namespaceName);
      return;
    }
  }

  if (lease.status?.phase === 'Ready') {
    const exposureStatus = await ensurePreviewExposure(lease, namespaceName);
    if (
      exposureStatus.exposurePhase !== lease.status?.exposurePhase
      || exposureStatus.previewUrl !== lease.status?.previewUrl
      || exposureStatus.message !== lease.status?.message
      || exposureStatus.credentialsRef !== lease.status?.credentialsRef
      || exposureStatus.credentialsAvailable !== lease.status?.credentialsAvailable
    ) {
      const { credentials: _legacyCredentials, ...safeStatus } = lease.status || {};
      await patchStatus(name, {
        ...safeStatus,
        ...exposureStatus,
      });
    }
    return;
  }

  await patchStatus(name, {
    phase: 'Provisioning',
    namespaceName,
    message: 'Creating broker-owned namespace access',
  });
  await ensureNamespace(lease, namespaceName);
  await ensureNamespaceAccess(namespaceName);
  await copySecrets(Array.isArray(lease.spec?.secretsToCopy) ? lease.spec.secretsToCopy : [], namespaceName);
  const exposureStatus = await ensurePreviewExposure(lease, namespaceName);
  await patchStatus(name, {
    phase: 'Ready',
    namespaceName,
    serviceAccountName: `${busterServiceAccountNamespace}/${busterServiceAccountName}`,
    internalUrl: lease.spec?.serviceName ? `http://${lease.spec.serviceName}.${namespaceName}.svc.cluster.local` : null,
    ...exposureStatus,
    expiresAt: expiresAt(lease),
    message: exposureStatus.previewUrl ? exposureStatus.message : 'Namespace ready',
  });
}

async function reconcileAll() {
  const list = await kube(leasePath());
  for (const lease of list.items || []) {
    try {
      await reconcileLease(lease);
    } catch (error) {
      log('error', `lease reconcile failed: ${lease.metadata?.name || 'unknown'}`, error.message);
      if (lease.metadata?.name) {
        try {
          const normalizedNamespaceName = normalizeLeaseNamespaceName(lease.spec?.namespaceName);
          await patchStatus(lease.metadata.name, {
            phase: 'Failed',
            namespaceName: normalizedNamespaceName || lease.spec?.namespaceName || null,
            message: error.message,
          });
        } catch (statusError) {
          log('error', `status patch failed: ${lease.metadata.name}`, statusError.message);
        }
      }
    }
  }
}

log('info', 'controller started', { namespace, apiGroup, apiVersion, allowedPrefixes: [...allowedPrefixes] });

while (true) {
  try {
    await reconcileAll();
  } catch (error) {
    log('error', 'controller loop failed', error.message);
  }
  await sleep(pollIntervalMs);
}
