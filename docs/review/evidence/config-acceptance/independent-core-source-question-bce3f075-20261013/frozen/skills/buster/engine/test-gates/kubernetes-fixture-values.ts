export const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
export const SECRET_NAME = /^[A-Za-z0-9._-]+$/u;
export const DIGEST = /^sha256:[a-f0-9]{64}$/u;
export const IMMUTABLE_IMAGE = /^([A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9]+(?:[._/-][a-z0-9]+)*)@(sha256:[a-f0-9]{64})$/u;
export const MAX_TIMER_MS = 2_147_483_647;
export const MAX_NAMESPACE_PREFIX_LENGTH = 42;
export const STORAGE_CLASS_NAME = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?)*$/u;
export type JsonObject = Record<string, unknown>;
export function object(value: unknown, label: string): JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`KUBERNETES_FIXTURE_REQUEST_INVALID:${label}`);
    }
    return value as JsonObject;
}
export function text(value: unknown, label: string, maximum = 1024): string {
    if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.includes('\0')) {
        throw new Error(`KUBERNETES_FIXTURE_REQUEST_INVALID:${label}`);
    }
    return value;
}
export function integer(value: unknown, label: string, minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
        throw new Error(`KUBERNETES_FIXTURE_REQUEST_INVALID:${label}`);
    }
    return Number(value);
}
export function stringArray(value: unknown, label: string, maximum: number, pattern?: RegExp): string[] {
    if (!Array.isArray(value) || value.length > maximum
        || value.some((item) => typeof item !== 'string' || item.length < 1 || item.length > 253
            || isInvalidArrayEntry(item, pattern))) {
        throw new Error(`KUBERNETES_FIXTURE_REQUEST_INVALID:${label}`);
    }
    return [...new Set(value as string[])];
}
function isInvalidArrayEntry(item: string, pattern?: RegExp): boolean {
    if (item.includes('\0'))
        return true;
    return pattern !== undefined && !pattern.test(item);
}
