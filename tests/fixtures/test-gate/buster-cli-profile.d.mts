import type { BusterAdmissionSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
/** Raw central author fixture plus the existing legacy runtime input; no boot authentication. */
export function cliProfile(root: string, admission: BusterAdmissionSettings): {
  runtime: string;
  environment: NodeJS.ProcessEnv & {
    SWARM_CONFIG: string;
    KUBECLAW_BUILD_REVISION: string;
    ADMISSION_TEST_TOKEN: string;
    ADMISSION_TEST_SOURCE_KEY: string;
  };
};
