// Squad AI audit: one headless 100-soldier battle with and without squad
// tactics (BotSettings.squads), on the same seed. Bundle with esbuild for Node:
//   esbuild tools/ai-audit.ts --bundle --platform=node --format=esm --outfile=ai-audit.mjs
//   node ai-audit.mjs [village|headland|verdun] [seconds] [seed] [recruit|regular|veteran]
import { Game, TestCollision, botCommand, idle, type Difficulty } from "../src/simulation";
import { villageMap } from "../src/village-map";
import { headlandMap } from "../src/headland-map";
import { verdunMap } from "../src/verdun-map";
import { dist, groundHeight } from "../src/map";
import { villageCover } from "../src/village-tactics";
import { kitBuildingAt, squadFeatures } from "../src/squads";

const maps = { village: villageMap, headland: headlandMap, verdun: verdunMap };
const [name = "village", seconds = "120", seed = "12345", difficulty = "regular"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const map = maps[name as keyof typeof maps];
// --without=commander,overwatch,... switches off individual squad behaviours.
const without = process.argv.find((a) => a.startsWith("--without="))?.slice(10).split(",") ?? [];
for (const feature of without) {
  if (!(feature in squadFeatures)) throw Error("Unknown feature " + feature);
  squadFeatures[feature as keyof typeof squadFeatures] = false;
}
const onlyAfter = process.argv.includes("--after-only");
if (!map) throw Error("Unknown map " + name);

function run(squads: boolean) {
  const g = new Game(new TestCollision(map), true, Number(seconds) * 30, Number(seed), { squads, difficulty: difficulty as Difficulty }, {
    map,
    humanPlayerIds: [],
  });
  let botMs = 0;
  g.commandOverride = (game, p) => {
    const start = performance.now();
    const c = botCommand(game, p);
    botMs += performance.now() - start;
    return c;
  };
  const out = {
    squads, shots: 0, deaths: 0, deathsInCover: 0, captures: 0, firstCapture: null as number | null,
    grenades: 0, grenadeKills: 0, suppressing: 0, stuck: 0, samples: 0, atWindows: 0, upstairs: 0,
    spacing: 0, spacingSamples: 0, callouts: {} as Record<string, number>, deathKinds: {} as Record<string, number>, modes: {} as Record<string, number>,
  };
  const began = performance.now();
  while (g.phase === "playing") {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    for (const e of g.events) {
      if (e.type === "fire") out.shots++;
      if (e.type === "capture") {
        out.captures++;
        out.firstCapture ??= g.tick / 30;
      }
      if (e.type === "grenadeThrow") out.grenades++;
      if (e.type === "callout") out.callouts[e.line] = (out.callouts[e.line] ?? 0) + 1;
      if (e.type === "botPosition" && e.reason === "stuck") out.stuck++;
      if (e.type === "death") {
        out.deaths++;
        const victim = g.players.find((p) => p.id === e.actor)!;
        if (kitBuildingAt(g, victim) || villageCover(g, victim, victim) > 0) out.deathsInCover++;
        if (e.report?.kind === "grenade") out.grenadeKills++;
        const kind = e.report?.kind ?? "unknown";
        out.deathKinds[kind] = (out.deathKinds[kind] ?? 0) + 1;
      }
    }
    if (g.tick % 30 === 0) {
      for (const p of g.players) {
        if (p.hp <= 0) continue;
        out.samples++;
        if (p.villagePlan?.window !== undefined && dist(p, p.villagePlan.goal) < 1.5) out.atWindows++;
        if (p.y > groundHeight(p.x, p.z, g.map) + 2) out.upstairs++;
        if (p.mode === "Suppressing") out.suppressing++;
        out.modes[p.mode] = (out.modes[p.mode] ?? 0) + 1;
      }
      // Squad spacing: mean distance from members to their squad's centre.
      const groups = new Map<string, { x: number; z: number }[]>();
      for (const p of g.players) {
        if (p.hp <= 0 || p.id === 0) continue;
        const key = p.team + Math.floor((p.teamIndex - (p.team === "blue" ? 1 : 0)) / 5);
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      for (const members of groups.values()) {
        if (members.length < 2) continue;
        const cx = members.reduce((n, q) => n + q.x, 0) / members.length;
        const cz = members.reduce((n, q) => n + q.z, 0) / members.length;
        out.spacing += members.reduce((n, q) => n + Math.hypot(q.x - cx, q.z - cz), 0) / members.length;
        out.spacingSamples++;
      }
    }
    if (g.players.some((p) => !Number.isFinite(p.x + p.y + p.z + p.hp))) throw Error("Nonfinite state");
  }
  const botTicks = g.tick;
  return {
    map: map.id, seed: Number(seed), difficulty, squads, seconds: g.tick / 30, cpuSeconds: (performance.now() - began) / 1000,
    botMsPerTick: botMs / botTicks, scores: g.scores, shots: out.shots, deaths: out.deaths,
    deathsInCoverShare: out.deaths ? out.deathsInCover / out.deaths : 0, captures: out.captures, firstCaptureSeconds: out.firstCapture,
    grenades: out.grenades, grenadeKills: out.grenadeKills, stuckReplans: out.stuck,
    windowShare: out.atWindows / out.samples, upstairsShare: out.upstairs / out.samples, suppressingShare: out.suppressing / out.samples,
    squadSpacing: out.spacing / Math.max(1, out.spacingSamples), callouts: out.callouts, deathKinds: out.deathKinds, modes: out.modes,
  };
}
const after = run(true);
console.log(JSON.stringify(onlyAfter ? { after, without } : { before: run(false), after }, null, 2));
