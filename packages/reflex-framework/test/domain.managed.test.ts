import { describe, expect, it } from "vitest";
import {
  createConsumer,
  createExecutionDomain,
  createProducer,
  getActiveRuntimeContext,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
  type ExecutionDomain,
  type WatcherNode,
} from "@volynets/reflex-runtime";
import {
  bindManaged,
  createContext,
  createManagedRoot,
  createOwnedEffect,
  createOwnershipNode,
  disposeOwnershipNode,
  getActiveOwnerContext,
  provideContext,
  runManaged,
  runWithOwner,
  runWithOwnershipNode,
  useContext,
} from "../src";

function createQueuedDomain() {
  const queue: WatcherNode[] = [];
  const domain = createExecutionDomain({
    scheduler: {
      onNodeInvalidated: (node) => void queue.push(node as WatcherNode),
      flush() {
        while (queue.length !== 0) runWatcher(queue.shift()!);
      },
      hasPending: () => queue.length !== 0,
      release: () => void (queue.length = 0),
    },
  });
  return { domain, queue };
}

function own(domain: ExecutionDomain) {
  return createManagedRoot(domain);
}

describe("managed boundary: execution domain + ownership", () => {
  it("enters the domain, then the owner", () => {
    const { domain } = createQueuedDomain();
    const root = own(domain);

    root.run(() => {
      expect(getActiveRuntimeContext()).toBe(domain.context);
      expect(getActiveOwnerContext()).toBe(root.owner);
      expect(root.owner.currentNode).toBe(root.node);
    });
  });

  it("keeps tracking across owner changes inside one domain", () => {
    const { domain } = createQueuedDomain();
    const root = own(domain);
    const first = createProducer(1);
    const second = createProducer(2);
    const child = createOwnershipNode();

    root.run(() => {
      const computed = createConsumer(
        () =>
          readProducer(first) +
          runWithOwner(root.owner, child, () => readProducer(second)) +
          runManaged(root.owner, child, () => readProducer(second)),
      );
      expect(readConsumer(computed)).toBe(5);
      writeProducer(second, 3);
      expect(readConsumer(computed)).toBe(7);
    });
  });

  it("restores the effect environment for runs and cleanups", () => {
    const { domain } = createQueuedDomain();
    const root = own(domain);
    const Theme = createContext("default");
    const source = createProducer(0);
    const seen: string[] = [];

    root.run(() => {
      provideContext(root.owner, Theme, "dark");
      createOwnedEffect(root.owner, root.node, () => {
        const value = readProducer(source);
        seen.push(`run:${useContext(root.owner, Theme)}:${value}`);
        return () => seen.push(`cleanup:${useContext(root.owner, Theme)}`);
      });
    });

    // Disposal starts from outside any owner and outside the domain.
    root.run(() => writeProducer(source, 1));
    domain.flush();
    root.dispose();

    expect(seen).toEqual([
      "run:dark:0",
      "cleanup:dark",
      "run:dark:1",
      "cleanup:dark",
    ]);
  });

  it("runs effects and their cleanup writes in the owner's domain (S1)", () => {
    const a = createQueuedDomain();
    const b = createQueuedDomain();
    const rootA = own(a.domain);
    const child = createOwnershipNode();
    const source = createProducer(0);
    const echo = createProducer(0);
    const echoRuns: number[] = [];
    let domainOfRun: unknown;

    rootA.run(() =>
      createOwnedEffect(rootA.owner, rootA.node, () => {
        echoRuns.push(readProducer(echo));
      }),
    );
    rootA.run(() => runWithOwnershipNode(rootA.owner, child, () => {}));

    // Created from domain B's context, the effect still belongs to A.
    b.domain.run(() =>
      createOwnedEffect(rootA.owner, child, () => {
        domainOfRun = getActiveRuntimeContext();
        readProducer(source);
        return () => writeProducer(echo, readProducer(echo) + 1);
      }),
    );
    expect(domainOfRun).toBe(a.domain.context);

    // Writes to A's nodes go through A's managed entry: a bound writer called
    // from B still schedules in A. (A raw write under B's context would use
    // B's hooks; the kernel does not know node ownership.)
    const writeSource = rootA.run(() =>
      bindManaged((value: number) => writeProducer(source, value)),
    );
    b.domain.run(() => writeSource(1));
    expect(b.queue).toHaveLength(0);
    expect(a.queue).toHaveLength(1);
    a.domain.flush();
    expect(echoRuns).toEqual([0, 1]);

    // Disposal started inside B: the cleanup's write still targets A.
    b.domain.run(() => disposeOwnershipNode(child));
    expect(b.queue).toHaveLength(0);
    expect(a.queue).toHaveLength(1);
    a.domain.flush();
    expect(echoRuns).toEqual([0, 1, 2]);
  });

  it("binds callbacks to their creation domain and owner", () => {
    const { domain } = createQueuedDomain();
    const root = own(domain);
    const Locale = createContext("en");
    let bound!: () => [unknown, string | undefined];

    root.run(() => {
      provideContext(root.owner, Locale, "uk");
      bound = bindManaged(() => [
        getActiveRuntimeContext(),
        useContext(getActiveOwnerContext()!, Locale),
      ]);
    });

    const [context, locale] = bound();
    expect(context).toBe(domain.context);
    expect(locale).toBe("uk");
  });

  it("rejects new owned work after the root is disposed (L1)", () => {
    const { domain } = createQueuedDomain();
    const root = own(domain);
    root.dispose();
    root.dispose();

    expect(root.disposed).toBe(true);
    expect(domain.closed).toBe(true);
    expect(() => root.run(() => 0)).toThrow(/disposed/);
  });

  it("treats providers as setup-time values and signals as live values", () => {
    const { domain } = createQueuedDomain();
    const root = own(domain);
    const Static = createContext(0);
    const Live = createContext<() => number>(() => 0);
    const live = createProducer(1);
    const seen: Array<[number | undefined, number]> = [];

    root.run(() => {
      provideContext(root.owner, Static, 1);
      provideContext(root.owner, Live, () => readProducer(live));
      createOwnedEffect(root.owner, root.node, () => {
        seen.push([
          useContext(root.owner, Static),
          useContext(root.owner, Live)!(),
        ]);
      });
      // Re-providing a plain value notifies nobody.
      provideContext(root.owner, Static, 2);
    });
    root.run(() => writeProducer(live, 5));
    domain.flush();

    expect(seen).toEqual([
      [1, 1],
      [2, 5],
    ]);
  });
});
