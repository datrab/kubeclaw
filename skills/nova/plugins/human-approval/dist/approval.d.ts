import type { StageResult, WaitRequest } from '@kubeclaw/plugin-sdk';
export declare const APPROVAL_SIGNAL_TYPE: "approval.resolved";
export declare const DEFAULT_APPROVAL_TIMEOUT_MINUTES = 60;
export declare const MAX_APPROVAL_TIMEOUT_MINUTES = 525600;
export interface ApprovalInput {
    readonly summary: string;
}
export interface ApprovalConfig {
    readonly target: string;
    readonly issuerId: string;
    readonly timeoutMinutes: number;
}
export interface ApprovalIssuer {
    readonly type: 'operator';
    readonly id: string;
}
export type ApprovalGuidance = {
    readonly decision: 'pending';
} | {
    readonly decision: 'approved' | 'rejected';
    readonly issuer: ApprovalIssuer;
    readonly reason?: string;
};
export declare function parseApprovalInput(value: unknown): ApprovalInput;
export declare function parseApprovalConfig(value: unknown): ApprovalConfig;
export declare function parseApprovalGuidance(value: unknown, expectedIssuerId: string): ApprovalGuidance;
export declare function calculateApprovalExpiresAt(now: Date, timeoutMinutes: number): string;
export declare function resultForApprovalGuidance(guidance: Exclude<ApprovalGuidance, {
    readonly decision: 'pending';
}>): StageResult;
export declare function validateCreatedWait(value: unknown, expected: {
    readonly issuerId: string;
    readonly expiresAt: string;
    readonly summary: string;
}): WaitRequest;
export declare function pendingApprovalResult(wait: WaitRequest): StageResult;
