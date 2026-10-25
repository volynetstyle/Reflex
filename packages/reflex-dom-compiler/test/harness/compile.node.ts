/**
 * Node-side compilation for tests: Babel only, so it also runs inside the
 * jsdom environment and behind the browser `compileLowered` command.
 */
import { transformSync, types as t, type NodePath, type PluginObj } from "@babel/core";
import type { CompilerReport } from "../../src/diagnostics";
import { transformReflexDOM } from "../../src/transform";

export type Variant = "baseline" | "native" | "template" | "auto";
export const VARIANTS: readonly Variant[] = ["baseline", "native", "template", "auto"];

export interface CompiledModule {
  /** Function body taking `(__require, __exports)`. */
  readonly body: string;
  readonly code: string;
  readonly report: CompilerReport | null;
}

const REQUIRE = "__require";
const EXPORTS = "__exports";

function exportAssignment(name: string, value: t.Expression): t.Statement {
  return t.expressionStatement(
    t.assignmentExpression(
      "=",
      t.memberExpression(t.identifier(EXPORTS), t.stringLiteral(name), true),
      value,
    ),
  );
}

function declaredNames(declaration: t.Declaration): string[] {
  if (t.isVariableDeclaration(declaration)) {
    return declaration.declarations.flatMap((declarator) =>
      Object.keys(t.getBindingIdentifiers(declarator.id)),
    );
  }
  return "id" in declaration && t.isIdentifier(declaration.id) ? [declaration.id.name] : [];
}

/** Rewrites ES module syntax into `__require`/`__exports` calls. */
function moduleToFunction(): PluginObj {
  return {
    visitor: {
      Program(program) {
        for (const statement of program.get("body") as NodePath[]) {
          if (statement.isImportDeclaration()) {
            const source = t.callExpression(t.identifier(REQUIRE), [
              t.stringLiteral(statement.node.source.value),
            ]);
            const properties: t.ObjectProperty[] = [];
            const replacements: t.Statement[] = [];
            for (const specifier of statement.node.specifiers) {
              if (t.isImportNamespaceSpecifier(specifier)) {
                replacements.push(
                  t.variableDeclaration("const", [t.variableDeclarator(specifier.local, source)]),
                );
              } else {
                const imported = t.isImportDefaultSpecifier(specifier)
                  ? "default"
                  : t.isIdentifier(specifier.imported)
                    ? specifier.imported.name
                    : specifier.imported.value;
                properties.push(t.objectProperty(t.stringLiteral(imported), specifier.local));
              }
            }
            if (properties.length > 0) {
              replacements.push(
                t.variableDeclaration("const", [
                  t.variableDeclarator(t.objectPattern(properties), source),
                ]),
              );
            }
            statement.replaceWithMultiple(replacements);
          } else if (statement.isExportNamedDeclaration()) {
            const { declaration, specifiers } = statement.node;
            if (declaration) {
              statement.replaceWithMultiple([
                declaration,
                ...declaredNames(declaration).map((name) =>
                  exportAssignment(name, t.identifier(name)),
                ),
              ]);
            } else {
              statement.replaceWithMultiple(
                specifiers.map((specifier) => {
                  const s = specifier as t.ExportSpecifier;
                  const exported = t.isIdentifier(s.exported) ? s.exported.name : s.exported.value;
                  return exportAssignment(exported, s.local);
                }),
              );
            }
          } else if (statement.isExportDefaultDeclaration()) {
            const declaration = statement.node.declaration;
            if (
              (t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) &&
              declaration.id
            ) {
              statement.replaceWithMultiple([
                declaration,
                exportAssignment("default", declaration.id),
              ]);
            } else {
              statement.replaceWith(
                exportAssignment("default", declaration as t.Expression),
              );
            }
          }
        }
      },
    },
  };
}

export function toFunctionBody(code: string): string {
  return transformSync(code, {
    babelrc: false,
    configFile: false,
    sourceType: "module",
    plugins: [moduleToFunction],
  })!.code!;
}

/** Compiles a module whose JSX is already lowered to factory calls. */
export function compileLowered(code: string, variant: Variant): CompiledModule {
  const out =
    variant === "baseline"
      ? { code, report: null }
      : transformReflexDOM(code, { strategy: variant, filename: "generated.js" });
  return { body: toFunctionBody(out.code), code: out.code, report: out.report };
}
