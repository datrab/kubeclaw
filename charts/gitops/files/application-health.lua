-- App-of-apps waves must not accept a previous revision's Healthy status.
local pending = {status = "Progressing", message = "Waiting for the selected child revision"}
if obj.status == nil or obj.spec == nil then return pending end
local status = obj.status
local errors = {ComparisonError = true, InvalidSpecError = true, SyncError = true, UnknownError = true, SharedResourceWarning = true, RepeatedResourceWarning = true, ExcludedResourceWarning = true}
for _, condition in ipairs(status.conditions or {}) do
  if errors[condition.type or ""] then
    return {status = "Degraded", message = condition.message or condition.type}
  end
end
if status.operationState ~= nil and (status.operationState.phase == "Failed" or status.operationState.phase == "Error") then
  return {status = "Degraded", message = status.operationState.message or "Child sync failed"}
end
-- Manual platform children report workload health independently of sync status.
-- Runtime children retain the strict selected-revision gate below.
local annotations = obj.metadata and obj.metadata.annotations or {}
if annotations["kubeclaw.io/health-mode"] == "observed" then
  return {status = status.health and status.health.status or "Progressing", message = status.health and status.health.message or "Waiting for child health"}
end
if obj.spec.source == nil then return pending end
local sync = status.sync
if sync == nil or sync.status ~= "Synced" or sync.revision == nil then return pending end
-- Continuous children follow main at an immutable bundle path. Argo reports
-- the resolved commit in status, not the literal branch name. The compared
-- source/path checks below still reject a previous bundle's Healthy status.
if obj.spec.source.targetRevision ~= "main" and sync.revision ~= obj.spec.source.targetRevision then return pending end
local compared = sync.comparedTo
if compared == nil or compared.source == nil or compared.destination == nil then return pending end
for _, key in ipairs({"repoURL", "path", "targetRevision"}) do
  if compared.source[key] ~= obj.spec.source[key] then return pending end
end
if compared.source.directory == nil or obj.spec.source.directory == nil
  or compared.source.directory.include ~= obj.spec.source.directory.include then return pending end
for _, key in ipairs({"server", "namespace"}) do
  if compared.destination[key] ~= obj.spec.destination[key] then return pending end
end
if status.health == nil or status.health.status ~= "Healthy" then
  return {status = status.health and status.health.status or "Progressing", message = status.health and status.health.message or "Waiting for child health"}
end
if status.operationState == nil or status.operationState.phase ~= "Succeeded"
  or status.operationState.syncResult == nil
  or status.operationState.syncResult.revision == nil then return pending end
if status.operationState.syncResult.revision ~= sync.revision then
  -- A new main commit need not change this immutable release directory. Argo
  -- updates compared revision without running a redundant sync in that case.
  -- Require a successful operation for this exact bundle, not unrelated Git
  -- history; still reject old bundles, missing provenance and mutable sources.
  local source = obj.spec.source
  local applied = status.operationState.syncResult.source
  if source.targetRevision ~= "main" or applied == nil
    or source.path == nil or annotations["kubeclaw.dev/immutable-bundle-path"] ~= source.path then return pending end
  for _, key in ipairs({"repoURL", "path", "targetRevision"}) do
    if applied[key] ~= source[key] then return pending end
  end
  if applied.directory == nil or applied.directory.include ~= source.directory.include then return pending end
end
return {status = "Healthy", message = "Selected child revision synced and healthy"}
