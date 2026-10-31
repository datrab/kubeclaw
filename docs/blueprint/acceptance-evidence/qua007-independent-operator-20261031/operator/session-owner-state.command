python3 - <<'PY'
import os,json,urllib.request
sid="agent:main:subagent:2e3b7c08-1ddc-4c13-baec-214a9924350f"
req=urllib.request.Request("http://127.0.0.1:18789/tools/invoke",data=json.dumps({"tool":"sessions_list","args":{"limit":1000}}).encode(),headers={"Authorization":"Bearer "+os.environ["OPENCLAW_GATEWAY_TOKEN"],"Content-Type":"application/json"})
with urllib.request.urlopen(req,timeout=30) as r: data=json.load(r)
def walk(v):
 if isinstance(v,dict):
  if v.get("key")==sid or v.get("sessionKey")==sid: print(json.dumps({k:v[k] for k in v if k not in ["messages","transcriptPath"]}))
  for k,x in v.items():
   if k=="text" and isinstance(x,str):
    try:walk(json.loads(x))
    except ValueError:pass
   else:walk(x)
 elif isinstance(v,list):
  for x in v:walk(x)
walk(data)
PY
