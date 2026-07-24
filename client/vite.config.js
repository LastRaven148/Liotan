import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sourceRevision from "../scripts/sourceRevision.js";

const clientRoot = fileURLToPath(new URL(".", import.meta.url));
const productionTestBuild = process.env.LIOTAN_PRODUCTION_TEST === "1";
const productionTestOutDir = resolve(clientRoot, "../test-results/production-build");
const rootPackage = JSON.parse(readFileSync(resolve(clientRoot, "../package.json"), "utf8"));
const sourceSha = sourceRevision.resolveSourceRevision(resolve(clientRoot, ".."));
const transparencyPublicKey = String(process.env.VITE_KEY_TRANSPARENCY_PUBLIC_KEY || "").trim();

function buildProvenance() {
  return {
    name: "liotan-build-provenance",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-meta.json",
        source: `${JSON.stringify({
          schema: "liotan-client-build/v1",
          version: String(rootPackage.version),
          sourceSha,
          keyTransparencyPublicKey: transparencyPublicKey,
          keyTransparencyPublicKeyPinned: /^[A-Za-z0-9_-]{43}$/.test(transparencyPublicKey)
        }, null, 2)}\n`
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), buildProvenance()],
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
  build: {
    outDir: productionTestBuild ? productionTestOutDir : "build",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: productionTestBuild ? {
        app: resolve(clientRoot, "index.html"),
        productionCrypto: resolve(clientRoot, "test/production/fixture.html"),
      } : undefined,
      output: {
        manualChunks(id) {
          if (id.includes("@wireapp/core-crypto") || id.includes("@noble/")) return "crypto-vendor";
          if (id.includes("react") || id.includes("scheduler")) return "react-vendor";
          if (id.includes("socket.io-client") || id.includes("engine.io-client")) return "realtime-vendor";
          return undefined;
        },
      },
    },
  },
});
