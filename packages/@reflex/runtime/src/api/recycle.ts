import { addCleanup } from "@reflex/core";
import { ReactiveNode } from "../reactivity/shape";

type CleanupReturn = void | (() => void);

export const recycling = (node: ReactiveNode) => {
  const scope = node.lifecycle;

  if (!scope) {
    throw new Error("Effect must exist on scope or create own");
  }

  addCleanup(scope, node.compute!());
};
