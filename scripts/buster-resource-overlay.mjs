import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import yaml from 'js-yaml';

// Helm replaces lists wholesale. Produce a resource-only --set-json argument
// instead of copying the release image/env/credentials into a site overlay.
export function busterResourceArgument(base, overlay) {
  const resources=overlay?.busterRuntimeResources;
  if(resources===undefined)return '';
  if(!resources || typeof resources!=='object' || Array.isArray(resources)
    || Object.keys(resources).some(k=>!['requests','limits'].includes(k)))throw new Error('BUSTER_RESOURCE_OVERLAY_INVALID');
  for(const scope of ['requests','limits']) {
    const v=resources[scope];
    if(!v || typeof v!=='object' || Array.isArray(v) || !v.cpu || !v.memory
      || Object.entries(v).some(([k,val])=>!['cpu','memory','ephemeral-storage'].includes(k) || typeof val!=='string' || !/^[0-9]+(?:\.[0-9]+)?(?:m|Ki|Mi|Gi|Ti)?$/.test(val)))throw new Error('BUSTER_RESOURCE_OVERLAY_INVALID');
  }
  const containers=overlay.extraContainers ?? base.extraContainers;
  const indices=containers?.flatMap((c,i)=>c.name==='buster-v2-runtime'?[i]:[]) ?? [];
  if(indices.length!==1)throw new Error('BUSTER_RESOURCE_CONTAINER_REQUIRED');
  return `extraContainers[${indices[0]}].resources=${JSON.stringify(resources)}`;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const [base,overlay]=process.argv.slice(2);
  if(!base || !overlay)throw new Error('Base and overlay values required');
  process.stdout.write(busterResourceArgument(yaml.load(fs.readFileSync(base,'utf8')),yaml.load(fs.readFileSync(overlay,'utf8'))));
}
