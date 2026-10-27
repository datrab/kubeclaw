// Exact native contract/field duties of the authored SDK consumer values.
// Field membership is not a complete parent-instance or runtime claim.
export const sdkExampleBindings = [
  {
    "symbol": "AdapterActivationId",
    "ordinal": 4,
    "definition": "adapterActivationId"
  },
  {
    "symbol": "AdapterLifecycle",
    "ordinal": 18,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/adapterLifecycle/properties/status"
    ]
  },
  {
    "symbol": "AdapterRegistration",
    "ordinal": 20,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/adapterRegistration/properties/providesCapabilities"
    ]
  },
  {
    "symbol": "AdministrativeReopenDecision",
    "ordinal": 22,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/administrativeReopenDecision/oneOf/0/properties/continuation",
      "#/$defs/administrativeReopenDecision/oneOf/1/properties/continuation"
    ]
  },
  {
    "symbol": "ArtifactRef",
    "ordinal": 26,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/artifactRef/properties/encoding"
    ]
  },
  {
    "symbol": "AttemptIdentity",
    "ordinal": 28,
    "definition": "attemptIdentity"
  },
  {
    "symbol": "CURRENT_REVIEW_CACHE_PROFILE",
    "ordinal": 30,
    "definition": "reviewCacheProfile"
  },
  {
    "symbol": "CURRENT_RUNTIME_DISPATCH_PROFILE",
    "ordinal": 32,
    "definition": "runtimeDispatchProfile"
  },
  {
    "symbol": "CapabilityGrant",
    "ordinal": 34,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/capabilityGrant/properties/capability"
    ]
  },
  {
    "symbol": "CapabilityInvocation",
    "ordinal": 36,
    "definition": "capabilityInvocation"
  },
  {
    "symbol": "DecisionFacts",
    "ordinal": 38,
    "definition": "decisionFacts"
  },
  {
    "symbol": "EffectAttemptIdentity",
    "ordinal": 40,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/attemptIdentity/properties/attemptNumber",
      "#/$defs/effectAttemptIdentity/anyOf/1/properties/attemptNumber"
    ]
  },
  {
    "symbol": "EffectDeliveryId",
    "ordinal": 44,
    "definition": "effectDeliveryId"
  },
  {
    "symbol": "EffectIdempotencyKey",
    "ordinal": 46,
    "definition": "effectIdempotencyKey"
  },
  {
    "symbol": "EffectReceipt",
    "ordinal": 50,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/effectReceipt/properties/status"
    ]
  },
  {
    "symbol": "EffectRequest",
    "ordinal": 52,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/effectRequest/properties/operation"
    ]
  },
  {
    "symbol": "EventIdentity",
    "ordinal": 54,
    "definition": "eventIdentity"
  },
  {
    "symbol": "InvocationLease",
    "ordinal": 56,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/invocationLease/properties/status"
    ]
  },
  {
    "symbol": "JsonObject",
    "ordinal": 58,
    "definition": "jsonObject"
  },
  {
    "symbol": "LifecycleEvent",
    "ordinal": 60,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/lifecycleEvent/properties/type"
    ]
  },
  {
    "symbol": "LocalId",
    "ordinal": 62,
    "definition": "localId"
  },
  {
    "symbol": "NamespacedId",
    "ordinal": 64,
    "definition": "namespacedId"
  },
  {
    "symbol": "ObserverCheckpoint",
    "ordinal": 66,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/observerCheckpoint/properties/sequence"
    ]
  },
  {
    "symbol": "ObserverDelivery",
    "ordinal": 68,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/observerDelivery/properties/attemptNumber"
    ]
  },
  {
    "symbol": "ObserverRegistration",
    "ordinal": 72,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/observerRegistration/properties/ordering"
    ]
  },
  {
    "symbol": "OpaqueId",
    "ordinal": 74,
    "definition": "opaqueId"
  },
  {
    "symbol": "PackageIdentity",
    "ordinal": 82,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/packageIdentity/properties/apiVersion"
    ]
  },
  {
    "symbol": "PackageProvenance",
    "ordinal": 84,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/packageProvenance/properties/trustScope"
    ]
  },
  {
    "symbol": "PackageResolution",
    "ordinal": 86,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/packageResolution/properties/registrationId"
    ]
  },
  {
    "symbol": "PipelineDefinition",
    "ordinal": 88,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/pipelineDefinition/properties/schemaVersion"
    ]
  },
  {
    "symbol": "PluginContext",
    "ordinal": 90,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/pluginContext/properties/schemaVersion"
    ]
  },
  {
    "symbol": "PluginDomainEvent",
    "ordinal": 92,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/pluginDomainEvent/properties/type"
    ]
  },
  {
    "symbol": "PluginStateEntry",
    "ordinal": 110,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/pluginStateEntry/properties/entryType"
    ]
  },
  {
    "symbol": "Reason",
    "ordinal": 116,
    "definition": "reason"
  },
  {
    "symbol": "RegistrationProvenance",
    "ordinal": 118,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/registrationProvenance/properties/surface"
    ]
  },
  {
    "symbol": "RelativeModulePath",
    "ordinal": 120,
    "definition": "relativeModulePath"
  },
  {
    "symbol": "RelativeSchemaPath",
    "ordinal": 122,
    "definition": "relativeSchemaPath"
  },
  {
    "symbol": "ReportAdapterRegistration",
    "ordinal": 132,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/reportAdapterRegistration/properties/mediaTypes"
    ]
  },
  {
    "symbol": "ResourceIdentity",
    "ordinal": 134,
    "definition": "resourceIdentity"
  },
  {
    "symbol": "ResourceLock",
    "ordinal": 136,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/resourceLock/properties/status"
    ]
  },
  {
    "symbol": "ResultBase",
    "ordinal": 138,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/resultBase/properties/outcome"
    ]
  },
  {
    "symbol": "ResumeSignal",
    "ordinal": 140,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/resumeSignal/properties/schemaVersion"
    ]
  },
  {
    "symbol": "ReviewCacheProfile",
    "ordinal": 142,
    "definition": "reviewCacheProfile"
  },
  {
    "symbol": "RuntimeDispatchProfile",
    "ordinal": 148,
    "definition": "runtimeDispatchProfile"
  },
  {
    "symbol": "RuntimeRunEdge",
    "ordinal": 150,
    "definition": "runtimeRunEdge"
  },
  {
    "symbol": "RuntimeRunGraph",
    "ordinal": 152,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/runtimeRunGraph/properties/schemaVersion"
    ]
  },
  {
    "symbol": "RuntimeRunSnapshot",
    "ordinal": 154,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/runtimeRunSnapshot/properties/schemaVersion"
    ]
  },
  {
    "symbol": "RuntimeRunSnapshotV4",
    "ordinal": 156,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/runtimeRunSnapshotV4/properties/schemaVersion"
    ]
  },
  {
    "symbol": "StageAttempt",
    "ordinal": 162,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/stageAttempt/properties/status"
    ]
  },
  {
    "symbol": "StageDefinition",
    "ordinal": 164,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/stageDefinition/properties/dependsOn"
    ]
  },
  {
    "symbol": "StageRegistration",
    "ordinal": 166,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/stageRegistration/properties/requiredCapabilities"
    ]
  },
  {
    "symbol": "StageResult",
    "ordinal": 168,
    "definition": "stageResult"
  },
  {
    "symbol": "TestContractId",
    "ordinal": 174,
    "definition": "testContractId"
  },
  {
    "symbol": "TestEvidencePolicy",
    "ordinal": 176,
    "definition": "testEvidencePolicy"
  },
  {
    "symbol": "TestProviderCapabilityRequest",
    "ordinal": 178,
    "definition": "capabilityInvocation"
  },
  {
    "symbol": "TestProviderPort",
    "ordinal": 186,
    "definition": "testProviderPort"
  },
  {
    "symbol": "TestProviderRegistration",
    "ordinal": 190,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/testProviderRegistration/properties/retrySafe"
    ]
  },
  {
    "symbol": "WaitRequest",
    "ordinal": 194,
    "schemaAuthority": "https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json",
    "schemaPointers": [
      "#/$defs/waitRequest/properties/expiresAt"
    ]
  }
];
