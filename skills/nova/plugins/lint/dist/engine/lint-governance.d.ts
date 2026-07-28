declare function validateBaseline(input: unknown, policyDir: string, today: string): Record<string, any>;
declare function validateRuleAdmission(input: unknown, tools: Record<string, any>[]): Record<string, any>;
export { validateBaseline, validateRuleAdmission };
