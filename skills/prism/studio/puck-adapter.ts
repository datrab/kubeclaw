import type { Data } from "@puckeditor/core";
import type { PrismDocument, PrismNode } from "@kubeclaw/prism-contracts-v1";
import type { PrismOperation } from "../domain/index.ts";

type PuckItem = Data["content"][number] & { props: Record<string, unknown> };
type PositionedPrism = { node: PrismNode; parentId: string; index: number };
type PositionedPuck = { item: PuckItem; parentId: string; index: number };
const childItems = (item: PuckItem): PuckItem[] =>
  Array.isArray(item.props.content) ? (item.props.content as PuckItem[]) : [];
const nodeType = (type: string) =>
  type === "Heading"
    ? "heading"
    : type === "Button"
      ? "button"
      : type === "Text"
        ? "text"
        : type === "PrismBlock"
          ? "alert"
          : "stack";
const genericProps = (item: PuckItem): Record<string, unknown> => {
  const type = String(item.props.nodeType ?? "alert");
  const label = String(item.props.label ?? "");
  const content = String(item.props.text ?? "");
  const action = String(item.props.action ?? "preview-action");
  const tone = String(item.props.tone ?? "default");
  const values: Record<string, Record<string, unknown>> = {
    grid: { columns: 2 },
    split: { direction: "horizontal", ratio: "1:1" },
    scroll: { direction: "vertical" },
    overlay: { placement: "center" },
    image: { asset: "placeholder-asset" },
    icon: { asset: "placeholder-icon", decorative: true },
    divider: { direction: "horizontal" },
    code: { content },
    link: { label: label || content, action },
    "text-input": { label: label || "Input", inputType: "text" },
    select: { label: label || "Select", options: [] },
    checkbox: { label: label || "Option", checked: false, action },
    list: {
      data: { $data: "items" },
      itemComponent: "list-item",
      emptyText: content || "No items",
    },
    table: {
      data: { $data: "items" },
      columns: [{ field: "name", label: "Name" }],
      emptyText: content || "No rows",
    },
    badge: { label: label || content, tone },
    progress: { value: 0, max: 100, label: label || "Progress" },
    chart: {
      kind: "line",
      data: { $data: "chart-data" },
      yFields: ["value"],
      title: label || "Chart",
    },
    navigation: {
      label: label || "Navigation",
      items: [],
      orientation: "vertical",
    },
    tabs: { label: label || "Tabs", items: [], active: "default" },
    breadcrumb: { items: [{ label: label || "Home", current: true }] },
    pagination: {
      page: 1,
      pageCount: 1,
      previousAction: "previous-page",
      nextAction: "next-page",
    },
    alert: { tone, message: content || label },
    dialog: {
      title: label || "Dialog",
      open: true,
      dismissAction: "close-dialog",
    },
    toast: { tone, message: content || label },
    tooltip: { content: content || label },
    "empty-state": { title: label || "Empty", message: content || "No items" },
    spinner: { label: label || "Loading", size: "medium" },
    component: { component: label || "component" },
    terminal: { title: label || "Terminal", columns: 100, rows: 30 },
    command: { prompt: "$", content },
    prompt: { label: label || "Prompt", inputType: "text", action },
    output: { content },
  };
  return values[type] ?? { content };
};
const nodeProps = (item: PuckItem) =>
  item.type === "Heading"
    ? { content: item.props.text }
    : item.type === "Button"
      ? { label: item.props.label }
      : item.type === "Text"
        ? { content: item.props.text }
        : item.type === "PrismBlock"
          ? genericProps(item)
          : { direction: "vertical", gap: item.props.gap };
const flattenPrism = (
  nodes: PrismNode[],
  parentId: string,
): PositionedPrism[] =>
  nodes.flatMap((node, index) => [
    { node, parentId, index },
    ...flattenPrism(node.children ?? [], node.id),
  ]);
const flattenPuck = (items: PuckItem[], parentId: string): PositionedPuck[] =>
  items.flatMap((item, index) => [
    { item, parentId, index },
    ...flattenPuck(childItems(item), String(item.props.id)),
  ]);
const safeId = (
  raw: unknown,
  document: PrismDocument,
  type: string,
  index: number,
) =>
  /^[a-z][a-z0-9-]{1,79}$/.test(String(raw))
    ? String(raw)
    : `node-${document.meta.revision}-${type}-${index}`;
const defaultChildren = (type: string, base: string): PrismNode[] =>
  type === "split" || type === "overlay"
    ? [1, 2].map((value) => ({
        id: `${base}-region-${value}`,
        type: "stack",
        props: { direction: "vertical" },
        children: [],
      }))
    : type === "scroll"
      ? [
          {
            id: `${base}-content`,
            type: "stack",
            props: { direction: "vertical" },
            children: [],
          },
        ]
      : type === "tooltip"
        ? [
            {
              id: `${base}-trigger`,
              type: "button",
              props: { label: "Help", variant: "quiet", action: "help" },
            },
          ]
        : [];
const toPrismNode = (
  item: PuckItem,
  document: PrismDocument,
  index: number,
): PrismNode => {
  const type =
    item.type === "PrismBlock"
      ? String(item.props.nodeType ?? "text")
      : nodeType(item.type);
  const id = safeId(item.props.id, document, type, index);
  const explicitChildren = childItems(item).map((child, childIndex) =>
    toPrismNode(child, document, childIndex),
  );
  const children = explicitChildren.length
    ? explicitChildren
    : defaultChildren(type, id);
  return {
    id,
    type,
    props:
      type === "button"
        ? { ...nodeProps(item), variant: "primary", action: "preview-action" }
        : nodeProps(item),
    ...(children.length ? { children } : {}),
  };
};

export function puckChangeToOperation(
  document: PrismDocument,
  next: Data,
  viewId = "home",
): PrismOperation | null {
  const current = flattenPrism(
    document.views[viewId]?.root.children ?? [],
    document.views[viewId]?.root.id ?? `${viewId}-root`,
  );
  const incoming = flattenPuck(
    next.content as PuckItem[],
    document.views[viewId]?.root.id ?? `${viewId}-root`,
  );
  const currentIds = new Set(current.map((entry) => entry.node.id));
  const incomingIds = new Set(
    incoming.map((entry) => String(entry.item.props.id)),
  );
  const operations: PrismOperation[] = [];
  const removedIds = new Set(
    current
      .filter((entry) => !incomingIds.has(entry.node.id))
      .map((entry) => entry.node.id),
  );
  for (const removed of current.filter(
    (entry) => removedIds.has(entry.node.id) && !removedIds.has(entry.parentId),
  ))
    operations.push({
      type: "node.remove",
      baseRevision: document.meta.revision,
      nodeId: removed.node.id,
    });
  const insertedIds = new Set(
    incoming
      .filter((entry) => !currentIds.has(String(entry.item.props.id)))
      .map((entry) => String(entry.item.props.id)),
  );
  for (const inserted of incoming.filter(
    (entry) =>
      insertedIds.has(String(entry.item.props.id)) &&
      !insertedIds.has(entry.parentId),
  ))
    operations.push({
      type: "node.insert",
      baseRevision: document.meta.revision,
      parentId: inserted.parentId,
      index: inserted.index,
      node: toPrismNode(inserted.item, document, inserted.index),
    });
  for (const entry of incoming) {
    const id = String(entry.item.props.id);
    const before = current.find((candidate) => candidate.node.id === id);
    if (
      before &&
      (before.parentId !== entry.parentId || before.index !== entry.index)
    )
      operations.push({
        type: "node.move",
        baseRevision: document.meta.revision,
        nodeId: id,
        parentId: entry.parentId,
        index: entry.index,
      });
  }
  for (const entry of incoming) {
    const id = String(entry.item.props.id);
    const before = current.find((candidate) => candidate.node.id === id);
    const props = nodeProps(entry.item);
    if (
      before &&
      Object.entries(props).some(
        ([key, value]) => before.node.props?.[key] !== value,
      )
    )
      operations.push({
        type: "node.props.set",
        baseRevision: document.meta.revision,
        nodeId: id,
        props,
      });
  }
  if (!operations.length) return null;
  if (operations.length === 1) return operations[0]!;
  return {
    type: "operation.batch",
    baseRevision: document.meta.revision,
    operations,
  };
}
