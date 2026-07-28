declare function failConfigMissing(code: string, message: string): never;
declare function failParse(ctx: any, toolId: any, parsed: any, result: any, file?: any): never;
declare function notApplicable(reason: any): {
    status: string;
    reason: any;
};
/**
 * Run all applicable tools for the current context.
 * Returns the complete report object.
 */
declare function runAllTools(ctx: any, toolRegistry: any): Promise<{
    schema_version: string;
    policy: {
        schema_version: any;
        digest: any;
        project: any;
        config_digests: any;
        effective_targets: {
            [k: string]: any;
        };
        baseline_digest: any;
    };
    project: any;
    scope: any;
    timestamp: string;
    tier: any;
    visibility: {
        debt: boolean;
        experimental: boolean;
    };
    changed_files: any;
    detected_types: any[];
    diagnostics: any;
    tools: any;
    summary: {
        total_errors: number;
        total_warnings: number;
        total_blocking: number;
        total_baselined: number;
        total_experimental: number;
        tools_ok: number;
        tools_not_applicable: number;
        tools_failed: number;
    };
}>;
export { failConfigMissing, failParse, notApplicable, runAllTools, };
