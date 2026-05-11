export type Destructor = () => void;

export type EffectFn = () => void | Destructor;

export interface EffectOptions {
  priority?: number;
}

export type Accessor<T> = () => T;
