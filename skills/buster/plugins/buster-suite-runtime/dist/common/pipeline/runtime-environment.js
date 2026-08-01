export function readCommonEnvironment(key, env = process.env) {
    return env[key];
}
export function commonEnvironmentSnapshot() {
    return { ...process.env };
}
