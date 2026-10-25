import { commands } from "vitest/browser";
import { ORDERED_SOURCES, orderedSuite } from "./ordered.shared";

const compiled = new Map(
  await Promise.all(
    Object.values(ORDERED_SOURCES).flatMap((source) =>
      (["baseline", "native", "template"] as const).map(
        async (variant) =>
          [
            source + variant,
            await commands.compileLowered(source, variant),
          ] as const,
      ),
    ),
  ),
);

orderedSuite((source, variant) => compiled.get(source + variant)!, "browser");
