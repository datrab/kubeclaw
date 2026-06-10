import assert from 'node:assert/strict';
import test from 'node:test';

test('discord fields facade exposes the runtime field builders', async () => {
  const discordFields = await import('../../../../../skills/buster/pipeline/services/discord-fields.ts');

  assert.equal(typeof discordFields.buildDiscordIdentityFields, 'function');
  assert.equal(typeof discordFields.buildDiscordIdentitySurfaceFields, 'function');
  assert.equal(typeof discordFields.buildSessionRateLimitDiscordFields, 'function');
  assert.ok(discordFields.DISCORD_FIELD_SPECS.RUN_ID);
  assert.ok(discordFields.DISCORD_IDENTITY_SURFACES.RATE_LIMIT_SESSION);

  const fields = discordFields.buildSessionRateLimitDiscordFields({
    run_id: 'run-1',
    module_id: 'module-1',
  });

  assert.deepEqual(
    fields.map((field) => [field.name, field.value]),
    [
      ['Run ID', 'run-1'],
      ['Module', 'module-1'],
    ],
  );
});
