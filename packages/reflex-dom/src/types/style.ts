export type CSSPropertyValue = string | number | null | undefined;

type CSSWritableKey = Exclude<
  {
    [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string
      ? K
      : never;
  }[keyof CSSStyleDeclaration],
  number | "length" | "parentRule" | "cssText"
>;

/**
 * Typed inline styles using DOM property names and custom `--property` names.
 */
export type StyleObject = Partial<Record<CSSWritableKey, CSSPropertyValue>> & {
  [CustomProperty in `--${string}`]?: CSSPropertyValue;
};

/** Inline style text, a typed style object, or no style. */
export type StyleValue = string | StyleObject | null | undefined;
