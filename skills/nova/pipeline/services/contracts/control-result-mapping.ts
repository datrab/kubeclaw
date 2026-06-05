interface ControlResultMappingRule {
  nextAction?: string | undefined;
  issueType?: string | undefined;
  outcomeClass?: string | undefined;
}

interface UnknownControlResultMappingOptions {
  nextAction?: string;
  issueType?: string;
  outcomeClass?: string;
}

export function buildControlResultMapping(
  rule: ControlResultMappingRule = {},
  outcomeClass: string | null = null,
  { defaultOutcomeClass = 'unknown' }: { defaultOutcomeClass?: string } = {},
): ControlResultMappingRule {
  return {
    nextAction: rule.nextAction,
    issueType: rule.issueType,
    outcomeClass: outcomeClass || rule.outcomeClass || defaultOutcomeClass,
  };
}

export function buildUnknownControlResultMapping({
  nextAction = 'block',
  issueType = 'unknown',
  outcomeClass = 'unknown',
}: UnknownControlResultMappingOptions = {}): ControlResultMappingRule {
  return buildControlResultMapping({ nextAction, issueType, outcomeClass });
}
