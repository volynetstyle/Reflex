type Phase = number;

interface Continuation<T> {
  onValue(value: T): void;
  onError(error: unknown): void;
  onComplete(): void;
}

interface Cancellation {
  cancel(): void;
}

interface AsyncSource<T> {
  subscribe(k: Continuation<T>, phase: Phase): Cancellation;
}

/**
 * Models async causal phase.
 */
class PhaseContext {
  #phase: Phase = 0;

  get current(): Phase {
    return this.#phase;
  }

  capture(): Phase {
    return this.#phase;
  }

  advance(): Phase {
    return ++this.#phase;
  }
}

class CancelToken implements Cancellation {
  alive = true;

  cancel() {
    this.alive = false;
  }
}

function _guardAsync<T>(src: AsyncSource<T>, ctx: PhaseContext): AsyncSource<T> {
  return {
    subscribe(k, phase) {
      const token = new CancelToken();

      const guarded: Continuation<T> = {
        onValue(v) {
          if (token.alive && ctx.current === phase) k.onValue(v);
        },

        onError(e) {
          if (token.alive && ctx.current === phase) k.onError(e);
        },

        onComplete() {
          if (!valid(token, ctx, phase)) return;
          token.cancel();
          k.onComplete();
        },
      };

      const upstream = src.subscribe(guarded, phase);

      return {
        cancel() {
          token.cancel();
          upstream.cancel();
        },
      };
    },
  };
}

const valid = (token: CancelToken, ctx: PhaseContext, phase: Phase) =>
  token.alive && ctx.current === phase;
