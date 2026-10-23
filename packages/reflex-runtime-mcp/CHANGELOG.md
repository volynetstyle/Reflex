# @volynets/reflex-runtime-mcp

## 1.0.2

### Patch Changes

- 03f4f9b: Internal peer dependencies now follow the released versions: the published floor is the workspace version at release time (`@volynets/reflex-runtime@^1.1.0`).

## 1.0.1

### Patch Changes

- 082d4e3: Preserve supported package formats and shared runtime identity in clean workspace builds. Include development debug chunks, provide matching CJS declarations with shared ambient types, erase scheduler production flags, and finalize the portable MCP CLI. Fix extracted synchronous AsyncExecution read/commit callbacks while retaining stale-attempt and after-await protection.
