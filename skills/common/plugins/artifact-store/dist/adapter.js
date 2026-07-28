import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
function canonical(value) {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}
function requiredText(value, label) {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || /[\r\n]/.test(value)) {
        throw new Error(`ARTIFACT_${label}_INVALID`);
    }
    return value;
}
function digestValue(value) {
    const digest = requiredText(value, 'DIGEST');
    if (!/^sha256:[a-f0-9]{64}$/.test(digest))
        throw new Error('ARTIFACT_DIGEST_INVALID');
    return digest;
}
function blobPath(root, digest) {
    const hash = digest.slice('sha256:'.length);
    return path.join(root, 'blobs', 'sha256', hash.slice(0, 2), `${hash.slice(2)}.json`);
}
function writeImmutable(file, bytes) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
        const descriptor = fs.openSync(file, 'wx', 0o600);
        try {
            fs.writeFileSync(descriptor, bytes);
            fs.fsyncSync(descriptor);
        }
        finally {
            fs.closeSync(descriptor);
        }
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
        const existing = fs.readFileSync(file);
        if (!existing.equals(bytes))
            throw new Error('ARTIFACT_DIGEST_COLLISION');
    }
}
function appendCatalog(root, artifact) {
    const file = path.join(root, 'catalog.jsonl');
    const descriptor = fs.openSync(file, 'a', 0o600);
    try {
        fs.writeSync(descriptor, `${canonical(artifact)}\n`);
        fs.fsyncSync(descriptor);
    }
    finally {
        fs.closeSync(descriptor);
    }
}
function catalogContains(root, artifactId, namespace, digest) {
    const file = path.join(root, 'catalog.jsonl');
    if (!fs.existsSync(file))
        return false;
    return fs.readFileSync(file, 'utf8').split('\n').some((line) => {
        if (line.length === 0)
            return false;
        try {
            const artifact = JSON.parse(line);
            return artifact.artifactId === artifactId
                && artifact.namespace === namespace
                && artifact.digest === digest;
        }
        catch {
            throw new Error('ARTIFACT_CATALOG_INVALID');
        }
    });
}
export function activate(context) {
    const configured = context.config.artifactRoot;
    if (typeof configured !== 'string' || configured.length === 0)
        throw new Error('artifactRoot is required');
    const maximum = context.config.maxArtifactBytes ?? 16 * 1024 * 1024;
    if (!Number.isSafeInteger(maximum) || Number(maximum) <= 0)
        throw new Error('maxArtifactBytes is invalid');
    const maxArtifactBytes = Number(maximum);
    const root = path.resolve(configured);
    return {
        async ready() {
            fs.mkdirSync(path.join(root, 'blobs', 'sha256'), { recursive: true, mode: 0o700 });
        },
        async invoke({ request, signal, confidential, fence }) {
            if (!confidential)
                fence.assertCurrent();
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            if (request.capability === 'artifacts.read' && request.operation === 'get_json') {
                const digest = digestValue(request.payload.digest);
                const artifactId = requiredText(request.resource.canonicalId, 'ID');
                const namespace = requiredText(request.payload.namespace, 'NAMESPACE');
                if (!catalogContains(root, artifactId, namespace, digest))
                    throw new Error('ARTIFACT_NOT_FOUND');
                const file = blobPath(root, digest);
                if (!fs.existsSync(file))
                    throw new Error('ARTIFACT_NOT_FOUND');
                const bytes = fs.readFileSync(file);
                const actual = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
                if (actual !== digest)
                    throw new Error('ARTIFACT_INTEGRITY_FAILED');
                return { value: JSON.parse(bytes.toString('utf8')), digest, sizeBytes: bytes.byteLength };
            }
            if (request.capability !== 'artifacts.write' || request.operation !== 'put_json') {
                throw new Error(`ARTIFACT_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
            }
            const artifactId = requiredText(request.resource.canonicalId, 'ID');
            const namespace = requiredText(request.payload.namespace, 'NAMESPACE');
            const mediaType = requiredText(request.payload.mediaType, 'MEDIA_TYPE');
            if (mediaType !== 'application/json')
                throw new Error('ARTIFACT_MEDIA_TYPE_UNSUPPORTED');
            const bytes = Buffer.from(canonical(request.payload.value));
            if (bytes.byteLength > maxArtifactBytes)
                throw new Error('ARTIFACT_SIZE_EXCEEDED');
            const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
            writeImmutable(blobPath(root, digest), bytes);
            const artifact = {
                artifactId,
                namespace,
                mediaType,
                digest,
                sizeBytes: bytes.byteLength,
                producer: request.attempt,
            };
            appendCatalog(root, artifact);
            return { artifact };
        },
        async shutdown() { },
    };
}
