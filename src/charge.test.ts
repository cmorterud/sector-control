import { describe, expect, it } from "vitest";
import { Game, TestCollision, botCommand, idle, type Event, type Soldier } from "./simulation";
import { industrialMap, dist, type MapDefinition } from "./map";
import { headlandMap } from "./headland-map";
import {
  advanceCharges,
  blowWhistle,
  chargeCommand,
  chargePromptReady,
  chargeRules,
  charging,
  startLoneCharge,
  whistleNotice,
  whistleReadyIn,
} from "./charge";
import { squadOf } from "./squads";

// Open ground, service rifles all round, every bot parked until a test moves it.
function field(teamSize = 8) {
  const map: MapDefinition = { ...industrialMap, boxes: [], spawn: { blue: { x: 0, z: 30 }, red: { x: 0, z: -40 } } };
  const g = new Game(new TestCollision(map), true, 9000, 12345, undefined, {
    map, teamSize, ambientArtillery: false, assaults: false,
  });
  g.artillery.enabled = false;
  for (const p of g.players)
    Object.assign(p, {
      x: p.team === "blue" ? 40 : -40, z: p.teamIndex * 2, y: 0, vx: 0, vz: 0, yaw: 0, pitch: 0,
      weapon: "serviceRifle", ammo: 5, reserve: 60, protectedUntil: 0, nextThink: Infinity, target: -1,
    });
  return g;
}
const at = (p: Soldier, x: number, z: number) => Object.assign(p, { x, z });
const whistles = (events: Event[]) => events.filter((e) => e.type === "whistle");

describe("discoverability", () => {
  it("shows the charge prompt exactly when pressing melee would start a charge", () => {
    const g = field(2), p = g.players[0];
    at(p, 0, 0);
    const sprinting = () => {
      Object.assign(p, { vz: -7, vx: 0, crouched: false, reloadAt: 0, weapon: "serviceRifle", nextMelee: 0 });
      p.command = { ...idle(), sprint: true, z: -1 };
    };
    sprinting();
    expect(chargePromptReady(g, p)).toBe(true);
    for (const spoil of ["slow", "aim", "crouched", "reload", "backward", "machineGun", "recovering"] as const) {
      sprinting();
      if (spoil === "slow") p.vz = -4;
      if (spoil === "aim") p.command.aim = true;
      if (spoil === "crouched") p.crouched = true;
      if (spoil === "reload") p.reloadAt = 50;
      if (spoil === "backward") p.command.z = 1;
      if (spoil === "machineGun") p.weapon = "machineGun";
      if (spoil === "recovering") p.nextMelee = 100;
      expect(chargePromptReady(g, p), spoil).toBe(false);
    }
    sprinting();
    g.step({ ...idle(), sprint: true, z: -1, melee: true });
    expect(p.melee?.kind).toBe("charge");
    expect(chargePromptReady(g, p)).toBe(false);
  });

  it("tells the player whose whistle it was, and warns of the enemy's", () => {
    const g = field(8), p = g.players[0], red = g.players[8];
    at(p, 0, 0);
    at(g.players[1], 3, 0);
    blowWhistle(g, p, { yaw: 0, pitch: 0 });
    expect(whistleNotice(g, whistles(g.events)[0], p)).toBe("OVER THE TOP! · 1 FOLLOWING");
    at(red, 0, -30);
    blowWhistle(g, red, { yaw: Math.PI, pitch: 0 });
    expect(whistleNotice(g, whistles(g.events)[1], p)).toBe("ENEMY WHISTLE · CHARGE INCOMING");
    at(red, 0, -80);
    expect(whistleNotice(g, { ...whistles(g.events)[1], at: { x: 0, y: 1, z: -80 } }, p)).toBeUndefined();
  });
});

describe("the whistle", () => {
  it("shares one team cooldown and recruits the squad from further off than other riflemen", () => {
    const g = field(8), p = g.players[0];
    at(p, 0, 0);
    // Blue bots 1-5 form the first squad, 6-7 the second.
    expect(squadOf(g, g.players[1])!.members).toEqual([1, 2, 3, 4, 5]);
    at(g.players[1], 5, 0);
    at(g.players[2], 15, 0);
    at(g.players[3], -24, 0); // own squad, beyond the general radius
    at(g.players[4], 0, 34); // own squad, too far
    at(g.players[5], 4, 4);
    g.players[5].weapon = "machineGun"; // gunners keep covering
    at(g.players[6], -12, 3); // other squad, near
    at(g.players[7], 0, 21); // other squad, beyond the general radius
    g.step({ ...idle(), whistle: true });
    const [e] = whistles(g.events);
    expect(e).toMatchObject({ actor: 0, team: "blue", recruits: [1, 2, 3, 6] });
    expect(whistleReadyIn(g, "blue")).toBe(chargeRules.cooldownTicks);
    expect(g.players[1].charge?.kind).toBe("squad");
    expect(g.players[0].charge).toBeUndefined();
    // The target is ahead, where the player looked (yaw 0 faces -z).
    expect(e.target.z).toBeLessThan(-10);
    g.step({ ...idle(), whistle: true });
    expect(whistles(g.events)).toHaveLength(0);
    // Red's whistle is its own.
    expect(blowWhistle(g, g.players[9], { yaw: Math.PI, pitch: 0 })).not.toBeNull();
    g.tick = g.charges.readyAt.blue - 1;
    g.step({ ...idle(), whistle: true });
    expect(whistles(g.events)).toHaveLength(1);
  });

  it("sends the charge at an enemy flag roughly where the whistler aims", () => {
    const g = field(2), p = g.players[0];
    at(p, 0, 0);
    Object.assign(g.sectors[0], { x: 8, z: -40, owner: "red" });
    blowWhistle(g, p, { yaw: 0.1, pitch: -0.2 });
    expect(whistles(g.events)[0].target).toEqual({ x: 8, z: -40 });
  });

  it("lets bot leaders whistle only after the player has had the ready whistle for a while", () => {
    const g = field(8);
    g.charges.readyAt.blue = 300;
    const leader = g.players[1];
    const s = squadOf(g, leader)!;
    Object.assign(s, { commanded: true, objective: 0 });
    Object.assign(g.sectors[0], { x: 0, z: -20, owner: "red" });
    for (const id of s.members) at(g.players[id], id * 2, 0);
    s.contact = { x: 0, y: 1, z: -20, tick: 0, enemy: 9, building: null };
    at(g.players[9], 0, -20);
    let first = -1;
    for (g.tick = 0; g.tick < 3000 && first < 0; g.tick++) {
      s.contact.tick = g.tick;
      chargeCommand(g, leader);
      if (leader.charge) first = g.tick;
    }
    expect(first).toBeGreaterThanOrEqual(300 + chargeRules.botGraceTicks);
    expect(whistles(g.events)).toMatchObject([{ actor: leader.id, target: { x: 0, z: -20 } }]);
    expect(dist(leader.charge!.target, { x: 0, z: -20 })).toBeLessThan(6);
  });
});

describe("charging bots", () => {
  it("fix bayonets, run at the target with bayonets levelled, then return to their squads", () => {
    const g = field(8), p = g.players[0];
    g.botSettings.engagementRange = 0;
    at(p, 0, 0);
    for (const id of [1, 2, 3]) at(g.players[id], id * 3, 2);
    g.step({ ...idle(), whistle: true, pitch: 0.3 });
    const recruits = [1, 2, 3].map((id) => g.players[id]);
    const start = recruits.map((q) => ({ x: q.x, z: q.z }));
    const target = whistles(g.events)[0].target;
    const modes = new Set<string>(), events: Event[] = [];
    let levelled = 0;
    for (let i = 0; i < chargeRules.durationTicks + 30; i++) {
      g.step(idle());
      events.push(...g.events);
      for (const q of recruits) {
        modes.add(q.mode);
        if (q.melee?.kind === "charge") levelled++;
      }
    }
    expect(modes).toContain("Fixing bayonets");
    expect(modes).toContain("Over the top");
    expect(modes).toContain("Bayonet charge");
    expect(levelled).toBeGreaterThan(30);
    recruits.forEach((q, i) => expect(dist(q, target)).toBeLessThan(dist(start[i], target) - 25));
    expect(recruits.every((q) => !q.charge)).toBe(true);
    expect(events.find((e) => e.type === "chargeEnd")).toMatchObject({ members: 3, lost: 0 });
    // Released: ordinary behaviour, so no charge mode lingers.
    g.step(idle());
    expect(recruits.some((q) => ["Over the top", "Fixing bayonets"].includes(q.mode))).toBe(false);
  });

  it("charge an enemy a few metres off when caught out of ammunition", () => {
    const g = field(1), p = g.players[0], q = g.players[1];
    at(p, 0, 0);
    p.hp = 10000;
    Object.assign(q, { x: 0, z: -6.5, yaw: Math.PI, ammo: 0, reserve: 0, nextThink: 0 });
    g.botSettings.engagementRange = 30;
    const events: Event[] = [];
    for (let i = 0; i < 240 && !events.some((e) => e.type === "melee" && e.phase === "strike"); i++) {
      g.step(idle());
      events.push(...g.events);
    }
    expect(events.find((e) => e.type === "melee" && e.phase === "start")).toMatchObject({ actor: q.id, kind: "charge" });
    expect(events.find((e) => e.type === "melee" && e.phase === "strike")).toMatchObject({ actor: q.id, target: 0, damage: 100 });
  });

  it("may drop a half-loaded clip to rush a close enemy, but never at range or with rounds in the rifle", () => {
    const g = field(1), p = g.players[0], q = g.players[1];
    at(p, 0, 0);
    Object.assign(q, { x: 0, z: -6, ammo: 0, reserve: 30 });
    q.awareness.visible = true;
    const tryAt = (setup: () => void) => {
      for (g.tick = 1; g.tick < 600; g.tick++) {
        setup();
        q.awareness.seenAt = g.tick;
        q.nextLoneCharge = 0;
        if (startLoneCharge(g, q, p)) return true;
      }
      return false;
    };
    expect(tryAt(() => Object.assign(q, { ammo: 5, reloadAt: 0 }))).toBe(false);
    expect(tryAt(() => Object.assign(q, { ammo: 0, reloadAt: g.tick + 40, z: -20 }))).toBe(false);
    expect(tryAt(() => Object.assign(q, { ammo: 0, reloadAt: g.tick + 40, z: -6 }))).toBe(true);
    expect(q.reloadAt).toBe(0);
    expect(q.charge).toMatchObject({ kind: "lone", enemy: 0 });
    expect(q.nextLoneCharge).toBe(g.tick + chargeRules.lone.cooldownTicks);
  });
});

describe("shock", () => {
  // Three blue chargers 8 m short of a red defender, running at him.
  function incoming(chargers = 3) {
    const g = field(4), d = g.players[5];
    at(d, 0, 0);
    Object.assign(d, { yaw: Math.PI });
    for (let i = 0; i < chargers; i++) {
      const c = g.players[1 + i];
      Object.assign(c, { x: (i - 1) * 2.5, z: 8, yaw: 0, vz: -6.8 });
      c.charge = { id: 1, kind: "squad", target: { x: 0, z: -5 }, startAt: 0, until: 1e9 };
    }
    g.tick = 30;
    return { g, d };
  }
  const shaken = (g: Game) => g.events.filter((e) => e.type === "chargePanic");

  it("leaves alert, unshaken defenders steady against a charge", () => {
    for (const chargers of [1, 3]) {
      const { g, d } = incoming(chargers);
      advanceCharges(g);
      expect(d.shaken ?? null, String(chargers)).toBeNull();
    }
  });

  it("breaks suppressed defenders for a moment: they crouch, hold fire and give ground, then recover", () => {
    const { g, d } = incoming(3);
    d.suppression = 0.5;
    advanceCharges(g);
    expect(shaken(g)).toMatchObject([{ actor: d.id }]);
    expect(d.suppression).toBeGreaterThanOrEqual(0.75);
    const c = chargeCommand(g, d)!;
    expect(c).toMatchObject({ fire: false, crouch: true });
    expect(c.z).toBeLessThan(0); // away from chargers coming from +z
    expect(d.mode).toBe("Shaken by charge");
    // It cannot be renewed every tick into a permanent stun.
    g.events = [];
    g.tick += 3;
    advanceCharges(g);
    expect(shaken(g)).toHaveLength(0);
    g.tick = d.shaken!.until;
    expect(chargeCommand(g, d)).toBeNull();
  });

  it("is earned by smoke or shellfire, while a machine gun crew stands firm", () => {
    const smoke = incoming(3);
    smoke.g.smokeClouds.push({ id: 1, actor: 1, team: "blue", x: 0, y: 1.2, z: 4, bornAt: 0, expiresAt: 900 });
    advanceCharges(smoke.g);
    expect(smoke.d.shaken).toBeTruthy();
    const shelled = incoming(3);
    shelled.d.combatReaction = { kind: "blast", tick: 20, strength: 0.8, from: { x: 0, y: 0, z: 0 }, pauseUntil: 0, braceUntil: 0 };
    advanceCharges(shelled.g);
    expect(shelled.d.shaken).toBeTruthy();
    const gun = incoming(3);
    gun.d.weapon = "machineGun";
    gun.d.suppression = 0.5;
    advanceCharges(gun.g);
    expect(gun.d.shaken ?? null).toBeNull();
    // A crew on an emplaced gun stays on it, even out of smoke.
    const emplaced = incoming(3);
    emplaced.d.mountedGun = 99;
    emplaced.g.smokeClouds.push({ id: 1, actor: 1, team: "blue", x: 0, y: 1.2, z: 4, bornAt: 0, expiresAt: 900 });
    advanceCharges(emplaced.g);
    expect(emplaced.d.shaken ?? null).toBeNull();
  });

  it("shakes the player's view but never takes their controls", () => {
    const { g } = incoming(3);
    const player = g.players[0];
    Object.assign(player, { team: "red", x: 0, z: 0, suppression: 0.5 });
    advanceCharges(g);
    expect(player.suppression).toBeGreaterThanOrEqual(0.75);
    expect(chargeCommand(g, player)).toBeNull();
  });

  it("makes a charger easier for bots to lead while he runs in the open", () => {
    const { g } = incoming(1);
    const c = g.players[1];
    expect(charging(c)).toBe(true);
    c.vz = 0;
    expect(charging(c)).toBe(false);
    c.charge = null;
    c.melee = { kind: "charge", startTick: 0, strikeTick: 12, endTick: 1e9, yaw: 0, struck: false };
    expect(charging(c)).toBe(true);
  });
});

describe("period balance", () => {
  // Five riflemen charge across open ground at an alert machine gunner and two
  // riflemen, with and without a smoke screen laid across the gap.
  function assault(gap: number, smoke: boolean) {
    const map: MapDefinition = { ...industrialMap, boxes: [], spawn: { blue: { x: 0, z: 30 }, red: { x: 0, z: -40 } } };
    const g = new Game(new TestCollision(map), true, 9000, 12345, undefined, {
      map, teamSize: 6, humanPlayerIds: [], ambientArtillery: false, assaults: false,
    });
    g.artillery.enabled = false;
    for (const p of g.players) {
      const blue = p.team === "blue";
      Object.assign(p, {
        x: blue ? (p.teamIndex - 2.5) * 2.5 : (p.teamIndex - 1) * 3, z: blue ? gap : 0, y: 0, vx: 0, vz: 0,
        yaw: blue ? 0 : Math.PI, weapon: "serviceRifle", ammo: 5, reserve: 60, protectedUntil: 0, nextThink: Infinity,
      });
      // Red holds the line: three defenders, the rest out of the fight.
      if (!blue && p.teamIndex > 2) Object.assign(p, { x: 45, z: -45, hp: 0, respawnAt: 1e9 });
    }
    Object.assign(g.players[7], { weapon: "machineGun", ammo: 60, reserve: 240 });
    if (smoke)
      for (const x of [-6, 0, 6])
        g.smokeClouds.push({ id: x + 10, actor: 1, team: "blue", x, y: 1.2, z: 9, bornAt: -100, expiresAt: 900 });
    // Let the defenders see what is coming before the whistle.
    for (let i = 0; i < 45; i++) g.step(idle());
    blowWhistle(g, g.players[1], { yaw: 0, pitch: 0 }, { x: 0, z: -2 });
    let lost = 0, killed = 0;
    for (let i = 0; i < chargeRules.durationTicks + 60; i++) {
      g.step(idle());
      for (const e of g.events)
        if (e.type === "death") {
          if (g.players[e.actor].team === "blue") lost++;
          else killed++;
        }
    }
    return { lost, killed };
  }

  it("lets an alert machine gun break a charge in the open, while one out of smoke breaks the defenders", () => {
    const open = [35, 45].map((gap) => assault(gap, false));
    const screened = [35, 45].map((gap) => assault(gap, true));
    const sum = (r: { lost: number; killed: number }[], k: "lost" | "killed") => r.reduce((n, x) => n + x[k], 0);
    // In the open most of the ten chargers fall and the line holds. Survivors
    // who stand and fight it out rather than fall back (src/bot-engage.ts)
    // can still take a defender each run.
    expect(sum(open, "lost")).toBeGreaterThanOrEqual(6);
    expect(sum(open, "killed")).toBeLessThanOrEqual(2);
    // Out of the smoke the charge arrives and takes defenders with it.
    expect(sum(screened, "killed")).toBeGreaterThanOrEqual(3);
    expect(sum(screened, "lost")).toBeLessThan(sum(open, "lost"));
  }, 60000);
});

it("plays a seeded headland battle in which bayonets do not dominate the killing", () => {
  const g = new Game(new TestCollision(headlandMap), true, 120 * 30, 4242, undefined, { map: headlandMap, humanPlayerIds: [] });
  let deaths = 0, melee = 0, charges = 0, whistled = 0;
  while (g.phase === "playing") {
    g.step(botCommand(g, g.players[0]));
    for (const e of g.events) {
      if (e.type === "death") {
        deaths++;
        if (e.report?.kind === "melee") melee++;
      }
      if (e.type === "melee" && e.phase === "start" && e.kind === "charge") charges++;
      if (e.type === "whistle") whistled++;
    }
  }
  expect(deaths).toBeGreaterThan(40);
  expect(melee / deaths).toBeLessThan(0.2);
  expect(g.players.every((p) => Number.isFinite(p.x + p.y + p.z + p.hp))).toBe(true);
  // Bots did charge: squads whistled and bayonets were levelled.
  expect(whistled).toBeGreaterThan(0);
  expect(charges).toBeGreaterThan(0);
}, 90000);
