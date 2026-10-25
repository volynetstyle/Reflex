import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import type { Plugin } from "vite";
import { transformReflexDOM } from "../../src/transform";

/**
 * Serves `fixture.tsx?variant=<baseline|native|template|auto>`: the real JSX
 * lowering (esbuild, automatic runtime), then the compiler for every variant
 * but `baseline`. Each module also exports `__report`.
 */
export function reflexVariantPlugin(): Plugin {
  return {
    name: "reflex-dom-compiler:variants",
    enforce: "pre",
    async load(id) {
      const [file, query] = id.split("?");
      const variant = query === undefined ? null : new URLSearchParams(query).get("variant");
      if (variant === null || !file!.endsWith(".tsx")) return null;

      const source = await readFile(file!, "utf8");
      const lowered = (
        await transform(source, {
          loader: "tsx",
          jsx: "automatic",
          jsxImportSource: "@volynets/reflex-dom",
          format: "esm",
          sourcefile: file,
        })
      ).code;

      if (variant === "baseline") return `${lowered}\nexport const __report = null;\n`;

      const { code, report } = transformReflexDOM(lowered, {
        strategy: variant as "native" | "template" | "auto",
        filename: file,
      });
      return `${code}\nexport const __report = ${JSON.stringify(report)};\n`;
    },
  };
}
