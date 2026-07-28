const VERSION = '1.0.0';
const DEFAULT_TOOL_TIMEOUT = 30000; // 30s per tool
const DEFAULT_TIER = 'full';
const TIERS = {
    'pre-check': 'Pre-check: fast type/lint checks only (tsc, ruff, shellcheck)',
    'full': 'Full report: all applicable tools',
};
export { DEFAULT_TIER, DEFAULT_TOOL_TIMEOUT, TIERS, VERSION, };
