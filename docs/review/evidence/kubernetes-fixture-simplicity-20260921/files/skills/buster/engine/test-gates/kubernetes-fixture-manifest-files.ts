import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { text, object, type JsonObject } from './kubernetes-fixture-values.ts';
export function contained(root: string, value: unknown): string {
    const requested = text(value, 'manifestPath', 4096);
    if (!path.isAbsolute(requested))
        throw new Error('KUBERNETES_FIXTURE_MANIFEST_PATH_INVALID');
    const canonical = fs.realpathSync(requested);
    if (canonical !== root && !canonical.startsWith(`${root}${path.sep}`)) {
        throw new Error('KUBERNETES_FIXTURE_MANIFEST_PATH_DENIED');
    }
    if (!fs.statSync(canonical).isFile())
        throw new Error('KUBERNETES_FIXTURE_MANIFEST_NOT_FILE');
    return canonical;
}
export function manifestBytes(file: string, expectedDigest: string, maximumBytes: number): Buffer {
    const handle = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const before = fs.fstatSync(handle);
        if (before.size < 1 || before.size > maximumBytes)
            throw new Error('KUBERNETES_FIXTURE_MANIFEST_SIZE_INVALID');
        const bytes = Buffer.alloc(before.size);
        let offset = 0;
        while (offset < bytes.length) {
            const count = fs.readSync(handle, bytes, offset, bytes.length - offset, offset);
            if (count === 0)
                throw new Error('KUBERNETES_FIXTURE_MANIFEST_READ_INCOMPLETE');
            offset += count;
        }
        const after = fs.fstatSync(handle);
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
            throw new Error('KUBERNETES_FIXTURE_MANIFEST_CHANGED');
        }
        const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
        if (digest !== expectedDigest)
            throw new Error('KUBERNETES_FIXTURE_MANIFEST_DIGEST_MISMATCH');
        return bytes;
    }
    finally {
        fs.closeSync(handle);
    }
}
export function flattenDocuments(values: unknown[], maximumResources: number): JsonObject[] {
    const out: JsonObject[] = [];
    const pending = values.filter(value => value !== null && value !== undefined).reverse();
    let visits = 0;
    while (pending.length) {
        if (++visits > 100_000)
            throw new Error('KUBERNETES_FIXTURE_MANIFEST_COMPLEXITY_LIMIT');
        const document = object(pending.pop(), 'manifestDocument');
        if (document.kind === 'List') {
            if (!Array.isArray(document.items))
                throw new Error('KUBERNETES_FIXTURE_MANIFEST_LIST_INVALID');
            if (pending.length + document.items.length > 100_000)
                throw new Error('KUBERNETES_FIXTURE_MANIFEST_COMPLEXITY_LIMIT');
            for (let index = document.items.length - 1; index >= 0; index -= 1)
                pending.push(document.items[index]);
        }
        else {
            if (out.length >= maximumResources)
                throw new Error('KUBERNETES_FIXTURE_RESOURCE_COUNT_INVALID');
            out.push(document);
        }
    }
    return out;
}
