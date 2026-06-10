import {
  V8Native,
  printShapeReport,
  printOptimizationStatus,
  optimizeWithWarmup,
  printOptimizeReport,
  runShapeTransitionScenario,
} from "./v8-native";

interface ReactiveNode {
  state: number;
  firstIn: unknown;
  lastIn: unknown;
  tailIn: unknown;
  firstOut: unknown;
  lastOut: unknown;
}

interface EffectScopeNode extends ReactiveNode {
  firstChild: OwnedNode | undefined;
  lastChild: OwnedNode | undefined;
  parent: ReactiveNode | undefined;
  prevSibling: OwnedNode | undefined;
  nextSibling: OwnedNode | undefined;

  fn: undefined;
  cleanup: undefined;
}

interface EffectNode extends ReactiveNode {
  firstChild: OwnedNode | undefined;
  lastChild: OwnedNode | undefined;
  parent: ReactiveNode | undefined;
  prevSibling: OwnedNode | undefined;
  nextSibling: OwnedNode | undefined;

  fn(): (() => void) | void;
  cleanup: (() => void) | undefined;
}

type OwnedNode = EffectNode | EffectScopeNode;
type AnyNode = ReactiveNode | OwnedNode;

function makeReactive(): ReactiveNode {
  return {
    state: 0,
    firstIn: null,
    lastIn: null,
    tailIn: null,
    firstOut: null,
    lastOut: null,
  };
}

function makeScope(): EffectScopeNode {
  return {
    state: 0,
    firstIn: null,
    lastIn: null,
    tailIn: null,
    firstOut: null,
    lastOut: null,

    firstChild: undefined,
    lastChild: undefined,
    parent: undefined,
    prevSibling: undefined,
    nextSibling: undefined,

    fn: undefined,
    cleanup: undefined,
  };
}

function makeEffect(fn: EffectNode["fn"]): EffectNode {
  return {
    state: 0,
    firstIn: null,
    lastIn: null,
    tailIn: null,
    firstOut: null,
    lastOut: null,

    firstChild: undefined,
    lastChild: undefined,
    parent: undefined,
    prevSibling: undefined,
    nextSibling: undefined,

    fn,
    cleanup: undefined,
  };
}

function createTouchReactive(): (node: AnyNode) => boolean {
  return function touchReactive(node: AnyNode): boolean {
    const state = node.state;
    const firstOut = node.firstOut;
    const lastOut = node.lastOut;

    return state === 0 && firstOut === lastOut;
  };
}

function createTouchOwned(): (node: OwnedNode) => boolean {
  return function touchOwned(node: OwnedNode): boolean {
    const first = node.firstChild;
    const last = node.lastChild;
    const parent = node.parent;

    return first === last || parent === null;
  };
}

function createTouchMixed(): (node: OwnedNode) => boolean {
  return function touchMixed(node: OwnedNode): boolean {
    const state = node.state;
    const firstOut = node.firstOut;
    const firstChild = node.firstChild;
    const fn = node.fn;

    return state === 0 && firstOut !== firstChild && fn === undefined;
  };
}

function printDivider(title: string): void {
  console.log("");
  console.log(title);
  console.log("=".repeat(title.length));
}

function runPolymorphicScenario<TNode extends object>(
  label: string,
  fn: (node: TNode) => unknown,
  warmNodes: readonly TNode[],
  testNodes: readonly TNode[],
): void {
  let warmIndex = 0;

  printDivider(`POLYMORPHIC CALL-SITE: ${label}`);

  const report = optimizeWithWarmup(
    label,
    fn,
    () => {
      fn(warmNodes[warmIndex]);
      warmIndex = (warmIndex + 1) % warmNodes.length;
    },
    () => {
      fn(warmNodes[0]);
    },
  );

  printOptimizeReport(report);

  for (const node of testNodes) {
    fn(node);
  }

  printOptimizationStatus(`${label}: after test nodes`, fn);
}

const reactive = makeReactive();
const secondReactive = makeReactive();
const effect = makeEffect(() => {});
const secondEffect = makeEffect(() => {});
const scope = makeScope();

console.log("V8 native available:", V8Native.isAvailable());

printDivider("SHAPE BASELINE");
printShapeReport("reactive vs secondReactive", reactive, secondReactive);
printShapeReport("effect vs secondEffect", effect, secondEffect);
printShapeReport("effect vs scope", effect, scope);
printShapeReport("reactive vs effect", reactive, effect);
printShapeReport("reactive vs scope", reactive, scope);

runShapeTransitionScenario({
  label: "Reactive fields: reactive -> effect",
  fn: createTouchReactive(),
  warmNode: reactive,
  testNode: effect,
});

runShapeTransitionScenario({
  label: "Reactive fields: effect -> reactive",
  fn: createTouchReactive(),
  warmNode: effect,
  testNode: reactive,
});

runShapeTransitionScenario({
  label: "Reactive fields: effect -> scope",
  fn: createTouchReactive(),
  warmNode: effect,
  testNode: scope,
});

runShapeTransitionScenario({
  label: "Owned fields: effect -> scope",
  fn: createTouchOwned(),
  warmNode: effect,
  testNode: scope,
});

runShapeTransitionScenario({
  label: "Mixed fields: effect -> scope",
  fn: createTouchMixed(),
  warmNode: effect,
  testNode: scope,
});

runPolymorphicScenario<AnyNode>(
  "Reactive fields: mixed warmup",
  createTouchReactive(),
  [reactive, effect, scope],
  [secondReactive, secondEffect],
);

runPolymorphicScenario<OwnedNode>(
  "Owned fields: mixed warmup",
  createTouchOwned(),
  [effect, scope],
  [secondEffect],
);

runPolymorphicScenario<OwnedNode>(
  "Mixed fields: mixed warmup",
  createTouchMixed(),
  [effect, scope],
  [secondEffect],
);
