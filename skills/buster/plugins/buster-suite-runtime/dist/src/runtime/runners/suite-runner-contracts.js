export function createSuiteRunnerValidationError(message, details) {
    const error = new Error(message);
    error.name = 'SuiteRunnerValidationError';
    error.code = 'BUSTER_SUITE_REQUEST_INVALID';
    error.details = details;
    return error;
}
