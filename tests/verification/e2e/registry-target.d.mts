export function realE2ERegistryTarget(environment?: Readonly<Record<string, string | undefined>>):
  Readonly<{ origin: string; host: string }>;
export function realE2EDeploymentImage(environment?: Readonly<Record<string, string | undefined>>):
  Readonly<{ reference: string; repository: string; digest: string }>;
