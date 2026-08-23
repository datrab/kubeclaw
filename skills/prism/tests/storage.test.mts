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

test("PostgreSQL migrations, immutable revisions, and artifacts work", async () => {
  const db = new PGlite({ extensions: { vector } }); await migrate(db);
  const repository = new RevisionRepository(db); const project = await repository.createProject("demo-project", "Demo");
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
