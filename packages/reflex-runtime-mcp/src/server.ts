import {
  fromJsonSchema,
  McpServer,
  type JsonSchemaType,
  type CallToolResult,
} from "@modelcontextprotocol/server";

import type { RuntimeMcpAdapter } from "@volynets/reflex-runtime/debug";

export function createReflexMcpServer(adapter: RuntimeMcpAdapter): McpServer {
  const server = new McpServer({
    name: "reflex-runtime",
    version: "1.0.0",
  });

  for (const tool of adapter.list()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: fromJsonSchema(tool.inputSchema as JsonSchemaType),
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      async (input): Promise<CallToolResult> => {
        const result = adapter.call(tool.name, input);
        // The core diagnostic model stays SDK-independent and exposes readonly data.
        // Adapt its immutable content tuple into the SDK's wire result at this boundary.
        return {
          content: result.content.map((item) => ({ ...item })),
          isError: result.isError,
          structuredContent: { ...result.structuredContent },
        };
      },
    );
  }

  return server;
}
