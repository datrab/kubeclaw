import type { AppState, Data, PuckAction } from "@puckeditor/core";
import type { PrismDocument, PrismNode, PrismOperation } from "./domain.js";

type PuckItem = Data["content"][number];

const zoneFor = (parentId: string): string => `${parentId}:children`;
const parentFromZone = (zone: string): string => {
  if (zone === "root") return "root";
  if (!zone.endsWith(":children")) throw new Error(`unsupported Puck zone: ${zone}`);
  return zone.slice(0, -":children".length);
};

const toPuckItem = (node: PrismNode): PuckItem => ({
  type: node.type,
  props: { ...node.props, id: node.id },
});

const toPrismNode = (item: PuckItem): PrismNode => {
  const id = item.props.id;
  if (typeof id !== "string" || !id) throw new Error("Puck item has no Prism node ID");
  const { id: _id, ...props } = item.props;
  const type = item.type as PrismNode["type"];
  if (!["stack", "grid", "split", "heading", "text", "button", "status"].includes(type)) {
    throw new Error(`unsupported component type: ${item.type}`);
  }
  return { id, type, props };
};

export const projectDocument = (document: PrismDocument): Data => {
  const zones: NonNullable<Data["zones"]> = {};
  const visit = (node: PrismNode): void => {
    if (node.children) {
      zones[zoneFor(node.id)] = node.children.map(toPuckItem);
      node.children.forEach(visit);
    }
  };
  visit(document.root);
  return {
    root: { props: { title: "Prism editor" } },
    content: (document.root.children ?? []).map(toPuckItem),
    zones,
  };
};

const itemAt = (state: AppState, zone: string, index: number): PuckItem => {
  const items = zone === "root" ? state.data.content : state.data.zones?.[zone];
  const item = items?.[index];
  if (!item) throw new Error(`missing Puck item at ${zone}[${index}]`);
  return item;
};

export const actionToOperation = (
  action: PuckAction,
  nextState: AppState,
  previousState: AppState,
): PrismOperation | null => {
  if (action.type === "insert") {
    const inserted = itemAt(nextState, action.destinationZone, action.destinationIndex);
    return {
      type: "node.insert",
      parentId: parentFromZone(action.destinationZone),
      index: action.destinationIndex,
      node: toPrismNode(inserted),
    };
  }
  if (action.type === "remove") {
    return { type: "node.remove", nodeId: String(itemAt(previousState, action.zone, action.index).props.id) };
  }
  if (action.type === "duplicate") {
    const oldItem = itemAt(previousState, action.sourceZone, action.sourceIndex);
    const newItem = itemAt(nextState, action.sourceZone, action.sourceIndex + 1);
    return {
      type: "node.duplicate",
      nodeId: String(oldItem.props.id),
      newNodeId: String(newItem.props.id),
    };
  }
  if (action.type === "move" || action.type === "reorder") {
    const sourceZone = action.type === "move" ? action.sourceZone : action.destinationZone;
    const item = itemAt(previousState, sourceZone, action.sourceIndex);
    return {
      type: "node.move",
      nodeId: String(item.props.id),
      parentId: parentFromZone(action.destinationZone),
      index: action.destinationIndex,
    };
  }
  if (action.type === "replace") {
    const oldItem = itemAt(previousState, action.destinationZone, action.destinationIndex);
    const nextItem = itemAt(nextState, action.destinationZone, action.destinationIndex);
    const { id: _id, ...props } = nextItem.props;
    if (oldItem.props.id !== nextItem.props.id || oldItem.type !== nextItem.type) {
      throw new Error("replace cannot change Prism identity or node type");
    }
    return { type: "node.props.set", nodeId: String(nextItem.props.id), props };
  }
  if (["setUi", "registerZone", "unregisterZone"].includes(action.type)) return null;
  throw new Error(`Puck action is not canonical: ${action.type}`);
};
