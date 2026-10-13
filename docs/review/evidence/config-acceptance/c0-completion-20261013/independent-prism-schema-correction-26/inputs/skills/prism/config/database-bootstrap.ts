/** Database credentials are captured once; ordinary upgrades cannot rotate them. */
export function prismDatabaseBootstrapConfig(environment: NodeJS.ProcessEnv = process.env) {
  const required = (name: string): string => {
    const value = environment[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  return { adminUrl: required('ADMIN_DATABASE_URL'),
    passwords: { migrator: required('PRISM_MIGRATOR_PASSWORD'), runtime: required('PRISM_RUNTIME_PASSWORD'), readonly: required('PRISM_READONLY_PASSWORD') },
    connectionTimeoutMs: 5000, maximumAttempts: 60, retryDelayMs: 2000 };
}
