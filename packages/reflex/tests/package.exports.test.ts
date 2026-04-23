import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readPackageExports(): Record<string, unknown> {
  const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
  const parsed = JSON.parse(packageJson) as { exports?: Record<string, unknown> };

  return parsed.exports ?? {};
}

describe("package exports", () => {
  it("keeps unstable helpers behind the unstable subpath", () => {
    expect(Object.keys(readPackageExports())).toEqual([".", "./unstable"]);
  });
});
