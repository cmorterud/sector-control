import { expect, it } from "vitest";
import { battlefields } from "./battlefields";
import { CombatFeedback } from "./combat-feedback";
import { Game, TestCollision } from "./simulation";
import { trenchMap } from "./trench-map";
import { gallipoliMap } from "./gallipoli-map";
import {
  casualtyNote, casualtyReturn, deployNotice, operationOrderHead, placeOfDeath, sideFor, soldierIdentity, soldierTitle,
} from "./soldier-record";

it("gives every battlefield's two armies a named unit, rank and soldier", () => {
  for (const map of battlefields) for (const team of ["blue", "red"] as const) {
    const side = sideFor(map, team);
    expect(side.units.length, `${map.id} ${team}`).toBeGreaterThan(0);
    const s = soldierIdentity(map, team, 7, 0);
    expect(s.name.length).toBeGreaterThan(2);
    expect(s.rank.length).toBeGreaterThan(1);
    expect(side.units.map((u) => u.name)).toContain(s.unit);
  }
});

it("draws the same soldier for the same seed and life, and a new one for the next life", () => {
  const a = soldierIdentity(trenchMap, "blue", 41, 0), b = soldierIdentity(trenchMap, "blue", 41, 0);
  expect(a).toEqual(b);
  const lives = Array.from({ length: 6 }, (_, i) => soldierTitle(soldierIdentity(trenchMap, "blue", 41, i)));
  expect(new Set(lives).size).toBeGreaterThan(4);
});

it("writes armies' own ranks and naming: British numbers, Ottoman patronymics", () => {
  const tommy = soldierIdentity(trenchMap, "blue", 3, 0);
  expect(tommy.number).toMatch(/^\d{4,5}$/);
  expect(["Pte.", "L/Cpl.", "Cpl.", "Sgt."]).toContain(tommy.rank);
  const askers = Array.from({ length: 8 }, (_, i) => soldierIdentity(gallipoliMap, "red", 5, i));
  for (const s of askers) {
    expect(s.name).toMatch(/ oğlu /);
    expect(s.number).toBeUndefined();
    expect(["Nefer", "Onbaşı", "Çavuş"]).toContain(s.rank);
    const [father, own] = s.name.split(" oğlu ");
    expect(father).not.toBe(own);
  }
});

it("heads the death card with a casualty note naming the fallen life and where it fell", () => {
  const map = trenchMap, g = new Game(new TestCollision(map), true, 6000, 1, undefined, { map, teamSize: 5, ambientArtillery: false });
  const f = new CombatFeedback(), p = g.players[0];
  const life = soldierIdentity(map, p.team, 9, 0);
  Object.assign(p, { protectedUntil: 0 });
  g.events = [];
  (g as any).damage(p, 100, g.players.find((q) => q.team !== p.team)!.id, "red", { kind: "bullet", weapon: "Gewehr 98", from: { x: p.x + 10, y: 1.65, z: p.z } });
  for (const e of g.events) f.event(g, e);
  life.fate = { kind: "killed", place: placeOfDeath(g, p) };
  const html = f.html(g, 0, "", casualtyNote(life, map));
  expect(html).toContain("CASUALTY NOTE · FREZENBERG · 16 AUGUST 1917");
  expect(html).toContain(soldierTitle(life));
  expect(html).toContain(`Killed in action near ${life.fate.place}.`);
  // The killer and the damage line stay below it.
  expect(html.indexOf("CASUALTY NOTE")).toBeLessThan(html.indexOf("KILLED BY"));
  expect(html).toContain("damage ·");
});

it("returns both sides' losses and each of the player's lives at the end", () => {
  const map = trenchMap, g = new Game(new TestCollision(map), true, 6000, 1, undefined, { map, teamSize: 4, ambientArtillery: false });
  for (const p of g.players) p.deaths = p.team === "blue" ? 2 : 3;
  const first = { ...soldierIdentity(map, "blue", 2, 0), fate: { kind: "killed" as const, place: "flag B" } };
  const html = casualtyReturn(g, [first, soldierIdentity(map, "blue", 2, 1)]);
  expect(html).toContain("16th (Irish) Division</th><td>4</td><td>8</td>");
  expect(html).toContain("12. Reserve-Division</th><td>4</td><td>12</td>");
  expect(html).toContain("killed in action near flag B");
  expect(html).toContain("survived the action");
});

it("escapes names and units into the deploy slip and the operation order", () => {
  const s = { ...soldierIdentity(trenchMap, "blue", 1, 0), name: "<b>x</b>" };
  expect(deployNotice(s)).toContain("&lt;b&gt;x");
  const order = operationOrderHead(s, trenchMap, 1);
  expect(order).toContain("OPERATION ORDER No.");
  expect(order).toContain("Frezenberg, 16 August 1917");
  expect(order).not.toContain("<b>x</b>");
});
