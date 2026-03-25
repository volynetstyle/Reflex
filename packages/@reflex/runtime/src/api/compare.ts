export type Comparator<T> = (a: T, b: T) => boolean;

export const compare: Comparator<unknown> = Object.is;
