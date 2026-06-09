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

function touchOwned(node: OwnedNode): boolean {
  const first = node.firstChild;
  const last = node.lastChild;
  const parent = node.parent;

  return first === last || parent === null;
}

const effect = makeEffect(() => {});
const scope = makeScope();

console.log("V8 native available:", V8Native.isAvailable());

printShapeReport("effect vs scope", effect, scope);


const report = optimizeWithWarmup(
  "touchOwned(effect)",
  touchOwned,
  () => {
    touchOwned(effect);
  },
  () => {
    touchOwned(effect);
  },
);

printOptimizeReport(report);

touchOwned(scope);

printOptimizationStatus("touchOwned after scope", touchOwned);

runShapeTransitionScenario({
  label: "OwnedNode effect -> scope",
  fn: touchOwned,
  warmNode: effect,
  testNode: scope,
});
