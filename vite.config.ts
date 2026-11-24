import { resolve } from "node:path";
import { defineConfig } from "vite";

// Two pages: the game and the Armory weapon reference.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        armory: resolve(__dirname, "armory/index.html"),
      },
    },
  },
});
