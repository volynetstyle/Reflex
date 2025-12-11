export interface FieldSpec {
  readonly bits: number;
}

export const NodeSchema = {
  epoch: { bits: 12 },
  version: { bits: 10 },
  generation: { bits: 10 },
  synergy: { bits: 28 },
  layoutId: { bits: 2 },
} satisfies Record<string, FieldSpec>;
