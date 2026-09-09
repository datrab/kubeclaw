import type { Config } from "@puckeditor/core";
import type { Props } from "./projection.ts";

const nodeTypes = [
  "grid",
  "split",
  "scroll",
  "overlay",
  "image",
  "icon",
  "divider",
  "code",
  "link",
  "text-input",
  "select",
  "checkbox",
  "list",
  "table",
  "badge",
  "progress",
  "chart",
  "navigation",
  "tabs",
  "breadcrumb",
  "pagination",
  "alert",
  "dialog",
  "toast",
  "tooltip",
  "empty-state",
  "spinner",
  "component",
  "terminal",
  "command",
  "prompt",
  "output",
];
export const config: Config<Props> = {
  components: {
    Stack: {
      fields: {
        gap: { type: "number", min: 0, max: 48 },
        content: { type: "slot" },
      },
      defaultProps: { gap: 16, content: [] },
      render: ({ gap, content: Content }) => (
        <section className="canvas-stack" style={{ gap }}>
          <Content />
        </section>
      ),
    },
    Heading: {
      fields: { text: { type: "text", contentEditable: true } },
      defaultProps: { text: "Heading" },
      render: ({ text }) => <h2>{text}</h2>,
    },
    Text: {
      fields: { text: { type: "textarea", contentEditable: true } },
      defaultProps: { text: "Text" },
      render: ({ text }) => <p>{text}</p>,
    },
    Button: {
      fields: { label: { type: "text", contentEditable: true } },
      defaultProps: { label: "Continue" },
      render: ({ label }) => (
        <button type="button" className="preview-button">
          {label}
        </button>
      ),
    },
    PrismBlock: {
      fields: {
        nodeType: {
          type: "select",
          options: nodeTypes.map((value) => ({ label: value, value })),
        },
        label: { type: "text", contentEditable: true },
        text: { type: "textarea" },
        action: { type: "text" },
        tone: {
          type: "select",
          options: [
            "default",
            "muted",
            "info",
            "success",
            "warning",
            "danger",
          ].map((value) => ({ label: value, value })),
        },
        content: { type: "slot" },
      },
      defaultProps: {
        nodeType: "alert",
        label: "",
        text: "Describe this item",
        action: "",
        tone: "default",
        content: [],
      },
      render: ({ nodeType, label, text, content: Content }) => (
        <section data-prism-type={nodeType} className="generic-block">
          <strong>{label || nodeType}</strong>
          {text ? <p>{text}</p> : null}
          <Content />
        </section>
      ),
    },
  },
};
