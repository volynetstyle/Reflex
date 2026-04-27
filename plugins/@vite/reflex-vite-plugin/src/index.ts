import { parseSync, printSync } from "@swc/core";
import { Visitor } from "@swc/core/Visitor.js";
import type {
  ArrowFunctionExpression,
  Expression,
  JSXAttribute,
  JSXAttributeName,
  JSXAttributeOrSpread,
  JSXAttrValue,
  JSXExpressionContainer,
  Module,
  Program,
} from "@swc/core";
import type { Plugin } from "vite";

type SelectorType = string | RegExp | Array<string | RegExp>;

const DEFAULT_JSX_IMPORT_SOURCE = "@volynets/reflex-dom";
const DEFAULT_REACTIVE_PROPS = ["class", "className", "style"] as const;

const WRAPPABLE_EXPRESSION_TYPES = new Set<Expression["type"]>([
  "ArrayExpression",
  "AssignmentExpression",
  "AwaitExpression",
  "BinaryExpression",
  "CallExpression",
  "ConditionalExpression",
  "NewExpression",
  "ObjectExpression",
  "OptionalChainingExpression",
  "ParenthesisExpression",
  "SequenceExpression",
  "TaggedTemplateExpression",
  "TemplateLiteral",
  "TsAsExpression",
  "TsConstAssertion",
  "TsInstantiation",
  "TsNonNullExpression",
  "TsSatisfiesExpression",
  "TsTypeAssertion",
  "UnaryExpression",
  "UpdateExpression",
]);

export interface ReflexDOMTransformOptions {
  include?: RegExp;
  exclude?: RegExp;
  reactiveProps?: readonly string[];
}

export interface ReflexDOMTransformResult {
  code: string;
  map: string | null;
}

export interface ReflexPluginOptions {
  /**
   * Can be used to process extra files like `.mdx`
   * @example include: /\.(mdx|js|jsx|ts|tsx)$/
   * @default /\.[tj]sx?$/
   */
  include?: SelectorType;
  /**
   * Can be used to exclude JSX/TSX files that run in a worker or are not Reflex files.
   * Except if explicitly desired, keep node_modules in the exclude list.
   * @example exclude: [/\/pdf\//, /\.solid\.tsx$/, /\/node_modules\//]
   * @default /\/node_modules\//
   */
  exclude?: SelectorType;
  /**
   * Control where the JSX factory is imported from.
   * https://oxc.rs/docs/guide/usage/transformer/jsx.html#import-source
   * @default "@volynets/reflex-dom"
   */
  jsxImportSource?: string;
  /**
   * Note: Skipping Reflex import with classic runtime is not supported from v4.
   * @default "automatic"
   */
  jsxRuntime?: "classic" | "automatic" | "reflex" | "tsrx";
  /**
   * Reflex Fast Refresh runtime options.
   */
  reflex?: {
    /**
     * Reflex Fast Refresh runtime URL prefix.
     * Useful in a module federation context to enable HMR by specifying
     * the host application URL in the Vite config of a remote application.
     */
    refreshHost?: string;
  };
  /**
   * Enables the DOM JSX transform that wraps computed reactive props
   * like class/className/style into accessors.
   */
  dom?: boolean | ReflexDOMTransformOptions;
}

class ReflexDOMJSXReactivePropsVisitor extends Visitor {
  private jsxAttributeDepth = 0;

  constructor(private readonly reactiveProps: ReadonlySet<string>) {
    super();
  }

  override visitJSXAttribute(node: JSXAttribute): JSXAttributeOrSpread {
    this.jsxAttributeDepth++;
    let next: JSXAttribute;

    try {
      next = super.visitJSXAttribute(node) as JSXAttribute;
    } finally {
      this.jsxAttributeDepth--;
    }

    const propName = getJSXAttributeName(next.name);

    if (!propName || !this.reactiveProps.has(propName)) {
      return next;
    }

    const value = next.value;

    if (!isJSXExpressionContainer(value)) {
      return next;
    }

    const expression = value.expression;

    if (expression.type === "JSXEmptyExpression") {
      return next;
    }

    if (!shouldWrapExpression(expression)) {
      return next;
    }

    next.value = {
      ...value,
      expression: createAccessorExpression(expression),
    };

    return next;
  }

  override visitJSXExpressionContainer(
    node: JSXExpressionContainer,
  ): JSXExpressionContainer {
    const next = super.visitJSXExpressionContainer(node);

    if (this.jsxAttributeDepth > 0) {
      return next;
    }

    const expression = next.expression;

    if (expression.type === "JSXEmptyExpression") {
      return next;
    }

    if (!shouldWrapExpression(expression)) {
      return next;
    }

    return {
      ...next,
      expression: createAccessorExpression(expression),
    };
  }
}

function normalizeDOMOptions(
  options: ReflexDOMTransformOptions = {},
): Required<ReflexDOMTransformOptions> {
  return {
    include: options.include ?? /\.[cm]?[jt]sx(?:$|\?)/,
    exclude: options.exclude ?? /node_modules/,
    reactiveProps: options.reactiveProps ?? DEFAULT_REACTIVE_PROPS,
  };
}

function stripQueryAndHash(id: string): string {
  return id.replace(/[?#].*$/, "");
}

function shouldProcessFile(
  id: string,
  options: Required<ReflexDOMTransformOptions>,
): boolean {
  const cleanId = stripQueryAndHash(id);

  return options.include.test(cleanId) && !options.exclude.test(cleanId);
}

function hasPotentialReactiveJSXExpression(
  code: string,
  reactiveProps: readonly string[],
): boolean {
  const hasReactivePropExpression = reactiveProps.some((propName) =>
    new RegExp(`\\b${propName}\\s*=\\s*\\{`).test(code),
  );

  if (hasReactivePropExpression) {
    return true;
  }

  return code.includes("{") && /<[A-Za-z][\w.:$-]*(?:\s|>|\/)|<>/.test(code);
}

function getJSXAttributeName(name: JSXAttributeName): string | null {
  if (name.type === "Identifier") {
    return name.value;
  }

  return null;
}

function isJSXExpressionContainer(
  value: JSXAttrValue | undefined,
): value is JSXExpressionContainer {
  return value?.type === "JSXExpressionContainer";
}

function shouldWrapExpression(expression: Expression): boolean {
  return WRAPPABLE_EXPRESSION_TYPES.has(expression.type);
}

function createAccessorExpression(
  expression: Expression,
): ArrowFunctionExpression {
  return {
    type: "ArrowFunctionExpression",
    span: (expression as ArrowFunctionExpression).span,
    ctxt: 0,
    params: [],
    body: expression,
    async: false,
    generator: false,
    typeParameters: undefined,
    returnType: undefined,
  } as unknown as ArrowFunctionExpression;
}

function parseJSXModule(code: string, id: string): Module {
  const cleanId = stripQueryAndHash(id);
  const isTypeScript = /\.([cm]?ts)x$/i.test(cleanId);

  return parseSync(code, {
    syntax: isTypeScript ? "typescript" : "ecmascript",
    tsx: isTypeScript,
    jsx: !isTypeScript,
    target: "es2022",
  });
}

function printProgram(program: Program, id: string): ReflexDOMTransformResult {
  const output = printSync(program, {
    filename: stripQueryAndHash(id),
    sourceMaps: true,
  });

  return {
    code: output.code,
    map: output.map ?? null,
  };
}

function normalizeDOMPluginOptions(
  options: boolean | ReflexDOMTransformOptions | undefined,
): ReflexDOMTransformOptions | null {
  if (options === undefined || options === false) {
    return null;
  }

  return options === true ? {} : options;
}

function createJSXEsbuildOptions(options: ReflexPluginOptions) {
  const jsxRuntime = options.jsxRuntime ?? "automatic";
  const jsxImportSource = options.jsxImportSource ?? DEFAULT_JSX_IMPORT_SOURCE;

  if (jsxRuntime === "classic") {
    return {
      jsx: "transform" as const,
      jsxFactory: "jsx",
      jsxFragment: "Fragment",
    };
  }

  return {
    jsx: "automatic" as const,
    jsxImportSource,
  };
}

export function transformReflexDOMJSX(
  code: string,
  id: string,
  rawOptions: ReflexDOMTransformOptions = {},
): ReflexDOMTransformResult | null {
  const options = normalizeDOMOptions(rawOptions);

  if (!shouldProcessFile(id, options)) {
    return null;
  }

  if (!hasPotentialReactiveJSXExpression(code, options.reactiveProps)) {
    return null;
  }

  const ast = parseJSXModule(code, id);
  const visitor = new ReflexDOMJSXReactivePropsVisitor(
    new Set(options.reactiveProps),
  );
  const transformed = visitor.visitProgram(ast) as Program;

  return printProgram(transformed, id);
}

export function reflexDOMVitePlugin(
  options: ReflexDOMTransformOptions = {},
): Plugin {
  return {
    name: "reflex-dom-jsx-reactive-props",
    enforce: "pre",
    transform(code, id) {
      return transformReflexDOMJSX(code, id, options);
    },
  };
}

export function reflexJSXVitePlugin(options: ReflexPluginOptions = {}): Plugin {
  return {
    name: "reflex-jsx",
    config() {
      return {
        esbuild: createJSXEsbuildOptions(options),
      };
    },
  };
}

export function reflex(options: ReflexPluginOptions = {}): Plugin[] {
  const plugins: Plugin[] = [];
  const domOptions = normalizeDOMPluginOptions(options.dom);

  if (domOptions !== null) {
    plugins.push(reflexDOMVitePlugin(domOptions));
  }

  plugins.push(reflexJSXVitePlugin(options));

  return plugins;
}

export default reflex;
