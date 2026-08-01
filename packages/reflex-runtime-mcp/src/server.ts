import {
  fromJsonSchema,
  McpServer,
  type JsonSchemaType,
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
      },
      async (input) => adapter.call(tool.name, input),
    );
  }

  return server;
}
