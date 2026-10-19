import {
  transformSync,
  types as t,
  type PluginObj,
  type PluginPass,
} from "@babel/core";
import {
  callType,
  classifyElement,
  consumption,
  isFactoryCall,
  type ClassifyConfig,
} from "./classify";
import type { CompilerReport, RegionReport, RegionStrategy } from "./diagnostics";
import { emitNative } from "./emit-native";
import { emitTemplate, verifyTemplate } from "./emit-template";
import { countNodes, type StaticElement } from "./model";

export interface ReflexDOMCompilerOptions {
  /** `false` turns the compiler into a no-op. Default `true`. */
  readonly enabled?: boolean;
  /**
   * `native`: direct DOM calls only (Trusted Types / strict CSP friendly).
   * `template`: HTML templates wherever the parser reproduces the tree.
   * `auto`: templates for regions of at least `templateThreshold` nodes.
   */
  readonly strategy?: "auto" | "template" | "native";
  readonly templateThreshold?: number;
  readonly factorySources?: readonly string[];
  readonly renderSources?: readonly string[];
  /** Module the generated code imports its helpers from. */
  readonly runtimeModule?: string;
  readonly assumePascalCaseComponents?: boolean;
  readonly onReport?: (report: CompilerReport) => void;
}

export const DEFAULT_FACTORY_SOURCES = [
  "@volynets/reflex-dom",
  "@volynets/reflex-dom/jsx-runtime",
  "@volynets/reflex-dom/jsx-dev-runtime",
  "@volynets/reflex-framework",
  "@volynets/reflex-framework/jsx-runtime",
  "@volynets/reflex-framework/jsx-dev-runtime",
];
export const DEFAULT_RENDER_SOURCES = ["@volynets/reflex-dom"];
export const DEFAULT_RUNTIME_MODULE = "@volynets/reflex-dom-compiler/runtime";
/**
 * Below this many nodes `auto` emits native code. Provisional: see the
 * benchmark README for the measured break-even per engine.
 */
export const DEFAULT_TEMPLATE_THRESHOLD = 8;

const PRAGMA_OFF = /@reflex-dom-compiler\s+off\b/;

interface Emitted {
  readonly strategy: Exclude<RegionStrategy, "runtime">;
  readonly reason: string | null;
}

export function reflexDOMCompiler(
  _api: unknown,
  options: ReflexDOMCompilerOptions = {},
): PluginObj<PluginPass> {
  const config: ClassifyConfig = {
    factorySources: new Set(options.factorySources ?? DEFAULT_FACTORY_SOURCES),
    renderSources: new Set(options.renderSources ?? DEFAULT_RENDER_SOURCES),
    assumePascalCaseComponents: options.assumePascalCaseComponents ?? true,
  };
  const strategy = options.strategy ?? "auto";
  const threshold = options.templateThreshold ?? DEFAULT_TEMPLATE_THRESHOLD;
  const runtimeModule = options.runtimeModule ?? DEFAULT_RUNTIME_MODULE;

  return {
    name: "reflex-dom-compiler",
    visitor: {
      Program(program, state) {
        const filename = state.file.opts.filename ?? null;
        const disabled =
          options.enabled === false ||
          (state.file.ast.comments ?? []).some((comment) => PRAGMA_OFF.test(comment.value));
        const regions: RegionReport[] = [];
        const hoisted: t.Statement[] = [];
        const helpers = new Map<string, t.Identifier>();

        const helper = (name: "compiled" | "template") => {
          let id = helpers.get(name);
          if (id === undefined) {
            id = program.scope.generateUidIdentifier(name);
            helpers.set(name, id);
          }
          return id;
        };

        const choose = (element: StaticElement, nodes: number): Emitted & { create: t.Identifier } => {
          const templateReason = strategy === "native" ? null : verifyTemplate(element);
          let chosen: Emitted;

          if (strategy === "native") chosen = { strategy: "native", reason: null };
          else if (templateReason !== null) chosen = { strategy: "native", reason: templateReason };
          else if (strategy === "auto" && nodes < threshold) {
            chosen = { strategy: "native", reason: `below template threshold (${nodes} < ${threshold} nodes)` };
          } else chosen = { strategy: "template", reason: null };

          if (chosen.strategy === "template") {
            const id = program.scope.generateUidIdentifier("tpl");
            hoisted.push(emitTemplate(element, id, helper("template")));
            return { ...chosen, create: id };
          }
          const id = program.scope.generateUidIdentifier("create");
          hoisted.push(emitNative(element, id));
          return { ...chosen, create: id };
        };

        if (!disabled) {
          program.traverse({
            CallExpression(path) {
              if (!isFactoryCall(path, config)) return;
              const type = callType(path, config);
              if (type.kind !== "host") return;

              const start = path.node.loc?.start;
              const base = {
                id: regions.length + 1,
                tag: type.tag,
                line: start?.line ?? null,
                column: start === undefined ? null : start.column + 1,
              };

              const result = classifyElement(path, config);
              if (!result.ok) {
                // Children may still hold static regions of their own.
                regions.push({ ...base, static: false, strategy: "runtime", nodes: 0, reason: result.reason });
                return;
              }

              const nodes = countNodes(result.element);
              const use = consumption(path, config);
              if (!use.consumed) {
                regions.push({ ...base, static: true, strategy: "runtime", nodes, reason: use.reason });
                path.skip();
                return;
              }

              const emitted = choose(result.element, nodes);
              const fallback = program.scope.generateUidIdentifier("fallback");
              hoisted.push(
                t.functionDeclaration(fallback, [], t.blockStatement([t.returnStatement(path.node)])),
              );
              path.replaceWith(t.callExpression(helper("compiled"), [emitted.create, fallback]));
              path.skip();
              regions.push({ ...base, static: true, strategy: emitted.strategy, nodes, reason: emitted.reason });
            },
          });
        }

        if (helpers.size > 0) {
          const imports = program.get("body").filter((statement) => statement.isImportDeclaration());
          const declaration = t.importDeclaration(
            [...helpers].map(([name, local]) => t.importSpecifier(local, t.identifier(name))),
            t.stringLiteral(runtimeModule),
          );
          const [inserted] =
            imports.length > 0
              ? imports[imports.length - 1]!.insertAfter(declaration)
              : program.unshiftContainer("body", declaration);
          inserted!.insertAfter(hoisted);
        }

        const report: CompilerReport = { filename, disabled, regions };
        (state.file.metadata as { reflexDOMCompiler?: CompilerReport }).reflexDOMCompiler = report;
        options.onReport?.(report);
      },
    },
  };
}

export interface TransformResult {
  readonly code: string;
  readonly report: CompilerReport;
}

/** Runs the plugin alone on an ES module whose JSX is already lowered. */
export function transformReflexDOM(
  code: string,
  options: ReflexDOMCompilerOptions & { readonly filename?: string } = {},
): TransformResult {
  const { filename, ...pluginOptions } = options;
  const result = transformSync(code, {
    filename: filename ?? "module.js",
    babelrc: false,
    configFile: false,
    sourceType: "module",
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [[reflexDOMCompiler, pluginOptions]],
  });
  const report = (result?.metadata as { reflexDOMCompiler?: CompilerReport } | undefined)
    ?.reflexDOMCompiler ?? { filename: filename ?? null, disabled: true, regions: [] };
  return { code: result?.code ?? code, report };
}
