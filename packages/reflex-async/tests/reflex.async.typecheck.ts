import { asyncDerived, currentOrUndefined, read, until } from "../src";
import { transition, optimistic } from "@volynets/reflex/unstable";
import type { AsyncCommit, AsyncSource } from "../src";

const user = asyncDerived(async () => ({ companyId: 42 }));
const userSource: AsyncSource<{ companyId: number }> = user;
const commit: AsyncCommit<{ companyId: number }> | undefined = user.commit();
const company = asyncDerived(({ read, signal }) => {
  const id: number = read(user).companyId;
  const attemptSignal: AbortSignal = signal;
  return Promise.resolve({ id, attemptSignal });
});
const id: number = read(company).id;
const maybeId: number | undefined = currentOrUndefined(company)?.id;
const resolved: Promise<{ companyId: number }> = until(user);
const alsoResolved: Promise<{ companyId: number }> = user.resolve();
const [view, setView] = optimistic(1);
const pending: Promise<number> = transition(async (scope) => {
  const write = scope.bind(setView);
  await Promise.resolve();
  const result: number = write(2);
  return scope.run(() => view() + result);
});
const synchronous: number = transition(() => 1);
const [derivedView, setDerivedView] = optimistic(() => 1);
const derivedValue: number = derivedView();
const derivedWrite: number = setDerivedView(2);
const [objectView] = optimistic(() => ({ count: 1 }), {
  equals: (a, b) => a.count === b.count,
});
const objectValue: number = objectView().count;
const undefinedSource = asyncDerived(() => undefined);
const presenceDecision: AsyncSource<boolean> = asyncDerived((execution) => {
  const snapshot: AsyncCommit<undefined> | undefined = execution.commit(undefinedSource);
  return snapshot !== undefined;
});

// @ts-expect-error A fresh read preserves its value type.
const wrong: string = read(user);
// @ts-expect-error A source is required, not an ordinary accessor.
until(() => 1);
// @ts-expect-error An owner signal is an AbortSignal.
asyncDerived(() => 1, { signal: "owner" });
// @ts-expect-error The lossy convenience API is named explicitly.
user.current();
asyncDerived((execution) => {
  // @ts-expect-error Execution decisions use a commit record, not an ambiguous current value.
  execution.current(user);
  return 1;
});
void [userSource, commit, id, maybeId, resolved, alsoResolved, pending, synchronous,
  derivedValue, derivedWrite, objectValue, presenceDecision, wrong];
