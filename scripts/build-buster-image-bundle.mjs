import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {declaredPipelineServices,materializePipelineGeneration} from './updates/pipeline-generation.mjs';

export async function buildBusterImageBundle({repository,output,revision,builtAt}) {
 if(!/^[a-f0-9]{40}$/u.test(revision??'')||!Number.isFinite(Date.parse(builtAt)))throw new Error('BUSTER_IMAGE_IDENTITY_REQUIRED');
 for(const directory of [repository,output])if(typeof directory!=='string'||!path.isAbsolute(directory)||path.resolve(directory)!==directory)throw new Error('BUSTER_IMAGE_PATH_INVALID');
 if(fs.existsSync(output))throw new Error('BUSTER_IMAGE_OUTPUT_EXISTS');
 const authorRoot=path.join(repository,'config'),root=JSON.parse(fs.readFileSync(path.join(authorRoot,'pipeline.config.json'),'utf8'));
 const bindings=root.bindings?.filter(binding=>binding.role==='buster'&&binding.owner==='buster-engine'&&binding.instanceId.endsWith('/buster-v2-runtime'));
 if(bindings?.length!==1)throw new Error('BUSTER_IMAGE_COMPOSITION_REQUIRED');
 const [namespace,releaseName,container,...extra]=bindings[0].instanceId.split('/');if(extra.length||container!=='buster-v2-runtime')throw new Error('BUSTER_IMAGE_COMPOSITION_REQUIRED');
 const services=declaredPipelineServices(authorRoot,{role:'buster',namespace,releaseName});
 fs.mkdirSync(output,{mode:0o755});const packageRoot=path.join(output,'role'),publisher=path.join(output,'publish');
 execFileSync('cc',['-std=c11','-O2','-Wall','-Wextra','-Werror',path.join(repository,'scripts/pipeline-publish.c'),'-o',publisher],{stdio:'pipe'});
 execFileSync(process.execPath,[path.join(repository,'scripts/build-runtime-role-bundle.mjs'),'buster',packageRoot,revision,'pipeline-image-projection.v1',builtAt],{cwd:repository,stdio:'pipe'});
 const generation=await materializePipelineGeneration({authorRoot,packageRoot,output:path.join(output,'generation'),services,publisher});
 const deliveryRoot=path.join(output,'delivery');fs.mkdirSync(deliveryRoot,{mode:0o755});
 fs.cpSync(path.join(output,'generation/expected/buster-preparation'),path.join(deliveryRoot,'version'),{recursive:true});fs.symlinkSync('version',path.join(deliveryRoot,'..data'));
 const expected=JSON.parse(fs.readFileSync(path.join(deliveryRoot,'version/expected-delivery.json'),'utf8'));
 const metadata={schemaVersion:'buster-image-delivery.v1',revision,namespace,releaseName,expected};
 fs.writeFileSync(path.join(output,'buster-delivery.json'),JSON.stringify(metadata,null,2)+'\n',{mode:0o444});
 return {packageRoot,systemRoot:path.join(output,'generation/system'),deliveryRoot,generationDigest:generation.generationDigest,metadata};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [output,revision]=process.argv.slice(2);if(process.argv.length!==4)throw new Error('Usage: build-buster-image-bundle.mjs ABSOLUTE_OUTPUT SOURCE_COMMIT');
 console.log(JSON.stringify(await buildBusterImageBundle({repository:path.resolve(import.meta.dirname,'..'),output,revision,builtAt:new Date().toISOString()})));
}
