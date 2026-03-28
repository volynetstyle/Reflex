export interface RuntimeScheduler {
  requestFlush(run: () => void): void;
}

export interface RuntimeHost {
  hasPendingCommitWork?(): boolean;
  commit?(): void;
  postCommit?(): void;
}

export interface RuntimeOptions {
  scheduler?: RuntimeScheduler;
  host?: RuntimeHost;
}

class Runtime {
  private scheduled = false;
  private flushing = false;

  constructor(
    private readonly scheduler: RuntimeScheduler,
    private readonly host: RuntimeHost | null,
  ) {}

  schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;

    this.scheduler.requestFlush(() => this.flush());
  }

  flush(): void {
    if (this.flushing) return;
    this.flushing = true;

    try {
      do {
        this.scheduled = false;

        this.flushReactiveWork();

        if (this.host?.hasPendingCommitWork?.()) {
          this.host.commit?.();
        }

        this.host?.postCommit?.();
      } while (this.scheduled);
    } finally {
      this.flushing = false;
    }
  }

  private flushReactiveWork(): void {
    // dirty nodes / effects / graph propagation
  }
}
