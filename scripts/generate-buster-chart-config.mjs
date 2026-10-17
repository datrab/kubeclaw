import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureSwarmSettings} from '../skills/common/plugin-runtime/foundation/config/swarm.ts';
import {createPipelineGenerationReceipt} from '../skills/common/plugin-runtime/foundation/config/pipeline-generation.ts';
import {declaredPipelineServices} from './updates/pipeline-generation.mjs';
export function busterChartProjection(authorRoot){
 const file=path.join(authorRoot,'pipeline.config.json'),root=JSON.parse(fs.readFileSync(file,'utf8'));
 const bindings=root.bindings.filter(item=>item.role==='buster'&&item.owner==='buster-engine'&&item.instanceId.endsWith('/buster-v2-runtime'));
 if(bindings.length!==1)throw new Error('BUSTER_CHART_COMPOSITION_REQUIRED');
 const [namespace,releaseName,container,...extra]=bindings[0].instanceId.split('/');if(extra.length||container!=='buster-v2-runtime')throw new Error('BUSTER_CHART_COMPOSITION_REQUIRED');
 const captures=declaredPipelineServices(authorRoot,{role:'buster',namespace,releaseName}).map(service=>captureSwarmSettings(file,service));
 const generationDigest=createPipelineGenerationReceipt(captures[0]).digest;
 if(captures.some(capture=>createPipelineGenerationReceipt(capture).digest!==generationDigest))throw new Error('BUSTER_CHART_GENERATION_CHANGED');
 return {schemaVersion:'pipeline-buster-chart-projection.v1',generatedFrom:'config/pipeline.config.json',generationDigest,deployment:{namespace,releaseName},clusterShared:captures[0].components['buster-engine'].settings.clusterInvokers.shared};
}
export function assertBusterChartProjection(repository){
 const file=path.join(repository,'charts/kubeclaw/files/pipeline/buster-topology.json');
 if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==JSON.stringify(busterChartProjection(path.join(repository,'config')),null,2)+'\n')throw new Error('BUSTER_CHART_PROJECTION_DRIFT:run npm run config:buster:sync');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const repository=path.resolve(import.meta.dirname,'..');if(process.argv.includes('--check'))assertBusterChartProjection(repository);
 else{const file=path.join(repository,'charts/kubeclaw/files/pipeline/buster-topology.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(busterChartProjection(path.join(repository,'config')),null,2)+'\n');}
}
