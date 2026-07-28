declare class LintPolicyError extends Error {
    code: string;
    constructor(message: string);
}
declare function fail(field: string, message: string): never;
declare function record(value: unknown, field: string): Record<string, any>;
declare function text(value: unknown, field: string): string;
declare function stringList(value: unknown, field: string, { nonEmpty }?: any): string[];
declare function repoRelative(value: unknown, field: string): string;
declare function isoDate(value: unknown, field: string): string;
export { LintPolicyError, fail, isoDate, record, repoRelative, stringList, text };
