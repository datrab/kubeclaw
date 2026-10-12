/** Runtime validation accepts untrusted input; credential values never enter the origin projection. */
export interface RegistryRuntimeConfiguration {
  registryBaseUrl: string;
  registryReference: string;
  registryCaFile?: string;
  registryUsernameEnvironmentVariable?: string;
  registryPasswordEnvironmentVariable?: string;
}
export interface RegistryClientConfiguration {
  buildkit: string;
  runtime: RegistryRuntimeConfiguration;
  node: {
    mirrors: Record<string, { endpoint: string[] }>;
    configs: Record<string, { tls?: { ca_file: string }; auth?: { username: string; password: string } }>;
  };
  caFile: string;
}
export function registryClientOrigin(input: unknown): string;
export function registryClientConfig(input: unknown,
  environment?: Readonly<Record<string, string | undefined>>): RegistryClientConfiguration;
export function writeRegistryClients(input: unknown, environment: Readonly<Record<string, string | undefined>>,
  outputs: Partial<Record<'buildkit' | 'runtime' | 'node', string>>): RegistryClientConfiguration;
