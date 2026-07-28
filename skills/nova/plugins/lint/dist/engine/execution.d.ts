/**
 * Run an external command safely. Returns { ok, stdout, stderr, exitCode }.
 * Never throws — all errors are captured in the return value.
 */
declare function safeExec(cmd: any, args: any, opts?: any): {
    ok: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut?: never;
    error?: never;
} | {
    ok: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
    error: string;
};
declare function requireToolExecution(result: any, toolId: any): any;
/**
 * Check if a command is available in PATH.
 */
declare function commandExists(cmd: any): boolean;
export { commandExists, requireToolExecution, safeExec };
