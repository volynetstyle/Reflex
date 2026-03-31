export type ProducerComparator<T> = (a: T, b: T) => boolean;

export const compare: ProducerComparator<unknown> = Object.is;
