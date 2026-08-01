type JsonObject = Record<string, any>;
export declare function shortHash(value: unknown): string;
export declare function limitEgressText(value: unknown, maxChars?: number): string;
export declare function buildEgressPreview(value: unknown, label?: string): string;
export declare function sanitizeTranscriptDetail(value: unknown, _label?: string): string | null;
export declare function sanitizeAcpTranscriptEvidence(transcript: any, label?: string): any;
export declare function summarizeStructuredValue(value: unknown, label?: string): JsonObject;
export declare function sanitizeJsonEgress(payload?: unknown, label?: string): any;
export declare function sanitizeMarkdownText(markdown?: unknown): string;
export declare function formatSummaryForDiscord(summary: unknown, maxChars?: number): string;
export declare function sanitizeTelemetryPayload(payload?: unknown): any;
export declare function sanitizeDiscordMessage(message?: any): {
    content: string | undefined;
    embeds: any;
    files: never[];
};
export declare function summarizePayloadForDiscord(payload: unknown, label?: string): {
    preview: string;
};
export declare function writePromptArtifact(filePath: string, prompt: unknown, meta?: JsonObject): void;
export declare function copyTranscriptArtifact(sourcePath: string, destPath: string): void;
export {};
