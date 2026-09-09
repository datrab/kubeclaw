import { createHash } from "node:crypto";
import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";
import { validatePrism } from "@kubeclaw/prism-contracts-v1";
import {
  applyOperation,
  resolveView,
  type PrismOperation,
} from "../domain/index.ts";
import { renderNode } from "../renderer/index.ts";
import { evaluate } from "../evaluation/index.ts";
import { EngineExecutionCache, type EngineCacheLimits } from "./execution-cache.ts";

export type EngineOperation =
  "generate" | "render" | "evaluate" | "ingest" | "publish";
export type EngineRequest = {
  contract: "kubeclaw.prism-design-engine@1";
  operation: EngineOperation;
  input: Record<string, unknown>;
  idempotencyKey: string;
};
export type EngineResult = {
  operation: EngineOperation;
  output: Record<string, unknown>;
};
export interface DesignProvider {
  propose(
    document: PrismDocument,
    instruction: string,
  ): Promise<PrismOperation[]>;
  embed(
    text: string,
  ): Promise<{ embedding: number[]; model: string; modelVersion: string }>;
}
const hash = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
function exactInput(
  input: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
): void {
  for (const key of Object.keys(input))
    if (!allowed.includes(key))
      throw new Error(`unsupported Prism input field: ${key}`);
  for (const key of required)
    if (!(key in input)) throw new Error(`missing Prism input field: ${key}`);
}

export class PrismEngine {
  private readonly provider: DesignProvider;
  private readonly executions: EngineExecutionCache<EngineResult>;
  constructor(provider: DesignProvider, cacheLimits?: EngineCacheLimits) {
    this.provider = provider;
    this.executions = new EngineExecutionCache(cacheLimits);
  }
  cacheUsage() {
    return this.executions.usage();
  }
  async execute(request: EngineRequest): Promise<EngineResult> {
    if (request.contract !== "kubeclaw.prism-design-engine@1")
      throw new Error("unsupported Prism engine contract");
    // Bind deferred execution to the same caller-independent input as its identity.
    const ownedRequest = structuredClone(request);
    const fingerprint = hash(
      JSON.stringify({ operation: ownedRequest.operation, input: ownedRequest.input }),
    );
    return this.executions.execute(ownedRequest.idempotencyKey, fingerprint, () => this.executeOnce(ownedRequest));
  }
  private async executeOnce(request: EngineRequest): Promise<EngineResult> {
    if (request.operation === "generate")
      exactInput(
        request.input,
        ["document", "instruction", "mode"],
        ["document", "instruction"],
      );
    else if (request.operation === "render")
      exactInput(
        request.input,
        ["document", "view", "state", "viewport", "capture", "assetSources"],
        ["document", "view", "state", "viewport"],
      );
    else if (request.operation === "evaluate")
      exactInput(request.input, ["document"], ["document"]);
    else if (request.operation === "ingest")
      exactInput(request.input, ["text"], ["text"]);
    else exactInput(request.input, ["document", "approved"], ["document"]);
    if (request.operation === "ingest") {
      const text = String(request.input.text ?? "").trim();
      if (!text || text.length > 200_000)
        throw new Error("ingest text length is invalid");
      const embedded = await this.provider.embed(text);
      if (
        !embedded.embedding.length ||
        embedded.embedding.some((value) => !Number.isFinite(value))
      )
        throw new Error("embedding provider returned an invalid vector");
      return {
        operation: "ingest",
        output: { ...embedded, sourceDigest: hash(text) },
      };
    }
    const document = request.input.document as PrismDocument;
    validatePrism<PrismDocument>("designDocument", document);
    let result: EngineResult;
    if (request.operation === "generate") {
      const operations = await this.provider.propose(
        document,
        String(request.input.instruction ?? ""),
      );
      const next = operations.reduce(
        (current, operation) =>
          applyOperation(current, {
            ...operation,
            baseRevision: current.meta.revision,
          } as PrismOperation),
        document,
      );
      result = {
        operation: "generate",
        output: {
          document: next,
          operations,
          mode: String(request.input.mode ?? "refine"),
        },
      };
    } else if (request.operation === "render") {
      const suppliedAssets = (request.input.assetSources ?? {}) as Record<
        string,
        unknown
      >;
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
      const safeColor=(value:unknown,fallback:string)=>typeof value==="string"&&/^(?:#[0-9a-f]{3,8}|rgba?\([0-9., %]+\)|hsla?\([0-9., %a-z]+\)|transparent|currentColor)$/iu.test(value)?value:fallback;
      const safeFont=(value:unknown)=>typeof value==="string"&&/^[a-z0-9 _-]{1,80}$/iu.test(value)?value:"system-ui";
      const bodyBackground = safeColor((document.theme.colors as Record<string, unknown>)?.background,"#ffffff");
      const bodyForeground = safeColor((document.theme.colors as Record<string, unknown>)?.text,"#111111");
      const bodyFont = safeFont(((document.theme.typography as Record<string, unknown>)?.body as Record<string, unknown> | undefined)?.family);
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;min-height:100%;background:${bodyBackground};color:${bodyForeground};font-family:${bodyFont},system-ui,sans-serif}button,input,select,textarea{font:inherit}img{max-width:100%;height:auto}</style></head><body>${renderNode(
        resolveView(
          document,
          String(request.input.view ?? "home"),
          String(request.input.state ?? "default"),
          String(request.input.viewport ?? "wide") as
            "compact" | "regular" | "wide",
        ),
        renderAssets,
        {
          data: document.views[String(request.input.view)]?.mockData as
            Record<string, unknown> | undefined,
          components: document.components,
          theme: document.theme as Record<string, unknown>,
        },
      )}</body></html>`;
      const capture = request.input.capture === true;
      let screenshotBase64: string | undefined;
      let ariaSnapshot: string | undefined;
      let accessibilityFindings: string[] | undefined;
      let rendererMetadata: Record<string,unknown>={name:"prism-html",version:"v1",locale:"en-US",timezone:"UTC",motion:"reduced"};
      if (capture) {
        const { chromium } = await import("playwright");
        const browser = await chromium.launch({ headless: true });
        rendererMetadata={...rendererMetadata,name:"chromium",version:browser.version()};
        try {
          const widths = { compact: 390, regular: 768, wide: 1440 } as const;
          const context = await browser.newContext({
            viewport: {
              width:
                widths[String(request.input.viewport) as keyof typeof widths] ??
                1440,
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
            .evaluateAll((elements) =>
              elements.flatMap((element, index) => {
                const labels =
                  "labels" in element
                    ? Array.from((element as HTMLInputElement).labels ?? [])
                        .map((label) => label.textContent?.trim() ?? "")
                        .join(" ")
                        .trim()
                    : "";
                const name =
                  element.getAttribute("aria-label") ||
                  labels ||
                  element.textContent?.trim() ||
                  element.getAttribute("placeholder") ||
                  "";
                const findings: string[] = [];
                if (!name) findings.push(`interactive-${index}-missing-name`);
                if (element.getAttribute("tabindex") === "-1")
                  findings.push(`interactive-${index}-not-keyboard-focusable`);
                const rect=(element as HTMLElement).getBoundingClientRect();
                if(rect.width<24||rect.height<24)findings.push(`interactive-${index}-touch-target-too-small`);
                return findings;
              }),
            );
          const contrastFindings=await page.locator("body").evaluate(()=>{
            const parse=(value:string)=>{const match=value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/u);return match?[Number(match[1]),Number(match[2]),Number(match[3]),match[4]===undefined?1:Number(match[4])] as const:null;};
            const composite=(front:readonly number[],back:readonly number[])=>{const alpha=front[3]??1,backAlpha=back[3]??1,outAlpha=alpha+backAlpha*(1-alpha);return [0,1,2].map((index)=>outAlpha?((front[index]??0)*alpha+(back[index]??0)*backAlpha*(1-alpha))/outAlpha:0).concat(outAlpha);};
            const lum=(rgb:readonly number[])=>{const c=rgb.map((v)=>{const n=v/255;return n<=.03928?n/12.92:Math.pow((n+.055)/1.055,2.4);});return .2126*c[0]!+.7152*c[1]!+.0722*c[2]!;};
            return Array.from(window.document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,p,label,button,a,[role=link],[role=tab]")).flatMap((element,index)=>{const s=getComputedStyle(element),fg=parse(s.color);let parent:HTMLElement|null=element,bg:readonly number[]|null=null;while(parent){const parsed=parse(getComputedStyle(parent).backgroundColor);if(parsed&&parsed[3]>0){bg=bg?composite(bg,parsed):parsed;if((bg[3]??0)>=1)break;}parent=parent.parentElement;}if(!fg||!bg)return [];const effectiveFg=composite(fg,bg),a=lum(effectiveFg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),size=Number.parseFloat(s.fontSize),weight=Number.parseInt(s.fontWeight,10)||400,large=size>=24||(size>=18.66&&weight>=700),minimum=large?3:4.5;return ratio<minimum? [`content-${index}-contrast-${ratio.toFixed(2)}-minimum-${minimum}`]:[];});
          });
          accessibilityFindings.push(...contrastFindings);
          await context.close();
        } finally {
          await browser.close();
        }
      }
      result = {
        operation: "render",
        output: {
          html,
          renderer: rendererMetadata,
          accessibilityFindings: accessibilityFindings ?? [],
          ...(screenshotBase64 ? { screenshotBase64, ariaSnapshot } : {}),
        },
      };
    } else if (request.operation === "evaluate") {
      const report = evaluate(document);
      result = {
        operation: "evaluate",
        output: report,
      };
    } else {
      if (request.input.approved !== true)
        throw new Error("explicit approval is required");
      const canonical = JSON.stringify(document);
      const manifest = {
        schema: "prism.baseline-bundle.v1",
        projectId: document.meta.projectId,
        revision: document.meta.revision,
        designDigest: hash(canonical),
      };
      result = {
        operation: "publish",
        output: { manifest, bundleDigest: hash(JSON.stringify(manifest)) },
      };
    }
    return result;
  }
}

export class DeterministicDesignProvider implements DesignProvider {
  async embed(
    text: string,
  ): Promise<{ embedding: number[]; model: string; modelVersion: string }> {
    const bytes = createHash("sha256").update(text).digest();
    return {
      embedding: Array.from(bytes.subarray(0, 16), (value) => value / 255),
      model: "deterministic-test-only",
      modelVersion: "1",
    };
  }
  async propose(
    document: PrismDocument,
    instruction: string,
  ): Promise<PrismOperation[]> {
    const node = document.views.home?.root.children?.[0];
    if (!node) return [];
    return [
      {
        type: "node.props.set",
        baseRevision: document.meta.revision,
        nodeId: node.id,
        props: { content: instruction || "Updated design" },
      },
    ];
  }
}

export class OpenAICompatibleDesignProvider implements DesignProvider {
  readonly #endpoint: URL;
  readonly #embeddingEndpoint: URL | null;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #embeddingModel: string;
  readonly #timeoutMs: number;
  constructor(options: {
    endpoint: string;
    embeddingEndpoint: string;
    apiKey: string;
    model: string;
    embeddingModel: string;
    timeoutMs?: number;
  }) {
    const providerUrl = (value: string, label: string) => {
      const url = new URL(value);
      const internalHttp = url.protocol === "http:"
        && (url.hostname.endsWith(".svc.cluster.local") || url.hostname.endsWith(".svc"));
      if (url.protocol !== "https:" && !internalHttp)
        throw new Error(`${label} requires HTTPS or an internal Kubernetes Service`);
      return url;
    };
    this.#endpoint = providerUrl(options.endpoint, "design provider");
    if (!options.apiKey || !options.model)
      throw new Error("design provider credentials and model are required");
    if (Boolean(options.embeddingEndpoint) !== Boolean(options.embeddingModel))
      throw new Error("embedding provider endpoint and model must be configured together");
    this.#embeddingEndpoint = options.embeddingEndpoint
      ? providerUrl(options.embeddingEndpoint, "embedding provider")
      : null;
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#embeddingModel = options.embeddingModel;
    this.#timeoutMs = options.timeoutMs ?? 60_000;
  }
  async propose(
    document: PrismDocument,
    instruction: string,
  ): Promise<PrismOperation[]> {
    const response = await fetch(this.#endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(this.#timeoutMs),
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Return JSON with an operations array. Use only Prism typed operations. Do not return code or markdown.",
          },
          { role: "user", content: JSON.stringify({ instruction, document }) },
        ],
      }),
    });
    if (!response.ok)
      throw new Error(`design provider failed: ${response.status}`);
    const envelope = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = envelope.choices?.[0]?.message?.content;
    if (!text) throw new Error("design provider returned no content");
    const parsed = JSON.parse(text) as { operations?: unknown };
    if (!Array.isArray(parsed.operations))
      throw new Error("design provider returned invalid operations");
    return parsed.operations.map((value) =>
      validatePrism<PrismOperation>("operation", value),
    );
  }
  async embed(
    text: string,
  ): Promise<{ embedding: number[]; model: string; modelVersion: string }> {
    if (!this.#embeddingEndpoint || !this.#embeddingModel)
      throw new Error("embedding provider is not configured");
    const response = await fetch(this.#embeddingEndpoint, {
      method: "POST",
      signal: AbortSignal.timeout(this.#timeoutMs),
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.#embeddingModel,
        input: text,
        encoding_format: "float",
      }),
    });
    if (!response.ok)
      throw new Error(`embedding provider failed: ${response.status}`);
    const value = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = value.data?.[0]?.embedding;
    if (
      !Array.isArray(embedding) ||
      !embedding.length ||
      embedding.some((item) => !Number.isFinite(item))
    )
      throw new Error("embedding provider returned no valid vector");
    return { embedding, model: this.#embeddingModel, modelVersion: "provider" };
  }
}
