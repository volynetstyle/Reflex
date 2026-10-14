import {
  ExecutionDomainState,
  getActiveRuntimeContext,
  runWithRuntimeContext,
  type ExecutionDomain,
} from "@volynets/reflex-runtime";
import type { OwnerContext } from "../ownership/ownership.scope";

/**
 * Runs `fn` inside `domain`. A closed domain is still entered by register
 * bank only, so late cleanup cannot route work into another domain; its hooks
 * are already detached, so nothing is scheduled.
 */
export function runInDomain<T>(
  domain: ExecutionDomain | null | undefined,
  fn: () => T,
): T {
  if (domain == null) return fn();
  if (domain.state !== ExecutionDomainState.Closed) return domain.run(fn);
  return getActiveRuntimeContext() === domain.context
    ? fn()
    : runWithRuntimeContext(domain.context, fn);
}

/** Runs `fn` inside the owner's domain (if any) without changing the owner. */
export function runInOwnerDomain<T>(owner: OwnerContext, fn: () => T): T {
  return runInDomain(owner.domain, fn);
}
