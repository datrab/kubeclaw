const documentSchema = { type: "object", additionalProperties: true };

function textResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    details: value,
  };
}

async function post(path, payload, config) {
  const base = config?.controlUrl || process.env.PRISM_CONTROL_URL || "http://127.0.0.1:28080";
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
  api.registerTool({
    name: "prism_create_design_set",
    description: "Persist exactly three materially distinct, complete Prism design documents for one project. This tool must be called once for every new Nova architecture request.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["generationId", "projectId", "designs"],
      properties: {
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
      return textResult(await post("/v1/agent/design-sets", params, context?.config));
    }
  });

  api.registerTool({
    name: "prism_apply_revision",
    description: "Commit a complete revised Prism document after processing Studio or Discord feedback in the existing project session.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["generationId", "projectId", "documentId", "expectedRevision", "instruction", "document"],
      properties: {
        generationId: { type: "string", minLength: 1 },
        projectId: { type: "string", minLength: 1 },
        documentId: { type: "string", minLength: 1 },
        expectedRevision: { type: "integer", minimum: 1 },
        instruction: { type: "string", minLength: 1 },
        document: documentSchema
      }
    },
    async execute(_id, params, context) {
      return textResult(await post("/v1/agent/revisions", params, context?.config));
    }
  });
}
