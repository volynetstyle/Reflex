import { describe, expect, it } from "vitest";

import { explore } from "../api";
import { watcherEvidenceCases } from "./language";
import { Evidence } from "./model";

describe("watcher evidence differential language", () => {
  it("preserves every algebraically accumulated obligation", () => {
    expect(watcherEvidenceCases).toHaveLength(40);
    expect(
      watcherEvidenceCases.every(
        ({ expectedEvidence }) => expectedEvidence === Evidence.Both,
      ),
    ).toBe(true);

    const report = explore(watcherEvidenceCases);

    expect(report.total).toBe(40);
    expect(report.divergent).toBe(0);
  });
});
