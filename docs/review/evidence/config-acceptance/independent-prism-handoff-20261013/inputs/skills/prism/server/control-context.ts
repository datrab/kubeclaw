import type { IncomingMessage } from "node:http";
import { runNativePrismOperation } from "../control/native-operation.ts";
import { verifySession } from "../control/session.ts";
import {
  ContentAddressedArtifactStore,
  RevisionRepository,
  type Database,
} from "../storage/index.ts";
import type { loadControlServerConfig } from "./control-config.ts";
import { cookies } from "./control-http.ts";
export function createControlContext(
  pool: Database,
  config: ReturnType<typeof loadControlServerConfig>,
) {
  const repository = new RevisionRepository(pool),
    artifacts = new ContentAddressedArtifactStore(config.artifactRoot);
  return Object.freeze({
    pool,
    repository,
    artifacts,
    config,
    runWorker: (
      operation: "generate" | "render" | "evaluate" | "ingest" | "publish",
      input: Record<string, unknown>,
      idempotencyKey: string,
    ) =>
      runNativePrismOperation(
        pool,
        artifacts,
        config,
        operation,
        input,
        idempotencyKey,
      ),
  });
}
export type ControlContext = ReturnType<typeof createControlContext>;
export function authenticated(
  context: ControlContext,
  request: IncomingMessage,
) {
  const { sessionSecret } = context.config;
  const values = cookies(request);
  const session = verifySession(values.prism_session ?? "", sessionSecret);
  const csrf = values.prism_csrf ?? "";
  if (
    !["GET", "HEAD"].includes(request.method ?? "") &&
    (!csrf || request.headers["x-prism-csrf"] !== csrf)
  )
    throw new Error("invalid CSRF token");
  return { user: session.user, roles: session.roles, csrf };
}
export type AuthenticatedControlContext = ControlContext & {
  readonly actor: ReturnType<typeof authenticated>;
};
