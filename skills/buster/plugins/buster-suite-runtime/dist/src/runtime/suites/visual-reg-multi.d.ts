import type { Finding, SuiteStatus } from '../services/verdict-schema.js';
type AnyRecord = Record<string, any>;
type Log = (message: string) => void;
export interface VisualPathEntry {
    name: string;
    path: string;
    nav?: string;
}
export interface PageResult {
    name: string;
    status: SuiteStatus;
    diffPercent: number | null;
    diffCount?: number;
    diffPath?: string | null;
    actualPath?: string;
    baselinePath?: string;
    canvasSize?: string;
    error?: string;
}
export interface MultiPathResult {
    findings: Finding[];
    pageResults: PageResult[];
    checksTotal: number;
    checksPassed: number;
    checksFailed: number;
}
export interface MultiPathInput {
    context: AnyRecord;
    pathsJson: VisualPathEntry[];
    baselineDir: string;
    artifactDir: string;
    baseUrl: string;
    pmThreshold: number;
    thresholds: AnyRecord | null;
    enforced: boolean;
    viewport: () => {
        width: number;
        height: number;
    };
    fullPage: boolean;
    baselinePath: (name: string) => string;
    outputPath: (name: string, suffix: string) => string;
    log: Log;
}
export declare function runMultiPath(input: MultiPathInput): Promise<MultiPathResult>;
export {};
