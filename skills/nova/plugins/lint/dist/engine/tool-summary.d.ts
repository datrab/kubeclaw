export declare function createToolSummary(): {
    total_errors: number;
    total_warnings: number;
    total_blocking: number;
    total_baselined: number;
    total_experimental: number;
    tools_ok: number;
    tools_not_applicable: number;
    tools_failed: number;
};
export declare function accumulateToolSummary(summary: any, result: any): any;
