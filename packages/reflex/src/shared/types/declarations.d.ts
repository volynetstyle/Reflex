declare const API_PROTOCOL_VERSION: `${number}.${number}.${number}`;

declare const APP_VERSION: string;
declare const APP_REVISION: string;

declare const BUILD_MODE: "development" | "production" | "test.js";
declare const PLATFORM: "browser" | "node" | "worker.js";


declare namespace ReflexGlobal {
  const __REFLEX_LIB__: Record<string, unknown>;

  const __REFLEX_INSPECTOR__: Record<string, unknown> | undefined;

  const __REFLEX_FEATURE_FLAGS__: Readonly<Record<string, boolean>> | undefined;

  const __REFLEX_RUNTIME__: Readonly<{
    startTime: number;
    activeOwners: number;
    dirtyNodes: number;
  }>;

  const __REFLEX_LOGGER__: Readonly<{
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  }>;
}
