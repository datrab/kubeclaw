export function readBusterEnvironment(key, env = process.env) {
    return env[key];
}
export function busterEnvironmentSnapshot() {
    return { ...process.env };
}
