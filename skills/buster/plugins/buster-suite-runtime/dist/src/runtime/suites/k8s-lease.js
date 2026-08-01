import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { execFileWithInput } from './k8s-command-env.js';
import { BUSTER_LEASE_API_GROUP, KUBECLAW_NS, assertKubectlOutputNotHtml, buildBusterNamespaceLease, errorMessage, errorOutput, execFileAsync, isNonEmptyString, parseKubectlJson, trimOut, } from './k8s-base.js';
async function assertCanUseBusterNamespaceLease(verb, env) {
    const resource = `busternamespaceleases.${BUSTER_LEASE_API_GROUP}`;
    const { stdout } = await execFileAsync('kubectl', ['auth', 'can-i', verb, resource, '-n', KUBECLAW_NS], {
        timeout: 10000,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        env,
    });
    assertKubectlOutputNotHtml(stdout, `kubectl auth can-i ${verb} ${resource}`);
    if (String(stdout).trim() !== 'yes') {
        throw new Error(`current Kubernetes identity cannot ${verb} ${resource} in namespace ${KUBECLAW_NS}`);
    }
}
export async function runNamespaceControllerPreflight(lease, env) {
    const version = await execFileAsync('kubectl', ['get', '--raw=/version'], {
        timeout: 10000,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        env,
    });
    parseKubectlJson(version.stdout, 'kubectl get --raw=/version');
    const resources = await execFileAsync('kubectl', ['api-resources', `--api-group=${BUSTER_LEASE_API_GROUP}`, '-o', 'name'], {
        timeout: 10000,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        env,
    });
    assertKubectlOutputNotHtml(resources.stdout, `kubectl api-resources --api-group=${BUSTER_LEASE_API_GROUP}`);
    if (!isNonEmptyString(resources.stdout)) {
        throw new Error(`kubectl api-resources --api-group=${BUSTER_LEASE_API_GROUP} returned empty output`);
    }
    const resourceNames = String(resources.stdout).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!resourceNames.some((name) => name === 'busternamespaceleases' || name === `busternamespaceleases.${BUSTER_LEASE_API_GROUP}`)) {
        throw new Error(`BusterNamespaceLease resource is not discoverable in API group ${BUSTER_LEASE_API_GROUP}`);
    }
    await assertCanUseBusterNamespaceLease('create', env);
    await assertCanUseBusterNamespaceLease('get', env);
    await assertCanUseBusterNamespaceLease('delete', env);
    try {
        await execFileWithInput('kubectl', ['apply', '--dry-run=server', '-f', '-'], `${JSON.stringify(lease)}\n`, { timeout: 15000, maxBuffer: 5 * 1024 * 1024, env });
    }
    catch (error) {
        const detail = errorOutput(error);
        assertKubectlOutputNotHtml(detail, 'kubectl apply --dry-run=server');
        throw new Error(`BusterNamespaceLease server-side dry-run failed: ${trimOut(detail)}`);
    }
    return 'Kubernetes API, BusterNamespaceLease discovery, RBAC, and server-side dry-run passed';
}
export async function requestNamespaceLease({ leaseName, namespaceName, namespacePrefix, serviceName, secretsToCopy, payload, ttlSeconds, cleanupPolicy, purpose, exposure, log, env }) {
    const lease = buildBusterNamespaceLease({
        leaseName,
        namespaceName,
        namespacePrefix,
        serviceName,
        secretsToCopy,
        payload,
        ttlSeconds,
        cleanupPolicy,
        purpose,
        exposure,
    });
    log(`Requesting namespace lease ${KUBECLAW_NS}/${leaseName} → ${namespaceName}`);
    await execFileWithInput('kubectl', ['apply', '-f', '-'], `${JSON.stringify(lease)}\n`, { timeout: 15000, maxBuffer: 5 * 1024 * 1024, env });
}
function normalizeLeaseStatus(lease) {
    return {
        namespaceName: typeof lease.status?.namespaceName === 'string' ? lease.status.namespaceName : '',
        previewUrl: typeof lease.status?.previewUrl === 'string' ? lease.status.previewUrl : null,
        exposurePhase: typeof lease.status?.exposurePhase === 'string' ? lease.status.exposurePhase : null,
        exposureHostname: typeof lease.status?.exposureHostname === 'string' ? lease.status.exposureHostname : null,
        credentialsRef: typeof lease.status?.credentialsRef === 'string' ? lease.status.credentialsRef : null,
        credentialsAvailable: lease.status?.credentialsAvailable === true,
        message: typeof lease.status?.message === 'string' ? lease.status.message : null,
    };
}
export function uniqueStrings(values) {
    return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}
function decodeSecretDataValue(value) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error('secret data value is missing');
    return Buffer.from(value, 'base64').toString('utf8');
}
export async function readTestCredentials(specs, namespace, env) {
    const credentials = [];
    for (const spec of specs) {
        const { stdout } = await execFileAsync('kubectl', ['get', 'secret', spec.secretName, '-n', namespace, '-o', 'json'], {
            timeout: 10000,
            encoding: 'utf8',
            maxBuffer: 2 * 1024 * 1024,
            env,
        });
        const secret = JSON.parse(stdout);
        const values = {};
        const missing = [];
        for (const key of spec.keys) {
            if (secret?.data?.[key] == null) {
                missing.push(key);
                continue;
            }
            values[key] = decodeSecretDataValue(secret.data[key]);
        }
        if (missing.length > 0) {
            throw new Error(`Test credential Secret/${spec.secretName} in ${namespace} is missing key(s): ${missing.join(', ')}`);
        }
        credentials.push({
            secret: spec.secretName,
            purpose: spec.purpose,
            values,
        });
    }
    return credentials;
}
async function readNamespaceLeaseStatus(leaseName, env) {
    const { stdout } = await execFileAsync('kubectl', ['get', 'busternamespacelease', leaseName, '-n', KUBECLAW_NS, '-o', 'json'], {
        timeout: 10000,
        encoding: 'utf8',
        maxBuffer: 5 * 1024 * 1024,
        env,
    });
    return normalizeLeaseStatus(JSON.parse(stdout));
}
export async function waitForNamespaceLeaseReady(leaseName, timeoutSeconds, log, env) {
    const deadline = Date.now() + timeoutSeconds * 1000;
    let lastMessage = '';
    while (Date.now() < deadline) {
        try {
            const { stdout } = await execFileAsync('kubectl', ['get', 'busternamespacelease', leaseName, '-n', KUBECLAW_NS, '-o', 'json'], {
                timeout: 10000,
                encoding: 'utf8',
                maxBuffer: 5 * 1024 * 1024,
                env,
            });
            const lease = JSON.parse(stdout);
            const phase = typeof lease.status?.phase === 'string' && lease.status.phase.trim() ? lease.status.phase : 'Pending';
            lastMessage = typeof lease.status?.message === 'string' && lease.status.message.trim() ? lease.status.message : phase;
            if (phase === 'Ready' && lease.status?.namespaceName) {
                log(`Namespace lease ready: ${lease.status.namespaceName}`);
                return normalizeLeaseStatus(lease);
            }
            if (selectTruthyValue(() => (phase === 'Rejected'), () => (phase === 'Failed'))) {
                throw new Error(`namespace lease ${phase}: ${lastMessage}`);
            }
        }
        catch (error) {
            if (!String(errorMessage(error)).includes('NotFound'))
                throw error;
            lastMessage = trimOut(errorMessage(error), 200);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`namespace lease ${leaseName} was not ready within ${timeoutSeconds}s: ${lastMessage}`);
}
export async function verifyCopiedSecrets(names, targetNamespace, env) {
    for (const name of names) {
        try {
            await execFileAsync('kubectl', ['get', 'secret', name, '-n', targetNamespace], {
                timeout: 10000,
                encoding: 'utf8',
                env,
            });
        }
        catch (error) {
            throw new Error(`Required secret copy failed: ${name}: ${trimOut(errorOutput(error))}`);
        }
    }
}
export async function waitForPreviewUrl(leaseName, timeoutSeconds, log, env) {
    const deadline = Date.now() + timeoutSeconds * 1000;
    let latest = null;
    while (Date.now() < deadline) {
        latest = await readNamespaceLeaseStatus(leaseName, env);
        if (latest.previewUrl) {
            log(`Preview URL ready: ${latest.previewUrl}`);
            return latest;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (latest == null)
        latest = await readNamespaceLeaseStatus(leaseName, env);
    const previewWaitReason = selectDefinedValue(() => (selectDefinedValue(() => (latest.message), () => (latest.exposurePhase))), () => ('preview_pending'));
    log(`Preview URL not ready after ${timeoutSeconds}s: ${previewWaitReason}`);
    return latest;
}
