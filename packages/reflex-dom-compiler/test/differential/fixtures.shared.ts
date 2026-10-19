import { expect } from "vitest";
import type { CompilerReport } from "../../src/diagnostics";
import { mountApp } from "../harness/dom";

export interface FixtureModule {
  default: unknown;
  minCompiled: number;
  __report: CompilerReport | null;
}

type Glob = Record<string, FixtureModule>;

// One eager glob per variant: Vite compiles each through `reflexVariantPlugin`.
export const variants = {
  baseline: import.meta.glob<FixtureModule>("../fixtures/*.tsx", { eager: true, query: { variant: "baseline" } }) as Glob,
  native: import.meta.glob<FixtureModule>("../fixtures/*.tsx", { eager: true, query: { variant: "native" } }) as Glob,
  template: import.meta.glob<FixtureModule>("../fixtures/*.tsx", { eager: true, query: { variant: "template" } }) as Glob,
  auto: import.meta.glob<FixtureModule>("../fixtures/*.tsx", { eager: true, query: { variant: "auto" } }) as Glob,
};

export const fixtureNames = Object.keys(variants.baseline).map((key) =>
  key.replace(/^.*\/(.*)\.tsx.*$/, "$1"),
);

function moduleOf(glob: Glob, name: string): FixtureModule {
  const key = Object.keys(glob).find((k) => k.includes(`/${name}.tsx`));
  if (key === undefined) throw new Error(`missing fixture ${name}`);
  return glob[key]!;
}

function compiledRegions(report: CompilerReport | null): number {
  return report?.regions.filter((r) => r.strategy !== "runtime").length ?? 0;
}

/**
 * Mounts every variant of a fixture and compares each with the baseline: the
 * final DOM, and the MutationObserver records of mount and dispose.
 */
export function checkFixture(name: string, doc: Document = document): void {
  const baseline = mountApp(moduleOf(variants.baseline, name).default, doc);
  const baselineDispose = baseline.dispose();
  // The trace comparison must not be vacuous.
  expect(baseline.mutations.length, `${name} mount records`).toBeGreaterThan(0);
  expect(baselineDispose.length, `${name} dispose records`).toBeGreaterThan(0);

  for (const variant of ["native", "template", "auto"] as const) {
    const module = moduleOf(variants[variant], name);
    expect(compiledRegions(module.__report), `${name}/${variant} compiled regions`)
      .toBeGreaterThanOrEqual(module.minCompiled);
    if (module.minCompiled === 0) {
      expect(compiledRegions(module.__report), `${name}/${variant} must not compile`).toBe(0);
    }

    const mounted = mountApp(module.default, doc);
    let disposeTrace: unknown = null;
    try {
      expect(mounted.snapshot, `${name}/${variant} DOM`).toEqual(baseline.snapshot);
      expect(mounted.html, `${name}/${variant} innerHTML`).toBe(baseline.html);
      expect(mounted.mutations, `${name}/${variant} mount mutations`).toEqual(baseline.mutations);
    } finally {
      disposeTrace = mounted.dispose();
      expect(mounted.container.childNodes.length).toBe(0);
    }
    expect(disposeTrace, `${name}/${variant} dispose mutations`).toEqual(baselineDispose);
  }
}
