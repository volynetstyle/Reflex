import type { OwnershipNode } from "./ownership.node";
import { disposeOwnershipNode } from "./ownership.cleanup";
import {
  createOwnershipNode,
  runWithOwnershipNode,
} from "./ownership.scope";

/** @deprecated Use `OwnershipNode` directly. */
export type Scope = OwnershipNode;

/** @deprecated Use `createOwnershipNode`. */
export const createScope = createOwnershipNode;

/** @deprecated Use `runWithOwnershipNode`. */
export const runWithScope = runWithOwnershipNode;

/** @deprecated Use `runWithOwnershipNode`. */
export const runInOwnershipScope = runWithOwnershipNode;

/** @deprecated Use `disposeOwnershipNode`. */
export const disposeScope = disposeOwnershipNode;
