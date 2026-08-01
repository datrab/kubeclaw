export declare function createObservabilityHealthState(): {
    markDegraded(key: string, data?: Record<string, any>): {
        shouldEmit: boolean;
        duplicate: boolean;
        restored: boolean;
        key: string;
        degradedAt: any;
        previous: Record<string, any>;
        state?: undefined;
    } | {
        shouldEmit: boolean;
        duplicate: boolean;
        restored: boolean;
        key: string;
        degradedAt: string;
        previous: Record<string, any> | null | undefined;
        state: {
            degraded: boolean;
            degradedAt: string;
        };
    };
    markRestored(key: string, data?: Record<string, any>): {
        shouldEmit: boolean;
        duplicate: boolean;
        restored: boolean;
        key: string;
        degradedAt: null;
        previous: Record<string, any> | null | undefined;
        restoredAt?: undefined;
        restoredAfterMs?: undefined;
        state?: undefined;
    } | {
        shouldEmit: boolean;
        duplicate: boolean;
        restored: boolean;
        key: string;
        degradedAt: any;
        restoredAt: string;
        restoredAfterMs: any;
        previous: Record<string, any>;
        state: {
            degraded: boolean;
            restoredAt: string;
        };
    };
};
