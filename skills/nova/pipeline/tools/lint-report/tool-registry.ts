import { registerTool } from './tool-registry-core.ts';
import './tool-registry-language-tools.ts';
import './tool-registry-dependency-tools.ts';
import './tool-registry-semgrep.ts';
import { registerContainerYamlTools } from './container-yaml-tools.ts';
import { registerKubernetesSecurityTools } from './kubernetes-security-tools.ts';
import { registerGoTools, registerTerraformTools } from './go-terraform-tools.ts';
import { registerArchitectureTools } from './architecture-tools.ts';

registerContainerYamlTools(registerTool);
registerKubernetesSecurityTools(registerTool);
registerArchitectureTools(registerTool);
registerGoTools(registerTool);
registerTerraformTools(registerTool);

export { buildToolRegistry, TOOL_ADAPTERS, TOOL_ADAPTERS as TOOL_REGISTRY, uniqueTypeScriptFindings } from './tool-registry-core.ts';
