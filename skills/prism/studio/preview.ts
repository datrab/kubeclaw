import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";
import type { PreviewAssets } from "./preview-assets.ts";
import { renderNode } from "../renderer/index.ts";
import { resolveView, type Viewport } from "../domain/index.ts";
export function previewDocument(
  document: PrismDocument,
  viewId = "home",
  state = "default",
  viewport: Viewport = "wide",
  assets: PreviewAssets = {},
): string {
  const root = resolveView(document, viewId, state, viewport);
  const children = root.children ?? [];
  const emptyLayout = ["stack", "grid", "split", "scroll", "overlay"].includes(root.type) && children.length === 0;
  let content: string;
  try {
    content =
      emptyLayout
        ? '<section role="status"><h1>Empty view</h1><p>Insert a component to continue.</p></section>'
        : renderNode(root, assets, {
            data: document.views[viewId]?.mockData as
              Record<string, unknown> | undefined,
            components: document.components,
            theme: document.theme as Record<string, unknown>,
          });
  } catch {
    content =
      '<section role="alert"><h1>Preview unavailable</h1><p>The document contains an unsupported component.</p></section>';
  }
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-prism-selection';"><style>body{font-family:system-ui;margin:0;padding:clamp(24px,6vw,80px)}[data-prism-id]{cursor:pointer}[data-prism-id]:hover{outline:2px solid #5b8cff;outline-offset:2px}</style><main>${content}</main><script nonce="prism-selection">addEventListener('click',event=>{const node=event.target.closest('[data-prism-id]');const action=event.target.closest('[data-prism-action]');if(!node&&!action)return;event.preventDefault();if(node)parent.postMessage({schema:'prism.selection.v1',nodeId:node.dataset.prismId},'*');if(action){const owner=action.closest('[data-prism-id]');parent.postMessage({schema:'prism.action.v1',nodeId:owner?.dataset.prismId,action:action.dataset.prismAction},'*')}});</script>`;
}
