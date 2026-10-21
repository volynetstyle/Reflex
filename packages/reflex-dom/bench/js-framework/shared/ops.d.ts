import type { RowData } from "./data.js";

export declare const MARK: string;

type Operation = (data: readonly RowData[]) => RowData[];

export declare const refreshOne: Operation;
export declare const refreshEvery10th: Operation;
export declare const moveForward: Operation;
export declare const moveBackward: Operation;
export declare const reverse: Operation;
export declare const interleave: Operation;
export declare const replaceHalf: Operation;
export declare const updateAll: Operation;
export declare const prepend: Operation;
export declare const removeEvery10th: Operation;

export declare const operations: Readonly<Record<string, Operation>>;
