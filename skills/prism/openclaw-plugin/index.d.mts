export interface PrismTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(id: string, params: unknown, context?: {
    config?: {controlUrl?: string};
  }): Promise<{
    content: Array<{type: 'text'; text: string}>;
    details: unknown;
  }>;
}

export default function register(api: {registerTool(tool: PrismTool): void}): void;
