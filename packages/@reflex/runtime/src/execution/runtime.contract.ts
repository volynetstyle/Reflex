import { Environment } from "./runtime.services";
import { RuntimeExtension } from "./runtime.plugin";

export class Runtime<Env extends Environment = {}> {
  readonly env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  use<AddedEnv extends Environment, RequiresEnv extends Environment>(
    extension: RuntimeExtension<AddedEnv, RequiresEnv>,
  ): asserts this is Runtime<Env & AddedEnv> {
    if (extension.requires) {
      for (const key of extension.requires) {
        if (!(key in this.env)) {
          throw new Error(`Missing capability: ${String(key)}`);
        }
      }
    }

    extension.install(this.env as Env & RequiresEnv & AddedEnv);
  }
}

export const createExtension =
  <AddedEnv extends Environment>(extension: RuntimeExtension<AddedEnv>) =>
  () =>
    extension;
