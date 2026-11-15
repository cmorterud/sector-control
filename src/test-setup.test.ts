import { expect, it } from "vitest";
import { AppBase, Entity } from "playcanvas";

it("gives headless entities and their clones a real application registry", () => {
  const app = AppBase.getApplication()!;
  expect(app).toBeDefined();
  expect(app.graphicsDevice.isNull).toBe(true);
  const original = new Entity("fixture"), child = new Entity("child");
  original.addChild(child);
  const clone = original.clone();
  expect(app.getEntityFromIndex(original.getGuid())).toBe(original);
  expect(app.getEntityFromIndex(clone.getGuid())).toBe(clone);
  expect(clone.children[0]).not.toBe(child);
  original.destroy(); clone.destroy();
});

it("turns a genuine engine assertion into a test failure without muting logging", () => {
  expect(() => new Entity("invalid", null as unknown as AppBase))
    .toThrow("PlayCanvas assertion: Could not find current application");
});
