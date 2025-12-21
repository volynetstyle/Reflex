import { Environment, CapabilityIdentifier } from "./runtime.services";

export interface RuntimeExtension<
  TEnv extends Environment = Environment,
  TExtended extends Environment = Environment,
> {
  readonly requires?: readonly CapabilityIdentifier[];
  readonly provides?: readonly CapabilityIdentifier[];
  install(runtime: TEnv): asserts runtime is TEnv & TExtended;
}
