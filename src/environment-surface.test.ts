import * as engine from "../node_modules/playcanvas/build/playcanvas/src/index.js";
import { standard } from "../node_modules/playcanvas/build/playcanvas/src/scene/shader-lib/programs/standard.js";
import { StandardMaterialOptions } from "../node_modules/playcanvas/build/playcanvas/src/scene/materials/standard-material-options.js";
import { shaderChunksGLSL } from "../node_modules/playcanvas/build/playcanvas/src/scene/shader-lib/glsl/collections/shader-chunks-glsl.js";
import { Preprocessor } from "../node_modules/playcanvas/build/playcanvas/src/core/preprocessor.js";
import { expect, it } from "vitest";
import * as pc from "playcanvas";
import { earthPixels, exposedEarth, earthDiffusePS, earthNormalPS, earthGlossPS } from "./environment-surface";
import { trenchRoots } from "./battlefield-dressing";
import { trenchMap } from "./trench-map";
import { villageMap } from "./village-map";
import { groundHeight, terrainCut, industrialMap } from "./map";
import { terrainGeometry } from "./terrain-geometry";
import { artilleryExplosionProfile } from "./destruction";
import { Game, TestCollision } from "./simulation";
import { Renderer } from "./rendering";

it("makes deterministic detailed earth with bounded roughness and unit normals", () => {
  const a = earthPixels(64);
  expect(a).toEqual(earthPixels(64));
  expect(new Set(a.diffuse.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(65);
  for (let i = 0; i < a.normal.length; i += 4) {
    const n = Array.from(a.normal.slice(i, i + 3), v => v / 255 * 2 - 1);
    expect(Math.hypot(...n)).toBeCloseTo(1, 1);
    expect(a.gloss[i]).toBeLessThan(80);
    expect(a.diffuse[i + 3]).toBe(255);
  }
  expect(exposedEarth(0)).toBe(0);
  expect(exposedEarth(0.05)).toBe(1);
  expect(exposedEarth(0, true)).toBe(1);
});

it("replaces both paving and grass with soil wherever shells actually excavate, and resets with the match", () => {
  for (const [map, x, z] of [[trenchMap, 8, 18], [villageMap, 0, 18]] as const) {
    const g = new Game(new TestCollision(map), false, 500, 12345, undefined, { map, ambientArtillery: false });
    const key = `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
    const original = terrainGeometry(g.map, key);
    const untouched = terrainGeometry(g.map, "-8,-5");
    g.explode({ x, z, y: groundHeight(x, z, g.map) + 0.02 }, -1, null, { ...artilleryExplosionProfile, damage: 0 });
    const after = terrainGeometry(g.map, key);
    let replaced = 0;
    for (let i = 0; i < after.positions.length; i += 3) {
      const cut = terrainCut(after.positions[i], after.positions[i + 2], g.map);
      if (cut >= 0.05) { expect(after.colors[i / 3 * 4 + 3]).toBe(1); replaced++; }
    }
    expect(replaced).toBeGreaterThan(8);
    expect(terrainGeometry(g.map, "-8,-5")).toEqual(untouched);
    const reset = new Game(new TestCollision(map), false, 500, 12345, undefined, { map });
    expect(terrainGeometry(reset.map, key)).toEqual(original);
  }
});

it("anchors a bounded root dressing to existing bank slopes without touching world state", () => {
  const before = JSON.stringify(trenchMap);
  const roots = trenchRoots(trenchMap);
  expect(roots.length).toBeGreaterThan(40);
  expect(roots.length).toBeLessThanOrEqual(180);
  expect(roots).toEqual(trenchRoots(trenchMap));
  for (const r of roots) for (const p of r.points) {
    expect(p.y - groundHeight(p.x, p.z, trenchMap)).toBeCloseTo(0.018);
    expect(Math.hypot(p.x - r.x, p.z - r.z)).toBeLessThan(0.5);
  }
  expect(JSON.stringify(trenchMap)).toBe(before);
  expect(trenchRoots(industrialMap)).toEqual([]);
});

it("uploads and shares the actual earth material maps and all three engine shader overrides", () => {
  type Harness = { app: { graphicsDevice: pc.NullGraphicsDevice }; map: typeof trenchMap; materials: Map<string, pc.StandardMaterial>; textures: Map<string, pc.Texture>; surfaceMaterial(kind: "mud", tint: string): pc.StandardMaterial };
  const r = Object.create(Renderer.prototype) as Harness;
  Object.assign(r, { app: { graphicsDevice: new pc.NullGraphicsDevice() }, map: trenchMap, materials: new Map(), textures: new Map() });
  const m = r.surfaceMaterial("mud", "#ffffff");
  expect(r.surfaceMaterial("mud", "#ffffff")).toBe(m);
  expect(m.getShaderChunks().get("diffusePS")).toBe(earthDiffusePS);
  expect(m.getShaderChunks().get("normalMapPS")).toBe(earthNormalPS);
  expect(m.getShaderChunks().get("glossPS")).toBe(earthGlossPS);
  for (const name of ["earth-diffuse", "earth-normal"]) {
    const t = r.textures.get(name)!;
    const pixels = t.lock({ mode: pc.TEXTURELOCK_READ }) as Uint8Array;
    expect(pixels.length).toBe(512 * 512 * 4);
    expect(pixels[3]).toBe(name === "earth-diffuse" ? 255 : earthPixels().gloss[0]);
    expect(new Set(pixels.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(30);
    t.unlock();
  }
  // Assemble the actual engine's lit forward variant. This catches unresolved
  // chunk tokens, missing includes, varying and sampler integration without UI.
  const device = r.app.graphicsDevice;
  engine.ShaderChunks.get(device as never).add(shaderChunksGLSL);
  const options = new StandardMaterialOptions();
  options.defines = new Map(engine.ShaderPass.get(device as never).getByIndex(engine.SHADER_FORWARD).defines);
  Object.assign(options, { diffuseTint: 2, glossTint: 1, diffuseVertexColor: true,
    diffuseVertexColorChannel: "rgb", diffuseEncoding: "linear" });
  for (const [name, channel] of [["diffuse", "rgb"], ["normal", "rgb"], ["gloss", "r"]])
    Object.assign(options, { [`${name}Map`]: true, [`${name}MapChannel`]: channel,
      [`${name}MapUv`]: 0, [`${name}MapTransform`]: 0, [`${name}MapIdentifier`]: name });
  Object.assign(options.litOptions, { shaderChunks: m.shaderChunks, vertexColors: true,
    hasTangents: true, useNormals: true, useSpecular: true, clusteredLightingEnabled: false,
    lights: [new engine.Light(device as never, false)] });
  const definition = standard.createShaderDefinition(device as never, options) as {
    vshader: string; fshader: string; vincludes: Map<string, string>; fincludes: Map<string, string>;
  };
  const vertex = Preprocessor.run(definition.vshader, definition.vincludes)!;
  const fragment = Preprocessor.run(definition.fshader, definition.fincludes)!;
  expect(vertex).toContain("vVertexColor");
  expect(fragment).toContain("uniform sampler2D earthDiffuse");
  expect(fragment).toContain("uniform sampler2D earthNormal");
  expect(fragment).toContain("void getAlbedo()");
  expect(fragment).toContain("void getGlossiness()");
  expect(fragment).not.toMatch(/\{STD_|#include/);
  for (const t of r.textures.values()) t.destroy();
  m.destroy(); r.app.graphicsDevice.destroy();
});
