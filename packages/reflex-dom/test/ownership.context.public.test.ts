import { describe, expect, it } from "vitest";
import {
  createContext,
  hasOwnContext,
  provideContext,
  useContext,
  type OwnershipContext,
} from "../src";
import { createOwnerContext, createScope, runWithScope } from "../src/ownership";

describe("ownership context public api", () => {
  it("exports a typed context API with default values", () => {
    const ThemeContext = createContext("light");
    const owner = createOwnerContext();
    const scope = createScope();

    expect(useContext(owner, ThemeContext)).toBe("light");

    runWithScope(owner, scope, () => {
      expect(hasOwnContext(owner, ThemeContext)).toBe(false);

      provideContext(owner, ThemeContext, "dark");

      expect(hasOwnContext(owner, ThemeContext)).toBe(true);
      expect(useContext(owner, ThemeContext)).toBe("dark");
    });

    expect(useContext(scope, ThemeContext)).toBe("dark");
  });

  it("inherits parent values and keeps child overrides isolated", () => {
    const ThemeContext = createContext("light");
    const owner = createOwnerContext();
    const root = createScope();

    runWithScope(owner, root, () => {
      provideContext(owner, ThemeContext, "root");

      const child = createScope();
      runWithScope(owner, child, () => {
        expect(useContext(owner, ThemeContext)).toBe("root");
        expect(hasOwnContext(owner, ThemeContext)).toBe(false);

        provideContext(owner, ThemeContext, "child");

        expect(useContext(owner, ThemeContext)).toBe("child");
        expect(hasOwnContext(owner, ThemeContext)).toBe(true);
      });

      expect(useContext(owner, ThemeContext)).toBe("root");
      expect(hasOwnContext(owner, ThemeContext)).toBe(true);
    });
  });

  it("creates non-extensible public context objects and layers", () => {
    const ThemeContext = createContext("light");
    const owner = createOwnerContext();
    const scope = createScope();

    expect(Object.isExtensible(ThemeContext)).toBe(false);
    expect(() => {
      (
        ThemeContext as OwnershipContext<string> & Record<string, unknown>
      ).debug = true;
    }).toThrow(TypeError);

    runWithScope(owner, scope, () => {
      provideContext(owner, ThemeContext, "dark");
    });

    expect(scope.context).not.toBeNull();
    expect(Object.isExtensible(scope.context)).toBe(false);
    expect(() => {
      (scope.context as Record<string, unknown>).extra = true;
    }).toThrow(TypeError);
  });
});
