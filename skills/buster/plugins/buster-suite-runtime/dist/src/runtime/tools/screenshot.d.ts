#!/usr/bin/env node
import type { BaselineGenerationResult } from './screenshot-routes.js';
export { parseBaselineRoutes } from './screenshot-routes.js';
export type { BaselineGenerationResult } from './screenshot-routes.js';
export interface ScreenshotViewport {
    width: number;
    height: number;
}
export interface ScreenshotOptions {
    viewport?: ScreenshotViewport;
    fullPage?: boolean;
    waitUntil?: string;
    timeout?: number;
}
export interface ScreenshotResult {
    name?: string;
    ok: boolean;
    path?: string;
    width?: number;
    height?: number;
    error?: string;
}
export interface ScreenshotBatchTarget {
    name: string;
    url: string;
    outputPath: string;
}
export declare function takeScreenshot(target: string, outputPath: string, opts?: ScreenshotOptions): Promise<ScreenshotResult>;
export declare function takeScreenshotBatch(targets: ScreenshotBatchTarget[], opts?: ScreenshotOptions): Promise<ScreenshotResult[]>;
export declare function generateBaselines(htmlPath: string, outputDir: string, opts?: ScreenshotOptions & {
    settleMs?: number;
}): Promise<BaselineGenerationResult>;
