import { Environment } from "./runtime.services";

export interface RuntimeExtension<
  AddedEnv extends Environment,
  RequiresEnv extends Environment = {},
> {
  readonly requires?: (keyof RequiresEnv)[];
  install(
    env: RequiresEnv & AddedEnv,
  ): asserts env is RequiresEnv & AddedEnv;
}
