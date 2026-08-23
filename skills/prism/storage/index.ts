import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";
import { applyOperation, type PrismOperation } from "../domain/index.ts";

export type Queryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec?(sql: string): Promise<unknown>;
};
const digest = (value: string | Uint8Array): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

export async function migrate(
  db: Queryable & { connect?: () => Promise<Queryable & { release(): void }> },
): Promise<void> {
  const root = new URL("./migrations/", import.meta.url);
  const files = (await readdir(root))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  const connection = db.connect ? await db.connect() : db;
  try {
    await connection.query("BEGIN");
    try {
      await connection.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('prism-schema-migrations',0))",
      );
      await connection.query("CREATE SCHEMA IF NOT EXISTS prism");
      await connection.query(
        "CREATE TABLE IF NOT EXISTS prism.schema_migration(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      for (const name of files) {
        const sql = await readFile(new URL(name, root), "utf8");
        const applied = await connection.query(
          "SELECT name FROM prism.schema_migration WHERE name=$1",
          [name],
        );
        if (!applied.rows[0]) {
          if (connection.exec) await connection.exec(sql);
          else await connection.query(sql);
          await connection.query(
            "INSERT INTO prism.schema_migration(name) VALUES($1)",
            [name],
          );
        }
      }
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    }
  } finally {
    if ("release" in connection && typeof connection.release === "function")
      connection.release();
  }
}

export class ContentAddressedArtifactStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  async put(
    content: Uint8Array,
  ): Promise<{ artifactId: string; digest: string; sizeBytes: number }> {
    const contentDigest = digest(content);
    const hex = contentDigest.slice(7);
    const path = join(this.root, hex.slice(0, 2), hex);
    await mkdir(dirname(path), { recursive: true });
    try {
      await stat(path);
    } catch {
      const pending = `${path}.${randomUUID()}.pending`;
      await writeFile(pending, content, { flag: "wx" });
      await rename(pending, path);
    }
    return {
      artifactId: `artifact:${contentDigest}`,
      digest: contentDigest,
      sizeBytes: content.byteLength,
    };
  }
  async get(artifactId: string): Promise<Uint8Array> {
    const match = /^artifact:sha256:([a-f0-9]{64})$/.exec(artifactId);
    if (!match) throw new Error("invalid artifact ID");
    const content = await readFile(
      join(this.root, match[1]!.slice(0, 2), match[1]!),
    );
    if (`artifact:${digest(content)}` !== artifactId)
      throw new Error("artifact digest mismatch");
    return content;
  }
}

export class RevisionRepository {
  private readonly db: Queryable;
  constructor(db: Queryable) {
    this.db = db;
  }
  async createProject(externalId: string, name: string): Promise<string> {
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO prism.project(id,external_id,name) VALUES($1,$2,$3)",
      [id, externalId, name],
    );
    return id;
  }
  async createDocument(
    projectId: string,
    key: string,
    document: PrismDocument,
    user: string,
    designRequestId?: string,
  ): Promise<string> {
    const documentId = randomUUID();
    const revisionId = randomUUID();
    const content = JSON.stringify(document);
    const contentDigest = digest(content);
    await this.db.query("BEGIN");
    try {
      await this.db.query("SELECT id FROM prism.project WHERE id=$1 FOR SHARE",[projectId]);
      if(designRequestId){const active=await this.db.query("SELECT id FROM prism.design_request WHERE id=$1 AND project_id=$2 AND status='active'",[designRequestId,projectId]);if(!active.rows[0])throw new Error("active Prism design request changed before document creation");}
      await this.db.query(
        "INSERT INTO prism.design_document(id,project_id,document_key,design_request_id) VALUES($1,$2,$3,$4)",
        [documentId, projectId, key, designRequestId ?? null],
      );
      await this.db.query(
        "INSERT INTO prism.design_revision(id,document_id,revision,schema_id,content,content_digest,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)",
        [
          revisionId,
          documentId,
          document.meta.revision,
          document.meta.schema,
          content,
          contentDigest,
          user,
        ],
      );
      await this.db.query(
        "UPDATE prism.design_document SET current_revision_id=$1 WHERE id=$2",
        [revisionId, documentId],
      );
      await this.db.query("COMMIT");
    } catch (error) {
      await this.db.query("ROLLBACK");
      throw error;
    }
    return documentId;
  }
  async current(
    documentId: string,
  ): Promise<{ id: string; document: PrismDocument }> {
    const result = await this.db.query<{ id: string; content: PrismDocument }>(
      "SELECT r.id,r.content FROM prism.design_document d JOIN prism.design_revision r ON r.id=d.current_revision_id WHERE d.id=$1",
      [documentId],
    );
    if (!result.rows[0]) throw new Error("document not found");
    return { id: result.rows[0].id, document: result.rows[0].content };
  }
  async revision(
    documentId: string,
    revision: number,
  ): Promise<{ id: string; document: PrismDocument }> {
    const result = await this.db.query<{ id: string; content: PrismDocument }>(
      "SELECT id,content FROM prism.design_revision WHERE document_id=$1 AND revision=$2",
      [documentId, revision],
    );
    if (!result.rows[0]) throw new Error("design revision not found");
    return { id: result.rows[0].id, document: result.rows[0].content };
  }
  async includesOperation(
    documentId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const result = await this.db.query(
      "SELECT id FROM prism.design_revision WHERE document_id=$1 AND operation->>'idempotencyKey'=$2 LIMIT 1",
      [documentId, idempotencyKey],
    );
    return Boolean(result.rows[0]);
  }
  async history(
    documentId: string,
  ): Promise<
    Array<{
      id: string;
      revision: number;
      createdAt: string;
      createdBy: string;
      operation: Record<string, unknown> | null;
    }>
  > {
    const result = await this.db.query<{
      id: string;
      revision: number;
      created_at: string;
      created_by: string;
      operation: Record<string, unknown> | null;
    }>(
      "SELECT id,revision,created_at::text,created_by,operation FROM prism.design_revision WHERE document_id=$1 ORDER BY created_at DESC,id DESC",
      [documentId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      revision: row.revision,
      createdAt: row.created_at,
      createdBy: row.created_by,
      operation: row.operation,
    }));
  }
  async restore(
    documentId: string,
    revisionId: string,
    user: string,
  ): Promise<PrismDocument> {
    const source = await this.db.query<{ content: PrismDocument }>(
      "SELECT content FROM prism.design_revision WHERE id=$1 AND document_id=$2",
      [revisionId, documentId],
    );
    if (!source.rows[0]) throw new Error("revision not found");
    const current = await this.current(documentId);
    const next = structuredClone(source.rows[0].content);
    next.meta.revision = current.document.meta.revision + 1;
    next.meta.updatedAt = new Date().toISOString();
    return this.replace(
      documentId,
      current.id,
      next,
      { type: "revision.restored", sourceRevisionId: revisionId },
      user,
    );
  }
  async apply(
    documentId: string,
    operation: PrismOperation,
    user: string,
  ): Promise<PrismDocument> {
    await this.db.query("BEGIN");
    try {
      const current = await this.current(documentId);
      const next = applyOperation(current.document, operation);
      const id = randomUUID();
      const content = JSON.stringify(next);
      await this.db.query(
        "INSERT INTO prism.design_revision(id,document_id,revision,schema_id,content,content_digest,parent_revision_id,operation,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9)",
        [
          id,
          documentId,
          next.meta.revision,
          next.meta.schema,
          content,
          digest(content),
          current.id,
          JSON.stringify(operation),
          user,
        ],
      );
      const updated = await this.db.query(
        "UPDATE prism.design_document SET current_revision_id=$1 WHERE id=$2 AND current_revision_id=$3 RETURNING id",
        [id, documentId, current.id],
      );
      if (!updated.rows[0]) throw new Error("revision conflict");
      await this.db.query("COMMIT");
      return next;
    } catch (error) {
      await this.db.query("ROLLBACK");
      throw error;
    }
  }
  async replace(
    documentId: string,
    expectedRevisionId: string,
    document: PrismDocument,
    operation: Record<string, unknown>,
    user: string,
  ): Promise<PrismDocument> {
    await this.db.query("BEGIN");
    try {
      const current = await this.current(documentId);
      if (current.id !== expectedRevisionId)
        throw new Error("revision conflict");
      const id = randomUUID();
      const content = JSON.stringify(document);
      await this.db.query(
        "INSERT INTO prism.design_revision(id,document_id,revision,schema_id,content,content_digest,parent_revision_id,operation,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9)",
        [
          id,
          documentId,
          document.meta.revision,
          document.meta.schema,
          content,
          digest(content),
          current.id,
          JSON.stringify(operation),
          user,
        ],
      );
      const updated = await this.db.query(
        "UPDATE prism.design_document SET current_revision_id=$1 WHERE id=$2 AND current_revision_id=$3 RETURNING id",
        [id, documentId, current.id],
      );
      if (!updated.rows[0]) throw new Error("revision conflict");
      await this.db.query("COMMIT");
      return document;
    } catch (error) {
      await this.db.query("ROLLBACK");
      throw error;
    }
  }
}
