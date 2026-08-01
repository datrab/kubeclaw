export interface ReviewInput {
    readonly task: string;
    readonly evidence?: Readonly<Record<string, unknown>>;
}
export interface ReviewDispatchRequest {
    readonly [key: string]: unknown;
    readonly protocol: 'kubeclaw.review.v2';
    readonly agent: string;
    readonly task: string;
    readonly review: {
        readonly subject: string;
        readonly evidence: Readonly<Record<string, unknown>>;
        readonly allowedStatuses: readonly ['PASS', 'FAIL'];
    };
    readonly outputContract: Readonly<Record<string, unknown>>;
}
export declare function buildReviewTask(input: ReviewInput, helperPrompt: unknown): string;
export declare function buildReviewDispatchRequest(agent: string, input: ReviewInput, helperPrompt: unknown): ReviewDispatchRequest;
