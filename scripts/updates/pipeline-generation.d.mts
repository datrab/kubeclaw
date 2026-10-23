import type { SwarmSelection } from '../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';
export function declaredPipelineServices(authorRoot: string, identity: {
  role: 'buster' | 'prism'; namespace: string; releaseName: string;
  deployment?: 'services' | 'agent-bridge';
}): SwarmSelection[];
export function materializePipelineGeneration(input: {
  authorRoot: string; packageRoot: string; output: string;
  services: readonly SwarmSelection[]; publisher: string;
}): Promise<Readonly<{
  generationDigest: string; imageReceiptDigest: string; callers: string[];
  output: string; inputGenerationSha256: string;
}>>;
