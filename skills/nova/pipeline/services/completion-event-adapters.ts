// Canonical completion-event adapter facade. Implementations are split by transport ownership.
export {
  createDedicatedRedisCompletionClient,
  createRedisCompletionEventAdapter,
} from './completion-redis-event-adapter.ts';
export { createLocalEvidenceEventAdapter } from './completion-local-event-adapter.ts';
