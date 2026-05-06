import { expect } from "vitest";
import type { ReactiveNode } from "../../../src";
import {
  Changed,
  Computing,
  DIRTY_STATE,
  Invalid,
  Reentrant,
  Tracking,
} from "../../../src";

export function expectChanged(node: ReactiveNode): void {
  expect(node.state & Changed).toBeTruthy();
}

export function expectInvalid(node: ReactiveNode): void {
  expect(node.state & Invalid).toBeTruthy();
}

export function expectNotChanged(node: ReactiveNode): void {
  expect(node.state & Changed).toBe(0);
}

export function expectNotInvalid(node: ReactiveNode): void {
  expect(node.state & Invalid).toBe(0);
}

export function expectDirty(node: ReactiveNode): void {
  expect(node.state & DIRTY_STATE).toBeTruthy();
}

export function expectClean(node: ReactiveNode): void {
  expect(node.state & DIRTY_STATE).toBe(0);
}

export function expectTracking(node: ReactiveNode): void {
  expect(node.state & Tracking).toBeTruthy();
}

export function expectComputing(node: ReactiveNode): void {
  expect(node.state & Computing).toBeTruthy();
}

export function expectReentrant(node: ReactiveNode): void {
  expect(node.state & Reentrant).toBeTruthy();
}

export function expectNotReentrant(node: ReactiveNode): void {
  expect(node.state & Reentrant).toBeFalsy();
}

export function expectNotTracking(node: ReactiveNode): void {
  expect(node.state & Tracking).toBeFalsy();
}

export function expectNotComputing(node: ReactiveNode): void {
  expect(node.state & Computing).toBeFalsy();
}

export function expectState(node: ReactiveNode, expected: number): void {
  expect(node.state).toBe(expected);
}

export function expectStates(
  entries: Array<readonly [ReactiveNode, number]>,
): void {
  for (const [node, expected] of entries) {
    expectState(node, expected);
  }
}
