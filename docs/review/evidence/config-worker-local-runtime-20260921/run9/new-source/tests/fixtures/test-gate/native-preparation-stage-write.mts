import { armPreparationHostBoundary } from './native-preparation-host-boundary.mts';
armPreparationHostBoundary('request.json', 'partial-write');
await import('../../../skills/buster/engine/test-gates/preparation-host.ts');
