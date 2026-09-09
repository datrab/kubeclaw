import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { inTransaction, type Database, type Queryable } from "../storage/index.ts";

export type SourceKind =
  "internal-project" | "user-upload" | "generated" | "public-web";
export type CorpusInput = {
  sourceKind: SourceKind;
  locator?: string;
  title: string;
  summary: string;
  tags: string[];
  sourceFamily?: string;
  surface?: string;
  industry?: string;
  style?: string[];
  rights: "full" | "derived" | "analysis-only" | "temporary";
  contentBase64?: string;
  mediaType?: string;
  sourceContentDigest?: string;
};
export type EmbeddingEvidence = {
  embedding: number[];
  model: string;
  modelVersion: string;
  sourceDigest: string;
};
const hash = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
export function validateSource(input: CorpusInput): void {
  if(input.sourceContentDigest&&!/^sha256:[a-f0-9]{64}$/u.test(input.sourceContentDigest))throw new Error("source content digest is invalid");
  if (input.sourceKind === "public-web") {
    if (!input.locator) throw new Error("public source needs a locator");
    const url = new URL(input.locator);
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const unsafeV4 = (value: string) => {
      const parts = value.split(".").map(Number);
      return (
        parts[0] === 10 ||
        parts[0] === 127 ||
        parts[0] === 0 ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        parts[0] >= 224
      );
    };
    const unsafeV6 = (value: string) =>
      value === "::1" ||
      value === "::" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      /^fe[89ab]/.test(value) ||
      value.startsWith("ff") ||
      value.startsWith("2001:db8:");
    if (
      url.protocol !== "https:" ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      (isIP(host) === 4 && unsafeV4(host)) ||
      (isIP(host) === 6 && unsafeV6(host))
    )
      throw new Error("source network is not allowed");
  }
}
export async function ingest(
  db: Database,
  input: CorpusInput,
  evidence: EmbeddingEvidence,
  options:{activate?:boolean}={},
): Promise<{ id: string; digest: string }> {
  validateSource(input);
  if (
    !evidence.embedding.length ||
    evidence.embedding.length > 4096 ||
    evidence.embedding.some((value) => !Number.isFinite(value))
  )
    throw new Error("valid embedding evidence is required");
  const digest = hash(JSON.stringify(input));
  return inTransaction(db, async (connection) => {
    // Serialize identical inputs before lookup; all writes share this reserved transaction.
    await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`prism-corpus:${digest}`]);
    const prior = await connection.query<{ id: string }>(
      "SELECT id FROM prism.corpus_revision WHERE content_digest=$1 LIMIT 1",
      [digest],
    );
    if (prior.rows[0]) return { id: prior.rows[0].id, digest };
    return insertRevision(connection, input, evidence, digest, options.activate !== false);
  });
}
async function insertRevision(connection: Queryable, input: CorpusInput, evidence: EmbeddingEvidence, digest: string, activate: boolean): Promise<{ id: string; digest: string }> {
  const itemId = randomUUID(),
    revisionId = randomUUID(),
    rightsId = randomUUID();
  const allowDesignUse =
    input.rights === "full" || input.rights === "derived";
  await connection.query(
    "INSERT INTO prism.rights_policy(id,retention,retain_original,allow_derivatives,allow_embedding,allow_design_use,basis) VALUES($1,$2,$3,$4,true,$5,'explicit-ingestion-policy')",
    [
      rightsId,
      input.rights,
      false,
      allowDesignUse,
      allowDesignUse,
    ],
  );
  await connection.query(
    "INSERT INTO prism.corpus_item(id,corpus_key,kind,status) VALUES($1,$2,$3,$4)",
    [itemId, digest, input.sourceKind,!activate?"restricted":"active"],
  );
  await connection.query(
    "INSERT INTO prism.corpus_revision(id,corpus_item_id,revision,source_kind,source_locator_hash,captured_at,normalized,searchable_text,content_digest,normalization_version,rights_id,source_content_digest) VALUES($1,$2,1,$3,$4,now(),$5::jsonb,$6,$7,'v1',$8,$9)",
    [
      revisionId,
      itemId,
      input.sourceKind,
      input.locator ? hash(input.locator) : null,
      JSON.stringify({
        title: input.title,
        summary: input.summary,
        tags: input.tags,
        sourceFamily: input.sourceFamily ?? input.sourceKind,
        ...(input.surface ? { surface: input.surface } : {}),
        ...(input.industry ? { industry: input.industry } : {}),
        ...(input.style ? { style: input.style } : {}),
      }),
      `${input.title} ${input.summary} ${input.tags.join(" ")}`,
      digest,
      rightsId,
      input.sourceContentDigest??null,
    ],
  );
  await connection.query(
    "UPDATE prism.corpus_item SET current_revision_id=$1 WHERE id=$2",
    [revisionId, itemId],
  );
  await connection.query(
    "INSERT INTO prism.corpus_embedding(corpus_revision_id,model,model_version,normalization_version,source_digest,embedding) VALUES($1,$2,$3,'v1',$4,$5::vector)",
    [
      revisionId,
      evidence.model,
      evidence.modelVersion,
      evidence.sourceDigest,
      `[${evidence.embedding.join(",")}]`,
    ],
  );
  return { id: revisionId, digest };
}

export async function search(
  db: Queryable,
  query: string,
  limit = 10,
  queryEmbedding?: { embedding: number[]; model: string },
  options: {
    required?: Record<string, unknown>;
    preferred?: Record<string, unknown>;
    avoid?: Record<string, unknown>;
    sourceFamilyLimit?: number;
  } = {},
): Promise<Array<Record<string, unknown>>> {
  const vector = queryEmbedding?.embedding;
  if (
    vector &&
    (vector.length === 0 || vector.some((value) => !Number.isFinite(value)))
  )
    throw new Error("query embedding is invalid");
  const requiredFilter = JSON.stringify(options.required ?? {});
  const avoidFilter = JSON.stringify(options.avoid ?? {});
  const result = vector
    ? await db.query(
        "WITH eligible AS (SELECT r.*,e.embedding,e.model FROM prism.corpus_revision r JOIN prism.corpus_item i ON i.current_revision_id=r.id JOIN prism.rights_policy p ON p.id=r.rights_id JOIN prism.corpus_embedding e ON e.corpus_revision_id=r.id WHERE i.status='active' AND p.allow_design_use=true AND (p.valid_until IS NULL OR p.valid_until>now()) AND e.model=$4 AND r.normalized @> $5::jsonb AND ($6::jsonb='{}'::jsonb OR NOT r.normalized @> $6::jsonb)), text_rank AS (SELECT id,row_number() OVER(ORDER BY ts_rank(search_vector,websearch_to_tsquery('simple',$1)) DESC,id) AS rank FROM eligible WHERE search_vector @@ websearch_to_tsquery('simple',$1) LIMIT 100), vector_rank AS (SELECT id,row_number() OVER(ORDER BY embedding <=> $3::vector,id) AS rank FROM eligible LIMIT 100), fused AS (SELECT COALESCE(t.id,v.id) id,COALESCE(1.0/(60+t.rank),0)+COALESCE(1.0/(60+v.rank),0) score FROM text_rank t FULL JOIN vector_rank v USING(id)) SELECT r.id,r.normalized,r.source_kind,f.score,'hybrid-rrf-v1' AS ranking FROM fused f JOIN prism.corpus_revision r ON r.id=f.id ORDER BY f.score DESC,r.id LIMIT $2",
        [
          query,
          Math.max(limit * 10, 100),
          `[${vector.join(",")}]`,
          queryEmbedding!.model,
          requiredFilter,
          avoidFilter,
        ],
      )
    : await db.query(
        "SELECT r.id,r.normalized,r.source_kind,ts_rank(r.search_vector,websearch_to_tsquery('simple',$1)) AS score,'text-v1' AS ranking FROM prism.corpus_revision r JOIN prism.corpus_item i ON i.current_revision_id=r.id JOIN prism.rights_policy p ON p.id=r.rights_id WHERE i.status='active' AND p.allow_design_use=true AND (p.valid_until IS NULL OR p.valid_until>now()) AND r.normalized @> $3::jsonb AND ($4::jsonb='{}'::jsonb OR NOT r.normalized @> $4::jsonb) AND r.search_vector @@ websearch_to_tsquery('simple',$1) ORDER BY score DESC,r.id LIMIT $2",
        [query, Math.max(limit * 10, 100), requiredFilter, avoidFilter],
      );
  const matches = (
    normalized: Record<string, unknown>,
    filter: Record<string, unknown> | undefined,
  ) =>
    !filter ||
    Object.entries(filter).every(([key, expected]) => {
      const actual = normalized[key];
      return Array.isArray(expected)
        ? expected.every((value) =>
            Array.isArray(actual) ? actual.includes(value) : actual === value,
          )
        : Array.isArray(actual)
          ? actual.includes(expected)
          : actual === expected;
    });
  const familyLimit = Math.max(1, options.sourceFamilyLimit ?? 2);
  const families = new Map<string, number>();
  const selected: Array<Record<string, unknown>> = [];
  const eligible = result.rows
    .map((row, rank) => ({ row, rank }))
    .filter(({ row }) => {
      const normalized = (row.normalized ?? {}) as Record<string, unknown>;
      return (
        matches(normalized, options.required) &&
        !(
          matches(normalized, options.avoid) &&
          Object.keys(options.avoid ?? {}).length > 0
        )
      );
    })
    .sort((left, right) => {
      const leftPreferred = matches(
        (left.row.normalized ?? {}) as Record<string, unknown>,
        options.preferred,
      );
      const rightPreferred = matches(
        (right.row.normalized ?? {}) as Record<string, unknown>,
        options.preferred,
      );
      return (
        Number(rightPreferred) - Number(leftPreferred) || left.rank - right.rank
      );
    });
  for (const { row } of eligible) {
    const normalized = (row.normalized ?? {}) as Record<string, unknown>;
    const family = String(
      normalized.sourceFamily ?? row.source_kind ?? "unknown",
    );
    if ((families.get(family) ?? 0) >= familyLimit) continue;
    families.set(family, (families.get(family) ?? 0) + 1);
    const preferred = matches(normalized, options.preferred);
    selected.push({
      ...row,
      explanation: {
        ranking: row.ranking,
        requiredMatched: true,
        preferredMatched: preferred,
        sourceFamily: family,
        diversityCap: familyLimit,
      },
    });
    if (selected.length === limit) break;
  }
  return selected;
}
export async function expire(db: Queryable, id: string): Promise<void> {
  await db.query(
    "UPDATE prism.corpus_item SET status='expired' WHERE current_revision_id=$1",
    [id],
  );
}
