export interface Input {
  readonly moduleId: string;
  readonly modulePath: string;
  readonly substeps?: readonly string[];
  readonly ownedPaths: readonly string[];
  readonly serveDockerfile: string | null;
  readonly apiSpecFile: string | null;
}
export interface Failure { readonly code: string; readonly message: string; readonly nextStep: string; }

function invalid(reason: string): never { throw new Error(`FORGE_DECLARATION_INVALID:${reason}`); }

/** Paths are canonical repository-relative identities, never basenames or suffixes. */
function deliveryPath(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || /[\\\x00-\x1f:]/u.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) invalid('path');
  return value;
}

function declarationBlock(content: string): string {
  const blocks: string[] = []; let fence = ''; let tagged = false; let lines: string[] = [];
  for (const line of content.split(/\r?\n/u)) {
    const marker = /^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(line);
    if (!fence && marker) {
      fence = marker[2]!; tagged = marker[3] === 'kubeclaw-deliverables'; lines = [];
    } else if (fence && marker && marker[2]![0] === fence[0]
      && marker[2]!.length >= fence.length && !marker[3]!.trim()) {
      if (tagged) blocks.push(lines.join('\n'));
      fence = ''; tagged = false;
    } else if (fence && tagged) lines.push(line);
  }
  if (tagged || blocks.length !== 1) invalid('exactly_one_complete_block_required');
  return blocks[0]!;
}

export function parseDeclaration(moduleId: string, substep: string | null, content: string): readonly string[] {
  let value;
  try { value = JSON.parse(declarationBlock(content)); } catch { invalid('block_or_json'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'deliverables,moduleId,schemaVersion,substep'
    || value.schemaVersion !== 'forge-deliverables.v1' || value.moduleId !== moduleId
    || value.substep !== substep || !Array.isArray(value.deliverables)) invalid('identity_or_shape');
  const paths = value.deliverables.map(deliveryPath) as string[];
  if (new Set(paths).size !== paths.length) invalid('duplicate_path');
  return paths;
}

export function validateDeliveryPaths(input: Input, declarations: readonly string[]): readonly Failure[] {
  const failures: Failure[] = [];
  const owned = input.ownedPaths.map(value => deliveryPath(value.replace(/\/$/u, '')));
  const owns = (file: string) => owned.some(prefix => file === prefix || file.startsWith(`${prefix}/`));
  if (new Set(declarations).size !== declarations.length) invalid('duplicate_substep_assignment');
  for (const [kind, raw] of [['serve_dockerfile', input.serveDockerfile], ['api_spec', input.apiSpecFile]] as const) {
    if (raw === null) continue;
    const file = deliveryPath(raw);
    if (kind === 'serve_dockerfile' && !owns(file)) continue;
    if (!declarations.includes(file)) failures.push({code: `preflight_contract.${kind}_not_declared`,
      message: `Required deliverable '${file}' is not explicitly declared in this module's Forge blueprint.`,
      nextStep: `Declare the exact repository-relative path '${file}' in the owning blueprint's kubeclaw-deliverables block.`});
  }
  return failures;
}
