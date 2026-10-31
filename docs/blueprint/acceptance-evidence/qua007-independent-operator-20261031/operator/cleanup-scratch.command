set -euo pipefail; git -C /home/node/.openclaw/workspace/tmp/qua007-fresh/source worktree list --porcelain; git -C /home/node/.openclaw/workspace/tmp/qua007-fresh/source status --short; python3 - <<'PY'
import os,pathlib,shutil,json
root=pathlib.Path("/home/node/.openclaw/workspace/tmp/qua007-fresh")
holders=[]
for p in pathlib.Path("/proc").iterdir():
 if not p.name.isdigit():continue
 for entry in [p/"cwd",p/"exe",*(p/"fd").glob("*")]:
  try:target=os.readlink(entry)
  except OSError:continue
  if target==str(root) or target.startswith(str(root)+"/"):holders.append({"pid":p.name,"link":str(entry),"target":target})
print(json.dumps({"scratch":str(root),"openUsers":holders}))
if holders:raise SystemExit("OWNED_SCRATCH_IN_USE")
assert root.is_dir() and not root.is_symlink()
assert not (root/"runtime/journey").exists()
shutil.rmtree(root)
print(json.dumps({"ownedScratchRemoved":not root.exists(),"proofRetainedOutsideScratch":pathlib.Path("/home/node/.openclaw/workspace/operations/pr13/evidence/qua007-independent-operator-20261031/operator/proof/raw-before-audit").is_dir()}))
PY
