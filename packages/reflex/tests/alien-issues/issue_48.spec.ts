import { describe, expect, it, vi } from "vitest";
import { reaction } from "../../src/api/effect";
import { setupAlienRuntime, signal } from "./alien-compat";

describe("alien-signals issue tests", () => {
  // Ported from stackblitz/alien-signals tests/issue_48.spec.ts.
  it("#48 disposes nested reactions during propagation", () => {
    setupAlienRuntime();

    const source = signal(0);
    const innerSpy = vi.fn();
    let disposeInner: Destructor | undefined;

    reaction(() => source()).subscribe((val) => {
      if (val === 1) {
        disposeInner = reaction(() => source()).subscribe(() => {
          innerSpy();
        });
      } else if (val === 2) {
        disposeInner!();
      }
    });

    source(1);
    source(2);
    source(3);

    expect(innerSpy).not.toHaveBeenCalled();
  });
});
