const documentSchema = { type: "object", additionalProperties: true };

function textResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    details: value,
  };
}

async function post(path, payload, base) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const value = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(value.error || `Prism control returned HTTP ${response.status}`);
  return value;
}

export default function register(api) {
  if (process.env.PRISM_CONTROL_URL !== undefined) throw new Error('PRISM_TOOL_LEGACY_OVERRIDE:PRISM_CONTROL_URL');
  const config = api.pluginConfig;
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).length !== 1 || typeof config.controlUrl !== 'string'
    || !/^https?:\/\/[^/?#\s@\\\x00-\x20\x7f]+\/?$/u.test(config.controlUrl)) throw new Error('PRISM_TOOL_CONTROL_URL_REQUIRED');
  const parsed = new URL(config.controlUrl);
  if (!parsed.hostname || parsed.username || parsed.password) throw new Error('PRISM_TOOL_CONTROL_URL_INVALID');
  // Capture startup policy once. Tool-call context is task data, never a policy author.
  const controlUrl = parsed.origin;
  api.registerTool({
    name: "prism_create_design_set",
    description: "Persist exactly three materially distinct, complete Prism design documents for one project. This tool must be called once for every new Nova architecture request.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["jobId", "fence", "generationId", "projectId", "designs"],
      properties: {
        jobId: { type: "string", format: "uuid" },
        fence: { type: "string", format: "uuid" },
        generationId: { type: "string", minLength: 1 },
        projectId: { type: "string", minLength: 1 },
        designs: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "title", "summary", "document"],
            properties: {
              key: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{1,62}$" },
              title: { type: "string", minLength: 1 },
              summary: { type: "string", minLength: 1 },
              document: documentSchema,
              evidence: { type: "object", additionalProperties: true }
            }
          }
        }
      }
    },
    async execute(_id, params, context) {
      return textResult(await post("/v1/agent/design-sets", params, controlUrl));
    }
  });

  api.registerTool({
    name: "prism_apply_revision",
    description: "Commit a complete revised Prism document after processing Studio or Discord feedback in the existing project session.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["jobId", "fence", "generationId", "projectId", "documentId", "expectedRevision", "instruction", "document"],
      properties: {
        jobId: { type: "string", format: "uuid" },
        fence: { type: "string", format: "uuid" },
        generationId: { type: "string", minLength: 1 },
        projectId: { type: "string", minLength: 1 },
        documentId: { type: "string", minLength: 1 },
        expectedRevision: { type: "integer", minimum: 1 },
        instruction: { type: "string", minLength: 1 },
        document: documentSchema
      }
    },
    async execute(_id, params, context) {
      return textResult(await post("/v1/agent/revisions", params, controlUrl));
    }
  });
}
