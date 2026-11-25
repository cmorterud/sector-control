import { afterEach, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { battlefieldCard, battlefieldInfo } from "./battlefield-info";
import { industrialMap } from "./map";
import { villageMap } from "./village-map";
import { headlandMap } from "./headland-map";

afterEach(() => vi.unstubAllEnvs());

it.each(["/", "/sector-control/"])("keeps map previews under the deployment base %s", (base) => {
  vi.stubEnv("BASE_URL", base);
  for (const map of [industrialMap, villageMap, headlandMap]) {
    const card = battlefieldCard(map, `?map=${map.id}`);
    const src = card.match(/<img src="([^"]+)"/)![1];
    expect(src.startsWith(base + "previews/")).toBe(true);
    expect(existsSync(new URL("../public/" + src.slice(base.length), import.meta.url))).toBe(true);
    expect(card).toContain(`href="?map=${map.id}"`);
  }
});

// Card images are frames rendered by tools/map-previews.mjs, one JPEG per map.
it.each(Object.keys(battlefieldInfo))("has a rendered preview for %s", (id) => {
  expect(existsSync(new URL(`../public/previews/${id}.jpg`, import.meta.url))).toBe(true);
});
