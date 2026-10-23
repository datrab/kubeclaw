/** Preserve Control's private response diagnostics while checking the expected JSON contract. */
export async function roundResponse<T>(response: Response, operation: string,
  valid: (value: unknown) => boolean, expected: string): Promise<T> {
  const body=await response.text();
  const context=`${operation}: HTTP ${response.status} ${response.statusText}`.trim();
  if(!response.ok)throw new Error(`${context}: ${body || '(empty response body)'}`);
  let value:unknown;
  try {value=JSON.parse(body);} catch(error) {
    throw new Error(`${context}: invalid JSON response (${error instanceof Error ? error.message : String(error)}); body: ${body}`,{cause:error});
  }
  if(!valid(value))throw new Error(`${context}: invalid response contract; expected ${expected}; body: ${body}`);
  return value as T;
}
export function responseObject(value:unknown):value is Record<string,unknown> {
  return value!==null && typeof value==='object' && !Array.isArray(value);
}
