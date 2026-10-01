/** @jsxImportSource ../../src */

import {
  createContext,
  createApp,
  defineModel,
  For,
  Portal,
  provideContext,
  renderToString,
  Show,
  Switch,
  useComputed,
  useContext,
  useEffect,
  useMemo,
  useMountedEffect,
  useOwned,
  useRef,
  useSignal,
} from "../../src";
import {
  addCleanup,
  createOwnerContext,
  createOwnershipNode,
  getActiveOwnerContext,
  runWithOwner,
  runWithOwnershipNode,
  type OwnershipNode,
} from "@volynets/reflex-framework";
import { appendRenderableNodes } from "../../src/mount/append";
import { getDOMContext, withDOMContext } from "../../src/runtime/context";
import {
  validateCase,
  type Case,
  type Observation,
  type Strategy,
} from "./model";

function withoutComments(root: Element): string {
  const copy = root.cloneNode(true) as Element;
  const comments = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
  const remove: Node[] = [];
  while (comments.nextNode()) remove.push(comments.currentNode);
  for (const comment of remove) comment.parentNode?.removeChild(comment);
  return copy.outerHTML;
}

function visibleMarkup(container: Element): string {
  const root = container.querySelector("main");
  return root === null ? "" : withoutComments(root);
}

function normalizedServerMarkup(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  return visibleMarkup(container);
}

export async function execute(
  testCase: Case,
  strategy: Strategy = "eager",
): Promise<Observation> {
  validateCase(testCase);
  const { program, trace } = testCase;
  const container = document.createElement("div");
  const portalTarget = document.createElement("aside");
  const output: string[] = [];
  const errors: string[] = [];
  const lifecycle: string[] = [];
  const ownerEvents: string[] = [];
  const keyedViolations: string[] = [];
  const activeRows = new Map<number, number>();
  let previousRows = new Map<number, Element>();
  const retiredRows = new Map<number, Element>();
  let ownerTopologyViolations = 0;
  let expectedOwnerNode: OwnershipNode | null = null;
  const effects: string[] = [];
  let childMounts = 0;
  let childCleanups = 0;
  let reads = 0;
  let computations = 0;
  let invalidations = 0;
  let domOps = 0;
  let setValue: (value: number) => void = () => {};
  let setUnrelated: (value: number) => void = () => {};
  let setItems: (ids: readonly number[]) => void = () => {};
  let independentDispose: (() => void) | undefined;
  let independentHost: Element | undefined;
  const itemPool = new Map<number, { id: number }>();
  const itemFor = (id: number) => {
    let item = itemPool.get(id);
    if (item === undefined) {
      item = { id };
      itemPool.set(id, item);
    }
    return item;
  };
  const ValueContext = createContext<() => number>();
  const snapshot = () => {
    if (program.consumer === "for") {
      const currentRows = new Map<number, Element>();
      const rowHost =
        independentHost !== undefined && !container.contains(independentHost)
          ? independentHost
          : container;
      for (const node of rowHost.querySelectorAll<Element>("[data-key]")) {
        const key = Number(node.getAttribute("data-key"));
        if (currentRows.has(key)) keyedViolations.push(`duplicate-key:${key}`);
        currentRows.set(key, node);
        if (!activeRows.has(key)) keyedViolations.push(`unowned-row:${key}`);
      }
      for (const [key, node] of previousRows) {
        const current = currentRows.get(key);
        if (current !== undefined && current !== node)
          keyedViolations.push(`remounted-key:${key}`);
        if (current === undefined) {
          retiredRows.set(key, node);
          if (activeRows.has(key))
            keyedViolations.push(`missing-cleanup:${key}`);
        }
      }
      for (const [key, node] of currentRows) {
        if (!previousRows.has(key) && retiredRows.get(key) === node) {
          keyedViolations.push(`resurrected-node:${key}`);
        }
      }
      previousRows = currentRows;
    }
    return (
      visibleMarkup(container) +
      (independentHost !== undefined && !container.contains(independentHost)
        ? `|detached:${withoutComments(independentHost)}`
        : "") +
      (program.consumer === "portal" ? `|${withoutComments(portalTarget)}` : "")
    );
  };
  const checkOwner = () => {
    if (expectedOwnerNode === null) return;
    let current = getActiveOwnerContext()?.currentNode ?? null;
    while (current !== null && current !== expectedOwnerNode)
      current = current.parent;
    if (current !== expectedOwnerNode) ownerTopologyViolations++;
  };

  function Child({ read }: { read: () => number }) {
    checkOwner();
    childMounts++;
    const child = childMounts;
    lifecycle.push(`mount:${child}`);
    useOwned(
      () => undefined,
      () => {
        childCleanups++;
        lifecycle.push(`cleanup:${child}`);
      },
    );
    return <span data-state="on">{() => read()}</span>;
  }

  function Row({ item, read }: { item: { id: number }; read: () => number }) {
    checkOwner();
    childMounts++;
    const lifetime = childMounts;
    if (activeRows.has(item.id))
      keyedViolations.push(`duplicate-owner:${item.id}`);
    activeRows.set(item.id, lifetime);
    lifecycle.push(`row:${item.id}:mount:${lifetime}`);
    useOwned(
      () => undefined,
      () => {
        childCleanups++;
        if (activeRows.get(item.id) !== lifetime)
          keyedViolations.push(`incorrect-cleanup:${item.id}`);
        activeRows.delete(item.id);
        lifecycle.push(`row:${item.id}:cleanup:${lifetime}`);
      },
    );
    return (
      <span data-key={item.id}>
        {item.id}:{() => read()}
      </span>
    );
  }

  function EffectConsumer({
    read,
    mounted,
  }: {
    read: () => number;
    mounted: boolean;
  }) {
    const run = () => {
      const value = read();
      effects.push(`run:${value}`);
      return () => effects.push(`cleanup:${value}`);
    };
    if (mounted) useMountedEffect(run);
    else useEffect(run);
    return <Child read={read} />;
  }

  function UnrelatedWork({ read }: { read: () => number }) {
    useEffect(() => {
      read();
      computations++;
    });
    return null;
  }

  function View() {
    expectedOwnerNode = getActiveOwnerContext()?.currentNode ?? null;
    const signal = useSignal(0);
    const raw = () => {
      reads++;
      return signal();
    };
    let read: () => number = raw;
    setValue = (value) => signal(value);

    if (program.source === "computed") {
      read = useComputed(() => {
        computations++;
        return raw();
      });
    } else if (program.source === "memo") {
      read = useMemo(() => {
        computations++;
        return raw();
      });
    } else if (program.source === "model") {
      const createModel = defineModel((ctx) => ({
        value: ctx.read(() => raw()),
        write: ctx.action((value: number) => signal(value)),
      }));
      const model = createModel();
      read = () => model.value();
      setValue = (value) => {
        model.write(value);
      };
    } else if (program.source === "context") {
      const owner = getActiveOwnerContext()!;
      const node = owner.currentNode!;
      provideContext(node, ValueContext, raw);
      read = useContext(node, ValueContext)!;
    } else if (program.source === "ref") {
      const ref = useRef(0);
      read = () => {
        reads++;
        return ref.current;
      };
      setValue = (value) => {
        ref.current = value;
      };
    }

    if (program.identity) {
      const upstream = read;
      read = useComputed(() => {
        computations++;
        return upstream();
      });
    }
    let unrelatedRead: (() => number) | undefined;
    if (program.unrelated) {
      const unrelated = useSignal(0);
      setUnrelated = (value) => unrelated(value);
      unrelatedRead = unrelated;
    }

    const branch = <Child read={read} />;
    let content;
    if (program.consumer === "show") {
      content = (
        <Show
          when={() => read() > 0}
          fallback={<span data-state="off">off</span>}
        >
          {branch}
        </Show>
      );
    } else if (program.consumer === "switch") {
      content = (
        <Switch
          value={() => read() > 0}
          cases={[{ when: true, children: branch }]}
          fallback={<span data-state="off">off</span>}
        />
      );
    } else if (program.consumer === "for") {
      const items = useSignal([itemFor(1), itemFor(2)]);
      setItems = (ids) => items(ids.map(itemFor));
      content = (
        <For
          each={items}
          by={(item) => item.id}
          fallback={<span data-state="off">off</span>}
        >
          {(item) => <Row item={item} read={read} />}
        </For>
      );
    } else if (program.consumer === "portal") {
      content = <Portal to={portalTarget}>{branch}</Portal>;
    } else if (
      program.consumer === "effect" ||
      program.consumer === "mounted-effect"
    ) {
      content = (
        <EffectConsumer
          read={read}
          mounted={program.consumer === "mounted-effect"}
        />
      );
    } else {
      content = branch;
    }
    let target;
    if (program.owner === "component") {
      target = <main>{content}</main>;
    } else {
      const host = document.createElement("main");
      if (program.owner === "owned") {
        const owner = getActiveOwnerContext()!;
        const node = createOwnershipNode();
        expectedOwnerNode = node;
        ownerEvents.push("nested:mount");
        addCleanup(node, () => ownerEvents.push("nested:cleanup"));
        runWithOwnershipNode(owner, node, () =>
          appendRenderableNodes(host, content, "html"),
        );
      } else {
        const independent = program.owner === "model-independent";
        const createBoundary = defineModel((ctx) => {
          expectedOwnerNode = getActiveOwnerContext()?.currentNode ?? null;
          const label = independent ? "independent" : "model";
          ownerEvents.push(`${label}:mount`);
          ctx.onDispose(() => ownerEvents.push(`${label}:cleanup`));
          appendRenderableNodes(host, content, "html");
          return { token: ctx.read(() => "model owner") };
        });
        if (independent) {
          independentHost = host;
          const parentContext = getDOMContext();
          const owner = createOwnerContext();
          const context = { ...parentContext, owner };
          const model = withDOMContext(context, () =>
            runWithOwner(owner, null, createBoundary),
          );
          independentDispose = () => model.dispose();
        } else {
          createBoundary();
        }
      }
      target = host;
    }
    return unrelatedRead === undefined
      ? target
      : [target, <UnrelatedWork read={unrelatedRead} />];
  }

  if (program.host === "ssr") {
    try {
      output.push(normalizedServerMarkup(renderToString(<View />)));
    } catch (error) {
      errors.push(`render:${String(error)}`);
    }
    return {
      semantics: { output },
      obligations: {
        childMounts,
        childCleanups,
        lifecycle,
        ownerEvents,
        ownerTopologyViolations,
        keyedViolations,
        effects,
        errors,
      },
      cost: { reads, computations, invalidations, domOps },
    };
  }

  const app = createApp({
    effectStrategy: strategy,
    hooks: {
      onNodeInvalidated() {
        invalidations++;
      },
    },
  });
  const tallyMutations = (records: readonly MutationRecord[]) => {
    for (const mutation of records) {
      domOps +=
        mutation.type === "childList"
          ? mutation.addedNodes.length + mutation.removedNodes.length
          : 1;
    }
  };
  const mutations = new MutationObserver(tallyMutations);
  mutations.observe(container, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  let dispose: (() => void) | undefined;
  try {
    dispose = app.render(<View />, container);
    output.push(snapshot());
    for (const step of trace) {
      try {
        if (step.kind === "write") {
          app.renderer.batch(() => {
            setValue(step.value);
            if (program.unrelated) setUnrelated(step.value);
          });
        } else if (step.kind === "list") {
          app.renderer.batch(() => {
            setItems(step.ids);
            if (program.unrelated) setUnrelated(step.ids.length);
          });
        } else if (step.kind === "dispose") {
          dispose?.();
          dispose = undefined;
        }
        if (step.kind === "settle" || step.kind === "dispose") {
          if (strategy === "flush") await Promise.resolve();
          output.push(snapshot());
        }
      } catch (error) {
        errors.push(`${step.kind}:${String(error)}`);
      }
    }
  } catch (error) {
    errors.push(`render:${String(error)}`);
  } finally {
    dispose?.();
    independentDispose?.();
    if (activeRows.size > 0)
      keyedViolations.push("rows-alive-after-final-dispose");
    tallyMutations(mutations.takeRecords());
    mutations.disconnect();
  }
  return {
    semantics: { output },
    obligations: {
      childMounts,
      childCleanups,
      lifecycle,
      ownerEvents,
      ownerTopologyViolations,
      keyedViolations,
      effects,
      errors,
    },
    cost: { reads, computations, invalidations, domOps },
  };
}
