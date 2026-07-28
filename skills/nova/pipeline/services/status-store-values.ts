export function objectRecord(value: any) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

export function arrayValue(value: any) {
  return Array.isArray(value) ? value : [];
}

export function firstTextValue(...values: any[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
