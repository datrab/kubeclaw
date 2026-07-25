import { getLifecycleModuleState } from "../status-store-lifecycle.ts";
import { READ_MODEL_SOURCE_CANONICAL_EVENTS } from "./common.ts";

export const MODULE_PENDING_STATUS = "PENDING";
export function getAuthoritativeModuleState(
  config: any,
  moduleId: any,
  _options: any = {},
): any {
  if (!moduleId) return null;
  return getLifecycleModuleState(config, moduleId) ?? null;
}
export function authoritativeModuleStatus(authoritative: any): string {
  return typeof authoritative?.status === "string" &&
    authoritative.status.trim()
    ? authoritative.status
    : MODULE_PENDING_STATUS;
}
export function projectionSourceAuthority(authoritative: any): any {
  return authoritative.projection_source !== undefined &&
    authoritative.projection_source !== null
    ? authoritative.projection_source
    : READ_MODEL_SOURCE_CANONICAL_EVENTS;
}
export function lifecycleProjectionSourceAuthority(authoritative: any): any {
  if (
    authoritative.projection_source !== undefined &&
    authoritative.projection_source !== null
  )
    return authoritative.projection_source;
  if (
    authoritative.read_model_source !== undefined &&
    authoritative.read_model_source !== null
  )
    return authoritative.read_model_source;
  return READ_MODEL_SOURCE_CANONICAL_EVENTS;
}
