import {ESLint} from 'eslint';
import path from 'node:path';
const eslint=new ESLint({cwd:process.cwd(),overrideConfigFile:path.resolve('charts/kubeclaw/files/config/eslint-config.mjs'),ignore:false});
for(const name of ['kubernetes-fixture-runtime','tailscale-exposure-runtime'])for(const file of [`skills/buster/engine/test-gates/${name}-consumer.ts`,'skills/buster/engine/test-gates/process-input.ts',`skills/buster/engine/test-gates/${name}.ts`])for(const source of ['export function environment() { return process.env.KUBECONFIG; }','export function environment() { return process.env.KUBECONFIG ?? "alternate"; }']){
const results=await eslint.lintText(source,{filePath:path.resolve(file)});console.log(JSON.stringify({name,file,source,results}));}
