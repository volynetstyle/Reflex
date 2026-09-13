import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  profileRuntime,
  profileRuntimeCounter,
  runtimeProfileCounters,
} from "@runtime/profiling";
import {
  adaptRuntimeProjection,
  legacyCounterProjection,
} from "@runtime/kernel/projection";

const runtimeSourceRoot = join(process.cwd(), "src");

function instrumentedFiles(directory = runtimeSourceRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? instrumentedFiles(path)
      : entry.name.endsWith(".ts")
        ? [path]
        : [];
  });
}

describe("runtime projection compatibility", () => {
  it("keeps legacy instrumentation out of runtime algorithms and maps every semantic counter", () => {
    const source = instrumentedFiles()
      .filter(
        (file) =>
          !file.endsWith("profiling.ts") &&
          !file.endsWith("projection.ts") &&
          !file.endsWith("projection.propagate.ts") &&
          !file.endsWith("dev.ts"),
      )
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /profileRuntime(?:Counter|CounterBy|PushPath|PullPath)/u,
    );
    expect(source).not.toContain("devRecordPropagate");

    for (const id of Object.keys(legacyCounterProjection)) {
      expect(source, id).toContain(`"${id}"`);
    }
  });

  it("covers the complete RuntimeProfileCounters compatibility surface", () => {
    const adapted = new Set([
      ...Object.values(legacyCounterProjection),
      "pushStackTrimExcess",
      "pullStackTrimExcess",
      "readConsumerDirtyPath",
      "readConsumerCleanFastPath",
    ]);
    expect(adapted).toEqual(new Set(Object.keys(runtimeProfileCounters)));
  });

  it("is differentially equivalent to every legacy counter", () => {
    for (const [id, counter] of Object.entries(legacyCounterProjection)) {
      const legacy = profileRuntime(() => profileRuntimeCounter(counter));
      const projected = profileRuntime(() =>
        adaptRuntimeProjection({
          id: id as keyof typeof legacyCounterProjection,
          kind: "semantic",
          payload: undefined,
        }),
      );
      expect(projected.counters, id).toEqual(legacy.counters);
      expect(projected.topology, id).toEqual(legacy.topology);
    }
  });

  it("projects a semantic observation to the exact legacy counter", () => {
    const result = profileRuntime(() =>
      adaptRuntimeProjection({
        id: "projection.semantic.push.subscriber.dirty.skip",
        kind: "semantic",
        payload: undefined,
      }),
    );
    expect(result.counters.pushAlreadyDirtySkipped).toBe(1);
    expect(
      Object.entries(result.counters).filter(([, value]) => value !== 0),
    ).toEqual([["pushAlreadyDirtySkipped", 1]]);
  });
});
