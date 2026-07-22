import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import reflexStore from "../src/vite";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(testDir, "fixtures");
const reflexSource = resolve(testDir, "../../reflex/src/index.ts");
const runtimeSource = resolve(testDir, "../../reflex-runtime/src");
const schedulerSource = resolve(testDir, "../../reflex-scheduler/src/index.ts");
const storeSource = resolve(testDir, "../src/index.ts");

const servers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function createStoreFixtureServer(): Promise<ViteDevServer> {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    root: fixtureRoot,
    plugins: [reflexStore()],
    resolve: {
      alias: {
        "@runtime": runtimeSource,
        "@volynets/reflex": reflexSource,
        "@volynets/reflex-runtime/internal": resolve(
          runtimeSource,
          "internal/index.ts",
        ),
        "@volynets/reflex-runtime": resolve(runtimeSource, "index.ts"),
        "@volynets/reflex-scheduler": schedulerSource,
        "@volynets/reflex-store": storeSource,
      },
    },
    server: {
      middlewareMode: true,
    },
    ssr: {
      noExternal: true,
    },
  });
  servers.push(server);
  return server;
}

describe("reflex store Vite plugin user DX", () => {
  it("loads a user module with the plugin connected and runs the compiled store", async () => {
    const server = await createStoreFixtureServer();
    const mod = await server.ssrLoadModule("/store-plugin-app.ts");

    expect(mod.runStorePluginDemo()).toEqual({
      count: 4,
      name: "Bob",
      post: 2,
      pre: 4,
      seen: ["Alice:0:idle", "Bob:2:idle", "Bob:4:ready"],
      status: "ready",
    });
  });

  it("surfaces store compiler diagnostics during Vite module loading", async () => {
    const server = await createStoreFixtureServer();

    await expect(
      server.ssrLoadModule("/store-plugin-unsupported.ts"),
    ).rejects.toThrow(
      "Dynamic compiled-store access is not supported in phase 1.",
    );
  });
});
