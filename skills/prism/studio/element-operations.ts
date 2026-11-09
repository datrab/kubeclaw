import type { PrismDocument, PrismNode } from '@kubeclaw/prism-contracts-v1';
import type { PrismOperation } from '../domain/index.ts';

export interface ElementPosition { node: PrismNode; parentId: string | null; index: number; depth: number }
export function elements(document: PrismDocument, viewId: string): ElementPosition[] {
  const root = document.views[viewId]?.root;
  if (!root) return [];
  const visit = (node: PrismNode, parentId: string | null, index: number, depth: number): ElementPosition[] => [
    { node, parentId, index, depth }, ...(node.children ?? []).flatMap((child, i) => visit(child, node.id, i, depth + 1)),
  ];
  return visit(root, null, 0, 0);
}
export function elementTitle(node: PrismNode): string {
  const value = ['content', 'label', 'title', 'message'].map(key => node.props?.[key]).find(item => typeof item === 'string' && item);
  return `${node.type}: ${typeof value === 'string' ? value.slice(0, 70) : node.id}`;
}
export function textProperty(node: PrismNode): string | undefined {
  return ['content', 'label', 'message', 'title', 'description'].find(key => typeof node.props?.[key] === 'string');
}
export function reorderElement(document: PrismDocument, viewId: string, nodeId: string, targetId: string): PrismOperation | null {
  const positions = elements(document, viewId);
  const source = positions.find(item => item.node.id === nodeId);
  const target = positions.find(item => item.node.id === targetId);
  if (!source?.parentId || !target || source.parentId !== target.parentId || source.index === target.index) return null;
  return { type: 'node.move', baseRevision: document.meta.revision, nodeId, parentId: source.parentId, index: target.index };
}
