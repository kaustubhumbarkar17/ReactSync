import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    host: "127.0.0.1",
    port: 43173,
    strictPort: true,
  },
  build: {
    outDir: "dist-demo",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        player: resolve(__dirname, "src/sidepanel/index.html"),
        mock: resolve(__dirname, "mock-streamer/index.html"),
      },
    },
  },
});
