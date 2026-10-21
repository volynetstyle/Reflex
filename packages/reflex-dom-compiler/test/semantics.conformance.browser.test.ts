import { expect, it } from "vitest";
import { checkSemantics } from "./semantics.conformance.shared";

it("every accepted static prop has exactly the compiled DOM effect (browser)", () => {
  const { checked, mismatches } = checkSemantics(document);
  expect(mismatches).toEqual([]);
  expect(checked).toBeGreaterThan(10_000);
}, 120_000);
