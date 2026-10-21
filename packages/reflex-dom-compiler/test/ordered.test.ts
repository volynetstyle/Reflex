import { compileLowered } from "./harness/compile.node";
import { orderedSuite } from "./ordered.shared";

orderedSuite(compileLowered, "jsdom");
