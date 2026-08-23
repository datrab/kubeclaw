import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import type { ReviewBundleContextItem, ReviewBundleEvidence } from './review-bundle-contract.ts';
import {
  SIMPLIFICATION_FACTS_EVIDENCE_KIND,
  SIMPLIFICATION_FACTS_SCHEMA_VERSION,
  type SimplificationFact,
  type SimplificationRevisionIdentity,
} from './simplification-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import { compareCodeUnits } from './review-ordering.ts';

const FORWARDING_FUNCTION = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^()]*)\)\s*\{\s*return\s+(?:await\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(([^()]*)\)\s*;?\s*\}/gu;

function argumentNames(value: string): readonly string[] | undefined {
  const names = value.split(',').map((part) => part.trim()).filter(Boolean).map((part) => (
    part.replace(/^\.\.\./u, '').replace(/\s*=.*$/u, '').replace(/\s*:\s*[\s\S]*$/u, '').trim()
  ));
  return names.every((name) => /^[A-Za-z_$][\w$]*$/u.test(name)) ? names : undefined;
}

function forwardingFacts(item: ReviewBundleContextItem): readonly SimplificationFact[] {
  if (!/\.(?:[cm]?[jt]sx?)$/u.test(item.path)) return [];
  const facts: SimplificationFact[] = [];
  for (const match of item.content.matchAll(FORWARDING_FUNCTION)) {
    const symbol = match[1];
    const parameters = argumentNames(match[2] ?? '');
    const forwarded = argumentNames(match[4] ?? '');
    if (!symbol || !parameters || !forwarded || parameters.join('\0') !== forwarded.join('\0')) continue;
    const target = match[3] as string;
    facts.push({
      factId: `forwarding.${sha256Text(`${item.path}\0${symbol}\0${target}`).slice(7, 23)}`,
      ruleId: 'SIM002', confidence: 'high', path: item.path, symbol,
      basis: `${symbol} only forwards the same parameters to ${target} and returns its result.`,
      smallestReplacement: `Call ${target} directly unless ${symbol} owns a documented policy or compatibility boundary.`,
      estimatedNetLocReduction: Math.max(1, (match[0].match(/\n/gu) ?? []).length + 1),
    });
  }
  return facts;
}

export function produceSimplificationFacts(
  revision: SimplificationRevisionIdentity,
  context: readonly ReviewBundleContextItem[],
): ReviewBundleEvidence & { readonly kind: typeof SIMPLIFICATION_FACTS_EVIDENCE_KIND } {
  const facts = context.flatMap(forwardingFacts).sort((left, right) => compareCodeUnits(left.factId, right.factId))
    .slice(0, REVIEW_HARD_LIMITS.simplificationFacts);
  const content = canonicalJson({ schemaVersion: SIMPLIFICATION_FACTS_SCHEMA_VERSION, revision, facts });
  return Object.freeze({ kind: SIMPLIFICATION_FACTS_EVIDENCE_KIND, digest: sha256Text(content), content });
}
