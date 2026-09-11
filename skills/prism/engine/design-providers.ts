import { createHash } from "node:crypto";
import { validatePrism, type PrismDocument } from "@kubeclaw/prism-contracts-v1";
import type { PrismOperation } from "../domain/index.ts";
import type { DesignProvider } from "./index.ts";

export class DeterministicDesignProvider implements DesignProvider {
  async embed(
    text: string,
    signal?: AbortSignal,
  ): Promise<{ embedding: number[]; model: string; modelVersion: string }> {
    signal?.throwIfAborted();
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
    signal?: AbortSignal,
  ): Promise<PrismOperation[]> {
    signal?.throwIfAborted();
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
      const internalHttp =
        url.protocol === "http:" &&
        (url.hostname.endsWith(".svc.cluster.local") ||
          url.hostname.endsWith(".svc"));
      if (url.protocol !== "https:" && !internalHttp)
        throw new Error(
          `${label} requires HTTPS or an internal Kubernetes Service`,
        );
      return url;
    };
    this.#endpoint = providerUrl(options.endpoint, "design provider");
    if (!options.apiKey || !options.model)
      throw new Error("design provider credentials and model are required");
    if (Boolean(options.embeddingEndpoint) !== Boolean(options.embeddingModel))
      throw new Error(
        "embedding provider endpoint and model must be configured together",
      );
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
    signal?: AbortSignal,
  ): Promise<PrismOperation[]> {
    const response = await fetch(this.#endpoint, {
      method: "POST",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(this.#timeoutMs)])
        : AbortSignal.timeout(this.#timeoutMs),
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
    signal?: AbortSignal,
  ): Promise<{ embedding: number[]; model: string; modelVersion: string }> {
    if (!this.#embeddingEndpoint || !this.#embeddingModel)
      throw new Error("embedding provider is not configured");
    const response = await fetch(this.#embeddingEndpoint, {
      method: "POST",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(this.#timeoutMs)])
        : AbortSignal.timeout(this.#timeoutMs),
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
