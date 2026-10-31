set -euo pipefail; cd /home/node/.openclaw/workspace/operations/pr13/evidence/qua007-independent-operator-20261031/operator/proof; sha256sum -c ../proof.sha256; python3 - <<'PY'
import os,pathlib,json
s=os.environ.get("OPENCLAW_GATEWAY_TOKEN","").encode();root=pathlib.Path("/home/node/.openclaw/workspace/operations/pr13/evidence/qua007-independent-operator-20261031/operator")
hits=[str(p.relative_to(root)) for p in root.rglob("*") if p.is_file() and s and s in p.read_bytes()]
print(json.dumps({"credentialValueMatchesInRetainedEvidence":len(hits)}));assert not hits
PY
