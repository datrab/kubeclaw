export interface CaseStudyInput {
    readonly projectId: string;
    readonly runId: string;
    readonly task: string;
    readonly facts: readonly {
        readonly label: string;
        readonly value: string;
    }[];
}
export interface CaseStudy {
    readonly status: 'generated';
    readonly projectId: string;
    readonly runId: string;
    readonly markdown: string;
}
export declare const requiredSections: readonly ["Context", "Challenge", "Approach", "Implementation", "Verification", "Outcome"];
export declare function buildRequest(agent: string, input: CaseStudyInput): Readonly<Record<string, unknown>>;
export declare function parseCaseStudy(value: unknown, input: CaseStudyInput): CaseStudy;
