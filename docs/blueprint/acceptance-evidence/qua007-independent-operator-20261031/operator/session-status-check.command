python3 - <<'PY'
import os,json,urllib.request
sid="agent:main:subagent:2e3b7c08-1ddc-4c13-baec-214a9924350f"
req=urllib.request.Request("http://127.0.0.1:18789/tools/invoke",data=json.dumps({"tool":"session_status","args":{"sessionKey":sid}}).encode(),headers={"Authorization":"Bearer "+os.environ["OPENCLAW_GATEWAY_TOKEN"],"Content-Type":"application/json"})
with urllib.request.urlopen(req,timeout=30) as r: data=json.load(r)
print(json.dumps(data))
PY
