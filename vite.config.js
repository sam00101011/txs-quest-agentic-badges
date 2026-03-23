import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: {
    host: true
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("@wagmi")) {
            return "wagmi";
          }
          if (id.includes("viem")) {
            return "viem";
          }
          if (id.includes("mppx")) {
            return "mppx";
          }

          return "vendor";
        }
      }
    }
  }
});
