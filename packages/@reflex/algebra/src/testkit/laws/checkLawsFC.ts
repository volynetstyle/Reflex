import type { LawSet } from "../../core/laws/laws"

/**
 * checkLawsFC (fast-check integration)
 *
 * Run laws using a property-based testing framework (e.g., fast-check).
 * This is a placeholder; in real usage, you'd integrate with fast-check directly.
 *
 * For now, we provide a simple runner that repeats laws many times.
 * If you use fast-check, adapt this to use fc.assert() and fc.property().
 *
 * @param laws Law set to check
 * @param runs Number of iterations
 */
export function checkLawsFC(laws: LawSet, runs = 1000): void {
  for (const law of laws) {
    for (let i = 0; i < runs; i++) {
      const ok = law.check()
      if (!ok) {
        throw new Error(
          `Property-based law failed: ${law.name} (run ${i + 1}/${runs})`,
        )
      }
    }
  }
}
