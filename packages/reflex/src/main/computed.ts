import { AnyNode, ValueOf, Computed } from "../typelevel/test";

export type ComputedArgs<In extends readonly AnyNode[]> = {
  [K in keyof In]: ValueOf<In[K]>;
};

export function computed<In extends readonly AnyNode[], R>(
  fn: (...values: ComputedArgs<In>) => R,
): Computed<R> {
  return undefined as any;
}

const double = computed((n: number) => n * 2);
