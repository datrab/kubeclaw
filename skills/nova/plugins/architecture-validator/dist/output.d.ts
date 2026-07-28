export interface ArchitectureOutput {
    readonly verdict: 'passed' | 'request_fix' | 'blocked';
    readonly summary: string;
    readonly findings: readonly string[];
    readonly checkedFiles: readonly string[];
}
export declare function parseArchitectureOutput(response: Readonly<Record<string, unknown>>): ArchitectureOutput;
