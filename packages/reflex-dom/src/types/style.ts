type CSSPropertyValue = string | number | null | undefined;

type CSSWritableKey = Exclude<
  {
    [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends
      | string
      | number
      | null
      | undefined
      ? K
      : never;
  }[keyof CSSStyleDeclaration],
  number | "length" | "parentRule" | "cssText"
>;

export type StyleObject = Partial<Record<CSSWritableKey, CSSPropertyValue>> & {
  [CustomProperty in `--${string}`]?: CSSPropertyValue;
};

export type StyleValue = string | StyleObject;
