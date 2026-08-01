type Payload = Record<string, any>;
type CleanupState = {
    leases: string[];
};
export declare const CLEANUP_POLICY: Readonly<{
    TASK_SCOPED: "task-scoped";
    STARTUP_SWEEP: "startup-sweep";
    SHUTDOWN_SWEEP: "shutdown-sweep";
    DISABLED: "disabled";
}>;
export declare function buildCleanupKubernetesLabels(payload?: Payload): Record<string, string>;
export declare function getCleanupStatePath(payload?: Payload, options?: {
    stateRoot?: string;
}): string;
export declare function trackRuntimeResources(payload?: Payload, resources?: {
    leases?: string[];
}, options?: {
    stateRoot?: string;
}): {
    statePath: string;
    state: CleanupState;
};
export declare function cleanupRuntimeResources(_stage: string, payload?: Payload | null, options?: {
    cleanupPolicy?: string;
    stateRoot?: string;
}): Promise<Record<string, unknown>>;
export {};
