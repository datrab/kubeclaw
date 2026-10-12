import { loadSwarmSettings } from '../skills/common/plugin-runtime/foundation/config/swarm.ts';
// Read-only before the entrypoint creates state, locks, files or child services.
const snapshot = loadSwarmSettings(process.env);
process.stdout.write(snapshot.identity.entry);
