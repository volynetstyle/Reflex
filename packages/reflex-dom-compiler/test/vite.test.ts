// @vitest-environment node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, createServer, resolveConfig, type Plugin } from "vite";
import { describe, expect, it } from "vitest";
import reflexDOMCompilerVite from "@volynets/reflex-dom-compiler/vite";
import type { CompilerReport } from "../src";
import { runtimeFlags } from "../../../tooling/configs/runtime-flags";
import { sourceAliases } from "../../../tooling/configs/source-aliases";
import reflex from "../../../plugins/@vite/reflex-vite-plugin/src/index";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/vite/client.tsx", import.meta.url));
const aliases = [
  ...sourceAliases("dom"),
  ...["jsx-runtime", "jsx-dev-runtime"].map(name => ({
    find: `@volynets/reflex-dom/${name}`,
    replacement: fileURLToPath(new URL(`../../reflex-dom/src/${name}.ts`, import.meta.url)),
  })),
  { find: /^@volynets\/reflex-dom$/, replacement: fileURLToPath(new URL("../../reflex-dom/src/index.ts", import.meta.url)) },
];
const lowered = `import { jsx } from "@volynets/reflex-dom/jsx-runtime";
import { render } from "@volynets/reflex-dom";
render(jsx("p", { children: "hello" }), document.body);`;

async function transform(plugins: Plugin[], code = lowered, id = "/src/app.tsx") {
  let result = null;
  for (const plugin of plugins) {
    const hook = plugin.transform!;
    const handler = typeof hook === "function" ? hook : hook.handler;
    result = await handler.call({} as never, code, id);
  }
  return result;
}

describe("Vite compiler plugin", () => {
  it("compiles lowered modules, forwards options and returns a source map", async () => {
    const reports: CompilerReport[] = [];
    const result = await transform(reflexDOMCompilerVite({ strategy: "native", onReport: r => reports.push(r) }));
    expect(result).toMatchObject({ code: expect.stringContaining('d.createElement("p")') });
    expect(result).toMatchObject({ map: { sources: ["/src/app.tsx"], sourcesContent: [lowered] } });
    expect(reports[0]).toMatchObject({ filename: resolve("/src/app.tsx"), regions: [{ strategy: "native" }] });
  });

  it.each(["/src/app.js", "/src/app.jsx", "/src/app.ts", "/src/app.mjs", "/src/app.cts", "/src/app.tsx?t=42", "C:\\src\\app.tsx"])("accepts %s", async id => {
    expect(await transform(reflexDOMCompilerVite(), lowered, id)).not.toBeNull();
  });

  it.each(["/node_modules/lib/app.tsx", "C:\\repo\\node_modules\\lib\\app.tsx", "/src/app.css", "\0virtual.tsx", "/src/app.tsx?raw", "/src/app.tsx?url", "/src/app.tsx?worker"])("skips %s", async id => {
    expect(await transform(reflexDOMCompilerVite(), lowered, id)).toBeNull();
  });

  it("supports custom filters and leaves disabled/uncompiled modules untouched", async () => {
    const plugin = reflexDOMCompilerVite({ include: "**/views/*.tsx", exclude: "**/skip.tsx" });
    expect(await transform(plugin, lowered, "/src/views/app.tsx")).not.toBeNull();
    expect(await transform(plugin, lowered, "/src/views/skip.tsx")).toBeNull();
    expect(await transform(plugin, lowered, "/src/app.tsx")).toBeNull();
    expect(await transform(reflexDOMCompilerVite({ enabled: false }))).toBeNull();
    expect(await transform(reflexDOMCompilerVite(), `// @reflex-dom-compiler off\n${lowered}`)).toBeNull();
    expect(await transform(reflexDOMCompilerVite(), 'export const message = "unchanged";')).toBeNull();
  });

  it("reports rejected regions without rewriting them", async () => {
    const reports: CompilerReport[] = [];
    expect(await transform(reflexDOMCompilerVite({ onReport: r => reports.push(r) }), lowered.replace('jsx("p"', 'jsx("input"'))).toBeNull();
    expect(reports[0]!.regions[0]!.strategy).toBe("runtime");
  });

  it("uses automatic Reflex JSX defaults and respects explicit JSX configuration", async () => {
    const config = await resolveConfig({ configFile: false, plugins: [reflexDOMCompilerVite()] }, "serve");
    expect(config.esbuild).toMatchObject({ jsx: "automatic", jsxImportSource: "@volynets/reflex-dom" });
    const custom = await resolveConfig({ configFile: false, plugins: [reflexDOMCompilerVite()], esbuild: { jsx: "preserve", jsxImportSource: "custom" } }, "serve");
    expect(custom.esbuild).toMatchObject({ jsx: "preserve", jsxImportSource: "custom" });
    const disabled = await resolveConfig({ configFile: false, plugins: [reflexDOMCompilerVite()], esbuild: false }, "serve");
    expect(disabled.esbuild).toBe(false);
  });

  it("preserves the source pragma across JSX lowering and clears it on an edit", async () => {
    const plugin = reflexDOMCompilerVite();
    const pre = plugin[0]!.transform!;
    const post = plugin[1]!.transform!;
    const before = typeof pre === "function" ? pre : pre.handler;
    const after = typeof post === "function" ? post : post.handler;
    const source = '// @reflex-dom-compiler off\nconst view = <p>hello</p>;';
    await before.call({} as never, source, "/src/app.tsx");
    expect(await after.call({} as never, lowered, "/src/app.tsx")).toBeNull();
    await before.call({} as never, source.replace("// @reflex-dom-compiler off", 'const text = "@reflex-dom-compiler off";'), "/src/app.tsx");
    expect(await after.call({} as never, lowered, "/src/app.tsx")).not.toBeNull();
  });

  it("runs after JSX lowering in the dev server, preserving the TSX source map", async () => {
    const reports: CompilerReport[] = [];
    const server = await createServer({
      configFile: false, root, logLevel: "silent",
      plugins: [reflex({ dom: true }), reflexDOMCompilerVite({ strategy: "native", onReport: r => reports.push(r) })],
      resolve: { alias: aliases, conditions: ["source"] },
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      const result = await server.transformRequest("/test/fixtures/vite/client.tsx");
      expect(result!.code).toContain('d.createElement("section")');
      expect(result!.code).toContain('from "/src/runtime.ts"');
      expect(result!.map && "sourcesContent" in result!.map && result!.map.sourcesContent).toContain(await readFile(fixture, "utf8"));
      expect(reports[0]!.regions.some(r => r.strategy === "native")).toBe(true);
      const disabled = await server.transformRequest("/test/fixtures/vite/disabled.tsx");
      expect(disabled!.code).not.toContain("_compiled");
      expect(reports.some(r => r.filename?.endsWith("disabled.tsx") && r.disabled)).toBe(true);
    } finally { await server.close(); }
  });

  it("compiles production bundles and composes build source maps", async () => {
    const result = await build({
      configFile: false, root, logLevel: "silent",
      plugins: [reflexDOMCompilerVite({ strategy: "template" })],
      build: {
        write: false, minify: false, sourcemap: true,
        rollupOptions: { input: fixture, external: /^@volynets\/reflex/, output: { format: "es" } },
      },
    });
    if (Array.isArray(result) || !("output" in result)) throw new Error("Expected one bundle");
    const chunk = result.output.find(output => output.type === "chunk")!;
    expect(chunk.code).toContain("compiled");
    expect(chunk.code).toContain("<section");
    expect(chunk.map!.sourcesContent).toContain(await readFile(fixture, "utf8"));
  });

  it("keeps SSR working through the compiled fallback", async () => {
    const reports: CompilerReport[] = [];
    const server = await createServer({
      configFile: false, root, logLevel: "silent",
      plugins: [reflexDOMCompilerVite({ strategy: "native", onReport: r => reports.push(r) })],
      define: runtimeFlags("production"),
      resolve: { alias: aliases, conditions: ["source"] },
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      const result = await server.ssrLoadModule("/test/fixtures/vite/server.tsx");
      expect(result.html).toBe('<section class="vite-compiler"><b>server</b></section>');
      expect(reports.some(r => r.regions.some(region => region.strategy === "native"))).toBe(true);
    } finally { await server.close(); }
  });
});
