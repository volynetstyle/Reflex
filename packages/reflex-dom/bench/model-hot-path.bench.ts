import { bench, describe } from "vitest";
import {
  createDOMContext,
  withDOMContext,
  type DOMContext,
} from "../src/runtime/context";
import {
  defineModel,
  readModelValue,
  type ModelReadable,
} from "../src/runtime/model";

const OPERATIONS = 1_024;
let value = 0;

const createModel = defineModel((ctx) => {
  const increment = ctx.action(() => ++value);

  return {
    value: ctx.read(() => value),
    increment,
    incrementNested: ctx.action(() => increment()),
  };
});

type BenchModel = ReturnType<typeof createModel>;

function setupModel(): { context: DOMContext; model: BenchModel } {
  value = 0;
  let model!: BenchModel;
  const context = createDOMContext();
  withDOMContext(context, () => {
    model = createModel();
  });
  return { context, model };
}

describe("model runtime hot paths", () => {
  let read!: ModelReadable<number>;
  let model!: BenchModel;
  let context!: DOMContext;

  bench(
    "branded read through readModelValue",
    () => {
      let total = 0;
      for (let index = 0; index < OPERATIONS; index++) {
        total += readModelValue(read);
      }
      if (total < 0) throw new Error("unreachable read result");
    },
    {
      setup() {
        ({ model } = setupModel());
        read = model.value;
      },
      teardown() {
        model.dispose();
      },
    },
  );

  bench(
    "model action",
    () => {
      for (let index = 0; index < OPERATIONS; index++) model.increment();
    },
    {
      setup() {
        ({ model } = setupModel());
      },
      teardown() {
        if (value % OPERATIONS !== 0) {
          throw new Error("model action lost an invocation");
        }
        model.dispose();
      },
    },
  );

  bench(
    "model action under active DOM context",
    () => {
      withDOMContext(context, () => {
        for (let index = 0; index < OPERATIONS; index++) model.increment();
      });
    },
    {
      setup() {
        ({ context, model } = setupModel());
      },
      teardown() {
        if (value % OPERATIONS !== 0) {
          throw new Error("context-bound model action lost an invocation");
        }
        model.dispose();
      },
    },
  );

  bench(
    "nested model action",
    () => {
      for (let index = 0; index < OPERATIONS; index++) model.incrementNested();
    },
    {
      setup() {
        ({ model } = setupModel());
      },
      teardown() {
        if (value % OPERATIONS !== 0) {
          throw new Error("nested model action lost an invocation");
        }
        model.dispose();
      },
    },
  );
});
