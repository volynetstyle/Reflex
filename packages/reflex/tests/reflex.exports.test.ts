import { describe, expect, it } from "vitest";
import * as reflex from "../src";
import * as api from "../src/api";
import * as infra from "../src/infra";
import * as policy from "../src/policy/scheduler";
import * as d from "../src/policy";
import * as unstable from "../src/unstable";
import { resource } from "../src/unstable/resource";
import { createModel, isModel, own } from "../src/infra/model";

describe("Reactive system - exports", () => {
  it("re-exports the public API from the top-level barrel", () => {
    expect(reflex.signal).toBe(api.signal);
    expect(reflex.computed).toBe(api.computed);
    expect(reflex.memo).toBe(api.memo);
    expect(reflex.effect).toBe(api.effect);
    expect(reflex.subscribeOnce).toBe(api.subscribeOnce);
    expect(reflex.map).toBe(api.map);
    expect(reflex.filter).toBe(api.filter);
    expect(reflex.merge).toBe(api.merge);
    expect(reflex.scan).toBe(api.scan);
    expect(reflex.hold).toBe(api.hold);
    expect(typeof reflex.batch).toBe("function");
    expect(reflex.createModel).toBe(createModel);
    expect(reflex.isModel).toBe(isModel);
    expect(reflex.own).toBe(own);
    expect(reflex.createRuntime).toBe(infra.createRuntime);
    expect("resource" in reflex).toBe(false);
  });

  it("re-exports policy helpers from the policy barrel", () => {
    expect(typeof policy.createEffectScheduler).toBe("function");
    expect(typeof d.EventDispatcher).toBe("function");
    expect(typeof policy.resolveEffectSchedulerMode).toBe("function");
  });

  it("keeps unstable exports behind the unstable barrel", () => {
    expect(unstable.resource).toBe(resource);
  });
});
