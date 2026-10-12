import { armPreparationHostBoundary } from './native-preparation-host-boundary.mts';
armPreparationHostBoundary('repository.tar.gz', 'partial-write');
await import('../../../skills/buster/engine/test-gates/preparation-host.ts');
