/** Original OpenClaw adapter capacity contract. Shared by actual activation and
 * Review projection so omitted legacy target fields are normalized exactly once
 * by their owner, not independently defaulted by Review. */
export function openClawTargetCapacity(raw:Readonly<Record<string,unknown>>) {
 const value={
  tokenizerEncoding:raw.tokenizerEncoding===undefined?'o200k_base':raw.tokenizerEncoding,
  maxPromptBytes:Number(raw.maxPromptBytes===undefined?900_000:raw.maxPromptBytes),
  maxInputTokens:Number(raw.maxInputTokens===undefined?120_000:raw.maxInputTokens),
  maxOutputTokens:Number(raw.maxOutputTokens===undefined?6_000:raw.maxOutputTokens),
  maxContextTokens:Number(raw.maxContextTokens===undefined?128_000:raw.maxContextTokens),
 };
 if(value.tokenizerEncoding!=='o200k_base'||value.maxPromptBytes!==900_000||value.maxInputTokens!==120_000||value.maxOutputTokens!==6_000||value.maxContextTokens!==128_000)throw new Error('OPENCLAW_TARGET_CAPACITY_INVALID');
 return Object.freeze({...value,tokenizerEncoding:'o200k_base' as const});
}

/** The identity portion of the same original activation parser. */
export function openClawTargetIdentity(raw:Readonly<Record<string,unknown>>) {
 const text=(value:unknown,fallback='')=>typeof value==='string'?value.trim():fallback;
 const id=/^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
 return Object.freeze({runtime:raw.runtime as 'acp'|'subagent',agentId:typeof raw.agentId==='string'&&id.test(raw.agentId)?raw.agentId:'codex',model:text(raw.model),thinking:text(raw.thinking,'high')});
}
