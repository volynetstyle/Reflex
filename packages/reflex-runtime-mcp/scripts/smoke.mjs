import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client({
  name: "reflex-runtime-mcp-smoke",
  version: "1.0.0",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/entrypoint.js"],
  cwd: import.meta.dirname.replaceAll("\\", "/").replace(/\/scripts$/, ""),
  stderr: "pipe",
});

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (!tools.some((tool) => tool.name === "graph.dump")) {
    throw new Error("Missing graph.dump tool.");
  }
  const result = await client.callTool({
    name: "statistics.summary",
    arguments: {},
  });
  if (result.isError) throw new Error("statistics.summary failed.");
  process.stderr.write(`MCP smoke passed (${tools.length} tools).\n`);
} finally {
  await client.close();
}
