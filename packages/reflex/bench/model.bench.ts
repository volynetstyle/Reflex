import { bench, describe } from "vitest";
import { createRuntime } from "../src/infra/runtime";
import { createModel, readModelValue } from "../src/infra/model";

createRuntime();

const createEmptyModel = createModel(() => ({}));
const createActionModel = createModel((ctx) => ({
  action: ctx.action((value: number) => value + 1),
}));
const readable = () => 1;

describe("model", () => {
  bench("create + dispose (no cleanup)", () => {
    for (let i = 0; i < 1_000; i++) {
      createEmptyModel().dispose();
    }
  });

  bench("create + dispose (two cleanups)", () => {
    for (let i = 0; i < 1_000; i++) {
      createModel((ctx) => {
        ctx.onDispose(() => {});
        ctx.onDispose(() => {});
        return {};
      })().dispose();
    }
  });

  bench("action call", () => {
    const model = createActionModel();
    let value = 0;

    for (let i = 0; i < 10_000; i++) {
      value = model.action(value);
    }

    return value;
  });

  bench("read accessor", () => {
    let value = 0;

    for (let i = 0; i < 100_000; i++) {
      value += readModelValue(readable);
    }

    return value;
  });

  bench("read plain value", () => {
    let value = 0;

    for (let i = 0; i < 100_000; i++) {
      value += readModelValue(1);
    }

    return value;
  });
});
