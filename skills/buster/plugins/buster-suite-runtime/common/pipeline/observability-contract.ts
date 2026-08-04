import crypto from 'node:crypto';

const WORK_TYPES = new Set(['pipeline', 'module', 'gate', 'generator', 'validator', 'pipeline_step']);
const WORK_OWNED = new Set(['module.started','module.status_changed','phase.started','phase.completed','gate.started','gate.verdict','agent.tool.started','agent.tool.finished','agent.model.started','agent.model.ended','quality.evidence','git.evidence']);

function text(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function integer(value: unknown) { return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null; }
function iso(value: unknown) { const normalized = text(value); return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : null; }
export function stableJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const SECRET_KEY=/(authorization|cookie|password|secret|token|api[_-]?key|private[_-]?key)/i;
const CREDENTIAL_VALUE=/(bearer\s+[a-z0-9._~+\/-]{12,}|(?:sk|ghp|github_pat)_[a-z0-9_-]{12,}|(?:token|secret|password|api[_-]?key)=[a-z0-9._~+\/-]{8,})/ig;
export function prohibitedEvidencePaths(value:any,key='',at='$'):string[]{const findings:string[]=[];if(key&&SECRET_KEY.test(key)&&typeof value==='string')findings.push(at);if(typeof value==='string'){CREDENTIAL_VALUE.lastIndex=0;if(CREDENTIAL_VALUE.test(value))findings.push(at);CREDENTIAL_VALUE.lastIndex=0;}else if(Array.isArray(value))value.forEach((item,index)=>findings.push(...prohibitedEvidencePaths(item,'',`${at}[${index}]`)));else if(value&&typeof value==='object')for(const[child,item]of Object.entries(value))findings.push(...prohibitedEvidencePaths(item,child,`${at}.${child}`));return[...new Set(findings)];}

function requiredIdentityErrors(normalized: any, eventType: string): string[] {
  const errors: string[] = [];
  for (const field of ['project', 'run_id', 'source', 'producer']) {
    if (!normalized[field]) errors.push(`${field} is required`);
  }
  if (WORK_OWNED.has(eventType) && (!normalized.work_id || !normalized.work_type)) {
    errors.push(`${eventType} requires work_id and work_type`);
  }
  return errors;
}

function agentIdentityErrors(normalized: any, eventType: string): string[] {
  const errors: string[] = [];
  const missingToolIdentity = [normalized.session_id, normalized.model_call_id, normalized.tool_call_id, normalized.dispatch_id].some((value) => !value)
    || normalized.attempt == null;
  if (eventType.startsWith('agent.tool.') && missingToolIdentity) {
    errors.push(`${eventType} requires attempt, dispatch, session, model_call, and tool_call identity`);
  }
  const isModelEvent = ['agent.model.', 'agent.llm.'].some((prefix) => eventType.startsWith(prefix));
  const missingModelIdentity = [normalized.session_id, normalized.model_call_id, normalized.dispatch_id].some((value) => !value)
    || normalized.attempt == null;
  if (isModelEvent && missingModelIdentity) {
    errors.push(`${eventType} requires attempt, dispatch, session, and model_call identity`);
  }
  return errors;
}

function authorityErrors(normalized: any, authoritative: any): string[] {
  const errors: string[] = [];
  for (const [field, value] of Object.entries(authoritative || {})) {
    if (value != null && value !== '' && normalized[field] !== value) {
      errors.push(`${field} does not match producer authority`);
    }
  }
  return errors;
}

function workIdentityErrors(normalized: any): string[] {
  const errors: string[] = [];
  if (normalized.work_type === 'gate' && !normalized.gate_id) errors.push('gate work requires gate_id');
  if (normalized.module_id && normalized.work_type !== 'module') errors.push('module_id requires work_type module');
  if (normalized.gate_id && normalized.work_type !== 'gate') errors.push('gate_id requires work_type gate');
  if (normalized.module_id && normalized.work_id !== normalized.module_id) errors.push('module_id must equal canonical work_id');
  if (normalized.gate_id && normalized.work_id !== normalized.gate_id) errors.push('gate_id must equal canonical work_id');
  return errors;
}
