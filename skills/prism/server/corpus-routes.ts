import { createHash } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { ingest, search, type CorpusInput } from "../corpus/index.ts";

import type { AuthenticatedControlContext } from "./control-context.ts";
import { body, json, sha256 } from "./control-http.ts";
type RouteContext = Pick<
  AuthenticatedControlContext,
  "pool" | "artifacts" | "runWorker" | "config"
>;

export async function corpusRoutes(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === "/v1/artifacts" && request.method === "POST") {
    await uploadArtifact(context, request, response);
    return true;
  }
  if (url.pathname === "/v1/corpus" && request.method === "POST") {
    await ingestCorpus(context, request, response);
    return true;
  }
  if (url.pathname === "/v1/corpus/search" && request.method === "GET") {
    await searchCorpus(context, response, url);
    return true;
  }
  return false;
}
async function uploadArtifact(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { artifacts } = context;

  const input = (await body(request, context.config.maximumArtifactUploadBodyBytes)) as { base64?: string };
  if (!input.base64) throw new Error("base64 is required");
  const decoded = Buffer.from(input.base64, "base64");
  if (
    decoded.byteLength > context.config.maximumArtifactBytes ||
    decoded.toString("base64") !== input.base64
  )
    throw new Error(`artifact payload is invalid or exceeds ${context.config.maximumArtifactBytes / 1_000_000} MB`);
  return json(response, 201, await artifacts.put(decoded));
}
async function ingestCorpus(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { pool } = context;

  const input = (await body(request, context.config.maximumJsonBodyBytes)) as CorpusInput;
  const acquisition = await acquireCorpus(context.config, input);
  let publicationError: unknown;
  let stored: { id: string; digest: string } | undefined;
  try {
    stored = await publishCorpus(context, input, acquisition);
  } catch (error) {
    publicationError = error;
  }
  let cleanupError: unknown;
  try {
    await cleanAcquisition(context.config, acquisition.quarantineDigest);
  } catch (error) {
    cleanupError = error;
  }
  if (publicationError && cleanupError)
    throw new AggregateError(
      [publicationError, cleanupError],
      "corpus publication and quarantine cleanup failed",
    );
  if (publicationError) throw publicationError;
  if (cleanupError) throw cleanupError;
  // ingest returns corpus_revision.id so activation remains bound to the exact governed revision.
  await pool.query(
    "UPDATE prism.corpus_item SET status='active' WHERE current_revision_id=$1",
    [stored!.id],
  );
  return json(response, 201, stored!);
}
async function searchCorpus(
  context: RouteContext,
  response: ServerResponse,
  url: URL,
) {
  const { pool, runWorker } = context;

  const { config } = context;
  const limit = Math.min(config.corpusSearchMaximumLimit, Math.max(1, Number(url.searchParams.get("limit") ?? config.corpusSearchDefaultLimit)));
  const query = url.searchParams.get("q") ?? "";
  const embedded = await runWorker(
    "ingest",
    { text: query },
    `query:${sha256(query)}`,
  );
  const parseFilter = (name: string): Record<string, unknown> | undefined => {
    const value = url.searchParams.get(name);
    if (!value) return undefined;
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error(`${name} filter must be an object`);
    return parsed as Record<string, unknown>;
  };
  const items = await search(
    pool,
    query,
    limit,
    {
      embedding: embedded.embedding as number[],
      model: String(embedded.model),
    },
    {
      required: parseFilter("required"),
      preferred: parseFilter("preferred"),
      avoid: parseFilter("avoid"),
      sourceFamilyLimit: Math.min(
        config.corpusSourceFamilyMaximumLimit,
        Math.max(1, Number(url.searchParams.get("sourceFamilyLimit") ?? config.corpusSourceFamilyDefaultLimit)),
      ),
    },
  );
  return json(response, 200, {
    items,
    coverageGap:
      items.length <
      limit
        ? "The approved corpus does not cover all requested result slots."
        : null,
  });
}

interface Acquisition {
  normalized: CorpusInput;
  quarantineDigest: string;
  contentBase64: string;
}
async function acquireCorpus(
  config: AuthenticatedControlContext["config"],
  input: CorpusInput,
): Promise<Acquisition> {
  const { ingestionUrl, ingestionSecret } = config;
  if (input.sourceKind === "public-web")
    throw new Error(
      "public-web ingestion is disabled until a source policy is approved",
    );
  const acquired = await fetch(new URL("/v1/acquisitions", ingestionUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${ingestionSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(config.ingestionAcquireTimeoutMs),
  });
  if (!acquired.ok)
    throw new Error(`corpus acquisition failed: ${acquired.status}`);
  const acquisition = (await acquired.json()) as {
    normalized?: CorpusInput;
    quarantineDigest?: string;
    contentBase64?: string;
  };
  if (
    !acquisition.normalized ||
    !acquisition.quarantineDigest ||
    !acquisition.contentBase64
  )
    throw new Error("corpus acquisition returned invalid evidence");
  return acquisition as Acquisition;
}
async function publishCorpus(
  context: Pick<AuthenticatedControlContext, "pool" | "runWorker">,
  input: CorpusInput,
  acquisition: Acquisition,
) {
  const { pool, runWorker } = context;
  const sourceBytes = Buffer.from(acquisition.contentBase64, "base64");
  if (
    `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}` !==
    acquisition.quarantineDigest
  )
    throw new Error("corpus acquisition digest mismatch");
  const normalized = {
    ...acquisition.normalized,
    sourceContentDigest: acquisition.quarantineDigest,
  };
  const text = `${normalized.title} ${normalized.summary} ${normalized.tags.join(" ")}`;
  const embedded = await runWorker(
    "ingest",
    { text },
    `corpus:${sha256(JSON.stringify(input))}`,
  );
  return ingest(
    pool,
    normalized,
    {
      embedding: embedded.embedding as number[],
      model: String(embedded.model),
      modelVersion: String(embedded.modelVersion),
      sourceDigest: String(embedded.sourceDigest),
    },
    { activate: false },
  );
}
async function cleanAcquisition(
  config: AuthenticatedControlContext["config"],
  quarantineDigest: string,
) {
  const { ingestionUrl, ingestionSecret } = config;
  await fetch(
    new URL(`/v1/acquisitions/${quarantineDigest.slice(7)}`, ingestionUrl),
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${ingestionSecret}` },
      signal: AbortSignal.timeout(config.ingestionCleanupTimeoutMs),
    },
  ).then((result) => {
    if (!result.ok)
      throw new Error(`quarantine cleanup failed: ${result.status}`);
  });
}
