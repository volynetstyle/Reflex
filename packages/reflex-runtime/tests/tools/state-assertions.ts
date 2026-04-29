import { expect } from "vitest";
import {
  Changed,
  Computing,
  DIRTY_STATE,
  Disposed,
  Invalid,
  ReactiveNode,
  Reentrant,
  Tracking,
} from "../../src";

export function expectChanged(node: ReactiveNode): void {
  expect(node.state & Changed).toBeTruthy();
}

export function expectInvalid(node: ReactiveNode): void {
  expect(node.state & Invalid).toBeTruthy();
}

export function expectClean(node: ReactiveNode): void {
  expect(node.state & DIRTY_STATE).toBe(0);
}

export function expectDisposed(node: ReactiveNode): void {
  expect(node.state & Disposed).toBeTruthy();
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

export function expectState(node: ReactiveNode, expected: number): void {
  expect(node.state).toBe(expected);
}
