import { compileLowered } from "./harness/compile.node";
import { reactiveHoleSuite } from "./holes.reactive.shared";

reactiveHoleSuite(compileLowered, "jsdom");
