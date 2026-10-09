import { describe, it } from "vitest";
import { executeDifferential } from "./harness";
import { historicalFaults } from "./catalog/historical";

describe("historical differential fault replay", () => {
  it.each(historicalFaults)("replays $id fixed by $fixedBy", ({ program }) => {
    executeDifferential(program);
  });
});
