class Effect {
  private _effectFn: () => void;
  private _cleanupFn: (() => void) | null;
  private _config: Record<string, unknown>;

  constructor(effectFn: () => void, config = {}) {
    this._effectFn = effectFn;
    this._cleanupFn = null;
    this._config = config;
  }

  run(): void {
    if (this._cleanupFn) {
      this._cleanupFn();
    }

    const cleanup = this._effectFn();
    if (typeof cleanup === "function") {
      this._cleanupFn = cleanup;
    }
  }
}
