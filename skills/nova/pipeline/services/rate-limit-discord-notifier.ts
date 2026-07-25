import { log } from '../core/logger.ts';
import { discord } from '../integrations/discord.ts';
import { resolveStatusDispatchId, resolveStatusGatewayLabel, resolveStatusSessionKey } from './correlation.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { arrayValue, selectPresentValue } from '../value-boundary.ts';
import { buildRateLimitDiscordCorrelation } from './rate-limit-correlation.ts';

const RATE_LIMIT_DISCORD_RESUME_TITLE = 'Rate limit cooldown complete';
const RATE_LIMIT_DISCORD_RESUME_DESCRIPTION = 'Resuming session.';

function errorMessage(error: any) {
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) return error.message;
  return String(error);
}

export function createSessionRateLimitDiscordNotifier(config: any, options: any = {}) {
  const discordFn = options.discordFn !== undefined ? options.discordFn : discord;
  return {
    sendPauseDiscord: async ({ status, embed }: any) => {
      const fields = typeof options.pauseFields === 'function' ? arrayValue(options.pauseFields(status)) : arrayValue(options.pauseFields);
      await discordFn(config, 'WARN', embed.title, embed.description, [...fields, ...arrayValue(embed?.fields)], {
        correlation: buildRateLimitDiscordCorrelation(status),
      }).catch((error: any) => log('DEBUG', `Tracked rate-limit pause Discord notice failed: ${errorMessage(error)}`));
    },
    sendResumeDiscord: async ({ status }: any) => {
      const description = typeof options.resumeDescription === 'function' ? options.resumeDescription(status) : options.resumeDescription;
      const fields = typeof options.resumeFields === 'function' ? arrayValue(options.resumeFields(status)) : arrayValue(options.resumeFields);
      await discordFn(
        config,
        'INFO',
        selectPresentValue(options.resumeTitle, RATE_LIMIT_DISCORD_RESUME_TITLE),
        selectPresentValue(description, RATE_LIMIT_DISCORD_RESUME_DESCRIPTION),
        fields,
        { correlation: buildRateLimitDiscordCorrelation(status) },
      ).catch((error: any) => log('DEBUG', `Tracked rate-limit resume Discord notice failed: ${errorMessage(error)}`));
    },
  };
}
