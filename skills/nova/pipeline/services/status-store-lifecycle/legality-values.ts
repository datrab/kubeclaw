import { selectDefinedValue } from "../../optional-absence.ts";
export type RecordValue = Record<string, any>;
export function objectRecord(value: any): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
export function numericValue(value: any, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
export function textValue(value: any): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}
export function normalizedSignalKind(
  proposal: RecordValue,
  refs: RecordValue,
): string {
  const kind = selectDefinedValue(
    () => textValue(proposal.data?.signal_kind),
    () => textValue(refs.signal_kind),
  );
  return (
    selectDefinedValue(
      () => kind,
      () => "",
    ) ?? ""
  ).toLowerCase();
}
export function referencedState(collection: any, key: any): RecordValue | null {
  if (!key) return null;
  return collection?.[key] ?? null;
}
export function cooldownIdentity(refs: RecordValue): {
  scope: string | null;
  key: string | null;
} {
  if (refs.module_id) return { scope: "modules", key: refs.module_id };
  if (refs.gate_id) return { scope: "gates", key: refs.gate_id };
  return { scope: null, key: null };
}
