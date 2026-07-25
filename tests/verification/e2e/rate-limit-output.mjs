const COOLDOWN_PATTERN = /\b(rate[- ]limit(?:ed)?|usage limit|subscription usage limit)\b[\s\S]{0,240}\b(cooldown|sleeping|resume at|retrying after cooldown|authorized_rate_limit_cooldown)\b/i;
const RESUME_AT_PATTERN = /\bresume at\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)\b/i;

function outputText(output) {
  if (!output) return '';
  return [
    output.stdout?.tail,
    output.stderr?.tail,
    ...(output.stdout?.fatal_lines || []),
    ...(output.stderr?.fatal_lines || []),
  ].filter(Boolean).join('\n');
}

export function rateLimitCooldownDetails(output) {
  const text = outputText(output);
  if (!COOLDOWN_PATTERN.test(text)) return null;
  return {
    resumeAt: text.match(RESUME_AT_PATTERN)?.[1] || null,
    evidenceLength: text.length,
  };
}

export function hasRateLimitCooldownEvidence(output) {
  return rateLimitCooldownDetails(output) !== null;
}
