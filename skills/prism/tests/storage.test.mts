import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFile } from "node:fs/promises";
import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";
import { ContentAddressedArtifactStore, RevisionRepository, migrate } from "../storage/index.ts";

test("migration lock is acquired before schema metadata is touched",async()=>{const statements:string[]=[];const db={async query(sql:string){statements.push(sql);return {rows:sql.startsWith("SELECT name")?[]:[]};},async exec(sql:string){statements.push(sql);}};await migrate(db as any);const lock=statements.findIndex((sql)=>sql.includes("pg_advisory_xact_lock"));const schema=statements.findIndex((sql)=>sql.includes("CREATE SCHEMA"));assert(lock>=0&&schema>lock);});

test("managed migrations require the preprovisioned schema without database-wide DDL",async()=>{const statements:string[]=[];const db={async query(sql:string){statements.push(sql);if(sql.includes("FROM pg_namespace"))return {rows:[{nspname:"prism"}]};return {rows:sql.startsWith("SELECT name")?[]:[]};},async exec(sql:string){statements.push(sql);}};await migrate(db as any,{infrastructure:"preprovisioned"});assert.equal(statements.some((sql)=>sql.includes("CREATE SCHEMA")||sql.includes("CREATE EXTENSION")||sql.includes("CREATE ROLE")),false);});

test("direction uniqueness migration archives existing unsourced duplicates",async()=>{
  const db=new PGlite({extensions:{vector}});await migrate(db);
  await db.exec("DROP INDEX prism.direction_unsourced_key_idx; DELETE FROM prism.schema_migration WHERE name='010_direction_unsourced_uniqueness.sql';");
  await db.query("INSERT INTO prism.project(id,external_id,name) VALUES('10000000-0000-4000-8000-000000000000','legacy-project','Legacy')");
  const values=['10000000-0000-4000-8000-000000000000','legacy','Legacy','Legacy direction',JSON.stringify({}),`sha256:${"a".repeat(64)}`];
  for(const id of ['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'])await db.query("INSERT INTO prism.direction(id,project_id,direction_key,title,summary,proposal,content_digest,state) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'proposed')",[id,...values]);
  await migrate(db);
  assert.equal((await db.query("SELECT id FROM prism.direction WHERE project_id='10000000-0000-4000-8000-000000000000'")).rows.length,1);
  const archived=await db.query<{direction_id:string;archive_reason:string}>("SELECT direction_id,archive_reason FROM prism.direction_duplicate_archive");
  assert.equal(archived.rows.length,1);assert.equal(archived.rows[0]?.archive_reason,'duplicate-unsourced-direction-key');
  await db.close();
});

test("PostgreSQL migrations, immutable revisions, and artifacts work", async () => {
  const db = new PGlite({ extensions: { vector } }); await migrate(db);
  const repository = new RevisionRepository(db); const project = await repository.createProject("demo-project", "Demo");
  const directionValues=[project,"legacy", "Legacy", "Legacy direction", JSON.stringify({}), `sha256:${"a".repeat(64)}`];
  await db.query("INSERT INTO prism.direction(id,project_id,direction_key,title,summary,proposal,content_digest,state) VALUES('00000000-0000-4000-8000-000000000001',$1,$2,$3,$4,$5::jsonb,$6,'proposed')",directionValues);
  await assert.rejects(
    db.query("INSERT INTO prism.direction(id,project_id,direction_key,title,summary,proposal,content_digest,state) VALUES('00000000-0000-4000-8000-000000000002',$1,$2,$3,$4,$5::jsonb,$6,'proposed')",directionValues),
    /direction_unsourced_key_idx|duplicate key|unique constraint/,
  );
  const fixture = JSON.parse(await readFile(new URL("../../../contracts/prism/v1/fixtures/minimal-web.json", import.meta.url), "utf8")) as PrismDocument;
  const documentId = await repository.createDocument(project, "primary", fixture, "davide");
  const next = await repository.apply(documentId, { type: "node.props.set", baseRevision: 1, nodeId: "title", props: { content: "Services" } }, "davide");
  assert.equal(next.meta.revision, 2); assert.equal((await repository.current(documentId)).document.meta.revision, 2);
  const current=await repository.current(documentId);const replacement=structuredClone(current.document);replacement.meta.revision=3;replacement.meta.updatedAt=new Date().toISOString();
  await repository.replace(documentId,current.id,replacement,{type:"engine.generate"},"davide");assert.equal((await repository.current(documentId)).document.meta.revision,3);
  const history=await repository.history(documentId);assert.equal(history.length,3);const restored=await repository.restore(documentId,history.at(-1)!.id,"davide");assert.equal(restored.meta.revision,4);assert.equal(restored.views.home.root.children?.[0]?.props?.content,"Deployments");
  await assert.rejects(repository.apply(documentId, { type: "node.remove", baseRevision: 1, nodeId: "title" }, "davide"), /revision conflict/);
  const store = new ContentAddressedArtifactStore(join(await mkdtemp(join(tmpdir(), "prism-artifacts-")), "objects"));
  const stored = await store.put(Buffer.from("baseline")); assert.deepEqual(Buffer.from(await store.get(stored.artifactId)), Buffer.from("baseline"));
  await db.close();
});
