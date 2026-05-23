import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readPackageExports(): Record<string, unknown> {
  const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
  const parsed = JSON.parse(packageJson) as { exports?: Record<string, unknown> };

  return parsed.exports ?? {};
}

describe("package exports", () => {
  it("exposes only the public DOM entrypoints", () => {
    expect(Object.keys(readPackageExports())).toEqual([
      ".",
      "./jsx-runtime",
      "./jsx-dev-runtime",
    ]);
  });
});
