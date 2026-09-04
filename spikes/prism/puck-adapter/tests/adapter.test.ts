import { describe, expect, it } from "vitest";
import type { AppState, Data, PuckAction } from "@puckeditor/core";
import { actionToOperation, projectDocument } from "../src/adapter.js";
import { applyOperation, type PrismDocument } from "../src/domain.js";

const document: PrismDocument = {
  revision: 1,
  root: {
    id: "root",
    type: "stack",
    props: { gap: 16 },
    children: [
      { id: "title", type: "heading", props: { content: "Deployments" } },
      {
        id: "grid",
        type: "grid",
        props: { columns: 2 },
        children: [{ id: "status", type: "status", props: { label: "Ready" } }],
      },
    ],
  },
};

const state = (data: Data): AppState => ({ data, ui: {} as AppState["ui"] });

describe("Puck adapter", () => {
  it("projects stable IDs and nested declared zones", () => {
    const data = projectDocument(document);
    expect(data.content.map((item) => item.props.id)).toEqual(["title", "grid"]);
    expect(data.zones?.["grid:children"]?.[0]?.props.id).toBe("status");
  });

  it("maps an actual Puck move action to a typed Prism operation", () => {
    const before = state(projectDocument(document));
    const afterData = structuredClone(before.data);
    afterData.content.splice(1, 0, afterData.zones!["grid:children"].splice(0, 1)[0]!);
    const action: PuckAction = {
      type: "move",
      sourceIndex: 0,
      sourceZone: "grid:children",
      destinationIndex: 1,
      destinationZone: "root",
    };
    const operation = actionToOperation(action, state(afterData), before);
    expect(operation).toEqual({ type: "node.move", nodeId: "status", parentId: "root", index: 1 });
    const result = applyOperation(document, operation!);
    expect(result.root.children?.map((node) => node.id)).toEqual(["title", "status", "grid"]);
  });

  it("maps property replacement without accepting identity changes", () => {
    const before = state(projectDocument(document));
    const afterData = structuredClone(before.data);
    afterData.content[0]!.props.content = "Services";
    const action: PuckAction = {
      type: "replace",
      destinationIndex: 0,
      destinationZone: "root",
      data: afterData.content[0]!,
    };
    const operation = actionToOperation(action, state(afterData), before);
    const result = applyOperation(document, operation!);
    expect(result.root.children?.[0]?.props.content).toBe("Services");
    expect(result.revision).toBe(2);
  });

  it("assigns fresh IDs to every node in a duplicated subtree", () => {
    const result = applyOperation(document, {
      type: "node.duplicate",
      nodeId: "grid",
      newNodeId: "grid-copy",
    });
    const original = result.root.children?.find((node) => node.id === "grid");
    const duplicate = result.root.children?.find((node) => node.id === "grid-copy");
    expect(duplicate?.children?.[0]?.id).not.toBe(original?.children?.[0]?.id);
    expect(duplicate?.children?.[0]?.id).toBe("grid-copy-copy-1");
  });

  it("rejects Puck state replacement as a canonical operation", () => {
    const current = state(projectDocument(document));
    expect(() => actionToOperation({ type: "setData", data: {} }, current, current)).toThrow(
      "not canonical",
    );
  });

  it("round-trips a saved document without canonical Puck state", () => {
    const operation = {
      type: "node.props.set" as const,
      nodeId: "status",
      props: { label: "Degraded" },
    };
    const saved = JSON.stringify(applyOperation(document, operation));
    const reloaded = JSON.parse(saved) as PrismDocument;
    expect(projectDocument(reloaded)).toEqual(projectDocument(JSON.parse(saved) as PrismDocument));
  });
});
