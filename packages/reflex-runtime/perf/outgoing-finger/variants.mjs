// Build arguments of an outgoing-finger variant for
// scripts/build-baseline-oracle.mjs, shared by ./analyze.mjs and ./time.mjs.
import { variants as ladderVariants } from "../tracking-ladder/variants.mjs";

/**
 * `<finger>[+<mutation>...]`: the findEdge.ts variant (`base`, and
 * `candidate` for the working tree under `--commit source`: none) and
 * mutations from perf/tracking-ladder/variants.mjs (`rotate`, `no-detach`).
 */
export function variantArgs(name) {
  const [finger, ...mutations] = name.split("+");
  return [
    ...(finger === "base" || finger === "candidate"
      ? []
      : [
          "--overlay",
          `src/kernel/shape/graph/findEdge.ts=perf/outgoing-finger/variants/${finger}.findEdge.ts`,
        ]),
    ...mutations.flatMap((m) => {
      if (!(m in ladderVariants)) throw new Error(`unknown mutation ${m}`);
      return ladderVariants[m].flatMap((spec) => ["--mutate", spec]);
    }),
  ];
}
