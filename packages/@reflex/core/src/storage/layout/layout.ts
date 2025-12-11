import type { FieldSpec } from "./schema";

export interface FieldLayout {
  readonly shift: number;
  readonly bits: number;
  readonly mask32: number;
}

export interface Layout64<
  TSchema extends Record<string, FieldSpec> = Record<string, FieldSpec>,
> {
  readonly fields: { [K in keyof TSchema]: FieldLayout };
  readonly fieldNames: (keyof TSchema)[];
  readonly totalBits: number;
}

export function createLayout64<TSchema extends Record<string, FieldSpec>>(
  schema: TSchema,
): Layout64<TSchema> {
  let shift = 0;
  const fields = {} as { [K in keyof TSchema]: FieldLayout };
  const fieldNames: (keyof TSchema)[] = Object.keys(schema);

  for (const name of fieldNames) {
    const bits = schema[name]!.bits;
    const mask32 = bits >= 32 ? 0xffffffff : bits > 0 ? (1 << bits) - 1 : 0;

    fields[name] = { shift, bits, mask32 };
    shift += bits;
  }

  if (shift > 64) {
    throw new Error(`Layout64: totalBits=${shift} > 64`);
  }

  return { fields, fieldNames, totalBits: shift };
}
