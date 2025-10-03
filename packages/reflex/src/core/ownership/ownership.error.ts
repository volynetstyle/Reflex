const OWNERSHIP_ERROR_NAME = "OwnershipDisposeError";
const OWNERSHIP_ERROR_IDENTIFIER = "[Ownership dispose]";

class OwnershipDisposeError extends Error {
  public readonly errors: Error[];

  constructor(errors: unknown[]) {
    super(
      `${OWNERSHIP_ERROR_IDENTIFIER} ${errors.length} error(s) during cleanup`
    );
    this.name = OWNERSHIP_ERROR_NAME;
    this.errors = errors.map((err) =>
      err instanceof Error ? err : new Error(String(err))
    );
  }

  toString() {
    return (
      `${this.message}\n` +
      this.errors
        .map((e, i) => `  [${i + 1}] ${e.stack ?? e.message}`)
        .join("\n")
    );
  }
}

export { OWNERSHIP_ERROR_IDENTIFIER, OWNERSHIP_ERROR_NAME };
export default OwnershipDisposeError;
