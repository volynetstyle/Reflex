class Effect {
  private effectFn: () => void;
  private cleanupFn: (() => void) | null;

  constructor(effectFn: () => void) {
    this.effectFn = effectFn;
    this.cleanupFn = null;
  }

  run(): void {
    if (this.cleanupFn) {
      this.cleanupFn();
    }
    
    const cleanup = this.effectFn();
    if (typeof cleanup === "function") {
      this.cleanupFn = cleanup;
    }
  }
}
