declare const __localNodeId: unique symbol;
declare const __epochToken: unique symbol;

export type LocalNodeId = number & { readonly [__localNodeId]: true };
export type EpochToken = number & { readonly [__epochToken]: true };

export const INVALID_LOCAL_NODE_ID = -1 as number as LocalNodeId;

export const asLocalNodeId = (n: number): LocalNodeId => n as LocalNodeId;
export const asEpochToken = (n: number): EpochToken => n as EpochToken;

export interface EpochAware {
  readonly epoch: EpochToken;
  captureEpoch(): EpochToken;
  isCurrent(token: EpochToken): boolean;
}

export class RuntimeEpoch implements EpochAware {
  private _epoch: number = 1;

  get epoch(): EpochToken {
    return asEpochToken(this._epoch);
  }

  captureEpoch(): EpochToken {
    // A4: token captures the current epoch for async boundaries
    return asEpochToken(this._epoch);
  }

  isCurrent(token: EpochToken): boolean {
    return (token as unknown as number) === this._epoch;
  }

  advanceEpoch(): void {
    // A3: only Runtime coordinates epoch transitions
    this._epoch = (this._epoch + 1) | 0;
    if (this._epoch === 0) this._epoch = 1; // avoid 0 if you want
  }
}

export class LocalIdAllocator {
  private next = 0;

  constructor(
    private onExhaust: () => void,
    private readonly maxId: number,
  ) {}

  alloc = (): LocalNodeId =>
    this.next > this.maxId
      ? (this.onExhaust(), INVALID_LOCAL_NODE_ID)
      : asLocalNodeId(this.next++);

  reset = (): void => void (this.next = 0);
}

export function guardEpoch(runtime: EpochAware, token: EpochToken): boolean {
  return runtime.isCurrent(token);
}
