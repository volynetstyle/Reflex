import {
  transformSync,
  types as t,
  type NodePath,
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
import { emitTemplate, emitTemplateCreate, verifyTemplate } from "./emit-template";
import { countNodes, type StaticElement } from "./model";

export interface ReflexDOMCompilerOptions {
  /** `false` turns the compiler into a no-op. Default `true`. */
  readonly enabled?: boolean;
  /**
   * `native`: direct DOM calls only (Trusted Types / strict CSP friendly).
   * `template`: HTML templates wherever the parser reproduces the tree.
   * `auto`: templates for regions of at least `autoTemplateMinNodes` nodes.
   */
  readonly strategy?: "auto" | "template" | "native";
  /** Overrides `AUTO_TEMPLATE_MIN_NODES` for `strategy: "auto"`. */
  readonly autoTemplateMinNodes?: number;
  readonly factorySources?: readonly string[];
  readonly renderSources?: readonly string[];
  /** Module the generated code imports its helpers from. */
  readonly runtimeModule?: string;
  /** Modules whose `For` mounts its `children` callback results. */
  readonly operatorSources?: readonly string[];
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
export const DEFAULT_OPERATOR_SOURCES = ["@volynets/reflex-dom"];
export const DEFAULT_RUNTIME_MODULE = "@volynets/reflex-dom-compiler/runtime";
/**
 * Steady-state heuristic, not a proven bound. Region size predicts how much a
 * clone saves per mount, not how often the region mounts: for n nodes and m
 * mounts a template costs P(n) + m·K(n) (parse once, clone per mount) and
 * native code m·N(n), so the template wins once m > P(n) / (N(n) − K(n)).
 * Measured: m ≤ 4 at 18 nodes in every engine, m ≈ 14 at 5 nodes in
 * Chromium (README, Benchmarks). Multiplicity information (`For` rows) should
 * replace it.
 */
export const AUTO_TEMPLATE_MIN_NODES = 8;

/** Dynamic children per region: see `acceptsHoles` for why only one. */
export const MAX_HOLES = 1;

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
    operatorSources: new Set(options.operatorSources ?? DEFAULT_OPERATOR_SOURCES),
  };
  const strategy = options.strategy ?? "auto";
  const threshold = options.autoTemplateMinNodes ?? AUTO_TEMPLATE_MIN_NODES;
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

        const helper = (name: "compiled" | "template" | "acceptsHoles") => {
          let id = helpers.get(name);
          if (id === undefined) {
            id = program.scope.generateUidIdentifier(name);
            helpers.set(name, id);
          }
          return id;
        };

        const choose = (element: StaticElement, nodes: number, holes: number): Emitted & { create: t.Identifier } => {
          const templateReason = strategy === "native" ? null : verifyTemplate(element);
          let chosen: Emitted;

          if (strategy === "native") chosen = { strategy: "native", reason: null };
          else if (templateReason !== null) chosen = { strategy: "native", reason: templateReason };
          else if (strategy === "auto" && nodes < threshold) {
            chosen = { strategy: "native", reason: `below the auto template heuristic (${nodes} < ${threshold} nodes)` };
          } else chosen = { strategy: "template", reason: null };

          const accepts = holes > 0 ? helper("acceptsHoles") : null;
          if (chosen.strategy === "template") {
            const id = program.scope.generateUidIdentifier("tpl");
            hoisted.push(emitTemplate(element, id, helper("template")));
            if (accepts === null) return { ...chosen, create: id };
            const create = program.scope.generateUidIdentifier("create");
            hoisted.push(emitTemplateCreate(element, create, id, accepts));
            return { ...chosen, create };
          }
          const id = program.scope.generateUidIdentifier("create");
          hoisted.push(emitNative(element, id, accepts));
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

              const holes: NodePath<t.Expression>[] = [];
              const result = classifyElement(path, config, holes);
              if (!result.ok) {
                // Children may still hold regions of their own.
                regions.push({ ...base, static: false, holes: 0, strategy: "runtime", nodes: 0, reason: result.reason });
                return;
              }

              const nodes = countNodes(result.element);
              const shape = { static: holes.length === 0, holes: holes.length, nodes };
              if (holes.length > MAX_HOLES) {
                regions.push({
                  ...base,
                  ...shape,
                  strategy: "runtime",
                  reason: `${holes.length} dynamic children (at most ${MAX_HOLES} per region)`,
                });
                return;
              }

              const use = consumption(path, config);
              if (!use.consumed) {
                regions.push({ ...base, ...shape, strategy: "runtime", reason: use.reason });
                path.skip();
                return;
              }

              const emitted = choose(result.element, nodes, holes.length);
              const fallback = program.scope.generateUidIdentifier("fallback");
              const args: t.Expression[] = [emitted.create, fallback];
              const params: t.Identifier[] = [];
              if (holes.length > 0) {
                // Each hole expression stays where the region is evaluated
                // (same scope, same order); the fallback receives its value.
                const values = program.scope.generateUidIdentifier("h");
                args.push(t.arrayExpression(holes.map((hole) => hole.node)));
                holes.forEach((hole, index) =>
                  hole.replaceWith(t.memberExpression(t.identifier(values.name), t.numericLiteral(index), true)),
                );
                params.push(values);
              }
              hoisted.push(
                t.functionDeclaration(fallback, params, t.blockStatement([t.returnStatement(path.node)])),
              );
              path.replaceWith(t.callExpression(helper("compiled"), args));
              path.skip();
              regions.push({ ...base, ...shape, strategy: emitted.strategy, reason: emitted.reason });
            },
          });
        }

        if (helpers.size > 0) {
          const declaration = t.importDeclaration(
            [...helpers].map(([name, local]) => t.importSpecifier(local, t.identifier(name))),
            t.stringLiteral(runtimeModule),
          );
          // Before the first statement that runs: user code may mount a
          // region during module evaluation, and `const _tpl` must be
          // initialized by then. Imports later in the file are hoisted anyway.
          const firstCode = program.get("body").find((statement) => !statement.isImportDeclaration());
          if (firstCode === undefined) program.pushContainer("body", [declaration, ...hoisted]);
          else firstCode.insertBefore([declaration, ...hoisted]);
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
