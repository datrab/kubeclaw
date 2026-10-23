type JsonRecord = Record<string, unknown>;

const FAILED_STATUSES = new Set(['blocked', 'denied', 'error', 'failed', 'forbidden', 'rejected']);

export class OpenClawToolRejectedError extends Error {
  readonly code = 'OPENCLAW_TOOL_REJECTED';
  readonly tool: string;
  readonly status: string;
  readonly governingCap?: string;

  constructor(tool: string, status: string, governingCap?: string) {
    super(`OPENCLAW_${tool.toUpperCase()}_REJECTED:${status}${governingCap ? `:${governingCap}` : ''}`);
    this.name = 'OpenClawToolRejectedError';
    this.tool = tool;
    this.status = status;
    if (governingCap) this.governingCap = governingCap;
  }
}

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

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function envelopeChain(value: unknown): readonly JsonRecord[] {
  const chain: JsonRecord[] = [];
  let current = value;
  for (let depth = 0; depth < 12 && record(current); depth += 1) {
    chain.push(current);
    if (record(current.structuredContent)) { current = current.structuredContent; continue; }
    if (record(current.output)) { current = current.output; continue; }
    if (record(current.result)) { current = current.result; continue; }
    if (record(current.details)) { current = current.details; continue; }
    const parsed = parsedTextContent(current);
    if (parsed !== undefined) { current = parsed; continue; }
    break;
  }
  return chain;
}

/** Reject a current or legacy tool-error envelope before callers parse success fields. */
export function assertOpenClawToolAccepted(value: unknown, tool: string): void {
  const chain = envelopeChain(value);
  const statuses = chain.map((entry) => text(entry.status)).filter((entry): entry is string => entry !== undefined);
  const rejectedStatus = statuses.find((entry) => FAILED_STATUSES.has(entry.toLowerCase()));
  const failed = chain.some((entry) => entry.ok === false || entry.isError === true)
    || rejectedStatus !== undefined;
  if (!failed) return;
  const status = rejectedStatus ?? 'error';
  const governingCap = chain.map((entry) => text(entry.governingCap) ?? text(entry.governing_cap))
    .find(Boolean);
  throw new OpenClawToolRejectedError(tool, status.toLowerCase(), governingCap);
}
