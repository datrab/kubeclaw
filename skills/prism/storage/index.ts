import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  readdir,
} from "node:fs/promises";
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
  options: { infrastructure?: "embedded" | "preprovisioned" } = {},
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
      if (options.infrastructure === "preprovisioned") {
        const schema = await connection.query(
          "SELECT n.nspname FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname='prism' AND r.rolname=current_user",
        );
        if (!schema.rows[0]) {
          throw new Error("Prism schema bootstrap is missing or prism_migrator is not its owner");
        }
      } else {
        await connection.query("CREATE EXTENSION IF NOT EXISTS vector");
        await connection.query("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'prism_migrator') THEN CREATE ROLE prism_migrator; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'prism_runtime') THEN CREATE ROLE prism_runtime; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'prism_readonly') THEN CREATE ROLE prism_readonly; END IF; END $$");
        await connection.query("CREATE SCHEMA IF NOT EXISTS prism");
      }
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

export { ContentAddressedArtifactStore } from "./artifacts.ts";

export type Database = Queryable & { connect?: () => Promise<Queryable & { release(): void }> };

export async function inTransaction<T>(db: Database, execute: (connection: Queryable) => Promise<T>): Promise<T> {
  const connection = db.connect ? await db.connect() : db;
  try {
    await connection.query("BEGIN");
    try {
      const result = await execute(connection);
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    }
  } finally {
    if ("release" in connection && typeof connection.release === "function") connection.release();
  }
}

async function insertDocument(connection: Queryable, projectId: string, key: string, document: PrismDocument, user: string, designRequestId?: string): Promise<string> {
    const documentId = randomUUID();
    const revisionId = randomUUID();
    const content = JSON.stringify(document);
    const contentDigest = digest(content);
      await connection.query("SELECT id FROM prism.project WHERE id=$1 FOR SHARE",[projectId]);
      if(designRequestId){const active=await connection.query("SELECT id FROM prism.design_request WHERE id=$1 AND project_id=$2 AND status='active'",[designRequestId,projectId]);if(!active.rows[0])throw new Error("active Prism design request changed before document creation");}
      await connection.query(
        "INSERT INTO prism.design_document(id,project_id,document_key,design_request_id) VALUES($1,$2,$3,$4)",
        [documentId, projectId, key, designRequestId ?? null],
      );
      await connection.query(
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
      await connection.query(
        "UPDATE prism.design_document SET current_revision_id=$1 WHERE id=$2",
        [revisionId, documentId],
      );
    return documentId;
}

export class RevisionRepository {
  private readonly db: Database;
  constructor(db: Database) {
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
    return inTransaction(this.db, connection => insertDocument(connection, projectId, key, document, user, designRequestId));
  }

  async createDirectionSet(projectKey: string, designs: readonly { key: string; title: string; summary: string; document: PrismDocument; evidence?: Record<string, unknown> }[]) {
    if (designs.length !== 3 || new Set(designs.map(item => item.key)).size !== 3
      || designs.some(item => !item.key || !item.title || !item.summary || item.document.meta.projectId !== projectKey)) throw new Error("invalid Prism design set");
    return inTransaction(this.db, async connection => {
      const project = await connection.query<{ id: string }>("SELECT id FROM prism.project WHERE external_id=$1 FOR UPDATE", [projectKey]);
      if (!project.rows[0]) throw new Error("active Prism project not found");
      const projectId = project.rows[0].id;
      const active = await connection.query<{ id: string }>("SELECT id FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1", [projectId]);
      if (!active.rows[0]) throw new Error("active Prism design request not found");
      const requestId = active.rows[0].id;
      const existing = await connection.query<{ id: string; source_document_id: string; direction_key: string; content_digest: string }>("SELECT d.id,d.source_document_id,d.direction_key,d.content_digest FROM prism.direction d JOIN prism.design_document doc ON doc.id=d.source_document_id WHERE d.project_id=$1 AND doc.design_request_id=$2 ORDER BY d.direction_key", [projectId, requestId]);
      if (existing.rows.length) {
        if (existing.rows.length !== 3 || existing.rows.some(row => {
          const design = designs.find(item => item.key === row.direction_key);
          return !design || row.content_digest !== digest(JSON.stringify(design.document));
        })) throw new Error("Prism design set conflicts with existing generation");
        return { status: 'already-created', projectId, documentId: existing.rows[0]!.source_document_id,
          directions: existing.rows.map(row => ({ directionId: row.id, documentId: row.source_document_id, key: row.direction_key })) };
      }
      const directions = [];
      for (const item of designs) {
        const documentId = await insertDocument(connection, projectId, `direction-${item.key}`, item.document, 'agent:prism', requestId);
        const current = await new RevisionRepository(connection).current(documentId);
        const directionId = randomUUID();
        const content = JSON.stringify(item.document);
        await connection.query("INSERT INTO prism.direction(id,project_id,source_document_id,source_revision_id,direction_key,title,summary,proposal,content_digest,state,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'proposed',$10::jsonb)",
          [directionId, projectId, documentId, current.id, item.key, item.title, item.summary, content, digest(content), JSON.stringify(item.evidence ?? {})]);
        directions.push({ directionId, documentId, key: item.key });
      }
      return { status: 'created', projectId, documentId: directions[0]!.documentId, directions };
    });
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
    return inTransaction(this.db, async (connection) => {
      const current = await new RevisionRepository(connection).current(documentId);
      const next = applyOperation(current.document, operation);
      const id = randomUUID();
      const content = JSON.stringify(next);
      await connection.query(
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
      const updated = await connection.query(
        "UPDATE prism.design_document SET current_revision_id=$1 WHERE id=$2 AND current_revision_id=$3 RETURNING id",
        [id, documentId, current.id],
      );
      if (!updated.rows[0]) throw new Error("revision conflict");
      return next;
    });
  }
  async replace(
    documentId: string,
    expectedRevisionId: string,
    document: PrismDocument,
    operation: Record<string, unknown>,
    user: string,
  ): Promise<PrismDocument> {
    return inTransaction(this.db, async (connection) => {
      const current = await new RevisionRepository(connection).current(documentId);
      if (current.id !== expectedRevisionId)
        throw new Error("revision conflict");
      const id = randomUUID();
      const content = JSON.stringify(document);
      await connection.query(
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
      const updated = await connection.query(
        "UPDATE prism.design_document SET current_revision_id=$1 WHERE id=$2 AND current_revision_id=$3 RETURNING id",
        [id, documentId, current.id],
      );
      if (!updated.rows[0]) throw new Error("revision conflict");
      return document;
    });
  }
}
