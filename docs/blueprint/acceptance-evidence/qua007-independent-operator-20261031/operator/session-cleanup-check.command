python3 - <<'PY'
import os,json,urllib.request
sid="agent:main:subagent:2e3b7c08-1ddc-4c13-baec-214a9924350f"
payload=json.dumps({"tool":"sessions_list","args":{"limit":1000}}).encode()
req=urllib.request.Request("http://127.0.0.1:18789/tools/invoke",data=payload,headers={"Authorization":"Bearer "+os.environ["OPENCLAW_GATEWAY_TOKEN"],"Content-Type":"application/json"})
with urllib.request.urlopen(req,timeout=30) as r: data=json.load(r)
print(json.dumps({"http":200,"ok":data.get("ok"),"ownedSessionKey":sid,"ownedKeyPresentInResponse":sid in json.dumps(data)}))
PY
