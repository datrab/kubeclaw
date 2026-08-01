import { StructuredOperationError } from '../operation-result.js';
type DiscordWebhookDeliveryDetails = {
    status?: number;
    statusText?: string;
    bodyPreview?: string;
    cause?: unknown;
};
type DiscordWebhookOptions = {
    fetchImpl?: typeof fetch;
    headers?: Record<string, string>;
    body?: BodyInit | null;
    signal?: AbortSignal | null;
    timeoutMs?: number;
};
export declare class DiscordWebhookDeliveryError extends StructuredOperationError {
    status?: number;
    statusText?: string;
    bodyPreview?: string;
    constructor(message: string, details?: DiscordWebhookDeliveryDetails);
}
export declare function postDiscordWebhook(url: string, options?: DiscordWebhookOptions): Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    body: any;
}>;
export {};
