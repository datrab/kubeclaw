import assert from "node:assert/strict";
import test from "node:test";
import { renderNode } from "../renderer/index.ts";

test("renderer escapes active content", () => {
  const output = renderNode({
    id: "unsafe-text",
    type: "text",
    props: { content: "<script>parent.hacked=true</script>" },
  });
  assert.doesNotMatch(output, /<script>/);
  assert.match(output, /&lt;script&gt;/);
});

test("renderer resolves collection data and reusable item components", () => {
  const context = {
    data: {
      services: { type: "list", value: [{ name: "API" }, { name: "Worker" }] },
    },
    components: {
      "service-row": {
        root: {
          id: "service-name",
          type: "text",
          props: { content: { $data: "name" } },
        },
      },
    },
  };
  const list = renderNode(
    {
      id: "services",
      type: "list",
      props: {
        data: { $data: "services" },
        itemComponent: "service-row",
        emptyText: "No services",
        ordered: true,
      },
    } as any,
    {},
    context,
  );
  assert.match(list, /API/);
  assert.match(list, /Worker/);
  assert.match(list, /<ol>/);
  assert.doesNotMatch(list, /No services/);
  const table = renderNode(
    {
      id: "service-table",
      type: "table",
      props: {
        data: { $data: "services" },
        columns: [{ field: "name", label: "Name" }],
        emptyText: "No services",
      },
    } as any,
    {},
    context,
  );
  assert.match(table, /<td>API<\/td>/);
});
test("renderer fails closed for unknown components", () =>
  assert.throws(
    () => renderNode({ id: "bad-node", type: "raw-html" }),
    /unsupported/,
  ));
test("renderer resolves theme tokens and layout properties", () => {
  const output = renderNode(
    {
      id: "panel",
      type: "stack",
      props: {
        direction: "vertical",
        gap: "$space.medium",
        padding: "$space.small",
        background: "$colors.surface",
        foreground: "$colors.text",
        radius: "$radius.panel",
        shadow: "$shadow.panel",
        width: "fill",
      },
      children: [{ id: "copy", type: "text", props: { content: "Ready" } }],
    } as any,
    {},
    {
      theme: {
        colors: { surface: "#15181d", text: "#f4f6f8" },
        space: { small: 8, medium: 16 },
        radius: { panel: 6 },
        shadow: { panel: "0 4px 16px rgba(0,0,0,.16)" },
      },
    },
  );
  assert.match(output, /display:flex/);
  assert.match(output, /gap:16px/);
  assert.match(output, /padding:8px/);
  assert.match(output, /background:#15181d/);
  assert.match(output, /color:#f4f6f8/);
  assert.match(output, /border-radius:6px/);
  assert.match(output, /box-shadow:0 4px 16px rgba\(0,0,0,\.16\)/);
  assert.match(output, /width:100%/);
});
test("renderer emits only declarative action identities", () => {
  const output = renderNode({
    id: "continue",
    type: "button",
    props: { label: "Continue", variant: "primary", action: "continue-flow" },
  } as any);
  assert.match(output, /data-prism-action="continue-flow"/);
  assert.doesNotMatch(output, /onclick|javascript:/i);
});
test("renderer applies semantic typography tokens", () => {
  const output = renderNode(
    { id: "title", type: "heading", props: { content: "Status", level: 1, style: "$typography.display" } } as any,
    {},
    { theme: { typography: { display: { family: "Inter", fallback: ["system-ui"], size: 32, weight: 700, lineHeight: 1.1 } } } },
  );
  assert.match(output, /font-family:Inter,system-ui/);
  assert.match(output, /font-size:32px/);
  assert.match(output, /font-weight:700/);
});
test("renderer uses semantic output for the full v1 catalogue", () => {
  const nodes = [
    { id: "image-one", type: "image", props: { asset: "asset-one" } },
    {
      id: "icon-one",
      type: "icon",
      props: { asset: "asset-one", decorative: true },
    },
    { id: "divider-one", type: "divider", props: { direction: "horizontal" } },
    { id: "code-one", type: "code", props: { content: "echo safe" } },
    {
      id: "chart-one",
      type: "chart",
      props: {
        kind: "line",
        data: { $data: "chart-data" },
        yFields: ["value"],
        title: "Values",
      },
    },
    {
      id: "crumb-one",
      type: "breadcrumb",
      props: { items: [{ label: "Home", current: true }] },
    },
    {
      id: "page-one",
      type: "pagination",
      props: {
        page: 1,
        pageCount: 2,
        previousAction: "previous",
        nextAction: "next",
      },
    },
    {
      id: "toast-one",
      type: "toast",
      props: { tone: "success", message: "Saved" },
    },
    {
      id: "tip-one",
      type: "tooltip",
      props: { content: "Help" },
      children: [
        {
          id: "tip-button",
          type: "button",
          props: { label: "Help", variant: "quiet", action: "help" },
        },
      ],
    },
  ] as const;
  const output = nodes
    .map((node) =>
      renderNode(node as any, {
        "asset-one": { alt: "Product view", src: "data:image/png;base64,AA==" },
      }),
    )
    .join("");
  assert.match(output, /alt="Product view"/);
  assert.match(output, /src="data:image\/png;base64,AA=="/);
  assert.match(output, /role="img"/);
  assert.match(output, /aria-label="Breadcrumb"/);
  assert.match(output, /role="tooltip"/);
  assert.doesNotMatch(output, /\[object Object\]/);
});
