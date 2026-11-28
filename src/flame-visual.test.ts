import { expect, test, vi } from "vitest";
import { drawFlameJet, flameVisual, type FlameJet } from "./flame-visual";
import { FxQuads } from "./fx-quads";

test.each([false, true])("the jet grows to the clipped endpoint within its budget (low quality: %s)", sparse => {
  const quads = new FxQuads(flameVisual.quadsPerStream * 2);
  const axial = vi.spyOn(quads, "axial");
  const jet: FlameJet = { from: {x:0,y:1.5,z:0}, to: {x:0,y:1.5,z:-6}, age:0.03, elapsed:0.03, seed:3, impact:true };
  const draw = () => {
    axial.mockClear();
    quads.begin([5, 1.5, 0], [0, 0, 1], [0, 1, 0]);
    drawFlameJet(quads, jet, sparse);
    return Math.min(...axial.mock.calls.map(([, , z, , , dz, length]) => z + dz * length));
  };
  const opening = draw();
  expect(opening).toBeLessThan(-1);
  expect(opening).toBeGreaterThan(-3);
  jet.elapsed = 0.3;
  expect(draw()).toBeCloseTo(-6, 8);
  expect(quads.count).toBeLessThanOrEqual(flameVisual.quadsPerStream);
  jet.age = flameVisual.release;
  draw();
  expect(quads.count).toBe(0);
});
