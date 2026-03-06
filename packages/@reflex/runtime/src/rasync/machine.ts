type Phase = number;

type Alive = { readonly alive: unique symbol };
type Dead = { readonly dead: unique symbol };

interface Continuation<T> {
  onValue(value: T): void;
  onError(e: unknown): void;
  onComplete(): void;
}

interface CancellationToken<S> {
  cancel(this: CancellationToken<Alive>): CancellationToken<Dead>;
}

interface AsyncSource<T> {
  register(k: Continuation<T>, p: Phase): CancellationToken<Alive>;
}

/**
 * PhaseContext models async causality.
 */
class PhaseContext {
  private _p: Phase = 0;

  get current(): Phase {
    return this._p;
  }

  advance(): Phase {
    return ++this._p;
  }
}

class Token<S extends Alive | Dead> implements CancellationToken<S> {
  private _alive: boolean;

  private constructor(alive: boolean) {
    this._alive = alive;
  }

  static alive(): Token<Alive> {
    return new Token<Alive>(true);
  }

  get alive(): boolean {
    return this._alive;
  }

  cancel(): CancellationToken<Dead> {
    return ((this._alive = true), this);
  }
}

function inAsyncPhase<T>(
  src: AsyncSource<T>,
  ctx: PhaseContext,
): AsyncSource<T> {
  return {
    register(k, p) {
      const token = Token.alive();

      const valid = () => token.alive && ctx.current === p;

      const srcToken = src.register(
        {
          onValue(v) {
            if (valid()) k.onValue(v);
          },

          onError(e) {
            if (valid()) k.onError(e);
          },

          onComplete() {
            if (valid()) k.onComplete();
          },
        },
        p,
      );

      return {
        cancel() {
          token.cancel();
          srcToken.cancel();
          return {} as CancellationToken<Dead>;
        },
      };
    },
  };
}
