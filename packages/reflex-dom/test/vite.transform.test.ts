import { parseSync } from "@swc/core";
import { describe, expect, it } from "vitest";
import {
  reflexDOMVitePlugin,
  transformReflexDOMJSX,
} from "../src/vite";

function getOpeningAttributes(code: string) {
  const ast = parseSync(code, {
    syntax: "typescript",
    tsx: true,
    target: "es2022",
  });

  const declaration = ast.body[0];

  if (declaration?.type !== "VariableDeclaration") {
    throw new TypeError("Expected a JSX variable declaration");
  }

  const init = declaration.declarations[0]?.init;
  const jsx =
    init?.type === "ParenthesisExpression" ? init.expression : init;

  if (jsx?.type !== "JSXElement") {
    throw new TypeError("Expected a JSX element");
  }

  return jsx.opening.attributes;
}

describe("transformReflexDOMJSX", () => {
  it("wraps computed class and style expressions into accessors", () => {
    const source = [
      "const view = (",
      "  <div",
      '    class={count() === 0 ? "idle" : "active"}',
      "    style={styles()}",
      "    onClick={handleClick}",
      "  />",
      ");",
    ].join("\n");

    const result = transformReflexDOMJSX(source, "Component.tsx");

    expect(result).not.toBeNull();

    const attributes = getOpeningAttributes(result!.code);
    const [classAttr, styleAttr, onClickAttr] = attributes;

    expect(classAttr?.type).toBe("JSXAttribute");
    expect(styleAttr?.type).toBe("JSXAttribute");
    expect(onClickAttr?.type).toBe("JSXAttribute");

    if (
      classAttr?.type !== "JSXAttribute" ||
      classAttr.value?.type !== "JSXExpressionContainer" ||
      styleAttr?.type !== "JSXAttribute" ||
      styleAttr.value?.type !== "JSXExpressionContainer" ||
      onClickAttr?.type !== "JSXAttribute" ||
      onClickAttr.value?.type !== "JSXExpressionContainer"
    ) {
      throw new TypeError("Expected JSX attributes with expression containers");
    }

    expect(classAttr.value.expression.type).toBe("ArrowFunctionExpression");
    expect(styleAttr.value.expression.type).toBe("ArrowFunctionExpression");
    expect(onClickAttr.value.expression.type).toBe("Identifier");
  });

  it("leaves bare identifiers alone", () => {
    const source = 'const view = <div class={className} style={styleObject} />;';
    const result = transformReflexDOMJSX(source, "Component.tsx");

    expect(result).not.toBeNull();

    const attributes = getOpeningAttributes(result!.code);
    const [classAttr, styleAttr] = attributes;

    expect(classAttr?.type).toBe("JSXAttribute");
    expect(styleAttr?.type).toBe("JSXAttribute");

    if (
      classAttr?.type !== "JSXAttribute" ||
      classAttr.value?.type !== "JSXExpressionContainer" ||
      styleAttr?.type !== "JSXAttribute" ||
      styleAttr.value?.type !== "JSXExpressionContainer"
    ) {
      throw new TypeError("Expected JSX attributes with expression containers");
    }

    expect(classAttr.value.expression.type).toBe("Identifier");
    expect(styleAttr.value.expression.type).toBe("Identifier");
  });

  it("exposes a vite plugin wrapper", async () => {
    const plugin = reflexDOMVitePlugin();
    const transformed = await plugin.transform?.call(
      {} as never,
      'const view = <div class={count() === 0 ? "idle" : "active"} />;',
      "Component.tsx",
    );

    expect(transformed).not.toBeNull();
    expect(typeof transformed).toBe("object");
  });
});
