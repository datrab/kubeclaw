/**
 * Safe JSON parse returning structured diagnostics.
 */
function tryParseJson(str: string) {
  try {
    return { ok: true as const, data: JSON.parse(str) };
  } catch (error: any) {
    return { ok: false as const, error: error.message };
  }
}

export { tryParseJson };
