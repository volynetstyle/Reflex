export {};

declare global {
  interface Console {
    error(...data: unknown[]): void;
    warn(...data: unknown[]): void;
  }
  var console: Console;
}
