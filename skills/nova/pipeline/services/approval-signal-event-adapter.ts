// Canonical approval-signal event boundary.
// Transport implementations live in dedicated Redis and local-filesystem adapters.

export {
  approvalSignalStreamKey,
  buildApprovalSignalEvent,
  buildApprovalSignalRedisEntry,
  publishApprovalSignalEvent,
  publishApprovalSignalState,
} from './approval-signal-event.ts';
export { createRedisApprovalSignalEventAdapter } from './approval-signal-redis-event-adapter.ts';
export { createApprovalSignalEventAdapter } from './approval-signal-local-event-adapter.ts';
