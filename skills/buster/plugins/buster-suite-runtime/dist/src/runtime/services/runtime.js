import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { readBusterEnvironment } from '../buster-environment.js';
function normalizeDiscordWebhookUrl(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return selectTruthyValue(() => (trimmed), () => (null));
}
export function resolveDiscordWebhookUrl(override = null) {
    const normalizedOverride = normalizeDiscordWebhookUrl(override);
    if (normalizedOverride !== null)
        return normalizedOverride;
    if (typeof override === 'string')
        return normalizeDiscordWebhookUrl(readBusterEnvironment('DISCORD_WEBHOOK_URL'));
    return null;
}
