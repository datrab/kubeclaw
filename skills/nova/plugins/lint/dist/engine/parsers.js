/**
 * Safe JSON parse returning structured diagnostics.
 */
function tryParseJson(str) {
    try {
        return { ok: true, data: JSON.parse(str) };
    }
    catch (error) {
        return { ok: false, error: error.message };
    }
}
export { tryParseJson };
