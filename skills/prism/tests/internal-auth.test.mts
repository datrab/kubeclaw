import test from "node:test";
import assert from "node:assert/strict";
import { signInternalRequest, verifyInternalRequest } from "../server/internal-auth.ts";
import { PostgresNonceStore } from "../server/internal-auth.ts";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../storage/index.ts";

test("internal request authentication binds time, nonce, and body",async()=>{
  const secret="test-secret-with-enough-entropy";const body=Buffer.from('{"operation":"render"}');const now=1_800_000_000_000;const nonce="0123456789abcdef0123456789abcdef";const signature=signInternalRequest(secret,body,now,nonce);const headers={"x-prism-timestamp":String(now),"x-prism-nonce":nonce,"x-prism-signature":`v1=${signature}`};const consumed=new Set<string>();const store={async consume(_audience:string,digest:string){if(consumed.has(digest))return false;consumed.add(digest);return true;}};
  await verifyInternalRequest(secret,body,headers,store,"prism-worker",now);
  await assert.rejects(()=>verifyInternalRequest(secret,body,headers,store,"prism-worker",now),/replayed/);
  await assert.rejects(()=>verifyInternalRequest(secret,Buffer.from("changed"),{...headers,"x-prism-nonce":"1123456789abcdef0123456789abcdef"},store,"prism-worker",now),/invalid/);
  await assert.rejects(()=>verifyInternalRequest(secret,body,{...headers,"x-prism-nonce":"2123456789abcdef0123456789abcdef"},store,"prism-worker",now+300_001),/expired/);
});

test("nonce replay protection is shared across worker replicas",async()=>{const db=new PGlite({extensions:{vector}});await migrate(db as any);const secret="shared-worker-secret-with-entropy";const body=Buffer.from("{}");const now=1_800_000_000_000;const nonce="abcdef0123456789abcdef0123456789";const headers={"x-prism-timestamp":String(now),"x-prism-nonce":nonce,"x-prism-signature":`v1=${signInternalRequest(secret,body,now,nonce)}`};await verifyInternalRequest(secret,body,headers,new PostgresNonceStore(db as any),"prism-worker",now);await assert.rejects(()=>verifyInternalRequest(secret,body,headers,new PostgresNonceStore(db as any),"prism-worker",now),/replayed/);await db.close();});
