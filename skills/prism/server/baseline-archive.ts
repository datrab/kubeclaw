import { pngDimensions } from '../engine/render-dimensions.ts';
import {
  assembleBaselineArchive,
  BASELINE_V2,
} from "@kubeclaw/prism-contracts-v1/baseline-archive";
import type {
  baselineSpecification,
  validateBaseline,
} from "./baseline-validation.ts";
import type { ControlContext } from "./control-context.ts";
export async function baselineArchive(
  context: Pick<ControlContext, "artifacts" | "runWorker" | "config">,
  approvalId: string,
  validated: Awaited<ReturnType<typeof validateBaseline>>,
  evidence: Awaited<ReturnType<typeof baselineSpecification>>,
) {
  const { currentDocument, approval, quality, warningIds } = validated;
  const { specification, criteria } = evidence;
  const textFiles: Record<string, string> = {
    "design-document.json": JSON.stringify(currentDocument.document),
    "design-specification.md": specification,
    "acceptance-criteria.json": JSON.stringify(criteria),
    "quality-report.json": JSON.stringify({
      ...quality,
      acceptedWarningIds: warningIds,
    }),
  };
  const { binaryFiles, manifestAssets, renderAssetSources } =
    await baselineAssets(context.artifacts, currentDocument.document, context.config.maximumRenderAssetBytes);
  await baselinePreviews(
    context.runWorker,
    currentDocument.document,
    approvalId,
    renderAssetSources,
    binaryFiles,
    textFiles,
  );
  const assembled = assembleBaselineArchive({
    // Select the new format only for a genuinely new publication. The
    // existing-baseline early return above keeps saved approvals/CAS bytes.
    profile: BASELINE_V2,
    textFiles,
    binaryFiles,
    manifest: {
      bundleId: `${currentDocument.document.meta.projectId.slice(0, 71)}-baseline`,
      projectId: currentDocument.document.meta.projectId,
      revision: currentDocument.document.meta.revision,
      designDocument: {
        path: "design-document.json",
        schema: "prism.design-document.v1",
        revision: currentDocument.document.meta.revision,
      },
      designSpecification: { path: "design-specification.md" },
      acceptanceCriteria: { path: "acceptance-criteria.json" },
      assets: manifestAssets,
      previews: { path: "previews/index.json" },
      createdAt: new Date(approval.approved_at).toISOString(),
    },
  });
  return assembled;
}

import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";
import { sha256 } from "./control-http.ts";
export async function baselineAssets(
  artifacts: ControlContext["artifacts"],
  document: PrismDocument,
  maximumRenderAssetBytes: number,
) {
  const binaryFiles: Record<string, string> = {};
  const manifestAssets: Record<
    string,
    { path: string; mediaType: string; digest: string }
  > = {};
  const renderAssetSources: Record<string, string> = {};
  let renderAssetBytes = 0;
  for (const [assetId, rawAsset] of Object.entries(document.assets)) {
    const asset = rawAsset as { artifact?: string; mediaType?: string };
    if (!asset.artifact || !asset.mediaType)
      throw new Error(`asset metadata is incomplete for ${assetId}`);
    const bytes = await artifacts.get(asset.artifact);
    renderAssetBytes += bytes.byteLength;
    if (renderAssetBytes > maximumRenderAssetBytes)
      throw new Error(`render assets exceed the ${maximumRenderAssetBytes / 1_000_000} MB baseline limit`);
    const extension =
      asset.mediaType === "image/png"
        ? "png"
        : asset.mediaType === "image/webp"
          ? "webp"
          : asset.mediaType === "image/svg+xml"
            ? "svg"
            : asset.mediaType === "font/woff2"
              ? "woff2"
              : "bin";
    const path = `assets/${assetId}.${extension}`;
    binaryFiles[path] = Buffer.from(bytes).toString("base64");
    renderAssetSources[assetId] =
      `data:${asset.mediaType};base64,${binaryFiles[path]}`;
    manifestAssets[assetId] = {
      path,
      mediaType: asset.mediaType,
      digest: sha256(bytes),
    };
  }
  return { binaryFiles, manifestAssets, renderAssetSources };
}

import { validatePrism } from "@kubeclaw/prism-contracts-v1";
interface PreviewFiles {
  binaryFiles: Record<string, string>;
  textFiles: Record<string, string>;
  previewEntries: Array<Record<string, unknown>>;
}
export async function baselinePreviews(
  runWorker: ControlContext["runWorker"],
  document: PrismDocument,
  approvalId: string,
  renderAssetSources: Record<string, string>,
  binaryFiles: Record<string, string>,
  textFiles: Record<string, string>,
) {
  const files: PreviewFiles = { binaryFiles, textFiles, previewEntries: [] };
  for (const [view, value] of Object.entries(document.views))
    for (const state of Object.keys(value.states))
      for (const viewport of ["compact", "regular", "wide"] as const) {
        await renderBaselinePreview(
          runWorker,
          document,
          approvalId,
          renderAssetSources,
          files,
          { view, state, viewport },
        );
      }
  const previewIndex = {
    schema: "prism.preview-index.v1",
    previews: files.previewEntries,
  };
  validatePrism("previewIndex", previewIndex);
  textFiles["previews/index.json"] = JSON.stringify(previewIndex);
}
async function renderBaselinePreview(
  runWorker: ControlContext["runWorker"],
  document: PrismDocument,
  approvalId: string,
  renderAssetSources: Record<string, string>,
  files: PreviewFiles,
  target: {
    view: string;
    state: string;
    viewport: "compact" | "regular" | "wide";
  },
) {
  const { view, state, viewport } = target;
  const { binaryFiles, textFiles, previewEntries } = files;
  const widths = { compact: 390, regular: 768, wide: 1440 } as const;
  const targetKey = `${view}-${state}-${viewport}`;
  const id = `${view.slice(0, 30)}-${state.slice(0, 20)}-${viewport}-${sha256(targetKey).slice(7, 15)}`;
  const rendered = await runWorker(
    "render",
    {
      document: document,
      view,
      state,
      viewport,
      capture: true,
      assetSources: renderAssetSources,
    },
    `${approvalId}:render:${id}`,
  );
  requireRenderEvidence(rendered, id);
  const previewPath = `previews/${id}.png`;
  const ariaPath = `previews/${id}.aria.txt`;
  binaryFiles[previewPath] = rendered.screenshotBase64;
  textFiles[ariaPath] = rendered.ariaSnapshot;
  const screenshot = Buffer.from(rendered.screenshotBase64, "base64");
  const selected = (rendered.renderer as { policyVersion?: unknown } | undefined)?.policyVersion === 'prism-render-policy.v1';
  const dimensions = selected ? pngDimensions(screenshot) : { width: widths[viewport], height: 1000 };
  const previewDigest = sha256(screenshot);
  const ariaDigest = sha256(rendered.ariaSnapshot);
  previewEntries.push({
    id,
    view,
    state,
    viewport,
    path: previewPath,
    width: dimensions.width,
    height: dimensions.height,
    fidelity: "intent",
    digest: previewDigest,
    ariaPath,
    ariaDigest,
    renderer: rendered.renderer,
  });
}

function requireRenderEvidence(
  rendered: Record<string, unknown>,
  id: string,
): asserts rendered is Record<string, unknown> & {
  screenshotBase64: string;
  ariaSnapshot: string;
} {
  if (
    typeof rendered.screenshotBase64 !== "string" ||
    typeof rendered.ariaSnapshot !== "string"
  )
    throw new Error(`render evidence is missing for ${id}`);
  if (!Array.isArray(rendered.accessibilityFindings))
    throw new Error(`rendered accessibility evidence is missing for ${id}`);
  if (rendered.accessibilityFindings.length)
    throw new Error(
      `rendered accessibility gate failed for ${id}: ${rendered.accessibilityFindings.join(",")}`,
    );
}
