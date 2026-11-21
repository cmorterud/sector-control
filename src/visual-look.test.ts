import { expect, it } from "vitest";
import * as pc from "playcanvas";
import { AutoQuality, parseQuality, qualityProfiles } from "./graphics-quality";
import { hexColor, lookFor, mapLooks, sunDirection } from "./map-look";
import { cubeDirection, skyColor, skyCubemapFaces } from "./sky";
import { insideBuilding, roomLight, shadeArchitecture } from "./room-light";
import { villageMap } from "./village-map";
import { architectureGeometry } from "./architecture-geometry";

it("parses quality choices and keeps Low free of post-processing", () => {
  expect(parseQuality("high")).toBe("high");
  expect(parseQuality("auto")).toBe("auto");
  expect(parseQuality("ultra")).toBeUndefined();
  expect(parseQuality(null)).toBeUndefined();
  expect(qualityProfiles.low.postProcessing).toBe(false);
  expect(qualityProfiles.low.ssao).toBe(false);
  expect(qualityProfiles.high.shadowDistance).toBeGreaterThan(qualityProfiles.low.shadowDistance);
});

it("auto quality steps down while play is slow and settles once it is fast enough", () => {
  const run = (auto: AutoQuality, ms: number, seconds: number) => {
    const changes: string[] = [];
    for (let t = 0; t < seconds * 1000; t += ms) { const next = auto.frame(ms); if (next) changes.push(next); }
    return changes;
  };
  const fast = new AutoQuality();
  expect(run(fast, 8, 10)).toEqual([]);
  expect(fast.done).toBe(false);
  expect(run(fast, 8, 30)).toEqual([]);
  expect(fast.done).toBe(true);
  expect(fast.quality).toBe("high");
  const slow = new AutoQuality();
  expect(run(slow, 40, 30)).toEqual(["medium", "low"]);
  expect(slow.done).toBe(true);
  // A good median with frequent hitches (one frame in eight at 33 ms) still steps down.
  const stutter = new AutoQuality();
  const changes: string[] = [];
  for (let i = 0; i < 2000 && !stutter.done; i++) { const next = stutter.frame(i % 8 ? 16.7 : 33.4); if (next) changes.push(next); }
  // Medium keeps a good median despite hitches: they are the simulation's own.
  expect(changes).toEqual(["medium"]);
  // One long hitch (a tab switch) is ignored rather than counted.
  const hitch = new AutoQuality();
  hitch.frame(5000);
  expect(run(hitch, 10, 40)).toEqual([]);
  expect(hitch.quality).toBe("high");
  // A level that starts fine but slows later still steps down.
  const throttled = new AutoQuality();
  expect(run(throttled, 10, 15)).toEqual([]);
  expect(run(throttled, 30, 10)).toEqual(["medium"]);
});

it("gives every map a look whose sky meets its fog at the horizon", () => {
  for (const id of Object.keys(mapLooks) as (keyof typeof mapLooks)[]) {
    const look = lookFor({ id }), sun = sunDirection(look);
    expect(look.fog.end).toBeLessThanOrEqual(210);
    const horizon = hexColor(look.sky.horizon);
    // Facing away from the sun, the horizon is exactly the fog colour.
    const away: [number, number, number] = [-sun[0], 0, -sun[2]];
    const l = Math.hypot(...away);
    const c = skyColor(look, [away[0] / l, 0, away[2] / l], sun);
    for (let i = 0; i < 3; i++) expect(c[i]).toBeCloseTo(horizon[i], 2);
    // The sky is brightest toward the sun.
    const toward = skyColor(look, sun, sun), zenith = skyColor(look, [0, 1, 0], sun);
    expect(toward.reduce((a, b) => a + b)).toBeGreaterThan(zenith.reduce((a, b) => a + b) - 0.01);
  }
});

it("points the sun where the renderer's light entity puts it", () => {
  for (const look of Object.values(mapLooks)) {
    const e = new pc.Entity();
    e.setEulerAngles(90 - look.sun.elevation, look.sun.azimuth, 0);
    const up = e.up, s = sunDirection(look);
    expect(up.x).toBeCloseTo(s[0], 5);
    expect(up.y).toBeCloseTo(s[1], 5);
    expect(up.z).toBeCloseTo(s[2], 5);
  }
});

it("builds cube faces that cover every direction once", () => {
  const same = (a: number[], b: number[]) => a.forEach((n, i) => expect(n).toBeCloseTo(b[i], 9));
  same(cubeDirection(0, 0, 0), [1, 0, 0]);
  same(cubeDirection(2, 0, 0), [0, 1, 0]);
  same(cubeDirection(5, 0, 0), [0, 0, -1]);
  const look = lookFor({ id: "village" }), faces = skyCubemapFaces(look, sunDirection(look), 8);
  expect(faces).toHaveLength(6);
  for (const f of faces) expect(f.length).toBe(8 * 8 * 4);
  // A dimmer copy stays dimmer everywhere.
  const dim = skyCubemapFaces(look, sunDirection(look), 8, 0.5);
  for (let i = 0; i < faces[2].length; i += 4) expect(dim[2][i]).toBeLessThanOrEqual(faces[2][i]);
});

it("darkens kit-building rooms away from their windows and leaves outdoors alone", () => {
  const manor = villageMap.buildings!.find((b) => b.id === "manor")!;
  expect(manor.kit).toBeTruthy();
  const up: [number, number, number] = [0, 1, 0];
  // Outside the footprint, or above the roof line, nothing changes.
  expect(roomLight(manor, [manor.x + manor.w, manor.baseY + 1, manor.z], up)).toBe(1);
  expect(roomLight(manor, [manor.x, manor.baseY + 20, manor.z], up)).toBe(1);
  // A floor point beside a ground-floor window is brighter than the house's middle.
  const window = manor.kit!.windows.find((w) => w.level === 0)!;
  const nearWindow: [number, number, number] = [window.x, manor.baseY + 0.05, window.z];
  const middle: [number, number, number] = [manor.x, manor.baseY + 0.05, manor.z + 1.25];
  expect(insideBuilding(manor, nearWindow)).toBe(true);
  expect(roomLight(manor, nearWindow, up)).toBeGreaterThan(roomLight(manor, middle, up) + 0.1);
  expect(roomLight(manor, middle, up)).toBeGreaterThanOrEqual(0.5);
  // Shading only ever darkens, and only some vertices of an interior wall.
  const wall = villageMap.boxes.find((b) => b.architecture?.building === "manor" && b.architecture.part === "wall" && b.architecture.level === 0)!;
  const plain = architectureGeometry(wall, 0), shaded = shadeArchitecture(architectureGeometry(wall, 0), wall, wall.h, manor);
  let darker = 0;
  for (let m = 0; m < plain.length; m++) for (let i = 0; i < plain[m].colors.length; i++) {
    expect(shaded[m].colors[i]).toBeLessThanOrEqual(plain[m].colors[i] + 1e-9);
    if (shaded[m].colors[i] < plain[m].colors[i] - 1e-6) darker++;
  }
  expect(darker).toBeGreaterThan(0);
});
