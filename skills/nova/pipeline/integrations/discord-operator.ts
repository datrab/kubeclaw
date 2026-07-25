import { selectDefinedValue } from '../optional-absence.ts';
import { arrayOrEmpty, normalizedFieldName, optionalText, recordOrEmpty, textOrEmpty } from './discord-values.ts';

function normalizeOperatorStatusText(value: any) {
  return textOrEmpty(value);
}

function normalizeOperatorModelText(value: any) {
  return textOrEmpty(value)
    .replace(/\bopenai-codex\//gi, 'openai/')
    .replace(/\bcodex-(\d[\w.-]*)\b/gi, 'gpt-$1');
}

function normalizeOperatorFieldValue(field: any) {
  const fieldRecord = recordOrEmpty(field);
  const raw = textOrEmpty(fieldRecord.value);
  const statusNormalized = normalizeOperatorStatusText(raw);
  return normalizedFieldName(fieldRecord.name) === 'model'
    ? normalizeOperatorModelText(statusNormalized)
    : statusNormalized;
}

function actionabilityFieldNeedsReplacement(name: any, value: any) {
  const normalizedName = normalizedFieldName(name);
  const text = textOrEmpty(value).trim();
  if (!text) return true;
  if (normalizedName === 'impact' && /^Buster reported an operator-visible event/i.test(text)) return true;
  if (normalizedName === 'action' && /(open latest\.json|inspect the run-scoped pipeline and Discord artifacts?|inspect.*artifacts?)/i.test(text)) return true;
  if (normalizedName === 'evidence' && /(run pipeline:|run discord:|buster diagnostic:|latest\.json|discord\.jsonl)/i.test(text)) return true;
  return false;
}

function operatorEmbedEvidenceSummary(embed: any = {}) {
  const skipNames = new Set(['impact', 'action', 'evidence', 'run', 'run id', 'attempt', 'dispatch', 'session']);
  const embedRecord = recordOrEmpty(embed);
  const lines = arrayOrEmpty(embedRecord.fields)
    .filter((field: any) => !skipNames.has(normalizedFieldName(recordOrEmpty(field).name)))
    .map((field: any) => {
      const fieldRecord = recordOrEmpty(field);
      const name = selectDefinedValue(() => (optionalText(fieldRecord.name)?.trim()), () => ('field_name_missing'));
      const value = normalizeOperatorFieldValue(field).trim();
      return value ? `${name}: ${value}` : null;
    })
    .filter(Boolean);
  const title = optionalText(embedRecord.title)?.trim();
  const description = optionalText(embedRecord.description)?.trim();
  if (lines.length) return lines.join('\n');
  if (title && description) return `${title}\n${description}`;
  if (title) return title;
  if (description) return description;
  return 'discord_evidence_fields_missing';
}

function replacementActionabilityValue(name: any, embed: any = {}) {
  const evidenceSummary = operatorEmbedEvidenceSummary(embed);
  const embedRecord = recordOrEmpty(embed);
  const normalizedName = normalizedFieldName(name);
  if (normalizedName === 'impact') {
    const title = optionalText(embedRecord.title)?.trim();
    const description = optionalText(embedRecord.description)?.trim();
    if (title && description) return `${title}: ${description}`;
    if (title) return title;
    if (description) return description;
    return 'discord_impact_fields_missing';
  }
  if (normalizedName === 'action') return 'Read the notification fields and act on the listed status, issue, or failure reason.';
  if (normalizedName === 'evidence') return evidenceSummary;
  return evidenceSummary;
}

export function normalizeOperatorEmbed(embed: any = {}) {
  const embedRecord = recordOrEmpty(embed);
  const normalized = {
    ...embedRecord,
    title: normalizeOperatorStatusText(embedRecord.title),
    description: normalizeOperatorStatusText(embedRecord.description),
    fields: Array.isArray(embedRecord.fields)
      ? embedRecord.fields.map((field: any) => ({
          ...field,
          value: normalizeOperatorFieldValue(field),
        }))
      : embedRecord.fields,
  };
  if (!Array.isArray(normalized.fields)) return normalized;
  normalized.fields = normalized.fields.map((field: any) => {
    const name = normalizedFieldName(recordOrEmpty(field).name);
    if (!['impact', 'action', 'evidence'].includes(name)) return field;
    if (!actionabilityFieldNeedsReplacement(name, field?.value)) return field;
    return { ...field, value: replacementActionabilityValue(name, normalized), inline: false };
  });
  return normalized;
}
