import { isoNow } from '../core/runtime.ts';
import {
  findPluginArtifacts,
  getPluginArtifactBundle,
  persistPluginArtifact,
  readPluginArtifact,
} from './artifact-plugin-storage.ts';

function laneFromOptions(options: any) {
  return {
    hookFamily: options.hookFamily ?? null,
    stageId: options.stageId ?? null,
    moduleId: options.moduleId ?? null,
  };
}

export function createPluginArtifactsApi(
  config: any = {},
  options: any = {}
) {
  const lane = laneFromOptions(options);
  getPluginArtifactBundle(config, lane);
  const invocation = options.invocation ?? {};
  const now = options.now ?? isoNow;
  return {
    async get(ref: any) {
      return readPluginArtifact(config, lane, ref);
    },
    async find(query: any = {}) {
      return findPluginArtifacts(config, lane, query);
    },
    async persist(request: any = {}) {
      return persistPluginArtifact({
        config,
        lane,
        invocation,
        now,
        request,
      });
    },
  };
}

export { getPluginArtifactBundle };
