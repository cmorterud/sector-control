import { afterAll, beforeAll, vi } from "vitest";
import { AppBase, AppOptions, NullGraphicsDevice } from "playcanvas";

// Real transforms/cloning need an application registry even without WebGL.
// Keep a headless app per test file; never start its browser/render loop.
let app: AppBase;
let assertions: { mockRestore(): void };
beforeAll(() => {
  const report = console.error.bind(console);
  assertions = vi.spyOn(console, "error").mockImplementation((...details: unknown[]) => {
    if (String(details[0]).startsWith("ASSERT FAILED:"))
      throw new Error("PlayCanvas assertion: " + details.slice(1).join(" "));
    report(...details);
  });
  const device = new NullGraphicsDevice();
  app = new AppBase(device.canvas);
  const options = new AppOptions();
  options.graphicsDevice = device;
  options.devtools = false;
  app.init(options);
});
afterAll(() => {
  try { app?.destroy(); }
  finally { assertions?.mockRestore(); }
});
