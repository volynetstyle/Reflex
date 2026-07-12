export {};

declare global {
  const console: {
    error(...data: unknown[]): void;
    warn(...data: unknown[]): void;
  };
}
