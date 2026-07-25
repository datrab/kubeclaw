import crypto from 'node:crypto';

export const TELEMETRY_SCHEMA_VERSION = 'telemetry_envelope.v1';
export const LIFECYCLE_SCHEMA_VERSION = 'pipeline_lifecycle.v1';
export const OBSERVABILITY_LEVELS = Object.freeze(['complete', 'partial', 'degraded', 'unknown']);
export const COMMAND_TYPES = Object.freeze(['approval.resolve', 'pipeline.pause', 'pipeline.resume', 'pipeline.cancel']);

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
export function sha256(value: string | Buffer): string { return crypto.createHash('sha256').update(value).digest('hex'); }
const SECRET_KEY=/(authorization|cookie|password|secret|token|api[_-]?key|private[_-]?key)/i;
const CREDENTIAL_VALUE=/(bearer\s+[a-z0-9._~+\/-]{12,}|(?:sk|ghp|github_pat)_[a-z0-9_-]{12,}|(?:token|secret|password|api[_-]?key)=[a-z0-9._~+\/-]{8,})/ig;
export function prohibitedEvidencePaths(value:any,key='',at='$'):string[]{const findings:string[]=[];if(key&&SECRET_KEY.test(key)&&typeof value==='string')findings.push(at);if(typeof value==='string'){CREDENTIAL_VALUE.lastIndex=0;if(CREDENTIAL_VALUE.test(value))findings.push(at);CREDENTIAL_VALUE.lastIndex=0;}else if(Array.isArray(value))value.forEach((item,index)=>findings.push(...prohibitedEvidencePaths(item,'',`${at}[${index}]`)));else if(value&&typeof value==='object')for(const[child,item]of Object.entries(value))findings.push(...prohibitedEvidencePaths(item,child,`${at}.${child}`));return[...new Set(findings)];}
export function assertEvidenceAdmissible(value:any){const prohibited=prohibitedEvidencePaths(value);if(prohibited.length)throw Object.assign(new Error(`prohibited evidence rejected at ${prohibited.join(', ')}`),{code:'PROHIBITED_EVIDENCE',prohibited});return value;}

export function normalizeCorrelationIdentity(input: any = {}) {
  const workType = text(input.work_type);
  return {
    project: text(input.project), run_id: text(input.run_id), work_id: text(input.work_id),
    work_type: workType && WORK_TYPES.has(workType) ? workType : null, module_id:text(input.module_id), gate_id: text(input.gate_id), gate_type:text(input.gate_type),
    attempt: integer(input.attempt), dispatch_id: text(input.dispatch_id), session_id: text(input.session_id ?? input.session_key),
    parent_session_id:text(input.parent_session_id),agent_id: text(input.agent_id), model_call_id: text(input.model_call_id), tool_call_id: text(input.tool_call_id),
    trace_id:text(input.trace_id),span_id:text(input.span_id),parent_span_id:text(input.parent_span_id),
    source: text(input.source), producer: text(input.producer ?? input.emitter),
  };
}

export function validateCorrelationIdentity(identity: any, { eventType = '', authoritative = {} as any } = {}) {
  const normalized = normalizeCorrelationIdentity(identity);
  const errors: string[] = [];
  for (const field of ['project', 'run_id', 'source', 'producer']) if (!(normalized as any)[field]) errors.push(`${field} is required`);
  const workIdentityMissing = [normalized.work_id, normalized.work_type].some((value) => !value);
  if (WORK_OWNED.has(eventType) && workIdentityMissing) errors.push(`${eventType} requires work_id and work_type`);
  const toolIdentityMissing = [normalized.session_id, normalized.model_call_id, normalized.tool_call_id, normalized.dispatch_id].some((value) => !value)
    || normalized.attempt == null;
  if (eventType.startsWith('agent.tool.') && toolIdentityMissing) errors.push(`${eventType} requires attempt, dispatch, session, model_call, and tool_call identity`);
  const isModelEvent = ['agent.model.', 'agent.llm.'].some((prefix) => eventType.startsWith(prefix));
  const modelIdentityMissing = [normalized.session_id, normalized.model_call_id, normalized.dispatch_id].some((value) => !value)
    || normalized.attempt == null;
  if (isModelEvent && modelIdentityMissing) errors.push(`${eventType} requires attempt, dispatch, session, and model_call identity`);
  for (const [field, value] of Object.entries(authoritative || {})) {
    if (value != null && value !== '' && (normalized as any)[field] !== value) errors.push(`${field} does not match producer authority`);
  }
  if (normalized.work_type === 'gate' && !normalized.gate_id) errors.push('gate work requires gate_id');
  if (normalized.module_id && normalized.work_type !== 'module') errors.push('module_id requires work_type module');
  if (normalized.gate_id && normalized.work_type !== 'gate') errors.push('gate_id requires work_type gate');
  if (normalized.module_id && normalized.work_id !== normalized.module_id) errors.push('module_id must equal canonical work_id');
  if (normalized.gate_id && normalized.work_id !== normalized.gate_id) errors.push('gate_id must equal canonical work_id');
  return { ok: errors.length === 0, errors, identity: normalized };
}

export function buildCanonicalEnvelope({ type, identity, payload = {}, seq, occurredAt, emittedAt, causationId = null, sourceEventId = null, authorityClass='pipeline_authority', authoritative = {} }: any) {
  const checked = validateCorrelationIdentity(identity, { eventType: type, authoritative });
  if (!checked.ok) throw Object.assign(new Error(`invalid correlation identity: ${checked.errors.join('; ')}`), { code: 'TELEMETRY_IDENTITY_INVALID', errors: checked.errors });
  const occurred = iso(occurredAt) ?? new Date().toISOString();
  const emitted = iso(emittedAt) ?? new Date().toISOString();
  if (!Number.isInteger(seq) || seq < 1) throw Object.assign(new Error('seq must be a positive integer'), { code: 'TELEMETRY_SEQUENCE_INVALID' });
  const logicalSeed = stableJson({ type, identity: checked.identity, payload });
  const stableSourceEventId=text(sourceEventId??payload.source_event_id)??`src_${sha256(logicalSeed)}`;
  const normalizedPayload={...payload};delete normalizedPayload.source_event_id;
  return { ...normalizedPayload, ...checked.identity, schema_version: TELEMETRY_SCHEMA_VERSION, event_id:`evt_${sha256(stableSourceEventId)}`,source_event_id:stableSourceEventId,type,occurred_at:occurred,emitted_at:emitted,seq,cursor:`${checked.identity.project}/${checked.identity.run_id}/${seq}`,authority_class:text(authorityClass)??'pipeline_authority',causation_id:text(causationId),extensions:{evidence_provenance:'production',...(payload.extensions??{})} };
}

export function payloadAdmission(input: any = {}) {
  const allowedClasses = new Set(['metadata','payload','artifact','quarantined']);
  const allowedCompleteness = new Set(['full','truncated','summarized','transformed','unavailable','reference_only']);
  const contentClass = text(input.content_class);
  const completeness = text(input.completeness);
  const errors = [];
  if (!contentClass || !allowedClasses.has(contentClass)) errors.push('invalid content_class');
  if (!completeness || !allowedCompleteness.has(completeness)) errors.push('invalid completeness');
  if (input.original_byte_length != null && integer(input.original_byte_length) == null) errors.push('invalid original_byte_length');
  if (input.original_sha256 != null && !/^[a-f0-9]{64}$/.test(String(input.original_sha256))) errors.push('invalid original_sha256');
  if(completeness==='full'&&input.transformation)errors.push('full evidence cannot declare a transformation');
  return { ok: errors.length === 0, errors, value: { content_class: contentClass, completeness, original_byte_length: input.original_byte_length ?? null, original_sha256: input.original_sha256 ?? null, transformation: input.transformation??null } };
}
