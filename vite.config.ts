import { resolve } from "node:path";
import { defineConfig } from "vite";
import { buildVersion } from "./tools/build-version";

// Two pages: the game and the Armory weapon reference.
export default defineConfig({
  define: { __BUILD_VERSION__: JSON.stringify(buildVersion()) },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        armory: resolve(__dirname, "armory/index.html"),
      },
    },
  },
});
