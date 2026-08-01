type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeGatewayRawValue(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function assertNoErrors(errors: string[], label: string): void {
  if (errors.length > 0) {
    throw new TypeError(`${label} failed ACP/gateway contract validation: ${errors.join('; ')}`);
  }
}

export function normalizeGatewayInvokeResult(value: unknown): UnknownRecord {
  if (isPlainObject(value)) return value;
  return { raw: normalizeGatewayRawValue(value) };
}

export function validateGatewayInvokeResult(result: unknown = {}): string[] {
  if (!isPlainObject(result)) return ['gateway invoke result must be an object'];
  if (result.raw !== undefined && typeof result.raw !== 'string' && result.raw !== null) {
    return ['raw must be a string or null when present'];
  }
  return [];
}

export function assertValidGatewayInvokeResult(
  result: unknown,
  label = 'gateway invoke result',
): unknown {
  assertNoErrors(validateGatewayInvokeResult(result), label);
  return result;
}

export function buildGatewayInvokeHttpError(
  tool: string,
  status: number,
  statusText: string,
  bodyText: unknown,
): Error & { httpStatus: number; httpBody: string | null } {
  const error = new Error(`Gateway ${tool} failed: ${status} ${statusText}`) as Error & {
    httpStatus: number;
    httpBody: string | null;
  };
  error.httpStatus = status;
  error.httpBody = typeof bodyText === 'string' ? bodyText : normalizeGatewayRawValue(bodyText);
  return error;
}

export function validateGatewayInvokeError(error: unknown = {}): string[] {
  if (!isPlainObject(error)) return ['gateway invoke error must be an object'];
  const errors: string[] = [];
  if (typeof error.message !== 'string' || error.message.trim().length === 0) {
    errors.push('message must be a non-empty string');
  }
  if (error.httpStatus !== undefined && typeof error.httpStatus !== 'number') {
    errors.push('httpStatus must be a number when present');
  }
  if (
    error.httpBody !== undefined
    && typeof error.httpBody !== 'string'
    && error.httpBody !== null
  ) {
    errors.push('httpBody must be a string or null when present');
  }
  return errors;
}
