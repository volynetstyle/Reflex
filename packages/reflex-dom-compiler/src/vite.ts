import { parseSync } from "@babel/core";
import { createFilter, normalizePath, type FilterPattern, type Plugin } from "vite";
import { transformReflexDOM, type ReflexDOMCompilerOptions } from "./transform";

export interface ReflexDOMCompilerViteOptions extends ReflexDOMCompilerOptions {
  /** Source modules to compile. Defaults to JS, JSX, TS and TSX files. */
  readonly include?: FilterPattern;
  /** Modules to leave alone. Defaults to node_modules. */
  readonly exclude?: FilterPattern;
}

/** Runs after Vite's JSX lowering, in both development and production. */
export function reflexDOMCompilerVite(options: ReflexDOMCompilerViteOptions = {}): Plugin[] {
  const { include, exclude, ...compilerOptions } = options;
  const filter = createFilter(include ?? /\.[cm]?[jt]sx?$/, exclude ?? /\/node_modules\//);
  const disabledFiles = new Set<string>();

  const sourceFile = (id: string): string | null => {
    if (options.enabled === false || id.startsWith("\0")) return null;
    const [filename, query] = id.split("?", 2);
    const params = new URLSearchParams(query);
    if (["raw", "url", "worker", "sharedworker"].some((key) => params.has(key))) return null;
    const file = normalizePath(filename!);
    return filter(file) ? file : null;
  };

  return [{
    name: "reflex-dom-compiler:pragma",
    enforce: "pre",
    transform: {
      order: "pre",
      handler(code, id) {
        const file = sourceFile(id);
        if (file === null) return null;
        disabledFiles.delete(id);
        // JSX lowering removes ordinary comments. Read the opt-out first, and
        // parse only potential pragmas so strings containing it are not opt-outs.
        if (code.includes("@reflex-dom-compiler")) {
          const ast = parseSync(code, {
            filename: file, babelrc: false, configFile: false, sourceType: "module",
            parserOpts: { plugins: ["jsx", "typescript"] },
          });
          if (ast?.comments?.some(comment => /@reflex-dom-compiler\s+off\b/.test(comment.value))) {
            disabledFiles.add(id);
          }
        }
        return null;
      },
    },
    watchChange(id, { event }) {
      if (event === "delete") disabledFiles.delete(id);
    },
  }, {
    name: "reflex-dom-compiler",
    enforce: "post",
    config(config) {
      if (options.enabled === false || config.esbuild === false) return;
      return {
        esbuild: {
          jsx: config.esbuild?.jsx ?? "automatic",
          jsxImportSource: config.esbuild?.jsxImportSource ?? "@volynets/reflex-dom",
        },
      };
    },
    transform(code, id) {
      const file = sourceFile(id);
      if (file === null) return null;

      const result = transformReflexDOM(code, {
        ...compilerOptions,
        enabled: !disabledFiles.has(id),
        filename: file,
        sourceMaps: true,
      });
      // Reports still describe rejected regions, without rewriting untouched modules.
      if (result.report.disabled || !result.report.regions.some((region) => region.strategy !== "runtime")) {
        return null;
      }
      return { code: result.code, map: result.map };
    },
  }];
}

export default reflexDOMCompilerVite;
