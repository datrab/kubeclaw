export declare const TOOL_ADAPTERS: any[];
export declare const TOOL_OUTPUT_PREVIEW_MISSING = "no output captured";
export declare const LINT_VULNERABILITY_FOUND = "vulnerability found";
export declare function eslintFindingSeed(ctx: any, fileResult: any, message: any, occurrences: any): {
    code: any;
    file: string;
    message: any;
    source_line: string;
    occurrence: any;
};
export declare function requireString(value: any, label: any): any;
export declare function requireNumber(value: any, label: any): any;
export declare function isJavaScriptOrTypeScriptProject(ctx: any): any;
export declare function affectedTypeScriptConfigs(ctx: any): any;
export declare function uniqueTypeScriptFindings(repoRoot: string, findings: any[]): any[];
export declare function npmAuditSeverity(severity: any): "warning" | "error";
export declare function registerTool(tool: any): void;
export declare function buildToolRegistry(policy: any, projectTypes: any): any;
