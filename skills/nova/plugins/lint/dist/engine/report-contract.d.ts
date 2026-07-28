declare const LINT_REPORT_SCHEMA_VERSION = "pipeline_lint_report.v6";
type AnyRecord = Record<string, any>;
declare function validateLintReport(report: unknown, expected?: AnyRecord): AnyRecord;
export { LINT_REPORT_SCHEMA_VERSION, validateLintReport };
