export interface RegistryHealthOptions {
  readonly origin: string;
  readonly username?: string;
  readonly password?: string;
}

export function validateRegistryHealth(options: RegistryHealthOptions): void {
  const url = new URL(options.origin);
  if (url.origin !== options.origin || url.username || url.password || !['https:', 'http:'].includes(url.protocol)) {
    throw new Error('HTTP_REGISTRY_HEALTH_ORIGIN_INVALID');
  }
  const authenticated = typeof options.username === 'string' && options.username.length > 0
    && typeof options.password === 'string' && options.password.length > 0;
  if (url.protocol === 'https:' ? !authenticated : options.username !== undefined || options.password !== undefined) {
    throw new Error('HTTP_REGISTRY_HEALTH_AUTH_INVALID');
  }
}

function acceptOnly(value: unknown): boolean {
  return value === undefined || (!!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(name => name.toLowerCase() === 'accept'));
}

/** Platform credentials authorize only the Distribution API version check. */
export class RegistryHealthAccess {
  readonly #origin: string;
  readonly #authorization: string | undefined;
  readonly #password: string | undefined;

  constructor(options: RegistryHealthOptions) {
    validateRegistryHealth(options);
    const authenticated = options.username !== undefined;
    this.#origin = options.origin;
    this.#password = options.password;
    this.#authorization = authenticated ? `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}` : undefined;
  }

  matches(url: URL): boolean { return url.origin === this.#origin; }

  headers(url: URL, operation: string, payload: Record<string, unknown>): Record<string, string> | undefined {
    if (!this.matches(url)) return undefined;
    if (operation !== 'request' || url.href !== `${this.#origin}/v2/`
      || !['GET', 'HEAD'].includes(String(payload.method ?? 'GET').toUpperCase()) || payload.body !== undefined
      || !acceptOnly(payload.headers)
      || (payload.responseHeaders !== undefined && (!Array.isArray(payload.responseHeaders)
        || payload.responseHeaders.some(name => name !== 'content-type')))) {
      throw new Error('HTTP_REGISTRY_HEALTH_SCOPE_DENIED');
    }
    return this.#authorization ? { authorization: this.#authorization } : {};
  }

  assertResponse(bytes: Buffer, contentType: string | null): void {
    if (!this.#authorization) return;
    const response = Buffer.concat([bytes, Buffer.from(contentType ?? '')]);
    if (response.includes(this.#authorization) || response.includes(this.#authorization.slice(6))
      || response.includes(this.#password!)) throw new Error('HTTP_REGISTRY_HEALTH_RESPONSE_SECRET_DENIED');
  }
}
