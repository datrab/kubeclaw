/**
 * Safe JSON parse returning structured diagnostics.
 */
declare function tryParseJson(str: string): {
    ok: true;
    data: any;
    error?: never;
} | {
    ok: false;
    error: any;
    data?: never;
};
export { tryParseJson };
