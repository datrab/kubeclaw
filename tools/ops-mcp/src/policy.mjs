import fs from 'node:fs';
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==keys.split(',').sort().join(','))throw new Error('OPS_MCP_POLICY_FIELDS_INVALID');};
const positive=v=>{if(!Number.isSafeInteger(v)||v<1||v>2147483647)throw new Error('OPS_MCP_POLICY_LIMIT_INVALID');};
const text=v=>{if(typeof v!=='string'||!v.trim()||v!==v.trim())throw new Error('OPS_MCP_POLICY_TEXT_INVALID');};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function captureOpsMcpPolicy(value){
 const p=structuredClone(value);exact(p,'schemaVersion,server,kubernetes,hubble,presentation,supervisor');
 if(p.schemaVersion!=='ops-mcp-policy.v1')throw new Error('OPS_MCP_POLICY_VERSION');
 exact(p.server,'port,host,localOnly,defaultNamespace,argoNamespace,namespaces,allowedOrigins');
 const s=p.server;if(!Number.isInteger(s.port)||s.port<0||s.port>65535||typeof s.localOnly!=='boolean')throw new Error('OPS_MCP_POLICY_SERVER_INVALID');
 for(const k of ['host','defaultNamespace','argoNamespace'])text(s[k]);
 if(s.localOnly&&s.host!=='127.0.0.1')throw new Error('Local-only MCP requires HOST=127.0.0.1');
 const validName=v=>typeof v==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v);
 if(!validName(s.defaultNamespace)||!validName(s.argoNamespace)||!Array.isArray(s.namespaces)||!s.namespaces.includes(s.defaultNamespace)||!s.namespaces.every(validName)||new Set(s.namespaces).size!==s.namespaces.length||!Array.isArray(s.allowedOrigins)||s.allowedOrigins.some(v=>typeof v!=='string'||v!==v.trim()||!v))throw new Error('OPS_MCP_POLICY_NAMESPACES_INVALID');
 exact(p.kubernetes,'timeoutMs,maxBytes');Object.values(p.kubernetes).forEach(positive);
 exact(p.hubble,'binary,server,timeout,maxConcurrentQueries,defaultWindowMs,maxWindowMs,maxRawBytes,maxOutputBytes,maxSummaryBytes,maxStderrBytes');
 text(p.hubble.binary);text(p.hubble.server);for(const [k,v] of Object.entries(p.hubble))if(!['binary','server'].includes(k))positive(v);
 if(p.hubble.defaultWindowMs>p.hubble.maxWindowMs)throw new Error('OPS_MCP_POLICY_WINDOW_INVALID');
 exact(p.presentation,'maxLogBytes,eventPageSize');Object.values(p.presentation).forEach(positive);
 exact(p.supervisor,'controlSocketProbeTimeoutSeconds,controlStartupTimeoutSeconds,controlStartupPollSeconds,loginStatusTimeoutSeconds,loginRetryWaitSeconds,controlHealthPollSeconds,controlTerminationTimeoutSeconds,restartWaitSeconds');
 for(const v of Object.values(p.supervisor))if(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>2147483647)throw new Error('OPS_SUPERVISOR_POLICY_INVALID');
 return freeze(p);
}
export function loadOpsMcpPolicy(file){if(typeof file!=='string'||!file)throw new Error('OPS_MCP_POLICY_LOCATOR_REQUIRED');return captureOpsMcpPolicy(JSON.parse(fs.readFileSync(fs.realpathSync(file),'utf8')));}
