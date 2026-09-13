import { describe, expect, it } from "vitest";
import type { TransformResult } from "vite";
import {
  reflexStore,
  reflexStoreVitePlugin,
} from "../src/vite";

type TransformHandler = (
  this: TransformContext,
  code: string,
  id: string,
) => TransformResult | Promise<TransformResult>;

type TransformContext = {
  warn(warning: string | Error): void;
  error(error: string | Error): never;
};

function getTransform(plugin = reflexStoreVitePlugin()): TransformHandler {
  if (typeof plugin.transform === "function") {
    return plugin.transform as TransformHandler;
  }

  throw new Error("Expected a function transform handler.");
}

function createPluginContext(warnings: string[] = []): TransformContext {
  return {
    warn(warning: string | Error) {
      warnings.push(typeof warning === "string" ? warning : warning.message);
    },
    error(error: string | Error): never {
      throw new Error(typeof error === "string" ? error : error.message);
    },
  };
}

describe("reflexStoreVitePlugin", () => {
  it("compiles imported createStore calls in Vite transform", async () => {
    const transform = getTransform();
    const result = await transform.call(
      createPluginContext(),
      [
        'import { createStore } from "@volynets/reflex-store";',
        "const state = createStore({ count: 0 });",
        "state.count += 1;",
      ].join("\n"),
      "src/app.ts",
    );

    expect(result).not.toBeNull();
    expect((result as { code: string }).code).toContain(
      'from "@volynets/reflex"',
    );
    expect((result as { code: string }).code).toContain(
      "const __read_count = __reflex_signal(0);",
    );
    expect((result as { code: string }).code).toContain("__write_count(__next_");
  });

  it("skips bare createStore calls by default to avoid false positives", async () => {
    const transform = getTransform();
    const result = await transform.call(
      createPluginContext(),
      "const state = createStore({ count: 0 });",
      "src/app.ts",
    );

    expect(result).toBeNull();
  });

  it("can opt into bare createStore compilation", async () => {
    const transform = getTransform(
      reflexStore({ compileBareCreateStore: true }),
    );
    const result = await transform.call(
      createPluginContext(),
      "const state = createStore({ count: 0 });",
      "src/app.ts",
    );

    expect((result as { code: string }).code).toContain("__reflex_signal(0)");
  });

  it("passes a custom lowering target to the compiler", async () => {
    const transform = getTransform(
      reflexStore({
        loweringTarget: {
          runtimeModule: "custom-runtime",
          signal: { exportName: "cell", localName: "$cell" },
          identifiers: {
            read: ({ mangledPath }) => `$read_${mangledPath}`,
          },
        },
      }),
    );
    const result = await transform.call(
      createPluginContext(),
      [
        'import { createStore } from "@volynets/reflex-store";',
        "const state = createStore({ count: 0 });",
        "void state.count;",
      ].join("\n"),
      "src/app.ts",
    );

    expect((result as { code: string }).code).toContain(
      'cell as $cell } from "custom-runtime"',
    );
    expect((result as { code: string }).code).toContain("$read_count()");
  });

  it("respects exclude filters", async () => {
    const transform = getTransform();
    const result = await transform.call(
      createPluginContext(),
      [
        'import { createStore } from "@reflex/store";',
        "const state = createStore({ count: 0 });",
      ].join("\n"),
      "/project/node_modules/pkg/index.ts",
    );

    expect(result).toBeNull();
  });

  it("surfaces phase-1 diagnostics through Vite errors", async () => {
    const transform = getTransform();

    await expect(
      Promise.resolve().then(() =>
        transform.call(
          createPluginContext(),
          [
            'import { createStore } from "@reflex/store";',
            "const state = createStore({ count: 0 });",
            "state[key];",
          ].join("\n"),
          "src/app.ts",
        ),
      ),
    ).rejects.toThrow(
      "Dynamic compiled-store access is not supported in phase 1.",
    );
  });
});
