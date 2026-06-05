// Compatibility shim: repo-local facade for the production /app/skills/pipeline surface.
// Canonical implementation lives in skills/common/pipeline and overwrites this path in images.
export * from '../../../common/pipeline/services/discord-fields.ts';
