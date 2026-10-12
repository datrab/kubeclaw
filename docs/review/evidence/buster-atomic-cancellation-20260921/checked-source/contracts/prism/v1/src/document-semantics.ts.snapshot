import type { PrismDocument, PrismNode } from './index.ts';
import { PRISM_JSON_LIMITS, PrismContractError } from './complexity.ts';
import { validateNodeCatalog } from './node-catalog.ts';
type Component = { root: PrismNode; variants?: Record<string, unknown> };
function invalid(message: string): never { throw new Error(`PRISM_INPUT_INVALID: designDocument: ${message}`); }

function validateTheme(document: PrismDocument): void {
  const cssColor = /^(?:#[0-9a-f]{3,8}|rgba?\([0-9., %]+\)|hsla?\([0-9., %a-z]+\)|transparent|currentColor)$/iu;
  for (const [token, color] of Object.entries(document.theme.colors as Record<string, unknown>)) {
    if (typeof color !== 'string' || !cssColor.test(color)) invalid(`invalid color token ${token}`);
  }
  const fontName = /^[a-z0-9 _-]{1,80}$/iu;
  for (const [token, raw] of Object.entries(document.theme.typography as Record<string, unknown>)) {
    const typography = raw as Record<string, unknown>;
    if (typeof typography.family !== 'string' || !fontName.test(typography.family)) invalid(`invalid typography token ${token}`);
    if (typography.fallback !== undefined && (!Array.isArray(typography.fallback) || typography.fallback.some((item) => typeof item !== 'string' || !fontName.test(item)))) invalid(`invalid typography fallback ${token}`);
  }
  for (const [token, shadow] of Object.entries(document.theme.shadow ?? {})) {
    if (typeof shadow !== 'string' || /[;}]/u.test(shadow)) invalid(`invalid shadow token ${token}`);
  }
}
function nodeMap(root: PrismNode): Map<string, PrismNode> {
  const nodes = new Map<string, PrismNode>();
  const pending = [root];
  while (pending.length) {
    const node = pending.pop()!;
    nodes.set(node.id, node);
    pending.push(...(node.children ?? []));
  }
  return nodes;
}
class DocumentSemantics {
  readonly components: Record<string, Component>;
  readonly maps = new Map<string, Map<string, PrismNode>>();
  readonly references = new Map<string, Set<string>>();
  readonly componentDepths = new Map<string, number>();
  patchDepth = 0;
  work = 0;
  constructor(document: PrismDocument) { this.components = document.components as Record<string, Component>; }
  consume(): void {
    if (++this.work > PRISM_JSON_LIMITS.nodes) throw new PrismContractError('SEMANTIC_WORK_EXCEEDED', 'PRISM_INPUT_INVALID: designDocument');
  }
  component(id: string): Component {
    const component = this.components[id];
    if (!component) invalid(`missing component ${id}`);
    return component;
  }
  patches(componentId: string, patches: unknown, path: string): void {
    if (patches === undefined) return;
    if (++this.patchDepth > PRISM_JSON_LIMITS.depth) throw new PrismContractError('PATCH_DEPTH_EXCEEDED', 'PRISM_INPUT_INVALID: designDocument');
    try {
      if (!patches || typeof patches !== 'object' || Array.isArray(patches)) invalid(`invalid patches at ${path}`);
      const nodes = this.maps.get(componentId) ?? nodeMap(this.component(componentId).root);
      this.maps.set(componentId, nodes);
      for (const [nodeId, patch] of Object.entries(patches)) {
        this.consume();
        const target = nodes.get(nodeId);
        if (!target || !patch || typeof patch !== 'object' || Array.isArray(patch)) invalid(`invalid patch target ${componentId}.${nodeId}`);
        this.patchedNode(target, patch as Record<string, unknown>, `${path}.${nodeId}`);
      }
    } finally { this.patchDepth--; }
  }
  patchedNode(node: PrismNode, patch: Record<string, unknown>, path: string): void {
    if ('component' in patch || 'itemComponent' in patch) invalid(`component references cannot change in ${path}`);
    const patched = { ...node, props: { ...(node.props ?? {}), ...patch } };
    validateNodeCatalog(patched, path);
    this.nodeReference(patched);
  }
  nodeReference(node: PrismNode): string | undefined {
    this.consume();
    const props = node.props ?? {};
    const reference = node.type === 'component' ? props.component : node.type === 'list' ? props.itemComponent : undefined;
    if (typeof reference !== 'string') return undefined;
    const component = this.component(reference);
    if (node.type === 'component') {
      if (typeof props.variant === 'string' && !component.variants?.[props.variant]) invalid(`missing variant ${reference}.${props.variant}`);
      this.patches(reference, props.overrides, `component.${node.id}.overrides`);
    }
    return reference;
  }
  referenced(root: PrismNode): Set<string> {
    const references = new Set<string>();
    for (const node of nodeMap(root).values()) {
      const reference = this.nodeReference(node);
      if (reference) references.add(reference);
    }
    return references;
  }
  componentsValid(): void {
    for (const [id, component] of Object.entries(this.components)) {
      validateNodeCatalog(component.root, `components.${id}.root`);
      for (const [variant, patches] of Object.entries(component.variants ?? {})) this.patches(id, patches, `components.${id}.variants.${variant}`);
      this.references.set(id, this.referenced(component.root));
    }
    const visiting = new Set<string>();
    for (const id of Object.keys(this.components)) this.checkCycle(id, visiting);
  }
  checkCycle(id: string, visiting: Set<string>): number {
    if (visiting.has(id)) invalid(`component cycle at ${id}`);
    const cached = this.componentDepths.get(id);
    if (cached !== undefined) return cached;
    if (visiting.size >= PRISM_JSON_LIMITS.depth) throw new PrismContractError('COMPONENT_DEPTH_EXCEEDED', 'PRISM_INPUT_INVALID: designDocument');
    visiting.add(id);
    let depth = 1;
    for (const reference of this.references.get(id) ?? []) depth = Math.max(depth, 1 + this.checkCycle(reference, visiting));
    if (depth > PRISM_JSON_LIMITS.depth) throw new PrismContractError('COMPONENT_DEPTH_EXCEEDED', 'PRISM_INPUT_INVALID: designDocument');
    visiting.delete(id);
    this.componentDepths.set(id, depth);
    return depth;
  }
  viewGroups(viewId: string, scope: string, groups: PrismDocument['views'][string]['states'], nodes: Map<string, PrismNode>): void {
    for (const [groupId, group] of Object.entries(groups)) {
      for (const [nodeId, patch] of Object.entries(group.patches)) {
        this.consume();
        const node = nodes.get(nodeId);
        if (!node) invalid(`missing patch target ${viewId}.${nodeId}`);
        this.patchedNode(node, patch, `views.${viewId}.${scope}.${groupId}.${nodeId}`);
      }
    }
  }
  viewsValid(document: PrismDocument): void {
    for (const [viewId, view] of Object.entries(document.views)) {
      validateNodeCatalog(view.root, `views.${viewId}.root`);
      this.referenced(view.root);
      const nodes = nodeMap(view.root);
      this.viewGroups(viewId, 'states', view.states, nodes);
      this.viewGroups(viewId, 'responsive', view.responsive, nodes);
    }
  }
}
export function validateDocumentSemantics(document: PrismDocument): void {
  validateTheme(document);
  const checks = new DocumentSemantics(document);
  checks.componentsValid();
  checks.viewsValid(document);
}
