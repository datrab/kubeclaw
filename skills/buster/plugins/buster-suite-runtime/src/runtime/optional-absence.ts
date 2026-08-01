export type OptionalAbsenceReader<T> = () => T;

export function selectDefinedValue<T>(...readers: Array<OptionalAbsenceReader<T>>): T {
  let lastValue: T | undefined;
  let hasValue = false;
  for (const reader of readers) {
    const value = reader();
    lastValue = value;
    hasValue = true;
    if (value !== undefined && value !== null) return value;
  }
  if (hasValue) return lastValue as T;
  return undefined as T;
}

export function selectTruthyValue<T>(...readers: Array<OptionalAbsenceReader<T>>): T {
  let lastValue: T | undefined;
  let hasValue = false;
  for (const reader of readers) {
    const value = reader();
    lastValue = value;
    hasValue = true;
    if (value) return value;
  }
  if (hasValue) return lastValue as T;
  return undefined as T;
}
