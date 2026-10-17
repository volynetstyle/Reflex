# `@volynets/reflex-runtime-mcp`

Official MCP protocol boundary for Reflex diagnostics.

```bash
npm install --save-dev @volynets/reflex-runtime-mcp @volynets/reflex-runtime
npx reflex-runtime-mcp
```

The package depends on the runtime only through its debug/diagnostics surface.
`@volynets/reflex-runtime` is a peer dependency, so diagnostics observe the
application's own runtime instance.
The runtime package itself has no MCP SDK or Zod dependency.
