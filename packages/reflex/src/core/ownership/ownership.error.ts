const OWNERSHIP_ERROR_NAME = "OwnershipDisposeError";
const OWNERSHIP_ERROR_IDENTIFIER = "[Ownership dispose]";

class OwnershipDisposeError extends Error {
  readonly errors: Error[];

  constructor(errors: unknown[]) {
    const normalized = errors.map((e) =>
      e instanceof Error ? e : new Error(String(e))
    );
    super(
      `${OWNERSHIP_ERROR_IDENTIFIER} ${normalized.length} error(s) during cleanup`
    );
    this.name = OWNERSHIP_ERROR_NAME;
    this.errors = normalized;
  }

  override toString(): string {
    const details = this.errors
      .map((e, i) => `  [${i + 1}] ${e.stack || e.message}`)
      .join("\n");
    return `${this.message}\n${details}`;
  }
}

export {
  OWNERSHIP_ERROR_IDENTIFIER,
  OWNERSHIP_ERROR_NAME,
  OwnershipDisposeError as default,
};
