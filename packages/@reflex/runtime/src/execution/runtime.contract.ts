import { RuntimeExtension } from "./runtime.plugin";
import { Environment, CapabilityIdentifier } from "./runtime.services";

export function createExtension<
  TEnv extends Environment,
  TExtended extends Environment,
>(
  provides: readonly CapabilityIdentifier[],
  requires: readonly CapabilityIdentifier[] | undefined,
  install: (runtime: TEnv) => asserts runtime is TEnv & TExtended,
): RuntimeExtension<TEnv, TExtended> {
  return { provides, requires, install };
}

export class Runtime<out S extends Environment = {}> {
  readonly services: S;
  private readonly capabilities = new Set<CapabilityIdentifier>();

  constructor(services: S) {
    this.services = services;
  }

  private satisfiesAxiom(
    axiom: readonly CapabilityIdentifier[] | undefined,
  ): boolean {
    if (!axiom) return true;
    return axiom.every((cap) => this.capabilities.has(cap));
  }

  use<TExtended extends Environment>(
    extension: RuntimeExtension<S, TExtended>,
  ): asserts this is Runtime<S & TExtended> {
    if (!this.satisfiesAxiom(extension.requires)) {
      const missing = extension.requires?.filter(
        (cap) => !this.capabilities.has(cap),
      );
      throw new Error(
        `Axiom violation: missing capabilities [${missing?.map((s) => s.description).join(", ")}]`,
      );
    }

    const conflicts = extension.provides?.filter((cap) =>
      this.capabilities.has(cap),
    );

    if (conflicts && conflicts.length > 0) {
      throw new Error(
        `Monotonicity violation: capabilities already exist [${conflicts.map((s) => s.description).join(", ")}]`,
      );
    }

    extension.install(this.services as S & TExtended);
    extension.provides?.forEach((cap) => this.capabilities.add(cap));
  }

  extends(other: Runtime<any>): boolean {
    for (const cap of this.capabilities) {
      if (!other.capabilities.has(cap)) {
        return false;
      }
    }

    return true;
  }

  get capabilityCount(): number {
    return this.capabilities.size;
  }
}
