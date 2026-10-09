---
"@volynets/reflex-runtime": patch
"@volynets/reflex": patch
"@volynets/reflex-async": patch
"@volynets/reflex-scheduler": patch
"@volynets/reflex-runtime-mcp": patch
---

Preserve supported package formats and shared runtime identity in clean workspace builds. Include development debug chunks, provide matching CJS declarations with shared ambient types, erase scheduler production flags, and finalize the portable MCP CLI. Fix extracted synchronous AsyncExecution read/commit callbacks while retaining stale-attempt and after-await protection.
