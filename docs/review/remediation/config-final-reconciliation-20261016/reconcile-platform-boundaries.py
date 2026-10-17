#!/usr/bin/env python3
"""Exact remaining platform boundary joins; never accept runtime cases or author policy."""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
ROSTER = "docs/review/evidence/config-acceptance/c0-completion-20261013/PACKAGE-FIELD-CASE-JOINS.json"
RUNTIME = "skills/nova/core/execution/engine-runtime.ts"
PLATFORM = "skills/common/plugin-runtime/foundation/config/platform.ts"
SNAPSHOTS = "skills/nova/core/execution/engine-snapshots.ts"
RUN = "skills/nova/core/execution/engine-run.ts"
SPECS = {
 "kubeclaw.artifact-store": ("artifact-store", "artifactRoot", "const configured = context.config.artifactRoot;"),
 "kubeclaw.state-store": ("state", "root", "const configured = context.config.root;"),
 "kubeclaw.telemetry-store": ("telemetry", "root", "const root = context.config.root;"),
 "kubeclaw.wait-store": ("waits", "root", "const root = context.config.root;"),
 "kubeclaw.network-http": ("http", None, None),
 "kubeclaw.openclaw-agent-events": ("source", "hooks", "const configured = context.config.hooks;"),
 "kubeclaw.operator-messaging": ("operator", None, None),
 "kubeclaw.transport-publisher": ("publisher", None, None),
}

def read(p): return json.loads((ROOT / p).read_text())
def digest(v): return hashlib.sha256(json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
def pin(p): return {"path": p, "sha256": hashlib.sha256((ROOT / p).read_bytes()).hexdigest()}
def pointer(v, p):
 for key in p.lstrip("/").split("/") if p else []:
  key = key.replace("~1", "/").replace("~0", "~")
  v = v[int(key)] if isinstance(v, list) else v[key]
 return v

def anchor(p, text):
 lines = [i+1 for i,line in enumerate((ROOT / p).read_text().splitlines()) if text in line]
 if not lines: raise ValueError(f"Missing actual source: {p}:{text}")
 return {**pin(p), "anchor": text, "lines": lines}

def build():
 roster = read(ROSTER)
 expected = {"fields":2409, "cases":6845, "requirements":50}
 cache = {}
 def resolve(ref):
  doc, loc = ref.split("#",1); p = roster["documents"][doc]["path"]
  if p not in cache: cache[p] = read(p)
  return pointer(cache[p],loc)
 for group,count in expected.items():
  rows = roster[group]
  if len(rows)!=count or len({r["id"] for r in rows})!=count: raise ValueError(f"Incomplete {group}")
  for row in rows:
   original = resolve(row["original"])
   if original["id"]!=row["id"] or digest(original)!=row["sha256"]: raise ValueError(f"Original drift: {row['id']}")
 originals = {r["id"]:r for r in roster["fields"]}
 cases = {r["id"] for r in roster["cases"]}
 selected = []
 for name,count in [("adapter",12),("delivery",20)]:
  rows = [r for g in read(str((OUT / (name+"-successors.json")).relative_to(ROOT)))["groups"] for r in g["rows"] if "JOIN_OPEN" in r["status"]]
  if len(rows)!=count: raise ValueError(f"Changed residual set: {name}; reconcile explicitly")
  for row in rows:
   ref = originals[row["id"]]; original = resolve(ref["original"])
   if row["original"]!=ref["original"] or row["originalObjectSha256"]!=ref["sha256"] or row["caseIds"]!=ref["caseIds"] or row["class"]!=original.get("class",original.get("classification")) or row["originalField"]!=original["field"]: raise ValueError(f"Residual drift: {row['id']}")
   if not set(row["caseIds"])<=cases: raise ValueError("Foreign original case")
   plugin = original["owner"]; registration,field,text = SPECS[plugin]
   base = "skills/common/plugins/"+plugin.removeprefix("kubeclaw.")
   manifest = read(base+"/plugin.json")
   entry = next(e for e in manifest["adapters"] if e["id"]==registration)
   schema_path = base+"/"+entry["configSchema"]
   schema = read(schema_path)
   if plugin=="kubeclaw.network-http":
    field = row["originalField"].removesuffix("[]")
    text = "config."+field
   elif plugin in ["kubeclaw.operator-messaging","kubeclaw.transport-publisher"]:
    field = "deliveryRoot" if row["originalField"]=="deliveryRoot" else "targets"
    text = "config."+field
   loc = "/properties/"+field
   fragment = pointer(schema,loc)
   if row["originalField"].endswith("[]"):
    loc += "/items"; fragment = pointer(schema,loc)
   consumer = base+"/src/"+("config.ts" if plugin=="kubeclaw.operator-messaging" else "adapter.ts")
   classification = "ROOT_PATH_RECEIVING_NOT_CENTRAL_DELIVERY_ACCEPTANCE" if field in ["root","artifactRoot","deliveryRoot"] else "PLATFORM_ADMISSION_OR_TARGET_RECEIVING_NOT_CENTRAL_DELIVERY_ACCEPTANCE"
   selected.append({**{k:row[k] for k in ["id","original","originalObjectSha256","class","originalField","caseIds"]},
    "plugin":plugin,"registration":plugin+":"+registration,"status":classification,
    "platformPointerTemplate":"/adapters/"+(plugin+":"+registration).replace("~","~0").replace("/","~1")+"/"+field,
    "sourceLane":anchor(PLATFORM,"readonly adapters:"),
    "projection":anchor(RUNTIME,"const selected: Record<string, Readonly<Record<string, unknown>>> = structuredClone(adapters);"),
    "consumer":anchor(consumer,text),"manifest":pin(base+"/plugin.json"),
    "schema":{**pin(schema_path),"pointer":loc,"fragmentSha256":digest(fragment)},
    "centralPhysicalAuthor":None,"runtimeAcceptance":"OPEN; no original result changed",
    "history":"OPEN: registry snapshot preserves configuration; recovery passes supplied platform.adapters and restores only specific selected profiles. This is not full retained root/allowlist/target identity recovery.",
    "constraint":"Trace coordinated selected platform author/delivery and original whole configuration capture before closure. Preserve existing grants, task and authentication authority. Secret names are references, never secret bytes. Container joins do not prove every variant child."})
 if len({r["id"] for r in selected})!=32: raise ValueError("Incomplete/duplicate residual joins")
 return {"scope":"All32 previously generic adapter/delivery platform residuals, exact current receiving joins; source navigation, NOT implementation or independent acceptance", "roster":pin(ROSTER),"preservedCounts":expected,
  "integrityFailures":[],"counts":dict(collections.Counter(r["status"] for r in selected)),
  "snapshot":anchor(SNAPSHOTS,"configuration: runtime.configuration"),
  "recovery":anchor(RUN,"prepareRuntime(platform, definition, retained.corePolicy"),
  "rows":selected,"originalCasesNewlyAccepted":0,"fullC0C6Complete":False,
  "retainedDefaults":[anchor("skills/common/plugins/network-http/src/adapter.ts","config.allowedHeaders ??"),anchor("skills/common/plugins/network-http/src/adapter.ts","config.allowedMethods as"),anchor("skills/common/plugins/operator-messaging/src/config.ts","const format = raw.format ?? 'json';")],
  "independentReview":"OPEN; no new independent reviewer output; no native acceptance inferred"}

if __name__=="__main__":
 result = build()
 (OUT / "platform-boundary-successors.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
 print(json.dumps({"fields":len(result["rows"]),"preservedCounts":result["preservedCounts"],"integrityFailures":result["integrityFailures"],"counts":result["counts"],"originalCasesNewlyAccepted":0}))
