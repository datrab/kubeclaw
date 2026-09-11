import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";
import { resolveView } from "../domain/index.ts";
import { renderNode } from "../renderer/index.ts";
import { openOwnedBrowser } from "./browser-capture.ts";
import { interactiveFindings, contrastFindings } from "./capture-findings.ts";
import type { EngineResult } from "./index.ts";

function renderAssetsFor(
  document: PrismDocument,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const suppliedAssets = (input.assetSources ?? {}) as Record<string, unknown>;
  const renderAssets: Record<string, unknown> = {};
  for (const [assetId, rawAsset] of Object.entries(document.assets)) {
    const asset = rawAsset as {
      artifact?: string;
      mediaType?: string;
      alt?: string;
    };
    const src = suppliedAssets[assetId];
    if (
      !asset.artifact ||
      !asset.mediaType ||
      typeof src !== "string" ||
      !src.startsWith(`data:${asset.mediaType};base64,`) ||
      src.length > 16_000_000
    )
      throw new Error(`render asset is unavailable: ${assetId}`);
    renderAssets[assetId] = {
      ...asset,
      src,
    };
  }
  return renderAssets;
}

function renderHtml(
  document: PrismDocument,
  input: Record<string, unknown>,
): string {
  const renderAssets = renderAssetsFor(document, input);
  const safeColor = (value: unknown, fallback: string) =>
    typeof value === "string" &&
    /^(?:#[0-9a-f]{3,8}|rgba?\([0-9., %]+\)|hsla?\([0-9., %a-z]+\)|transparent|currentColor)$/iu.test(
      value,
    )
      ? value
      : fallback;
  const safeFont = (value: unknown) =>
    typeof value === "string" && /^[a-z0-9 _-]{1,80}$/iu.test(value)
      ? value
      : "system-ui";
  const bodyBackground = safeColor(
    (document.theme.colors as Record<string, unknown>)?.background,
    "#ffffff",
  );
  const bodyForeground = safeColor(
    (document.theme.colors as Record<string, unknown>)?.text,
    "#111111",
  );
  const bodyFont = safeFont(
    (
      (document.theme.typography as Record<string, unknown>)?.body as
        Record<string, unknown> | undefined
    )?.family,
  );
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;min-height:100%;background:${bodyBackground};color:${bodyForeground};font-family:${bodyFont},system-ui,sans-serif}button,input,select,textarea{font:inherit}img{max-width:100%;height:auto}</style></head><body>${renderNode(
    resolveView(
      document,
      String(input.view ?? "home"),
      String(input.state ?? "default"),
      String(input.viewport ?? "wide") as "compact" | "regular" | "wide",
    ),
    renderAssets,
    {
      data: document.views[String(input.view)]?.mockData as
        Record<string, unknown> | undefined,
      components: document.components,
      theme: document.theme as Record<string, unknown>,
    },
  )}</body></html>`;
  return html;
}

async function captureHtml(
  html: string,
  input: Record<string, unknown>,
  rendererMetadata: Record<string, unknown>,
  signal?: AbortSignal,
) {
  let screenshotBase64: string | undefined;
  let ariaSnapshot: string | undefined;
  let accessibilityFindings: string[] | undefined;
  const owned = await openOwnedBrowser(signal);
  const browser = owned.browser;
  rendererMetadata = {
    ...rendererMetadata,
    name: "chromium",
    version: browser.version(),
  };
  try {
    const widths = { compact: 390, regular: 768, wide: 1440 } as const;
    const context = await browser.newContext({
      viewport: {
        width: widths[String(input.viewport) as keyof typeof widths] ?? 1440,
        height: 1000,
      },
      locale: "en-US",
      timezoneId: "UTC",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.addStyleTag({
      content:
        "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
    });
    screenshotBase64 = (
      await page.screenshot({ type: "png", fullPage: true })
    ).toString("base64");
    ariaSnapshot = await page.locator("body").ariaSnapshot();
    accessibilityFindings = await page
      .locator(
        "button,input,select,textarea,[role=button],[role=link],[role=tab]",
      )
      .evaluateAll(interactiveFindings);
    const contrast = await page.locator("body").evaluate(contrastFindings);
    accessibilityFindings.push(...contrast);
    await context.close();
  } finally {
    await owned.close();
  }
  return {
    screenshotBase64,
    ariaSnapshot,
    accessibilityFindings,
    rendererMetadata,
  };
}

export async function renderOperation(
  document: PrismDocument,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<EngineResult> {
  const html = renderHtml(document, input);
  const capture = input.capture === true;
  let screenshotBase64: string | undefined;
  let ariaSnapshot: string | undefined;
  let accessibilityFindings: string[] | undefined;
  let rendererMetadata: Record<string, unknown> = {
    name: "prism-html",
    version: "v1",
    locale: "en-US",
    timezone: "UTC",
    motion: "reduced",
  };
  if (capture) {
    const captured = await captureHtml(html, input, rendererMetadata, signal);
    ({
      screenshotBase64,
      ariaSnapshot,
      accessibilityFindings,
      rendererMetadata,
    } = captured);
  }
  return {
    operation: "render",
    output: {
      html,
      renderer: rendererMetadata,
      accessibilityFindings: accessibilityFindings ?? [],
      ...(screenshotBase64 ? { screenshotBase64, ariaSnapshot } : {}),
    },
  };
}
