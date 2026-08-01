import { subtle } from "@volynets/reflex-runtime/debug";
import { serveRuntimeMcpStdio } from "./stdio.js";

serveRuntimeMcpStdio(subtle.mcp());
