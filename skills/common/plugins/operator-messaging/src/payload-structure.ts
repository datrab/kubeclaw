export interface PayloadStructure {
  readonly maximumDepth: number;
  readonly maximumArrayEntries: number;
  readonly maximumObjectProperties: number;
}
// Fixed limits of the existing payload/retirement protocol, not runtime defaults.
// Admission can select stricter limits; original record verification stays on
// the protocol ceiling rather than today's narrower processing selection.
export const OPERATOR_PAYLOAD_PROTOCOL_LIMITS: PayloadStructure = Object.freeze({maximumDepth:20,maximumArrayEntries:1000,maximumObjectProperties:1000});
export function capturePayloadStructure(value: unknown): PayloadStructure {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'maximumArrayEntries,maximumDepth,maximumObjectProperties') throw new Error('OPERATOR_PAYLOAD_STRUCTURE_INVALID');
  const raw=value as Record<string,unknown>;
  for (const [key, maximum] of Object.entries(OPERATOR_PAYLOAD_PROTOCOL_LIMITS)) {
    if (!Number.isSafeInteger(raw[key]) || Number(raw[key]) < 1 || Number(raw[key]) > maximum) throw new Error(`OPERATOR_PAYLOAD_STRUCTURE_INVALID:${key}`);
  }
  return Object.freeze({...raw}) as unknown as PayloadStructure;
}
