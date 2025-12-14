/**
 * A function that never returns (e.g., throws or loops forever).
 */
type Nothing = () => never;

type NoneToVoidFn = () => void;

/**
 * A function that takes an argument of type T and returns nothing.
 * Useful for callback hooks, observers, disposers etc.
 */
type OneToVoidFn<T> = (value: T) => void;

/**
 * Extracts the type of the first parameter of a function type F.
 * If F doesn't take parameters, resolves to never.
 */
type FirstArg<F> = F extends (arg: infer A, ...rest: any[]) => any ? A : never;

/**
 * Converts a union type U to an intersection type.
 * Useful for merging multiple contract types into one.
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

/**
 * Creates a type where exactly one of the keys K in T must be present
 * (mutually exclusive keys). Useful for discriminated unions of config objects.
 */
type RequireOnlyOne<T, K extends keyof T = keyof T> = K extends keyof T
  ? { [P in K]: T[P] } & Partial<Record<Exclude<keyof T, P>, never>>
  : never;

/**
 * A signal-like accessor: no params returns a value of type T.
 * Useful if you want a consistent “getter” type in your reactive system.
 */
type Accessor<T> = {
  get value(): T;
};

/**
 * A mutator paired with an accessor: returns void and sets value of type T.
 * Often seen in APIs like `createSignal<T>() => [Accessor<T>, Setter<T>]`.
 */
type Setter<T> = (value: T) => void;

/**
 * A tuple of accessor and setter for type T.
 */
type Signal<T> = [Accessor<T>, Setter<T>];


