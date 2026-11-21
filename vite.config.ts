import { resolve } from "node:path";
import { defineConfig } from "vite";

// Two pages: the game and the Armoury weapon reference.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        armoury: resolve(__dirname, "armoury/index.html"),
      },
    },
  },
});
