// Explicit selected-policy image contract. Older images have no such entrypoint
// and cannot silently start their environment-default server with a new chart.
if (!Object.hasOwn(process.env,'OPS_MCP_POLICY_FILE')) throw new Error('OPS_MCP_POLICY_LOCATOR_REQUIRED');
await import('./server.mjs');
