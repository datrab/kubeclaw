#!/usr/bin/env bash
set -euo pipefail
image="${1:?image required}"
container="$(docker run -d --network none -e NODE_EXTRA_CA_CERTS= -e OPS_MCP_BEARER_TOKEN=ci-local-transport-proof-000000000000 "$image")"
trap 'docker logs "$container"; docker rm -f "$container" >/dev/null' EXIT
docker exec "$container" node --input-type=module -e '
  import assert from "node:assert/strict";
  import {setTimeout} from "node:timers/promises";
  let ready=false;
  for(let i=0;i<50;i++) { try { const r=await fetch("http://127.0.0.1:8080/healthz"); assert.equal(r.status,200); assert.equal((await r.json()).ok,true); ready=true; break; } catch { await setTimeout(100); } }
  assert.equal(ready,true,"MCP did not become healthy");
  assert.equal((await fetch("http://127.0.0.1:8080/mcp",{method:"POST"})).status,401);
  const response=await fetch("http://127.0.0.1:8080/mcp", {method:"POST", headers:{"content-type":"application/json",accept:"application/json, text/event-stream",authorization:"Bearer ci-local-transport-proof-000000000000"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"image-proof",version:"1.0.0"}}})});
  assert.equal(response.status,200); const result=await response.json(); assert.ok(result.result?.serverInfo?.name); assert.equal(result.error,undefined);
  console.log("Actual MCP container: health, authentication rejection and authenticated initialization passed; no Kubernetes call or stub used.");
'
