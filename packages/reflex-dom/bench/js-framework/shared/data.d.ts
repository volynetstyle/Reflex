export interface RowData {
  readonly id: number;
  readonly label: string;
}

export declare function buildData(count: number): RowData[];
