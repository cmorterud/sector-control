import { expect, it, vi } from "vitest";
import { artilleryRules } from "./artillery";
import { BattlefieldFeedback, type SoundCue } from "./battlefield";
import { gallipoliMap } from "./gallipoli-map";
import { groundHeight, type MapDefinition } from "./map";
import { mortarStats } from "./mortar-stats";
import { ballisticPath, closestApproach, mortarSound, overheadPass, shellVoices } from "./shell-sound";
import { Game, TestCollision, idle, type Event } from "./simulation";
import { trenchMap } from "./trench-map";

vi.setConfig({ testTimeout: 120000 });

const scene = (map: MapDefinition = trenchMap, ambient = false) => {
  const g = new Game(new TestCollision(map), true, 480 * 30, 5, undefined, { map, ambientArtillery: ambient, teamSize: 3 });
  g.commandOverride = () => idle();
  const cues: SoundCue[] = [], feedback = new BattlefieldFeedback((c) => cues.push(c));
  feedback.reset(g);
  return { g, cues, feedback };
};
// Step the match and its sound together, noting when each cue played and
// where each shell burst.
function run(g: Game, feedback: BattlefieldFeedback, cues: SoundCue[], ticks: number, first = idle()) {
  const heard: { tick: number; cue: SoundCue }[] = [], impacts: Extract<Event, { type: "artilleryImpact" }>[] = [];
  for (let i = 0; i < ticks; i++) {
    const before = cues.length;
    g.step(i ? idle() : first);
    for (const e of g.events) {
      feedback.event(g, e);
      if (e.type === "artilleryImpact") impacts.push(e);
    }
    feedback.step(g);
    for (const cue of cues.slice(before)) heard.push({ tick: g.tick, cue });
  }
  return { heard, impacts };
}
const place = (g: Game, x: number, z: number) =>
  Object.assign(g.players[0], { x, z, y: groundHeight(x, z, g.map), vx: 0, vz: 0, protectedUntil: 0 });

it("gives every shell and bomb its own voice: whizz-bangs barely warn, heavies are heard for seconds", () => {
  const v = shellVoices;
  expect(v.naval.lead).toBeLessThan(0.3);
  expect(v.heavy.lead).toBeGreaterThan(2 * v.field.lead);
  expect(v.heavy.rumble).toBeGreaterThan(0);
  expect(v.stokes.tone?.interval).toBeGreaterThan(1);
  expect(v.granatenwerfer.flutter!.rate).toBeGreaterThan(v.garland.flutter!.rate);
  expect(v.gas.flutter).toBeDefined();
  expect(v.overhead.pass).toBe(true);
  // Every army's tube has its own voice.
  expect(new Set(mortarStats.map((m) => mortarSound(m.name))).size).toBe(mortarStats.length);
  expect(mortarSound(undefined)).toBe("stokes");
});

it("hears each fire-mission shell coming once, along the path it really flies, before it bursts", () => {
  const { g, cues, feedback } = scene();
  place(g, -10, 6);
  g.tick = artilleryRules.initialDelay;
  const { heard, impacts } = run(g, feedback, cues, artilleryRules.warning + artilleryRules.barrageDuration + 40, { ...idle(), artillery: { x: 20, z: 6, area: true } });
  const incoming = heard.filter((h) => h.cue.kind === "incoming");
  expect(impacts).toHaveLength(artilleryRules.shellCount);
  // One voice per shell: the launch events of planned shells add none.
  expect(incoming).toHaveLength(artilleryRules.shellCount);
  expect(feedback.incomingByShell.field).toBe(artilleryRules.shellCount);
  const lead = Math.round(shellVoices.field.lead * 30);
  for (const impact of impacts) {
    const voice = incoming.find((h) => Math.hypot(h.cue.at.x - impact.at.x, h.cue.at.z - impact.at.z) < 0.6)!;
    expect(voice, `shell at ${impact.at.x}, ${impact.at.z}`).toBeDefined();
    // Heard the voice's lead before it lands, and the path ends at the burst.
    expect(impact.tick - voice.tick).toBeGreaterThanOrEqual(lead - 1);
    expect(impact.tick - voice.tick).toBeLessThanOrEqual(lead + 1);
    const path = voice.cue.path!;
    expect(path[0].t).toBe(0);
    expect(path.at(-1)!.t).toBeCloseTo((impact.tick - voice.tick) / 30, 1);
    expect(Math.abs(path.at(-1)!.at.y - impact.at.y)).toBeLessThan(0.6);
    // It comes down from the firing side, high and steep.
    expect(path[0].at.y).toBeGreaterThan(path.at(-1)!.at.y + 20);
    expect(path[0].at.x).toBeLessThan(path.at(-1)!.at.x);
  }
});

it("leaves the match untouched", () => {
  const plain = scene(), heard = scene();
  for (const s of [plain, heard]) {
    place(s.g, -10, 6);
    s.g.tick = artilleryRules.initialDelay;
  }
  run(heard.g, heard.feedback, heard.cues, 260, { ...idle(), artillery: { x: 20, z: 6, area: true } });
  for (let i = 0; i < 260; i++) plain.g.step(i ? idle() : { ...idle(), artillery: { x: 20, z: 6, area: true } });
  expect(heard.g.snapshot()).toEqual(plain.g.snapshot());
});

it("only hears shells whose path comes within their reach", () => {
  const { g, cues, feedback } = scene();
  place(g, -70, 0);
  g.tick = artilleryRules.initialDelay;
  // Called by the listener far from the target: too far to hear them come.
  const { heard } = run(g, feedback, cues, artilleryRules.warning + artilleryRules.barrageDuration + 40, { ...idle(), artillery: { x: -10, z: 30, area: true } });
  const incoming = heard.filter((h) => h.cue.kind === "incoming");
  for (const h of incoming) expect(closestApproach(h.cue.path!, { x: -70, y: g.players[0].y + 1.6, z: 0 })).toBeLessThanOrEqual(shellVoices.field.reach);
});

it("rips a warship's shell in at the last moment", () => {
  const { g, cues, feedback } = scene(gallipoliMap);
  const flag = gallipoliMap.sectors.find((s) => s.id === "E")!;
  place(g, flag.x - 12, flag.z);
  g.tick = artilleryRules.initialDelay;
  const { heard, impacts } = run(g, feedback, cues, artilleryRules.warning + artilleryRules.barrageDuration + 40, { ...idle(), artillery: { x: flag.x, z: flag.z, area: true } });
  const naval = heard.filter((h) => h.cue.shell === "naval");
  expect(naval.length).toBeGreaterThan(0);
  expect(heard.some((h) => h.cue.shell === "field")).toBe(false);
  for (const h of naval) {
    const impact = impacts.find((i) => Math.hypot(i.at.x - h.cue.at.x, i.at.z - h.cue.at.z) < 0.6)!;
    expect(impact.tick - h.tick).toBeLessThanOrEqual(Math.round(shellVoices.naval.lead * 30) + 1);
  }
});

it("hears the stray heavy coming for seconds, as a heavy", () => {
  const { g, cues, feedback } = scene(trenchMap, true);
  place(g, 0, 0);
  const { heard, impacts } = run(g, feedback, cues, 30 * 60);
  const heavy = heard.filter((h) => h.cue.shell === "heavy");
  expect(impacts.length).toBeGreaterThan(0);
  expect(heavy.length).toBeGreaterThan(0);
  for (const h of heavy.filter((h) => h.tick < g.tick - 120)) {
    const impact = impacts.find((i) => Math.hypot(i.at.x - h.cue.at.x, i.at.z - h.cue.at.z) < 0.6)!;
    expect(impact).toBeDefined();
    expect(impact.tick - h.tick).toBeGreaterThanOrEqual(Math.round(shellVoices.heavy.lead * 30) - 1);
  }
});

it("follows a mortar bomb down with its tube's voice", () => {
  const { g, cues, feedback } = scene();
  place(g, 0, 0);
  const tube = mortarStats.find((m) => m.id === "granatenwerfer")!;
  const from = { x: 30, y: 2, z: 0 };
  // A bomb 1.2 s from landing just beside the listener.
  g.mortars.bombs.push({
    id: 77, actor: 5, team: "red", owner: 5, from, aim: { x: 1, z: 0 }, target: { x: 1, y: 0, z: 0 }, weaponId: tube.name,
    x: 9, y: 12, z: 0, vx: -6.7, vy: -2, vz: 0, bornAt: g.tick - 50, landsAt: g.tick + 36,
  } as (typeof g.mortars.bombs)[number]);
  feedback.event(g, { type: "mortar", phase: "whistle", actor: 5, owner: 5, bomb: 77, landsAt: g.tick + 36, at: { x: 1, y: 0, z: 0 }, id: 1, tick: g.tick } as Event);
  const cue = cues.find((c) => c.kind === "incoming")!;
  expect(cue.shell).toBe("granatenwerfer");
  expect(cue.path!.at(-1)!.t).toBeCloseTo(1.2, 5);
  expect(cue.path![0].at).toEqual({ x: 9, y: 12, z: 0 });
  // Far away, it is not heard at all.
  place(g, -80, 0);
  feedback.event(g, { type: "mortar", phase: "whistle", actor: 5, owner: 5, bomb: 77, landsAt: g.tick + 36, at: { x: 1, y: 0, z: 0 }, id: 2, tick: g.tick } as Event);
  expect(cues.filter((c) => c.kind === "incoming")).toHaveLength(1);
});

it("sends a heavy over the sector toward the rear now and then, high up, and lands it far off", () => {
  const { g, cues, feedback } = scene();
  place(g, 0, 0);
  const passes: { tick: number; cue: SoundCue }[] = [];
  for (let t = 1; t <= 30 * 180; t++) {
    g.tick = t;
    const before = cues.length;
    feedback.step(g);
    for (const cue of cues.slice(before)) if (cue.shell === "overhead") passes.push({ tick: t, cue });
  }
  expect(passes.length).toBeGreaterThanOrEqual(3);
  expect(passes.length).toBeLessThanOrEqual(8);
  for (let i = 1; i < passes.length; i++) expect(passes[i].tick - passes[i - 1].tick).toBeGreaterThanOrEqual(750);
  for (const { cue } of passes) {
    const path = cue.path!;
    expect(Math.min(...path.map((p) => p.at.y))).toBeGreaterThan(100);
    // From one side's rear to the other's: it crosses the whole sector.
    expect(Math.sign(path[0].at.x)).toBe(-Math.sign(path.at(-1)!.at.x));
  }
  expect(overheadPass({ x: 0, y: 0, z: 0 }, 0.2)[0].at.x).toBeLessThan(0);
});

it("traces a ballistic path to where it lands", () => {
  const path = ballisticPath({ x: 0, y: 10, z: 0 }, { x: 2, y: 0, z: 0 }, 10, 1);
  expect(path.at(-1)!.at).toEqual({ x: 2, y: 5, z: 0 });
  expect(path).toHaveLength(7);
});
