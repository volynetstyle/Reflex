export type ProducerComparator<T> = (a: T, b: T) => boolean;

export const compare = Object.is satisfies ProducerComparator<unknown>;
