import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";
import fixture from "../../../contracts/prism/v1/fixtures/minimal-web.json" with { type: "json" };
import { puckChangeToOperation } from "../studio/puck-adapter.ts";
import { previewDocument } from "../studio/preview.ts";

test("desktop startup and failure panels remain visible", () => {
  const app = readFileSync(new URL("../studio/app.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../studio/studio.css", import.meta.url), "utf8");
  assert.equal(app.match(/className="start-panel"/gu)?.length, 2);
  assert.match(css, /\.start-panel\{[^}]*display:flex/u);
  assert.match(css, /\.mobile-nav,\.sheet\{display:none\}/u);
  assert.match(app, /No design requests yet\./u);
  assert.match(app, /Projects appear here after Nova sends an architecture to Prism\./u);
  assert.match(app, /Design generation pending\./u);
  assert.doesNotMatch(app, /createProject|Create project|Design directions could not be created/u);
});
test("Puck insertion becomes a typed canonical operation", () => {
  const operation = puckChangeToOperation(
    fixture as any,
    {
      root: { props: {} },
      content: [
        { type: "Heading", props: { id: "title", text: "Deployments" } },
        { type: "Button", props: { id: "unsafe id", label: "Inspect" } },
      ],
    } as any,
  );
  assert.equal(operation?.type, "node.insert");
  assert.match((operation as any).node.id, /^node-/);
  assert.equal((operation as any).node.props.action, "preview-action");
});
test("an empty canvas renders a safe empty state", () => {
  const empty = {
    ...fixture,
    views: {
      home: {
        ...fixture.views.home,
        root: { ...fixture.views.home.root, children: [] },
      },
    },
  };
  assert.match(previewDocument(empty as any), /Empty view/);
});

test("a valid leaf root renders as content", () => {
  const document=structuredClone(fixture) as PrismDocument;
  document.views.home.root={id:"leaf-heading",type:"heading",props:{content:"Leaf view",level:1}};
  const html=previewDocument(document);
  assert.match(html,/Leaf view/);
  assert.doesNotMatch(html,/Empty view/);
});

test("Puck preserves nested content and inserts into the correct parent", () => {
  const nested = {
    ...fixture,
    views: {
      home: {
        ...fixture.views.home,
        root: {
          ...fixture.views.home.root,
          children: [
            {
              id: "content-stack",
              type: "stack",
              props: { direction: "vertical", gap: 16 },
              children: [
                { id: "body", type: "text", props: { content: "Status" } },
              ],
            },
          ],
        },
      },
    },
  };
  const operation = puckChangeToOperation(
    nested as any,
    {
      root: { props: {} },
      content: [
        {
          type: "Stack",
          props: {
            id: "content-stack",
            gap: 16,
            content: [
              { type: "Text", props: { id: "body", text: "Status" } },
              { type: "Button", props: { id: "inspect", label: "Inspect" } },
            ],
          },
        },
      ],
    } as any,
  );
  assert.equal(operation?.type, "node.insert");
  assert.equal((operation as any).parentId, "content-stack");
  assert.equal((operation as any).node.id, "inspect");
});

test("Puck edits a nested node through a typed operation", () => {
  const nested = {
    ...fixture,
    views: {
      home: {
        ...fixture.views.home,
        root: {
          ...fixture.views.home.root,
          children: [
            {
              id: "content-stack",
              type: "stack",
              props: { direction: "vertical", gap: 16 },
              children: [
                { id: "body", type: "text", props: { content: "Status" } },
              ],
            },
          ],
        },
      },
    },
  };
  const operation = puckChangeToOperation(
    nested as any,
    {
      root: { props: {} },
      content: [
        {
          type: "Stack",
          props: {
            id: "content-stack",
            gap: 16,
            content: [
              { type: "Text", props: { id: "body", text: "Service status" } },
            ],
          },
        },
      ],
    } as any,
  );
  assert.equal(operation?.type, "node.props.set");
  assert.equal((operation as any).nodeId, "body");
  assert.equal((operation as any).props.content, "Service status");
});

test("one Puck change emits one atomic batch for multiple edits", () => {
  const operation = puckChangeToOperation(
    fixture as any,
    {
      root: { props: {} },
      content: [
        { type: "Heading", props: { id: "title", text: "Services" } },
        {
          type: "Button",
          props: { id: "primary-action", label: "Review" },
        },
      ],
    } as any,
  );
  assert.equal(operation?.type, "operation.batch");
  assert.equal((operation as any).operations.length, 2);
  assert.deepEqual(
    (operation as any).operations.map((item: any) => item.type),
    ["node.insert", "node.props.set"],
  );
});

test("the isolated preview uses the trusted renderer for every node", () => {
  const document = {
    ...fixture,
    views: {
      home: {
        ...fixture.views.home,
        root: {
          ...fixture.views.home.root,
          children: [
            ...fixture.views.home.root.children,
            { id: "body", type: "text", props: { content: "Service status" } },
          ],
        },
      },
    },
  };
  const html = previewDocument(document as any);
  assert.match(html, /<p data-prism-id="body"/);
  assert.match(html, /prism\.action\.v1/);
  assert.doesNotMatch(html, /<button[^>]*data-prism-id="body"/);
});
