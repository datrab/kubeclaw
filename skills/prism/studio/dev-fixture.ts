import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";

export const developmentDocument: PrismDocument = {
  meta: {
    schema: "prism.design-document.v1",
    documentId: "studio-development",
    projectId: "studio-development",
    revision: 1,
    title: "Studio development",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  theme: {
    colors: {
      background: "#0b0d10",
      surface: "#15181d",
      text: "#f4f6f8",
      action: "#f97316",
    },
    typography: { body: { family: "Inter", fallback: ["system-ui"] } },
    space: { small: 8, medium: 16, large: 24 },
    breakpoints: { compact: 0, regular: 768, wide: 1280 },
    rules: [],
  },
  assets: {},
  components: {},
  views: {
    home: {
      title: "Home",
      surface: "web",
      root: {
        id: "home-root",
        type: "stack",
        props: { direction: "vertical", gap: 16 },
        children: [
          {
            id: "page-heading",
            type: "heading",
            props: { content: "Deployments", level: 1 },
          },
        ],
      },
      states: { default: { patches: {} } },
      responsive: {
        compact: { patches: {} },
        regular: { patches: {} },
        wide: { patches: {} },
      },
    },
  },
  flows: {},
};
