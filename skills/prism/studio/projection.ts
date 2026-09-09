import type { Data } from "@puckeditor/core";
import type { PrismDocument, PrismNode } from "@kubeclaw/prism-contracts-v1";

export type Props = {
  Stack: { gap: number; content: unknown };
  Heading: { text: string };
  Text: { text: string };
  Button: { label: string };
  PrismBlock: {
    nodeType: string;
    label: string;
    text: string;
    action: string;
    tone: string;
    content: unknown;
  };
};
export function mapNode(node: PrismNode): Data<Props>["content"][number] {
  const id = node.id; const props = node.props ?? {};
  switch (node.type) {
    case "heading": return { type: "Heading", props: { id, text: String(props.content ?? "") } };
    case "text": return { type: "Text", props: { id, text: String(props.content ?? "") } };
    case "button": return { type: "Button", props: { id, label: String(props.label ?? "") } };
    case "stack": return { type: "Stack", props: { id, gap: Number(props.gap ?? 16), content: (node.children ?? []).map(mapNode) } };
    default: return genericNode(node);

  }
}
export const project = (document: PrismDocument, viewId: string): Data<Props> => ({
  root: { props: { title: document.meta.title } },
  content: (document.views[viewId]?.root.children ?? []).map(mapNode),
});

function displayField(props: Record<string, unknown>, fields: string[]): string {
  for (const key of fields) if (props[key] !== undefined) return String(props[key]);
  return '';
}
function genericNode(node: PrismNode): Data<Props>["content"][number] {
  const props = node.props ?? {};
  return { type: "PrismBlock", props: { id: node.id, nodeType: node.type,
    label: displayField(props, ['label', 'title']),
    text: displayField(props, ['content', 'message', 'description']),
    action: String(props.action ?? ''), tone: String(props.tone ?? 'default'),
    content: (node.children ?? []).map(mapNode),
  } };
}
