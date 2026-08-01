export type AnyRecord = Record<string, any>;
export interface ApiTestResult {
    passed: boolean;
    failures: string[];
    status: number | null;
    elapsed: number;
}
export declare function interpolate(value: unknown, vars: Record<string, string>): unknown;
export declare function interpolateObject(value: any, vars: Record<string, string>): any;
export declare function getByPath(value: any, dotPath: unknown): any;
export declare function missingTemplateVarsForTest(test: AnyRecord, vars: Record<string, string>, defaults: AnyRecord): string[];
