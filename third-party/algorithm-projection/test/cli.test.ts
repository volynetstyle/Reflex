import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: (text: string) => {
        stdout += text;
      },
      stderr: (text: string) => {
        stderr += text;
      },
    },
    output: () => ({ stdout, stderr }),
  };
}

describe("algorithm-projection CLI", () => {
  it("prints help without attempting analysis", () => {
    const target = capture();
    expect(runCli(["--help"], target.io)).toBe(0);
    expect(target.output()).toEqual({
      stdout: expect.stringContaining(
        "Usage: algorithm-projection <file> <function>",
      ),
      stderr: "",
    });
  });

  it("reports invalid arguments on stderr", () => {
    const target = capture();
    expect(runCli(["only-a-file.ts"], target.io)).toBe(1);
    expect(target.output().stdout).toBe("");
    expect(target.output().stderr).toContain("Expected <file> and <function>");
  });

  it("rejects unknown options", () => {
    const target = capture();
    expect(runCli(["input.ts", "run", "--wat"], target.io)).toBe(1);
    expect(target.output().stderr).toContain("Unknown option --wat");
  });
});
