import type { LawSet } from "../../core/laws/laws"

export function checkLaws(laws: LawSet, runs = 100): void {
  for (const law of laws) {
    for (let i = 0; i < runs; i++) {
      const ok = law.check()
      if (!ok) {
        throw new Error(`Law failed: ${law.name} (run ${i + 1}/${runs})`)
      }
    }
  }
}
