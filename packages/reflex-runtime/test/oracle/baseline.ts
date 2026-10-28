// Runtime bundles of the oracle suites, built and cached by the testkit
// (testkit/lib/sides.mjs): one builder and one cache for `pnpm rt` and vitest.
import { pinnedBaseline } from "../../testkit/lib/paths.mjs";
import { buildSide, loadSide } from "../../testkit/lib/sides.mjs";
import type { RuntimeModule } from "../../testkit/oracle/program";

export const BASELINE_COMMIT: string = pinnedBaseline();

/** The frozen baseline bundle (testkit/oracle/baseline-commit.txt). */
export async function loadBaseline(): Promise<RuntimeModule> {
  return (await loadSide(
    await buildSide("baseline", { flavor: "oracle", quiet: true }),
  )) as RuntimeModule;
}

/**
 * The working tree, rebuilt per process: as a mutant (`--mutate` arguments)
 * or with branch-coverage projections (`flavor: "profile"`).
 */
export async function loadSource({
  flavor = "oracle",
  mutations = [],
}: {
  flavor?: "oracle" | "profile";
  mutations?: string[];
} = {}): Promise<RuntimeModule> {
  return (await loadSide(
    await buildSide("source", {
      flavor,
      extraMutations: mutations,
      quiet: true,
    }),
  )) as RuntimeModule;
}
