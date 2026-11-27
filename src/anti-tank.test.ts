import { describe, expect, it } from "vitest";
import { Game, TestCollision, idle, type Event } from "./simulation";
import { groundHeight } from "./map";
import { trenchMap } from "./trench-map";
import { springOffensiveMap } from "./spring-offensive-map";
import { equipLoadout, factions, rosterRoles } from "./loadouts";
import { activeTank, tankRules, toWorld, type Tank } from "./tanks";
import { tankNotice } from "./tank-hud";
import { antiTankBotAim, antiTankHunt, antiTankRules, antiTankTarget, blockAntiTankHunt } from "./anti-tank";
import { TankHitFeedback } from "./tank-hit-feedback";
import { tankHits, weaponStats } from "./weapon-stats";

function scene(map = trenchMap, teamSize = 3) {
  const g = new Game(new TestCollision(map), true, 30 * 600, 12345, undefined, { map, teamSize, ambientArtillery: false, tanks: true });
  g.artillery.enabled = false;
  g.commandOverride = () => idle();
  for (const p of g.players) p.protectedUntil = 0;
  return g;
}
function run(g: Game, ticks: number) {
  const events: Event[] = [];
  for (let i = 0; i < ticks && g.phase === "playing"; i++) {
    g.step(idle());
    events.push(...g.events);
  }
  return events;
}
// A red rifleman 12 m off Blue's tank's flank, sights on its side plates.
function flank(g: Game, t: Tank) {
  const shooter = g.players.find((p) => p.team === "red" && p.tank === undefined)!;
  const from = toWorld(t, 0, tankRules.width / 2 + 12);
  Object.assign(shooter, { ...from, y: groundHeight(from.x, from.z, g.map), vx: 0, vz: 0 });
  shooter.yaw = Math.atan2(t.x - shooter.x, shooter.z - t.z);
  shooter.pitch = Math.atan2(t.y + 1.1 - (shooter.y + 1.5), 12 + tankRules.width / 2);
  return shooter;
}
function volley(g: Game, shooter: Game["players"][number], shots: number) {
  const events: Event[] = [];
  for (let i = 0; i < shots; i++) {
    shooter.ammo = 1;
    shooter.nextShot = 0;
    shooter.reloadAt = 0;
    g.fire(shooter);
    events.push(...run(g, 3));
  }
  return events;
}

describe("anti-tank kit", () => {
  it("issues each army its own anti-tank weapon", () => {
    expect(factions.german.antiTank).toBe("Tankgewehr M1918");
    expect(factions.british.antiTank).toBe("SMLE Mk III · AP");
    expect(factions.french.antiTank).toBe("Berthier Mle 1916 · AP");
    const g = scene();
    const p = g.players[1];
    p.faction = "german";
    equipLoadout(p, "antiTank");
    expect(p.weaponId).toBe("Tankgewehr M1918");
    expect(p.weapon).toBe("serviceRifle");
    expect(p.ammo).toBe(1);
  });

  it("puts Tankgewehr rounds through the plate, wearing the hull down to a knock-out", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const shooter = flank(g, t);
    equipLoadout(shooter, "antiTank");
    expect(shooter.weaponId).toBe("Tankgewehr M1918");
    const stats = weaponStats.find((w) => w.id === "tankgewehr")!;
    const events = volley(g, shooter, 1);
    expect(t.hp).toBe(tankRules.hp - stats.armour!.hull);
    const pierced = events.filter((e) => e.type === "tank" && e.phase === "pierced");
    expect(pierced).toHaveLength(1);
    // The shooter reads the hit at the crosshair; the crew get the strip notice.
    const feedback = new TankHitFeedback();
    expect(feedback.event(g, pierced[0], shooter.id)).toEqual({ kind: "pierced", text: expect.stringMatching(/^−55 HULL · 91%/) });
    expect(tankNotice(g, pierced[0], g.players[t.driver!])).toMatch(/THROUGH THE PLATE/);
    const impact = events.find((e) => e.type === "impact" && e.tank === t.id)!;
    expect(feedback.event(g, impact, shooter.id)).toBeUndefined();
    const later = volley(g, shooter, tankHits(stats)!.knockOut);
    expect(t.state).toBe("wreck");
    expect(later.some((e) => e.type === "tank" && e.phase === "knockedOut")).toBe(true);
    const last = later.filter((e) => e.type === "tank" && e.phase === "pierced").at(-1)!;
    expect(feedback.event(g, last, shooter.id)?.kind).toBe("knockedOut");
  });

  it("marks ordinary rounds that ring off an enemy tank's plate as no penetration", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const shooter = flank(g, t);
    const feedback = new TankHitFeedback();
    const marks = volley(g, shooter, 3).map((e) => feedback.event(g, e, shooter.id)).filter(Boolean);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((m) => m!.kind === "ricochet" && m!.text === "NO PENETRATION")).toBe(true);
    expect(t.hp).toBe(tankRules.hp);
  });

  it("sends anti-tank bots after an enemy tank they cannot yet reach, ahead of their flag", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const bot = g.players.find((p) => p.team === "red" && p.tank === undefined)!;
    equipLoadout(bot, "antiTank");
    // 110 m off: out of range, so it closes in to the standoff distance.
    const far = toWorld(t, 0, 110);
    Object.assign(bot, { ...far, y: groundHeight(far.x, far.z, g.map) });
    const goal = antiTankHunt(g, bot)!;
    expect(goal).toBeDefined();
    expect(Math.hypot(goal.x - t.x, goal.z - t.z)).toBeCloseTo(antiTankRules.huntStandoff, 1);
    // A rifleman keeps to his orders.
    equipLoadout(bot, "rifleman");
    expect(antiTankHunt(g, bot)).toBeUndefined();
    // In range with a clear shot, the bot stops hunting and fires.
    equipLoadout(bot, "antiTank");
    flank(g, t);
    const near = g.players.find((p) => p.team === "red" && p.tank === undefined)!;
    expect(near).toBe(bot);
    expect(antiTankHunt(g, bot)).toBeUndefined();
    // Only a soldier at bayonet reach comes before the tank.
    const enemy = g.players.find((p) => p.team === "blue" && p.tank === undefined)!;
    Object.assign(enemy, { x: bot.x + 8, z: bot.z, y: bot.y });
    expect(antiTankBotAim(g, bot, { ...idle() }, enemy)).toBe(true);
  });

  it("lets a hunter with no route to its standoff point keep to its other orders for a while", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const bot = g.players.find((p) => p.team === "red" && p.tank === undefined)!;
    equipLoadout(bot, "antiTank");
    const far = toWorld(t, 0, 110);
    Object.assign(bot, { ...far, y: groundHeight(far.x, far.z, g.map) });
    expect(antiTankHunt(g, bot)).toBeDefined();
    blockAntiTankHunt(g, bot);
    expect(antiTankHunt(g, bot)).toBeUndefined();
    g.tick += antiTankRules.huntRetryTicks;
    expect(antiTankHunt(g, bot)).toBeDefined();
  });

  it("lets armour-piercing service rounds wear a tank down slowly, while ball only splashes", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const shooter = flank(g, t);
    volley(g, shooter, 5);
    expect(t.hp).toBe(tankRules.hp);
    shooter.faction = "british";
    equipLoadout(shooter, "antiTank");
    volley(g, shooter, 5);
    expect(t.hp).toBe(tankRules.hp - 5 * weaponStats.find((w) => w.id === "smle-ap")!.armour!.hull);
  });

  it("sometimes wounds the crewman inside", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const crew = g.players[t.driver!];
    const shooter = flank(g, t);
    equipLoadout(shooter, "antiTank");
    volley(g, shooter, 8);
    expect(crew.hp).toBeLessThan(100);
  });

  it("turns an anti-tank bot onto an enemy tank in sight", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const bot = flank(g, t);
    equipLoadout(bot, "antiTank");
    expect(antiTankTarget(g, bot)).toBe(t);
    const c = { ...idle(), yaw: bot.yaw + 0.5 };
    expect(antiTankBotAim(g, bot, c)).toBe(true);
    expect(c.aim).toBe(true);
    // A rifleman leaves it to the grenades and the guns.
    equipLoadout(bot, "rifleman");
    expect(antiTankBotAim(g, bot, { ...idle() })).toBe(false);
  });

  it("puts the kit with bots on tank maps without crowding out the riflemen", () => {
    const g = new Game(new TestCollision(springOffensiveMap), true, 30 * 600, 7, undefined, { map: springOffensiveMap, ambientArtillery: false, tanks: true });
    for (const team of ["blue", "red"] as const) {
      const list = g.players.filter((p) => p.team === team);
      expect(list.some((p) => p.loadout === "antiTank")).toBe(true);
      expect(list.filter((p) => p.loadout === "rifleman").length / list.length).toBeGreaterThan(0.6);
    }
    expect(rosterRoles(g.teamSize, false)).not.toContain("antiTank");
  });
});
