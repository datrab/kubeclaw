export type TelemetryRecord = Record<string, any>;
export interface TelemetryOptions extends TelemetryRecord {
  project?: unknown; run_id?: unknown; module_id?: string | null; emitter?: string | null;
  log_dir?: string | null; pipeline_log_path?: string | null; pipeline_run_log_path?: string | null;
  attempt?: unknown; dispatch_id?: string | null; session_key?: string | null; gate_id?: string | null;
  gate_type?: string | null; enabled?: boolean; streamMaxLen?: number;
}
export interface TelemetryIdentity { ok: boolean; project: string | null; runId: string | null; streamKey: string | null; seqKey: string | null; error: Error | null }
interface RedisMulti { xadd(...args: unknown[]): RedisMulti; expire(...args: unknown[]): RedisMulti; exec(): Promise<unknown> }
export interface RedisClient { incr(key: string | null): Promise<number>; multi(): RedisMulti; quit(): Promise<unknown>; on(event: string, listener: (error: unknown) => void): void }
export interface TelemetryHealth { redis: TelemetryRecord }
export interface BusterTelemetryContext extends TelemetryRecord {
  redis: RedisClient | null; streamKey: string | null; seqKey: string | null; project: string; runId: string;
  moduleId: string; emitter: string; logDir: string | null; pipelineLogPath: string | null; pipelineRunLogPath: string | null;
  attempt: unknown; dispatchId: string | null; sessionKey: string | null; gateId: string | null; gateType: string | null;
  streamMaxLen: number; _health: TelemetryHealth;
}
export interface ContextOverrides { identity?: TelemetryIdentity; redis?: RedisClient | null; health?: TelemetryHealth }
