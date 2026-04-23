import { parseSync, printSync } from "@swc/core";
import { Visitor } from "@swc/core/Visitor";
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

class ReflexDOMJSXReactivePropsVisitor extends Visitor {
  constructor(private readonly reactiveProps: ReadonlySet<string>) {
    super();
  }

  override visitJSXAttribute(node: JSXAttribute): JSXAttributeOrSpread {
    const next = super.visitJSXAttribute(node) as JSXAttribute;
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
}

function normalizeOptions(
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

function hasReactivePropExpression(
  code: string,
  reactiveProps: readonly string[],
): boolean {
  return reactiveProps.some((propName) =>
    new RegExp(`\\b${propName}\\s*=\\s*\\{`).test(code),
  );
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

export function transformReflexDOMJSX(
  code: string,
  id: string,
  rawOptions: ReflexDOMTransformOptions = {},
): ReflexDOMTransformResult | null {
  const options = normalizeOptions(rawOptions);

  if (!shouldProcessFile(id, options)) {
    return null;
  }

  if (!hasReactivePropExpression(code, options.reactiveProps)) {
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
