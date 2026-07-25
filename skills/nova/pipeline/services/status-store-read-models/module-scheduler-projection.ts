import { cloneSerializable } from "../serialization.ts";
import {
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
} from "./common.ts";
import {
  MODULE_PENDING_STATUS,
  authoritativeModuleStatus,
  getAuthoritativeModuleState,
  projectionSourceAuthority,
} from "./module-projection-authority.ts";

function defined(primary: any, secondary: any = null): any {
  return primary !== undefined && primary !== null ? primary : secondary;
}
function pendingState(moduleId: any, moduleConfig: any) {
  return {
    module_id: defined(moduleId, moduleConfig?.dir),
    module_dir: moduleConfig?.dir ?? null,
    title: moduleConfig?.title ?? null,
    status: MODULE_PENDING_STATUS,
    scheduler_consumed: false,
    completed: false,
    blocked: false,
    failed: false,
    projection_source: READ_MODEL_SOURCE_PENDING,
    ...buildProjectionSourceFields({
      readModelSource: READ_MODEL_SOURCE_PENDING,
      operatorProjectionSource: "module_scheduler_read_model",
    }),
    scheduler_drift: [],
    scheduler_drift_detected: false,
  };
}
function authoritativeIdentity(authoritative: any, moduleId: any, config: any) {
  return {
    module_id: defined(authoritative.module_id, defined(moduleId, config?.dir)),
    module_dir: defined(authoritative.module_dir, config?.dir),
    title: defined(config?.title, authoritative.title),
  };
}
function authoritativeState(
  authoritative: any,
  moduleId: any,
  moduleConfig: any,
) {
  const status = authoritativeModuleStatus(authoritative);
  return {
    ...authoritative,
    ...authoritativeIdentity(authoritative, moduleId, moduleConfig),
    status,
    scheduler_consumed: status === "PASS",
    completed: status === "PASS",
    blocked: status === "BLOCKED",
    failed: status === "FAIL",
    projection_source: projectionSourceAuthority(authoritative),
    ...buildProjectionSourceFields({
      readModelSource: defined(
        authoritative.read_model_source,
        READ_MODEL_SOURCE_CANONICAL_EVENTS,
      ),
      operatorProjectionSource: "module_scheduler_read_model",
    }),
    scheduler_drift: [],
    scheduler_drift_detected: false,
  };
}
export function projectModuleSchedulerState(
  config: any,
  moduleId: any,
  moduleConfig: any = null,
  options: any = {},
): any {
  void options.status;
  void options.statusRead;
  const authoritative = getAuthoritativeModuleState(config, moduleId, {
    dir: defined(moduleConfig?.dir, moduleId),
  });
  return cloneSerializable(
    authoritative
      ? authoritativeState(authoritative, moduleId, moduleConfig)
      : pendingState(moduleId, moduleConfig),
  );
}
