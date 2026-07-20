export interface TerminalNode {
  readonly __terminalNode: unique symbol;
}

declare module "@volynets/reflex-framework/jsx-runtime" {
  export namespace JSX {
    interface IntrinsicElements {
      screen: { children?: unknown };
      line: { children?: unknown };
      text: {
        color?: "blue" | "bold" | "cyan" | "dim" | "green" | "red" | "yellow";
        children?: unknown;
      };
      indent: { size?: number; children?: unknown };
    }
  }
}
