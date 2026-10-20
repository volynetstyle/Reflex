import {
  transformSync,
  types as t,
  type NodePath,
  type PluginObj,
  type PluginPass,
  type BabelFileResult,
} from "@babel/core";
import {
  callType,
  classifyElement,
  consumption,
  isFactoryCall,
  readProps,
  type ClassifyConfig,
} from "./classify";
import type { CompilerReport, RegionReport, RegionStrategy } from "./diagnostics";
import { emitNative } from "./emit-native";
import { emitTemplate, emitTemplateCreate, verifyTemplate } from "./emit-template";
import { countNodes, type StaticElement } from "./model";
import { classifyOrderedElement, emitOrderedNative, orderedCounts, PLATFORM_PROPS } from "./ordered";
import { rejectTag } from "./semantics";

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
  /** Modules whose For/Show/Switch/Portal exports consume rendered branches. */
  readonly operatorSources?: readonly string[];
  readonly onReport?: (report: CompilerReport) => void;
}

export const DEFAULT_FACTORY_SOURCES = [
  "@volynets/reflex-dom",
  "@volynets/reflex-dom/jsx-runtime",
  "@volynets/reflex-dom/jsx-dev-runtime",
  "@volynets/reflex-dom/standalone",
  "@volynets/reflex-dom/standalone/jsx-runtime",
  "@volynets/reflex-dom/standalone/jsx-dev-runtime",
  "@volynets/reflex-framework",
  "@volynets/reflex-framework/jsx-runtime",
  "@volynets/reflex-framework/jsx-dev-runtime",
];
export const DEFAULT_RENDER_SOURCES = ["@volynets/reflex-dom", "@volynets/reflex-dom/standalone"];
export const DEFAULT_OPERATOR_SOURCES = ["@volynets/reflex-dom", "@volynets/reflex-dom/standalone"];
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

/** Deferred template holes; ordered native regions have no such limit. */
export const MAX_TEMPLATE_HOLES = 1;
/** Compatibility alias for the template fast-path limit. */
export const MAX_HOLES = MAX_TEMPLATE_HOLES;

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
          // Compile callback bodies and islands inside opaque children before
          // their enclosing region captures them. In ordinary host trees,
          // prefer maximal outer regions over their static children.
          const candidates: { path: NodePath<t.CallExpression>; node: t.Node; ancestors: t.Node[]; depth: number; order: number; use: ReturnType<typeof consumption> }[] = [];
          const boundaries = new Map<t.Node, boolean>();
          const opaqueBoundary = (path: NodePath): boolean => {
            const cached = boundaries.get(path.node);
            if (cached !== undefined) return cached;
            let opaque = false;
            if (isFactoryCall(path, config)) {
              const type = callType(path, config);
              const props = readProps(path);
              opaque = type.kind === "component" || (type.kind === "host" &&
                (rejectTag(type.tag) !== null || typeof props === "string" || [...props.keys()].some(name => PLATFORM_PROPS.has(name))));
            }
            boundaries.set(path.node, opaque);
            return opaque;
          };
          program.traverse({ CallExpression(path) {
            if (!isFactoryCall(path, config) || callType(path, config).kind !== "host") return;
            const ancestors: t.Node[] = [];
            let depth = 0;
            for (let parent = path.parentPath; parent !== null; parent = parent.parentPath!) {
              ancestors.push(parent.node);
              if (parent.isFunction() || opaqueBoundary(parent)) depth++;
            }
            candidates.push({ path, node: path.node, ancestors, depth, order: candidates.length, use: consumption(path, config) });
          } });
          candidates.sort((a, b) => b.depth - a.depth || a.order - b.order);
          const compiled = new Set<t.Node>();
          for (const candidate of candidates) {
            if (candidate.ancestors.some(node => compiled.has(node))) continue;
            const path = candidate.path;
            const type = callType(path, config);
            if (type.kind !== "host") continue;

            const start = path.node.loc?.start;
            const base = {
              id: regions.length + 1,
              tag: type.tag,
              line: start?.line ?? null,
              column: start === undefined ? null : start.column + 1,
            };

            let holes: NodePath<t.Expression>[] = [];
            let result = classifyElement(path, config, holes);
            let ordered = false;
            if (!result.ok || holes.length > MAX_HOLES) {
              const captured: NodePath<t.Expression>[] = [];
              const native = classifyOrderedElement(path, config, captured);
              if (native.ok) { result = native; holes = captured; ordered = true; }
            }
            if (!result.ok) {
              // Children may still hold regions of their own.
              regions.push({ ...base, static: false, holes: 0, strategy: "runtime", nodes: 0, reason: result.reason });
              continue;
            }

            const nodes = countNodes(result.element);
            const counts = ordered ? orderedCounts(result.element) : null;
            const shape = { static: holes.length === 0, holes: counts?.children ?? holes.length, nodes,
              ...(counts === null ? {} : { bindings: counts.bindings }) };
            if (!ordered && holes.length > MAX_HOLES) {
              regions.push({
                ...base,
                ...shape,
                strategy: "runtime",
                reason: `${holes.length} dynamic children (at most ${MAX_HOLES} per region)`,
              });
              continue;
            }

            // Keep the proof from the original tree: earlier replacements may
            // have moved a reference into a generated captured-values array.
            const use = candidate.use;
            if (!use.consumed) {
              regions.push({ ...base, ...shape, strategy: "runtime", reason: use.reason });
              continue;
            }

            let emitted: Emitted & { create: t.Identifier };
            if (ordered) {
              const create = program.scope.generateUidIdentifier("create");
              hoisted.push(emitOrderedNative(result.element, create));
              emitted = { create, strategy: "native", reason: "ordered runtime props and children" };
            } else emitted = choose(result.element, nodes, holes.length);
            const fallback = program.scope.generateUidIdentifier("fallback");
            const args: t.Expression[] = [emitted.create, fallback];
            const params: t.Identifier[] = [];
            if (holes.length > 0) {
              // Each hole expression stays where the region is evaluated
              // (same scope, same order); the fallback receives its value.
              const values = program.scope.generateUidIdentifier("h");
              args.push(t.arrayExpression(holes.map((hole) => hole.node)));
              holes.forEach((hole, index) => {
                hole.replaceWith(t.memberExpression(t.identifier(values.name), t.numericLiteral(index), true));
                // A call's pure annotation is invalid on a value lookup.
                hole.node.leadingComments = hole.node.leadingComments?.filter(comment => !/[@#]__PURE__/.test(comment.value));
              });
              params.push(values);
            }
            hoisted.push(
              t.functionDeclaration(fallback, params, t.blockStatement([t.returnStatement(path.node)])),
            );
            path.replaceWith(t.callExpression(helper("compiled"), args));
            compiled.add(candidate.node);
            regions.push({ ...base, ...shape, strategy: emitted.strategy, reason: emitted.reason });
          }
          regions.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0));
          for (let i = 0; i < regions.length; i++) regions[i] = { ...regions[i]!, id: i + 1 };
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
  readonly map: BabelFileResult["map"];
}

/** Runs the plugin alone on an ES module whose JSX is already lowered. */
export function transformReflexDOM(
  code: string,
  options: ReflexDOMCompilerOptions & {
    readonly filename?: string;
    readonly sourceMaps?: boolean;
  } = {},
): TransformResult {
  const { filename, sourceMaps = false, ...pluginOptions } = options;
  const result = transformSync(code, {
    filename: filename ?? "module.js",
    sourceFileName: filename ?? "module.js",
    sourceMaps,
    babelrc: false,
    configFile: false,
    sourceType: "module",
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [[reflexDOMCompiler, pluginOptions]],
  });
  const report = (result?.metadata as { reflexDOMCompiler?: CompilerReport } | undefined)
    ?.reflexDOMCompiler ?? { filename: filename ?? null, disabled: true, regions: [] };
  return { code: result?.code ?? code, report, map: result?.map ?? null };
}
