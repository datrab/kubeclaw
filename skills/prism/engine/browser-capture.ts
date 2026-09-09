import { chromium, type Browser } from 'playwright';

export class PrismBrowserCloseError extends Error {
  constructor(cause: unknown) { super('PRISM_BROWSER_CLOSE_FAILED', { cause }); }
}

type Closed = { ok: true } | { ok: false; error: unknown };
function browserCloser(browser: Browser): () => Promise<Closed> {
  let closing: Promise<Closed> | undefined;
  return () => closing ??= browser.close().then(() => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }));
}

/** Only the admitted execution owner may close this browser. Core bounds drain time. */
export async function openOwnedBrowser(signal: AbortSignal | undefined) {
  signal?.throwIfAborted();
  const browser = await chromium.launch({ headless: true });
  const closeOnce = browserCloser(browser);
  const abort = () => { void closeOnce(); };
  signal?.addEventListener('abort', abort, { once: true });
  const close = async () => {
    signal?.removeEventListener('abort', abort);
    const closed = await closeOnce();
    if (!closed.ok) throw new PrismBrowserCloseError(closed.error);
    signal?.throwIfAborted();
  };
  if (signal?.aborted) await close();
  return { browser, close };
}
