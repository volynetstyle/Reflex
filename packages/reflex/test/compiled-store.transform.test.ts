import { describe, expect, it } from "vitest";
import { transformCompiledStore } from "../src/unstable/store/transform";

describe("transformCompiledStore", () => {
  it("rewrites static leaf reads into generated accessor calls", () => {
    const source = [
      'const state = createStore({ user: { name: "Alice" }, count: 0 });',
      "const name = state.user.name;",
      "const count = state.count;",
    ].join("\n");

    const result = transformCompiledStore(source);

    expect(result.code).toContain("const name = __read_user_name()");
    expect(result.code).toContain("const count = __read_count()");
  });

  it("rewrites plain and compound assignments", () => {
    const source = [
      'const state = createStore({ user: { name: "Alice" }, count: 0 });',
      'state.user.name = "Bob";',
      "state.count += 2;",
    ].join("\n");

    const result = transformCompiledStore(source);

    expect(result.code).toContain('__write_user_name("Bob")');
    expect(result.code).toContain("const __rhs_");
    expect(result.code).toContain("__write_count(__next_");
  });

  it("rewrites postfix and prefix updates", () => {
    const source = [
      "const state = createStore({ count: 0 });",
      "state.count++;",
      "++state.count;",
    ].join("\n");

    const result = transformCompiledStore(source);

    expect(result.code).toContain("const __prev_");
    expect(result.code).toContain("return __prev_");
    expect(result.code).toContain("const __next_");
    expect(result.code).toContain("return __next_");
  });
});
