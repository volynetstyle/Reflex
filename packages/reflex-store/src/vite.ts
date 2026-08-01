import type { Plugin, TransformResult } from "vite";
import {
  CompiledStoreTransformError,
  compileStore,
  type CompiledStoreDiagnostic,
  type CompiledStoreLoweringTargetOptions,
} from "./store/transform";

type Selector = string | RegExp | readonly (string | RegExp)[];
type DiagnosticMode = "error" | "warn" | "collect";
type DiagnosticReporter = {
  warn(warning: string): void;
  error(error: string): never;
};

export interface ReflexStoreVitePluginOptions {
  /**
   * Files eligible for the compiled-store transform.
   *
   * @default /\.[cm]?[jt]sx?$/
   */
  include?: Selector;
  /**
   * Files excluded from the compiled-store transform.
   *
   * @default /\/node_modules\//
   */
  exclude?: Selector;
  /**
   * Runtime module used by generated code.
   *
   * @default "@volynets/reflex"
   */
  runtimeModule?: string;
  /** Customize the runtime primitives and every generated identifier. */
  loweringTarget?: CompiledStoreLoweringTargetOptions;
  /**
   * Compile bare `createStore({ ... })` calls even when the file does not
   * import `createStore` from `@volynets/reflex-store`.
   *
   * The default keeps the plugin conservative and avoids touching unrelated
   * libraries that also expose a `createStore` function.
   *
   * @default false
   */
  compileBareCreateStore?: boolean;
  /**
   * How unsupported phase-1 syntax is surfaced through Vite.
   *
   * @default "error"
   */
  diagnostics?: DiagnosticMode;
}

const DEFAULT_INCLUDE = /\.[cm]?[jt]sx?$/;
const DEFAULT_EXCLUDE = /\/node_modules\//;
const STORE_IMPORT_RE =
  /from\s*["'](?:@volynets\/reflex-store|@reflex\/store)(?:\/(?:store|compiled-store))?["']/;

export function reflexStoreVitePlugin(
  options: ReflexStoreVitePluginOptions = {},
): Plugin {
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;
  const diagnostics = options.diagnostics ?? "error";

  return {
    name: "reflex-store",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = normalizeId(id);
      if (!matchesSelector(include, normalizedId)) {
        return null;
      }
      if (matchesSelector(exclude, normalizedId)) {
        return null;
      }
      if (!shouldCompileCode(code, options.compileBareCreateStore ?? false)) {
        return null;
      }

      try {
        const result = compileStore(code, normalizedId, {
          importRuntime: true,
          onDiagnostic: diagnostics === "error" ? "throw" : "collect",
          loweringTarget: options.loweringTarget,
          runtimeModule: options.runtimeModule,
        });

        reportDiagnostics(this, result.diagnostics, diagnostics);

        return {
          code: result.code,
          map: parseSourceMap(result.map),
        } satisfies TransformResult;
      } catch (error) {
        if (error instanceof CompiledStoreTransformError) {
          this.error(formatDiagnostics(error.diagnostics));
        }
        throw error;
      }
    },
  };
}

export { reflexStoreVitePlugin as reflexStore };
export default reflexStoreVitePlugin;

function shouldCompileCode(code: string, compileBareCreateStore: boolean): boolean {
  if (!code.includes("createStore")) {
    return false;
  }

  return compileBareCreateStore || STORE_IMPORT_RE.test(code);
}

function normalizeId(id: string): string {
  return id.split("?")[0]!.replace(/\\/g, "/");
}

function matchesSelector(selector: Selector, id: string): boolean {
  if (isSelectorArray(selector)) {
    return selector.some((item) => matchesSelector(item, id));
  }

  if (typeof selector === "string") {
    return id.includes(selector);
  }

  return selector.test(id);
}

function isSelectorArray(
  selector: Selector,
): selector is readonly (string | RegExp)[] {
  return Array.isArray(selector);
}

function parseSourceMap(map: string | null): TransformResult["map"] {
  return map === null ? null : JSON.parse(map);
}

function reportDiagnostics(
  context: DiagnosticReporter,
  diagnostics: readonly CompiledStoreDiagnostic[],
  mode: DiagnosticMode,
): void {
  if (diagnostics.length === 0 || mode === "collect") {
    return;
  }

  const message = formatDiagnostics(diagnostics);
  if (mode === "warn") {
    context.warn(message);
    return;
  }

  context.error(message);
}

function formatDiagnostics(
  diagnostics: readonly CompiledStoreDiagnostic[],
): string {
  return diagnostics.map((diagnostic) => diagnostic.message).join("\n");
}
