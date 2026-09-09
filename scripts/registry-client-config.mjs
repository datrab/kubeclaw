import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

function closedObject(value,keys,label){
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error(`${label}: object required`);
  for(const key of Object.keys(value))if(!keys.includes(key))throw new Error(`${label}: unknown field ${key}`);
  if(label!=='registry clients')for(const [key,field] of Object.entries(value))if(key!=='auth' && typeof field!=='string')throw new Error(`${label}: ${key} must be a string`);
}
function contractShape(input){
  closedObject(input,['schemaVersion','registry','dockerHubMirror'],'registry clients');
  const common=['endpoint','transport','caFile','nodeCaFile','caSecretName','caSecretKey'];
  closedObject(input.registry,[...common,'auth','authSecretName','usernameKey','passwordKey'],'registry');
  if(input.registry.auth!==undefined)closedObject(input.registry.auth,['usernameEnvironmentVariable','passwordEnvironmentVariable'],'registry.auth');
  if(input.dockerHubMirror!==undefined){
    const mirror=input.dockerHubMirror;closedObject(mirror,common,'dockerHubMirror');
    if(mirror.endpoint===''){
      if(mirror.transport!=='' || ['caFile','nodeCaFile','caSecretName'].some(key=>mirror[key]!==undefined && mirror[key]!==''))throw new Error('dockerHubMirror: disabled mirror must have empty transport and trust');
    }else if(typeof mirror.endpoint!=='string' || !mirror.endpoint)throw new Error('dockerHubMirror: omit mirror or explicitly supply empty endpoint and transport to disable');
  }
}

function trust(input,label){
  for(const field of ['caFile','nodeCaFile'])if(input[field] && (!path.isAbsolute(input[field]) || /[\r\n\0]/u.test(input[field])))throw new Error(`${label}: ${field} must be an absolute file path`);
  if(input.transport==='http-lab' && (input.caFile || input.nodeCaFile))throw new Error(`${label}: HTTP lab transport cannot specify TLS trust`);
  if(Boolean(input.caFile)!==Boolean(input.nodeCaFile))throw new Error(`${label}: custom trust needs both worker caFile and nodeCaFile`);
}
function endpoint(input,label){
  if(!input || typeof input!=='object')throw new Error(`${label}: endpoint and transport must be explicitly configured`);
  if(typeof input.endpoint!=='string' || input.endpoint!==input.endpoint.trim())throw new Error(`${label}: endpoint must be an explicit unpadded origin`);
  const url=new URL(input.endpoint);
  if(!['https','http-lab'].includes(input.transport) || url.protocol!==(input.transport==='https'?'https:':'http:'))throw new Error(`${label}: transport must match endpoint scheme (https or explicit http-lab)`);
  if(url.username || url.password || url.search || url.hash || url.pathname!=='/' || !/^[a-z0-9.-]+(?::[0-9]+)?$/u.test(url.host))throw new Error(`${label}: use a registry origin without credentials, path, query or fragment`);
  trust(input,label);
  return {...input,endpoint:url.origin,host:url.host};
}

function credentialNames(registry){
  const auth=registry.auth;
  if(!auth){
    if(registry.transport==='https')throw new Error('HTTPS registry requires explicit authentication configuration');
    return undefined;
  }
  if(registry.transport!=='https')throw new Error('registry credentials require HTTPS; lab HTTP must be anonymous');
  const names=[auth.usernameEnvironmentVariable,auth.passwordEnvironmentVariable];
  if(names.some(name=>typeof name!=='string' || !/^[A-Z][A-Z0-9_]+$/u.test(name)))throw new Error('registry auth requires explicit credential environment names');
  return names;
}
function authentication(registry,environment){
  const names=credentialNames(registry);
  if(!names)return undefined;
  const [username,password]=names.map(name=>environment[name]);
  if(!username || !password)throw new Error('registry credential environment variables are missing or empty');
  return {username,password};
}

function nodeConfiguration(registry,mirror,credentials){
  const mirrors={[registry.host]:{endpoint:[registry.endpoint]}};
  if(mirror)mirrors['docker.io']={endpoint:[mirror.endpoint]};
  const configs={};
  for(const client of [registry,mirror].filter(Boolean))if(client.nodeCaFile)configs[client.host]={tls:{ca_file:client.nodeCaFile}};
  if(credentials)configs[registry.host]={...configs[registry.host],auth:credentials};
  return {mirrors,configs};
}

function buildkitConfiguration(registry,mirror){
  const toml=[];
  for(const client of [registry,mirror].filter(Boolean)){
    toml.push(`[registry.${JSON.stringify(client.host)}]`);
    if(client.transport==='http-lab')toml.push('  http = true');
    if(client.caFile)toml.push(`  ca = [${JSON.stringify(client.caFile)}]`);
  }
  if(mirror)toml.push('[registry."docker.io"]',`  mirrors = [${JSON.stringify(mirror.host)}]`);
  return toml.join('\n')+'\n';
}

function validateRouting(registry,mirror){
  if(mirror && (mirror.host==='docker.io' || registry.host==='docker.io'))throw new Error('Docker Hub mirror routing collides with a docker.io endpoint');
  if(mirror?.auth || mirror?.authSecretName)throw new Error('Docker Hub mirror credentials are not configured by this public-cache contract');
  if(mirror?.host===registry.host)throw new Error('writable registry cannot also be a pull-through mirror');
}

function clients(input){
  if(input?.schemaVersion!=='registry-clients.v1')throw new Error('registry-clients.v1 configuration is required; see docs/operations/registry-clients.md');
  contractShape(input);
  const registry=endpoint(input.registry,'registry');
  const mirror=input.dockerHubMirror?.endpoint?endpoint(input.dockerHubMirror,'dockerHubMirror'):null;
  validateRouting(registry,mirror);
  return {registry,mirror};
}
/** Non-secret origin projection for callers; never resolves credential values. */
export function registryClientOrigin(input){
  const {registry}=clients(input);
  credentialNames(registry);
  return registry.endpoint;
}
/** One operator-owned contract; generation does not install or verify node configuration. */
export function registryClientConfig(input,environment={}){
  const {registry,mirror}=clients(input);
  const auth=input.registry.auth;
  const credentials=authentication(registry,environment);
  return {buildkit:buildkitConfiguration(registry,mirror),runtime:{registryBaseUrl:registry.endpoint,registryReference:registry.host,...(registry.caFile?{registryCaFile:registry.caFile}:{}),
    ...(auth?{registryUsernameEnvironmentVariable:auth.usernameEnvironmentVariable,registryPasswordEnvironmentVariable:auth.passwordEnvironmentVariable}:{})},
    node:nodeConfiguration(registry,mirror,credentials),caFile:registry.caFile || ''};
}

export function writeRegistryClients(input,environment,outputs){
  const config=registryClientConfig(input,environment);
  for(const [kind,file] of Object.entries(outputs)){
    if(!['buildkit','runtime','node'].includes(kind))throw new Error('unknown registry output');
    fs.writeFileSync(file,kind==='buildkit'?config.buildkit:JSON.stringify(config[kind],null,2)+'\n',{mode:0o600,flag:'wx'});
  }
  return config;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const [inputFile,kind,outputFile]=process.argv.slice(2);
  if(!inputFile || !['buildkit','runtime','node'].includes(kind) || !outputFile)throw new Error('Usage: registry-client-config.mjs INPUT_JSON buildkit|runtime|node OUTPUT_FILE (new file, private mode)');
  writeRegistryClients(JSON.parse(fs.readFileSync(inputFile,'utf8')),process.env,{[kind]:outputFile});
}
