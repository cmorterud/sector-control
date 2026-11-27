// Offline all-bot attack and defend matches. Bundle with esbuild for Node:
//   npx esbuild tools/offensive-audit.ts --bundle --platform=node --format=esm --outfile=<out>.mjs
//   node <out>.mjs <map> <seed> [teamSize]
// Prints the winner, how many phases fell and when, and what each side lost.
import { Game, TestCollision, botCommand, idle, prepareNavigation } from "../src/simulation";
import { springOffensiveMap } from "../src/spring-offensive-map";
import { gallipoliMap } from "../src/gallipoli-map";
import { supportsTanks } from "../src/tanks";
const maps = { "spring-offensive": springOffensiveMap, gallipoli: gallipoliMap };
const [id = "spring-offensive", seedText = "12345", sizeText] = process.argv.slice(2);
const map = maps[id as keyof typeof maps];
if (!map) throw Error(`Unknown map ${id}; one of ${Object.keys(maps).join(", ")}`);
const seed = Number(seedText);
const g = new Game(new TestCollision(map), true, 480 * 30, seed, { difficulty: "regular" }, {
  map, humanPlayerIds: [], tanks: supportsTanks(map), ...(sizeText ? { teamSize: Number(sizeText) } : {}),
});
prepareNavigation(g.map);
const started = Date.now();
const deaths = { blue: 0, red: 0 }, phases: number[] = [];
let captures = 0, most = 0;
while (g.phase === "playing") {
  g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
  for (const e of g.events) {
    if (e.type === "death") deaths[g.players[e.actor].team]++;
    if (e.type === "offensive" && e.phase === "taken") phases.push(Math.round(g.tick / 30));
    if (e.type === "capture") captures++;
  }
  const open = g.offensive!.phases[g.offensive!.phase] ?? [];
  most = Math.max(most, open.filter((i) => g.sectors[i].owner === g.offensive!.attacker).length);
}
const o = g.offensive!;
console.log(JSON.stringify({ map: id, seed, teamSize: g.teamSize, seconds: Math.round(g.tick / 30), wall: (Date.now() - started) / 1000,
  winner: g.winner, attacker: o.attacker, result: o.result, taken: o.phase, phases, captures, most, deaths,
  remaining: g.reinforcements.remaining, owners: g.sectors.map((s) => s.id + ":" + (s.owner ?? "-")).join(" ") }));
