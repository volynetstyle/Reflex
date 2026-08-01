declare const process: {
  argv: string[];
  execPath: string;
  env: Record<string, string | undefined>;
  stdout: {
    isTTY?: boolean;
    columns?: number;
    write(value: string | Uint8Array): void;
  };
  stderr: {
    write(value: string | Uint8Array): void;
  };
  versions: {
    node: string;
  };
  hrtime: {
    bigint(): bigint;
  };
  exit(code?: number): never;
  exitCode?: number;
  on(event: "exit", listener: () => void): void;
};

interface ImportMeta {
  url: string;
}

declare class Buffer extends Uint8Array {
  static alloc(size: number): Buffer;
  static allocUnsafe(size: number): Buffer;
  static byteLength(value: string): number;
  static concat(chunks: Buffer[]): Buffer;
  write(value: string, offset?: number, length?: number, encoding?: "ascii" | "utf8"): number;
  copy(target: Buffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
  subarray(start?: number, end?: number): Buffer;
  toString(encoding?: "utf8"): string;
}

declare namespace NodeJS {
  type Signals = string;
  interface Timeout {}
}

declare module "node:child_process" {
  export function spawn(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: Record<string, string | undefined>;
      shell: false;
      stdio: ["ignore", "pipe", "pipe"];
      windowsHide: true;
    },
  ): {
    stdout: { on(event: "data", listener: (chunk: Buffer) => void): void };
    stderr: { on(event: "data", listener: (chunk: Buffer) => void): void };
    on(event: "error", listener: (error: Error) => void): void;
    on(event: "close", listener: (status: number | null, signal: NodeJS.Signals | null) => void): void;
  };
}

declare module "node:crypto" {
  export function createHash(algorithm: "sha256"): {
    update(value: string | Buffer): void;
    digest(encoding: "hex"): string;
  };
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options: { recursive: true }): void;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readFileSync(path: string): Buffer;
  export function readdirSync(path: string): string[];
  export function readdirSync(path: string, options: { withFileTypes: true }): Array<{
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }>;
  export function rmSync(path: string, options: { recursive: true; force: true }): void;
  export function statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
  };
  export function writeFileSync(path: string, data: string): void;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:timers" {
  export function clearInterval(timeout: NodeJS.Timeout): void;
  export function setInterval(callback: () => void, delay: number): NodeJS.Timeout;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
