// pipeline/core/constants.js — Shared status and exit code constants
// Extracted from pipeline-original.js (module 16)

export const STATUS = {
  PENDING:           'PENDING',
  IN_PROGRESS:       'IN_PROGRESS',
  READY_FOR_TESTING: 'READY_FOR_TESTING',
  TESTING:           'TESTING',
  PASS:              'PASS',
  FAIL:              'FAIL',
  BLOCKED:           'BLOCKED',
  RATE_LIMITED:      'RATE_LIMITED',
};

export const EXIT_OK           = 0;
export const EXIT_ERROR        = 1;
export const EXIT_NEEDS_NOVA   = 10;
export const EXIT_BLOCKED      = 20;
export const EXIT_TIMEOUT      = 30;
export const EXIT_RATE_LIMITED = 40;
