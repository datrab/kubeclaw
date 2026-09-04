import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const namespace=process.env.PRISM_NAMESPACE;if(!namespace)throw new Error("PRISM_NAMESPACE is required");
const kubectl=(args,options={})=>execFileSync("kubectl",[...args,"-n",namespace],{encoding:"utf8",stdio:options.stdio??"pipe"}).trim();
const checks=[];const startedAt=new Date().toISOString();

const workerPod=kubectl(["get","pod","-l","app=prism-worker","-o","jsonpath={.items[0].metadata.name}"]);assert(workerPod);kubectl(["delete","pod",workerPod,"--wait=false"]);kubectl(["rollout","status","deployment/prism-worker","--timeout=10m"]);checks.push("worker-pod-termination-recovered");

const postgresPod=kubectl(["get","pod","-l","app=prism-postgresql","-o","jsonpath={.items[0].metadata.name}"]);assert(postgresPod);kubectl(["delete","pod",postgresPod,"--wait=false"]);kubectl(["rollout","status","statefulset/prism-postgresql","--timeout=10m"]);checks.push("postgresql-restart-recovered");

const suffix=Date.now();const backup=`prism-backup-live-${suffix}`;kubectl(["create","job",`--from=cronjob/prism-backup`,backup]);kubectl(["wait","--for=condition=complete",`job/${backup}`,"--timeout=15m"]);checks.push("backup-completed");
const restore=`prism-restore-live-${suffix}`;kubectl(["create","job",`--from=cronjob/prism-restore-proof`,restore]);kubectl(["wait","--for=condition=complete",`job/${restore}`,"--timeout=15m"]);checks.push("restore-proof-completed");

const readBuster=(name)=>{const file=process.env[name];if(!file)throw new Error(`${name} is required`);const value=JSON.parse(readFileSync(file,"utf8"));assert.equal(value.receipt?.provider,"buster-suite-v2");assert.match(value.receipt?.resultDigest??"",/^[a-f0-9]{64}$/);assert.match(value.baselineDigest??"",/^sha256:[a-f0-9]{64}$/);assert.ok(Array.isArray(value.results));return value;};
const defects=readBuster("PRISM_BUSTER_DEFECT_RESULT_FILE");const corrected=readBuster("PRISM_BUSTER_CORRECTED_RESULT_FILE");assert.equal(defects.baselineDigest,corrected.baselineDigest,"Buster must use one baseline digest before and after correction");for(const suite of ["visual-reg","a11y"]){assert.ok(defects.results.some((result)=>result.suite===suite&&result.status==="FAIL"),`Buster did not detect the ${suite} defect`);assert.ok(corrected.results.some((result)=>result.suite===suite&&result.status==="PASS"),`Buster did not pass the corrected ${suite} result`);}checks.push("buster-real-defects-detected-and-corrected");

console.log(JSON.stringify({status:"passed",testVersion:"prism-live-failures.v2",namespace,startedAt,finishedAt:new Date().toISOString(),checks,skippedChecks:[]}));
