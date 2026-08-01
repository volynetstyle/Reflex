import {
  serveStdio,
  type ServeStdioOptions,
  type StdioServerHandle,
} from "@modelcontextprotocol/server/stdio";

import type { RuntimeMcpAdapter } from "@volynets/reflex-runtime/debug";
import { createReflexMcpServer } from "./server.js";

/** Serve a Reflex diagnostic tool catalog through the official MCP stdio boundary. */
export function serveRuntimeMcpStdio(
  adapter: RuntimeMcpAdapter,
  options?: ServeStdioOptions,
): StdioServerHandle {
  return serveStdio(() => createReflexMcpServer(adapter), options);
}
