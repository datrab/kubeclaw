import assert from "node:assert/strict";
import {createHmac,timingSafeEqual} from "node:crypto";
import { readFileSync } from "node:fs";

const path=process.env.PRISM_LIVE_EVIDENCE_FILE;
if(!path)throw new Error("PRISM_LIVE_EVIDENCE_FILE is required; repository verification is available as verify:prism:repository");
const evidence=JSON.parse(readFileSync(path,"utf8"));
const key=process.env.PRISM_LIVE_EVIDENCE_HMAC_KEY;
const expectedCommit=process.env.PRISM_EXPECTED_COMMIT;
const expectedImages=(process.env.PRISM_EXPECTED_IMAGE_DIGESTS??"").split(",").filter(Boolean).sort();
if(!key||Buffer.byteLength(key)<32)throw new Error("PRISM_LIVE_EVIDENCE_HMAC_KEY with at least 32 bytes is required");
if(!expectedCommit||!expectedImages.length)throw new Error("PRISM_EXPECTED_COMMIT and PRISM_EXPECTED_IMAGE_DIGESTS are required");
const signature=String(evidence.signature??"");delete evidence.signature;
const canonical=(value)=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map((name)=>`${JSON.stringify(name)}:${canonical(value[name])}`).join(",")}}`:JSON.stringify(value);
const expectedSignature=`hmac-sha256:${createHmac("sha256",key).update(canonical(evidence)).digest("hex")}`;
const supplied=Buffer.from(signature),expected=Buffer.from(expectedSignature);
assert.ok(supplied.length===expected.length&&timingSafeEqual(supplied,expected),"production evidence signature is invalid");
assert.equal(evidence.schema,"prism.production-evidence.v1");
assert.equal(evidence.status,"passed");
assert.equal(evidence.issuer,"github-actions");
assert.equal(evidence.repositoryCommit,expectedCommit);
assert.ok(Array.isArray(evidence.imageDigests)&&evidence.imageDigests.length===4);
for(const digest of evidence.imageDigests)assert.match(digest,/^sha256:[a-f0-9]{64}$/);
assert.deepEqual([...evidence.imageDigests].sort(),expectedImages);
assert.ok(Array.isArray(evidence.cleanRuns)&&evidence.cleanRuns.length>=2);
assert.equal(new Set(evidence.cleanRuns.map((run)=>run.namespace)).size,evidence.cleanRuns.length);
for(const run of evidence.cleanRuns){assert.equal(run.status,"passed");assert.equal(run.repositoryCommit,expectedCommit);assert.deepEqual([...run.imageDigests].sort(),expectedImages);assert.match(run.namespace,/^test-prism-/);assert.match(run.baselineDigest,/^sha256:[a-f0-9]{64}$/);assert.match(run.evidenceArtifactDigest,/^sha256:[a-f0-9]{64}$/);assert.equal(run.skippedChecks?.length??0,0);}
for(const gate of ["novaStage","provider","failureMatrix","backupRestore","forgeBuster","telemetryAlerts","security"]){assert.equal(evidence[gate]?.status,"passed",`${gate} live evidence is incomplete`);assert.match(evidence[gate]?.evidenceArtifactDigest,/^sha256:[a-f0-9]{64}$/);assert.equal(evidence[gate]?.skippedChecks?.length??0,0);}
console.log(JSON.stringify({status:"passed",testVersion:"prism-production-evidence.v1",evidenceFile:path,cleanRuns:evidence.cleanRuns.length}));
