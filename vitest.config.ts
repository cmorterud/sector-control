import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Exercise the same engine invariants locally and on CI.
  resolve: { alias: [{ find: /^playcanvas$/, replacement: "playcanvas/debug" }] },
  test: {
    exclude: [...configDefaults.exclude, "tools/**/*.test.mjs"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
