import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL(".", import.meta.url));
const productionTestBuild = process.env.LIOTAN_PRODUCTION_TEST === "1";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
  build: {
    outDir: "build",
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
