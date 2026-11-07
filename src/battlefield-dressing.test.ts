import { expect, it } from "vitest";
import { battlefieldProps } from "./battlefield-dressing";
import { treeHasCrown, foliageBlocks, vegetationFor } from "./vegetation";
import { blocked, groundHeight, industrialMap, type Box } from "./map";
import { runtimeMap } from "./destruction";
import { TestCollision } from "./simulation";
import { trenchMap } from "./trench-map";

it("authors mostly bare or snapped trees with ground-anchored roots and physical short trunks", () => {
  const trees = trenchMap.vegetation!.filter((b) => b.kind === "tree");
  expect(vegetationFor(trenchMap)).toEqual(trenchMap.vegetation);
  expect(trees.length).toBeGreaterThanOrEqual(8);
  expect(trees.filter(treeHasCrown).length).toBeLessThan(trees.length * 0.35);
  expect(trees.some((b) => b.treeStyle === "sparse")).toBe(true);
  for (const tree of trees) {
    expect(tree.baseY).toBe(groundHeight(tree.x, tree.z, trenchMap));
    if (tree.treeStyle === "snapped") expect(tree.h).toBeLessThan(4.8);
    else expect(tree.h).toBeGreaterThanOrEqual(6.2);
  }
});

it("does not let leafless trees conceal silhouettes behind invisible foliage, while trunks stay solid", () => {
  for (const treeStyle of ["bare", "snapped", "sparse"] as const) {
    const tree: Box = {
      id: "tree",
      kind: "tree",
      x: 0,
      z: 0,
      w: 0.8,
      d: 0.8,
      h: 6,
      baseY: 0,
      treeStyle,
    };
    const map = runtimeMap({ ...industrialMap, boxes: [], vegetation: [tree] });
    expect(
      foliageBlocks(map, { x: -3, y: 4.2, z: 0.3 }, { x: 3, y: 4.2, z: 0.3 }),
    ).toBe(treeStyle === "sparse");
    expect(
      new TestCollision(map).ray({ x: -2, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }),
    ).toBeLessThan(1);
  }
});

it("places a bounded, repeatable selection of low equipment along usable trench edges", () => {
  const props = battlefieldProps(trenchMap);
  expect(props).toEqual(battlefieldProps(trenchMap));
  expect(props.length).toBeGreaterThanOrEqual(6);
  expect(props.length).toBeLessThanOrEqual(20);
  expect(new Set(props.map((p) => p.kind)).size).toBe(3);
  for (const prop of props) {
    expect(prop.y).toBe(groundHeight(prop.x, prop.z, trenchMap));
    expect(prop.y).toBeLessThanOrEqual(0.1);
    expect(blocked(prop.x, prop.z, 0.45, trenchMap)).toBe(false);
  }
  expect(battlefieldProps(industrialMap)).toEqual([]);
});
