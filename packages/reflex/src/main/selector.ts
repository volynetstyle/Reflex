import { SignalCore, Selector, Projection } from "../typelevel/test";

export function selector<K>(source: SignalCore<K>): Selector<K> {
  return undefined as any;
}

export function projection<T, K>(map: (v: T) => K): Projection<K>;

export function projection<T, K>(
  source: SignalCore<T>,
  map: (v: T) => K,
): Projection<K>;

export function projection<T, K>(
  a: SignalCore<T> | ((v: T) => K),
  b?: (v: T) => K,
): Projection<K> {
  return undefined as any;
  //   let source: SignalCore<T>;
  //   let map: (v: T) => K;

  //   if (typeof b === "function") {
  //     // projection(source, map)
  //     source = a as SignalCore<T>;
  //     map = b;
  //   } else {
  //     // projection(map) — implicit source from tracking context
  //     if (!CURRENT_OWNER) {
  //       throw new Error("projection(map) must be called inside computed/memo");
  //     }

  //     source = readImplicitDependency<T>(CURRENT_OWNER);
  //     map = a as (v: T) => K;
  //   }

  //   return createProjectionNode(source, map);
}
