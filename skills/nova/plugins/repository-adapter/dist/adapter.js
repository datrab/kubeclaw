import fs from 'node:fs';
import path from 'node:path';
function relativeRepositoryPath(value) {
    if (value.length === 0
        || value.startsWith('/')
        || /^[A-Za-z]:[\\/]/.test(value)
        || value.includes('\0')
        || /[\r\n]/.test(value)
        || value.split(/[\\/]+/).includes('..'))
        throw new Error('REPOSITORY_PATH_FORBIDDEN');
    return value.replaceAll('\\', '/');
}
function repositoryFile(root, relative) {
    const candidate = path.resolve(root, relativeRepositoryPath(relative));
    if (!candidate.startsWith(`${root}${path.sep}`))
        throw new Error('REPOSITORY_PATH_FORBIDDEN');
    let canonical;
    try {
        canonical = fs.realpathSync(candidate);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            throw new Error('REPOSITORY_FILE_NOT_FOUND');
        throw error;
    }
    if (!canonical.startsWith(`${root}${path.sep}`))
        throw new Error('REPOSITORY_PATH_FORBIDDEN');
    if (!fs.statSync(canonical).isFile())
        throw new Error('REPOSITORY_NOT_A_FILE');
    return canonical;
}
export function activate(context) {
    const configured = context.config.repositoryRoot;
    if (typeof configured !== 'string' || configured.length === 0)
        throw new Error('repositoryRoot is required');
    const maximum = context.config.maxFileBytes ?? 4 * 1024 * 1024;
    if (!Number.isSafeInteger(maximum) || Number(maximum) <= 0)
        throw new Error('maxFileBytes is invalid');
    const maxFileBytes = Number(maximum);
    const root = fs.realpathSync(configured);
    return {
        async ready() {
            if (!fs.statSync(root).isDirectory())
                throw new Error('repositoryRoot is not a directory');
        },
        async invoke({ request, signal, confidential, fence }) {
            if (!confidential)
                fence.assertCurrent();
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            if (request.capability !== 'git.repository.read' || request.operation !== 'read_text') {
                throw new Error(`REPOSITORY_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
            }
            const file = repositoryFile(root, request.resource.canonicalId);
            const size = fs.statSync(file).size;
            if (size > maxFileBytes)
                throw new Error(`REPOSITORY_FILE_TOO_LARGE:${size}:${maxFileBytes}`);
            const content = fs.readFileSync(file, 'utf8');
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            return { content, sizeBytes: Buffer.byteLength(content), path: relativeRepositoryPath(request.resource.canonicalId) };
        },
        async shutdown() { },
    };
}
