export interface ArchitectureOutput {
    readonly verdict: 'passed' | 'blocked';
    readonly summary: string;
    readonly findings: readonly ArchitectureFinding[];
    readonly checkedFiles: readonly string[];
}
export interface ArchitectureFinding {
    readonly id: string;
    readonly severity: 'blocking' | 'error' | 'warn' | 'info';
    readonly scope: 'domain_model' | 'integration_boundary';
    readonly paths: readonly string[];
    readonly explanation: string;
    readonly remediation: string;
}
export declare function parseArchitectureOutput(response: Readonly<Record<string, unknown>>): ArchitectureOutput;
