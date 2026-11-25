// Bayonet charge audit: seeded all-bot battles, reporting the kill mix (how
// much of the dying is done with the bayonet), how often lone and squad
// charges start and how often they land. Bundle with esbuild for Node:
//   esbuild tools/charge-audit.ts --bundle --platform=node --format=esm --outfile=charge-audit.mjs
//   node charge-audit.mjs [trenches|village|headland|verdun|fort-vaux] [seconds] [seed,seed,...]
import { Game, TestCollision, botCommand, idle } from "../src/simulation";
import { trenchMap } from "../src/trench-map";
import { villageMap } from "../src/village-map";
import { headlandMap } from "../src/headland-map";
import { verdunMap } from "../src/verdun-map";
import { fortVauxMap } from "../src/fort-vaux-map";

const maps = { trenches: trenchMap, village: villageMap, headland: headlandMap, verdun: verdunMap, "fort-vaux": fortVauxMap };
const [name = "trenches", seconds = "120", seeds = "12345,777,4242"] = process.argv.slice(2);
const map = maps[name as keyof typeof maps];
if (!map) throw Error("Unknown map " + name);

function audit(seed: number) {
  const g = new Game(new TestCollision(map), true, Number(seconds) * 30, seed, undefined, { map, humanPlayerIds: [] });
  const out = {
    deaths: 0, melee: 0, chargeKills: 0, starts: {} as Record<string, number>,
    charges: 0, chargesLanded: 0, chargersKilled: 0, whistles: 0, panicked: 0,
    lone: 0, squadCharges: [] as { members: number; landed: number; lost: number; reached: number }[],
  };
  const lone = new Set<number>();
  // A bayonet-charge lunge "lands" if it strikes an enemy for damage before it ends.
  const open = new Map<number, boolean>();
  while (g.phase === "playing") {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    for (const e of g.events) {
      if (e.type === "whistle") out.whistles++;
      if (e.type === "chargePanic") out.panicked++;
      if (e.type === "chargeEnd") out.squadCharges.push({ members: e.members, landed: e.landed, lost: e.lost, reached: e.reached });
      if (e.type === "melee" && e.phase === "start") {
        out.starts[e.kind] = (out.starts[e.kind] ?? 0) + 1;
        if (e.kind === "charge") {
          out.charges++;
          open.set(e.actor, false);
        }
      }
      if (e.type === "melee" && e.phase === "strike" && e.kind === "charge" && e.damage) open.set(e.actor, true);
      if (e.type === "melee" && e.kind === "charge" && (e.phase === "end" || e.phase === "cancel") && open.has(e.actor)) {
        if (open.get(e.actor)) out.chargesLanded++;
        open.delete(e.actor);
      }
      if (e.type === "death") {
        out.deaths++;
        if (e.report?.kind === "melee") out.melee++;
        if (e.report?.weapon === "Bayonet charge") out.chargeKills++;
        // Still marked as charging: the charge is cleared on the next tick.
        if (g.players[e.actor].charge) out.chargersKilled++;
        open.delete(e.actor);
      }
    }
    for (const p of g.players) {
      if (p.charge?.kind === "lone" && !lone.has(p.id)) out.lone++;
      if (p.charge?.kind === "lone") lone.add(p.id);
      else lone.delete(p.id);
    }
    if (g.players.some((p) => !Number.isFinite(p.x + p.y + p.z + p.hp))) throw Error("Nonfinite state");
  }
  const squads = out.squadCharges;
  return {
    map: map.id, seed, seconds: g.tick / 30, scores: g.scores, ...out,
    // A whistle charge succeeds if a blow lands or survivors reach the goal.
    squadChargeSuccess: squads.length ? +(squads.filter((c) => c.landed || c.reached).length / squads.length).toFixed(3) : 0,
    meleeShare: out.deaths ? +(out.melee / out.deaths).toFixed(3) : 0,
    chargeSuccess: out.charges ? +(out.chargesLanded / out.charges).toFixed(3) : 0,
  };
}
for (const seed of seeds.split(",").map(Number)) console.log(JSON.stringify(audit(seed)));
