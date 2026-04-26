import { describe, expect, it } from "vitest";
import {
  createRuntime,
  effect,
  effectRender,
  signal,
} from "../src";

describe("effectRender", () => {
  it("reruns before regular effects on runtime flush", () => {
    const rt = createRuntime({ effectStrategy: "flush" });
    const [value, setValue] = signal(1);
    const log: string[] = [];

    effect(() => {
      log.push(`user:${value()}`);
    });

    effectRender(() => {
      log.push(`render:${value()}`);
    });

    log.length = 0;
    setValue(2);
    rt.flush();

    expect(log).toEqual(["render:2", "user:2"]);
  });
});
