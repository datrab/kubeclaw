type JsonRecord = Record<string, unknown>;

export function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parsedTextContent(value: JsonRecord): unknown {
  if (!Array.isArray(value.content)) return undefined;
  for (const block of value.content) {
    if (!record(block) || block.type !== 'text' || typeof block.text !== 'string') continue;
    try { return JSON.parse(block.text) as unknown; }
    catch (_error) {
      /* INTENTIONAL_NONCRITICAL(non_json_tool_text): another text block or structured content may carry the result. */
      void _error;
    }
  }
  return undefined;
}

/** Normalize both current MCP CallToolResult envelopes and the legacy Gateway wrapper. */
export function openClawToolDetails(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 12 && record(current); depth += 1) {
    if (record(current.structuredContent)) { current = current.structuredContent; continue; }
    if (record(current.details)) { current = current.details; continue; }
    if (record(current.output)) { current = current.output; continue; }
    if (record(current.result)) { current = current.result; continue; }
    const parsed = parsedTextContent(current);
    if (parsed !== undefined) { current = parsed; continue; }
    break;
  }
  return current;
}
