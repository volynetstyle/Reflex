// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../src/globals.d.ts" />

import { computed } from "../src/api/derived";
import { signal } from "../src/api/signal";
import {
  createModel,
  type ModelShape,
} from "../src/infra/model";

const [count, setCount] = signal(0);
const doubled = computed(() => count() * 2);

createModel((ctx) => ({
  count,
  doubled,
  inc: ctx.action(() => setCount((value) => value + 1)),
  nested: {
    reset: ctx.action(() => setCount(0)),
  },
}));

createModel((ctx) => ({
  zeroArg: ctx.action(() => count()),
}));

const validShape: ModelShape<{
  count: Signal<number>;
  doubled: Computed<number>;
}> = {
  count,
  doubled,
};
