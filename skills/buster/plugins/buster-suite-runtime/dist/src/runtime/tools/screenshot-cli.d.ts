type ScreenshotFn = (target: string, output: string, options: Record<string, unknown>) => Promise<{
    ok: boolean;
}>;
type BaselineFn = (html: string, output: string, options: Record<string, unknown>) => Promise<{
    ok: boolean;
}>;
interface ScreenshotCliDependencies {
    takeScreenshot: ScreenshotFn;
    generateBaselines: BaselineFn;
    defaults: {
        viewport: {
            width: number;
            height: number;
        };
        waitUntil: string;
        timeout: number;
        settleMs: number;
    };
    stdout: (message: string) => void;
    stderr: (message: string) => void;
}
export declare function runScreenshotCli(dependencies: ScreenshotCliDependencies): void;
export {};
