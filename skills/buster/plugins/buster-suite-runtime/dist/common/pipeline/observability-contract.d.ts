export declare const TELEMETRY_SCHEMA_VERSION = "telemetry_envelope.v1";
export declare const LIFECYCLE_SCHEMA_VERSION = "pipeline_lifecycle.v1";
export declare const OBSERVABILITY_LEVELS: readonly string[];
export declare const COMMAND_TYPES: readonly string[];
export declare function stableJson(value: any): string;
export declare function sha256(value: string | Buffer): string;
export declare function prohibitedEvidencePaths(value: any, key?: string, at?: string): string[];
export declare function assertEvidenceAdmissible(value: any): any;
export declare function normalizeCorrelationIdentity(input?: any): {
    project: string | null;
    run_id: string | null;
    work_id: string | null;
    work_type: string | null;
    module_id: string | null;
    gate_id: string | null;
    gate_type: string | null;
    attempt: number | null;
    dispatch_id: string | null;
    session_id: string | null;
    parent_session_id: string | null;
    agent_id: string | null;
    model_call_id: string | null;
    tool_call_id: string | null;
    trace_id: string | null;
    span_id: string | null;
    parent_span_id: string | null;
    source: string | null;
    producer: string | null;
};
export declare function validateCorrelationIdentity(identity: any, { eventType, authoritative }?: {
    eventType?: string | undefined;
    authoritative?: any;
}): {
    ok: boolean;
    errors: string[];
    identity: {
        project: string | null;
        run_id: string | null;
        work_id: string | null;
        work_type: string | null;
        module_id: string | null;
        gate_id: string | null;
        gate_type: string | null;
        attempt: number | null;
        dispatch_id: string | null;
        session_id: string | null;
        parent_session_id: string | null;
        agent_id: string | null;
        model_call_id: string | null;
        tool_call_id: string | null;
        trace_id: string | null;
        span_id: string | null;
        parent_span_id: string | null;
        source: string | null;
        producer: string | null;
    };
};
export declare function buildCanonicalEnvelope({ type, identity, payload, seq, occurredAt, emittedAt, causationId, sourceEventId, authorityClass, authoritative }: any): any;
export declare function payloadAdmission(input?: any): {
    ok: boolean;
    errors: string[];
    value: {
        content_class: string | null;
        completeness: string | null;
        original_byte_length: any;
        original_sha256: any;
        transformation: any;
    };
};
