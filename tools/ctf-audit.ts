// Seeded capture-the-flag bot battles; run with esbuild's node bundle:
//   npx esbuild tools/ctf-audit.ts --bundle --platform=node --format=esm --outfile=/tmp/ctf-audit.mjs && node /tmp/ctf-audit.mjs [map] [seeds...]
// TEAM_SIZE and SECONDS override the map's roster and the eight-minute match.
import { Game, TestCollision, botCommand, idle } from "../src/simulation";
import { trenchMap } from "../src/trench-map";
import { verdunMap } from "../src/verdun-map";
import { nightRaidMap } from "../src/night-map";
import { ctfMap } from "../src/ctf";

const maps = { trenches: trenchMap, verdun: verdunMap, "night-raid": nightRaidMap };
const [name = "trenches", ...seedArgs] = process.argv.slice(2);
const seeds = seedArgs.length ? seedArgs.map(Number) : [12345, 6842, 91821];
for (const seed of seeds) {
  const map = ctfMap(maps[name as keyof typeof maps]);
  const teamSize = process.env.TEAM_SIZE ? Number(process.env.TEAM_SIZE) : undefined;
  const g = new Game(new TestCollision(map), true, Number(process.env.SECONDS ?? 480) * 30, seed, undefined, { map, humanPlayerIds: [], teamSize });
  const started = Date.now();
  const actions: Record<string, number> = {};
  const captures: { tick: number; team: string; flag: string }[] = [];
  while (g.phase === "playing") {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    for (const e of g.events)
      if (e.type === "flag") {
        actions[`${e.action}:${e.team}`] = (actions[`${e.action}:${e.team}`] ?? 0) + 1;
        if (e.action === "capture") captures.push({ tick: e.tick, team: e.team === "blue" ? "red" : "blue", flag: e.flag });
      }
  }
  console.log(JSON.stringify({ map: name, seed, ticks: g.tick, seconds: (Date.now() - started) / 1000, scores: g.scores, winner: g.winner, overtime: g.ctf!.overtime, takes: g.ctf!.takes, actions, captures }));
}
