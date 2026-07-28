declare const CANONICAL_LINT_CONFIG_FALSE_POSITIVE: {
    code: string;
    resource: string;
    document_sha256: string;
    message: string;
    owner: string;
    reason: string;
    created: string;
    expires: string;
    tracking: string;
    approved_by: string;
    approved_on: string;
};
declare function normalizedDocumentDigest(document: string): string;
declare function isCanonicalLintConfigFalsePositive(rendered: string, issue: any, today?: any, filter?: any): boolean;
declare function trivyFindings(ctx: any, chartDir: any, rendered: any, issues: any): any;
declare function registerKubernetesSecurityTools(registerTool: any): void;
export { CANONICAL_LINT_CONFIG_FALSE_POSITIVE, isCanonicalLintConfigFalsePositive, normalizedDocumentDigest, registerKubernetesSecurityTools, trivyFindings };
