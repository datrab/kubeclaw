function objectRecord(value: any): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

export function projectModuleValidation(existing: any, event: any): any {
  const current = objectRecord(existing.validation);
  const attempt = event.refs?.attempt ?? null;
  if (event.type === "module_attempt.started") {
    return {
      attempt,
      delivery_lint_passed: false,
      delivery_lint_passed_at: null,
      pre_check_passed: false,
      pre_check_passed_at: null,
    };
  }
  if (event.type !== "module_attempt.testing_started") return current;
  const delivery = Boolean(event.data?.delivery_lint_passed);
  const preCheck = Boolean(event.data?.pre_check_passed);
  return {
    ...(current ?? {}),
    attempt,
    delivery_lint_passed: delivery,
    delivery_lint_passed_at: delivery
      ? event.occurred_at
      : (current?.delivery_lint_passed_at ?? null),
    pre_check_passed: preCheck,
    pre_check_passed_at: preCheck
      ? event.occurred_at
      : (current?.pre_check_passed_at ?? null),
  };
}
