import type { PipelineBootCapture } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Console } from "node:console";
import type { Database } from "../storage/index.ts";
import { agentRoutes } from "./agent-routes.ts";
import { approvalRoute } from "./approval-route.ts";
import { artifactRoute } from "./artifact-route.ts";
import { baselineRoute } from "./baseline-route.ts";
import { loadControlCompositionConfig } from "./control-config.ts";
import {
  authenticated,
  createControlContext,
  type ControlContext,
} from "./control-context.ts";
import { json } from "./control-http.ts";
import { corpusRoutes } from "./corpus-routes.ts";
import { directionRoutes } from "./direction-routes.ts";
import { dispatchRoute } from "./dispatch-route.ts";
import { documentHistoryRoutes, documentRoutes } from "./document-routes.ts";
import { engineRoute } from "./engine-route.ts";
import { handleInternalArtifact } from "./internal-artifacts.ts";
import { preferenceRoutes } from "./preference-routes.ts";
import { productAuthorityHandler } from "./product-decisions.ts";
import { projectRoutes } from "./project-routes.ts";
import { sessionRoutes } from "./session-routes.ts";
// Match the original Console(ignoreErrors:true) policy. The closed-descriptor
// regression verifies preserved responses and availability for that failure.
const diagnostics = new Console({
  stdout: process.stdout,
  stderr: process.stderr,
  ignoreErrors: true,
});

async function handle(
  context: ControlContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  try {
    const url = new URL(request.url ?? "/", "http://prism-control");
    if (await handlePublic(context, request, response, url)) return;
    return await handleApplication(context, request, response, url);
  } catch (error) {
    diagnostics.error("[prism-control] request failed", {
      method: request.method,
      path: request.url,
      error: error instanceof Error ? error.message : "request failed",
    });
    return json(response, error instanceof SyntaxError ? 400 : 422, {
      error: error instanceof Error ? error.message : "request failed",
    });
  }
}
/** Compose the original HTTP service; the caller owns database/listener lifetime. */
export async function createControlServer(
  pool: Database,
  capture: PipelineBootCapture,
  environment?: NodeJS.ProcessEnv,
) {
  return createConfiguredControlServer(
    pool,
    await loadControlCompositionConfig(capture, environment),
  );
}

/** Build the HTTP service from the already captured production composition. */
export function createConfiguredControlServer(
  pool: Database,
  composition: Awaited<ReturnType<typeof loadControlCompositionConfig>>,
) {
  const { service: config, product: productConfig } = composition;
  const context = createControlContext(pool, config);
  return createServer(
    productAuthorityHandler(
      (request, response) => handle(context, request, response),
      { db: pool, config: productConfig, sessionSecret: config.sessionSecret, productDecisionLifetimeMs: config.productDecisionLifetimeMs, productDecisionHistoryLimit: config.productDecisionHistoryLimit, maximumProductInputBytes: config.maximumProductInputBytes, productControllerTimeoutMs: config.productControllerTimeoutMs, maximumProductControllerResponseBytes: config.maximumProductControllerResponseBytes, maximumProductControllerTokenCharacters: config.maximumProductControllerTokenCharacters },
    ),
  );
}

async function handlePublic(
  context: ControlContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === "/health") {
    json(response, 200, { status: "ok" });
    return true;
  }
  if (url.pathname === "/ready") {
    await context.pool.query("SELECT 1");
    json(response, 200, { status: "ready" });
    return true;
  }
  const {
    spiffeEnabled,
    workerSecret,
    trustedWorkerSpiffeId,
    trustedControlSpiffeId,
    trustedPrismAgentSpiffeId,
  } = context.config;
  if (
    await handleInternalArtifact(request, response, url, {
      maximumInternalEvidenceBytes: context.config.maximumInternalEvidenceBytes,
      artifacts: context.artifacts,
      spiffeEnabled,
      workerSecret,
      trustedWorkerSpiffeId,
      trustedControlSpiffeId,
      trustedPrismAgentSpiffeId,
    })
  )
    return true;
  if (await sessionRoutes(context, request, response, url)) return true;
  if (await dispatchRoute(context, request, response, url)) return true;
  if (await agentRoutes(context, request, response, url)) return true;
  return false;
}
async function handleApplication(
  context: ControlContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) {
  const actor = authenticated(context, request);
  const application = { ...context, actor };
  if (await projectRoutes(application, request, response, url)) return;
  if (await documentRoutes(application, request, response, url)) return;
  if (await directionRoutes(application, request, response, url)) return;
  if (await documentHistoryRoutes(application, request, response, url)) return;
  if (await engineRoute(application, request, response, url)) return;
  if (await approvalRoute(application, request, response, url)) return;
  if (await baselineRoute(application, request, response, url)) return;
  if (await corpusRoutes(application, request, response, url)) return;
  if (await preferenceRoutes(application, request, response, url)) return;
  if (await artifactRoute(application, request, response, url)) return;
  return json(response, 404, { error: "not found" });
}
