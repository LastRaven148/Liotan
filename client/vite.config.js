import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
