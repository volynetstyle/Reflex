/** @jsxImportSource ../src */

import { describe, expect, it } from "vitest";
import {
  getActiveExecutionDomain,
  getActiveRuntimeContext,
  type ExecutionDomain,
} from "@volynets/reflex-runtime";
import { renderToString } from "../src";

describe("SSR request domains", () => {
  it("renders each request in its own domain and closes it afterwards", () => {
    const seen: Array<ExecutionDomain | undefined> = [];
    const ambient = getActiveRuntimeContext();

    function Probe() {
      seen.push(getActiveExecutionDomain());
      return <p>ok</p>;
    }

    expect(renderToString(<Probe />)).toContain("ok");
    expect(renderToString(<Probe />)).toContain("ok");

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeDefined();
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen.every((domain) => domain!.closed)).toBe(true);
    expect(getActiveRuntimeContext()).toBe(ambient);
  });
});
