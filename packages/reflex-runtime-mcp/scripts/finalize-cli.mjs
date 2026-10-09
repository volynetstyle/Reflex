import { chmod, readFile } from "node:fs/promises";
const entrypoint = new URL("../dist/entrypoint.js", import.meta.url);
if (!(await readFile(entrypoint, "utf8")).startsWith("#!/usr/bin/env node")) throw new Error("MCP CLI must retain its Node shebang");
await chmod(entrypoint, 0o755);
