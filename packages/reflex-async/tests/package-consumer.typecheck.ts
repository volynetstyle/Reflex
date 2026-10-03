import {
  asyncDerived,
  read,
  until,
  type AsyncCommit,
  type AsyncSource,
} from "@volynets/reflex-async";

const source: AsyncSource<number> = asyncDerived(() => Promise.resolve(1));
const commit: AsyncCommit<number> | undefined = source.commit();
const value: number = read(source);
const result: Promise<number> = until(source);
source[Symbol.dispose]();
void [commit, value, result];

// @ts-expect-error Published declarations preserve the job's value type.
const wrong: AsyncSource<string> = source;
void wrong;
