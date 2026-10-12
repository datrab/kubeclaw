import json,pathlib,hashlib
root=pathlib.Path.cwd();ev=root/'docs/review/evidence/config-control-listener-20260921'
files=[item['path'] for item in json.loads((ev/'before-identities.json').read_text())]
files+=json.loads((root/'docs/review/evidence/control-route-quality-20260921/production-files.json').read_text())
files+=['skills/prism/tests/fixtures/closed-stderr-control.mts','scripts/check-built-runtime-image.sh','skills/prism/tests/control-listener.test.mts','skills/prism/tests/control-image-environment.test.mts','skills/prism/tests/control-product-composition.test.mts','skills/prism/tests/swarm-control-policy.test.mts','skills/prism/tests/swarm-worker-config.test.mts','skills/prism/tests/control.test.mts','skills/prism/tests/control-decisions.test.mts','skills/prism/tests/control-product-independent.test.mts','skills/prism/tests/control-generation-http.test.mts','tests/verification/deployment/prism-swarm-config.test.mjs','docs/operations/operator-configuration.md','docs/architecture/prism-openclaw-runtime.md','docs/review/remediation/implementation/config-inventory-20260920.json','docs/review/remediation/implementation/config-inventory-20260920.md','docs/review/remediation/implementation/config-control-listener-20260921.md','docs/review/remediation/implementation/control-route-quality-20260921.md']
items=[]
for name in sorted(set(files)):
 p=root/name;dest=ev/'source'/(name+'.snapshot');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes());items.append({'path':name,'snapshot':str(dest.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(ev/'source-identities.json').write_text(json.dumps({'files':items},indent=2)+'\n')
print(len(items))
