const OWNERSHIP_ERROR_NAME = "OwnershipDisposeError";
const OWNERSHIP_ERROR_IDENTIFIER = "[Ownership dispose]";

class OwnershipDisposeError extends Error {
  readonly errors: Error[];

  constructor(errors: unknown[]) {
    const normalized: Error[] = new Array(errors.length);

    for (let i = 0; i < errors.length; i++) {
      const e = errors[i];
      normalized[i] = e instanceof Error ? e : new Error(String(e));
    }

    super(
      `${OWNERSHIP_ERROR_IDENTIFIER} ${normalized.length} error(s) during cleanup`
    );
    this.name = OWNERSHIP_ERROR_NAME;
    this.errors = normalized;
  }

  override toString(): string {
    let result = this.message;

    for (let i = 0; i < this.errors.length; i++) {
      const e = this.errors[i];
      result += `\n  [${i + 1}] ${e.stack || e.message}`;
    }
    
    return result;
  }
}

export {
  OWNERSHIP_ERROR_IDENTIFIER,
  OWNERSHIP_ERROR_NAME,
  OwnershipDisposeError as default,
};
