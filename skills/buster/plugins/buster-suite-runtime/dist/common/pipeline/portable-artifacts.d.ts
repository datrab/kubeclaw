type ArtifactConfig = {
    _runId?: string;
    run_id?: string;
    pipeline_dir?: string;
    paths?: {
        swarm_dir?: string;
    };
    _emitCanonicalEvidence?: (type: string, value: unknown, options: {
        sourceEventId: string;
    }) => unknown;
};
type ArtifactInput = {
    logical_id: string;
    kind: string;
    media_type: string;
    bytes?: string | Uint8Array;
    encoding?: BufferEncoding;
    content_class?: string;
    producer: string;
    correlation?: unknown;
    completeness?: string;
    original_byte_length?: number;
    original_sha256?: string;
    transformation?: unknown;
};
type ArtifactPaths = Record<'root' | 'blobs' | 'catalog' | 'quarantine' | 'manifest' | 'closure' | 'archive' | 'health' | 'evaluation', string>;
type ArtifactRecord = Record<string, unknown>;
export declare function runEvidenceRoot(config: ArtifactConfig): string;
export declare function artifactPaths(config: ArtifactConfig): ArtifactPaths;
export declare function publishArtifact(config: ArtifactConfig, input: ArtifactInput): ArtifactRecord;
export declare function quarantinePayload(config: ArtifactConfig, input: Record<string, unknown>): ArtifactRecord;
export declare function canonicalFingerprint(value: unknown): string;
export declare function verifyArtifactCatalog(config: ArtifactConfig): {
    ok: boolean;
    count: number;
    errors: ArtifactRecord[];
};
export declare function writeCanonicalJson(file: string, value: unknown): string;
export {};
