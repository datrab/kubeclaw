import type { SuiteVerdict } from '../services/verdict-schema.js';
type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
interface TailscalePreviewContext {
    config?: AnyRecord;
    suiteResults?: Record<string, SuiteVerdict>;
    logSink?: LogSink | null;
}
interface PreviewTarget {
    previewUrl: string;
    contentUrl: string;
    expectedText: string | null;
    sourceSuite: 'k8s' | 'explicit';
    provider: string | null;
    smokePaths: string[];
    smokeExpectedText: Record<string, string>;
}
export declare function resolveTailscalePreviewTarget(context: TailscalePreviewContext): PreviewTarget;
export default function tailscalePreviewSuite(context: TailscalePreviewContext): Promise<SuiteVerdict>;
export {};
