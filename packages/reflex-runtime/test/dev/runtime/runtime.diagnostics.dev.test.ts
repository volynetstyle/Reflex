import { beforeEach, describe, expect, it } from "vitest";

import { subtle } from "../../../src/debug";
import { readConsumer, readProducer, writeProducer } from "../../../src";
import {
  createConsumer,
  createProducer,
  resetRuntime,
} from "../../runtime.test_utils";

describe("Reactive runtime - diagnostics tools (dev)", () => {
  beforeEach(() => {
    resetRuntime();
    subtle.clearHistory();
  });

  it("explains graph state and publishes thin MCP tools", () => {
    const source = subtle.label(createProducer(1), "source");
    const computed = subtle.label(
      createConsumer(() => readProducer(source) * 2),
      "computed",
    );

    expect(readConsumer(computed)).toBe(2);
    const sourceId = subtle.snapshot(source)!.id;
    const computedId = subtle.snapshot(computed)!.id;
    writeProducer(source, 2);

    const diagnostics = subtle.diagnostics();
    expect(diagnostics.graph.parents(computedId)).toMatchObject({ ok: true });
    expect(diagnostics.dependencies.whyDirty(computedId)).toMatchObject({
      ok: true,
      result: { dirty: true },
    });
    expect(diagnostics.timeline.timestamps(sourceId)).toMatchObject({
      ok: true,
      result: { createdAt: expect.any(Number) },
    });
    expect(diagnostics.statistics.summary()).toMatchObject({
      ok: true,
      result: { edgeCount: expect.any(Number), nodeCount: expect.any(Number) },
    });

    const mcp = subtle.mcp();
    expect(mcp.list().map((tool) => tool.name)).toContain("graph.dump");
    expect(mcp.call("dependency.whyDirty", { id: computedId })).toMatchObject({
      isError: false,
      structuredContent: { ok: true },
    });
  });
});
