// Hip-fire audit: seeded all-bot matches, reporting how often bots fire with
// the sights up, from the hip and in a gas mask, the hit rate of each, and
// the match result. Bundle with esbuild for Node:
//   esbuild tools/hipfire-audit.ts --bundle --platform=node --format=esm --packages=external --outfile=hipfire-audit.mjs
//   node hipfire-audit.mjs [seconds]
import { Game, TestCollision, botCommand, idle } from "../src/simulation";
import { trenchMap } from "../src/trench-map";
import { verdunMap } from "../src/verdun-map";
import { villageMap } from "../src/village-map";
import { aimBlend } from "../src/weapon-handling";

const seconds = Number(process.argv[2] ?? 180);
const runs = [[12345, trenchMap], [6842, verdunMap], [91821, verdunMap], [12345, villageMap]] as const;
type Bucket = { shots: number; hits: number; range: number };
const bucket = (): Bucket => ({ shots: 0, hits: 0, range: 0 });
const reports = [];
for (const [seed, map] of runs) {
  const g = new Game(new TestCollision(map), true, seconds * 30, seed, undefined, { map, humanPlayerIds: [] });
  const kind = new Map<number, "aimed" | "hip" | "masked">();
  const out = { aimed: bucket(), hip: bucket(), masked: bucket() };
  let deaths = 0, gasStrikes = 0, gasShells = 0, maskOns = 0;
  while (g.phase === "playing") {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    for (const e of g.events) {
      if (e.type === "fire") {
        const p = g.players.find((q) => q.id === e.actor)!;
        if (p.mountedGun !== undefined) continue;
        const k = p.gasMask?.worn ? "masked" : aimBlend(p, g.tick) >= 0.99 ? "aimed" : "hip";
        kind.set(e.projectile, k);
        out[k].shots++;
        const target = g.players.find((q) => q.id === p.target);
        out[k].range += target ? Math.hypot(target.x - p.x, target.z - p.z) : 0;
      }
      if (e.type === "impact" && e.hit && e.target !== null) {
        const k = kind.get(e.projectile);
        const shooter = g.players.find((q) => q.id === e.actor), target = g.players.find((q) => q.id === e.target);
        if (k && shooter && target && shooter.team !== target.team) out[k].hits++;
      }
      if (e.type === "death") deaths++;
      if (e.type === "gasStrike" && e.phase === "call") gasStrikes++;
      if (e.type === "gasShellImpact") gasShells++;
      if (e.type === "gasMask" && e.worn) maskOns++;
    }
  }
  const rate = (b: Bucket) => b.shots ? +(b.hits / b.shots).toFixed(3) : null;
  for (const b of Object.values(out)) b.range = b.shots ? +(b.range / b.shots).toFixed(1) : 0;
  const all = { shots: out.aimed.shots + out.hip.shots + out.masked.shots, hits: out.aimed.hits + out.hip.hits + out.masked.hits, range: 0 };
  const report = {
    seed, map: map.id, seconds, scores: g.scores, winner: g.winner, deaths, gasStrikes, gasShells, maskOns,
    shots: all.shots, hitRate: rate(all),
    aimed: { ...out.aimed, rate: rate(out.aimed) }, hip: { ...out.hip, rate: rate(out.hip) }, masked: { ...out.masked, rate: rate(out.masked) },
  };
  reports.push(report);
  console.log(JSON.stringify(report));
}
