import { eyeHeightOf } from "./crouch";
import { dist } from "./map";
import type { Game, Event, Soldier } from "./simulation";
export const voiceLines = [
  "reloading",
  "incoming",
  "grenade",
  "smoke",
] as const;
export type VoiceLine = (typeof voiceLines)[number];
export const chatterRules = {
  nearby: 24,
  globalTicks: 7 * 30,
  soldierTicks: 22 * 30,
  lineTicks: 12 * 30,
};
// Select from real, public events; never reads or changes bot intentions or gameplay RNG.
export class SoldierChatter {
  enabled = true;
  private next = 0;
  private last = -1000;
  private actors = new Map<number, number>();
  private lines = new Map<VoiceLine, number>();
  reset() {
    this.next = 0;
    this.last = -1000;
    this.actors.clear();
    this.lines.clear();
  }
  react(g: Game, e: Event): { actor: Soldier; line: VoiceLine } | undefined {
    if (!this.enabled || g.players[0].hp <= 0) return;
    const listener = g.players[0];
    const nearby = (p: Soldier) =>
      p.hp > 0 &&
      p.team === listener.team &&
      !p.mantle &&
      dist(p, listener) <= chatterRules.nearby;
    let actor: Soldier | undefined, line: VoiceLine | undefined;
    if (e.type === "reload" || e.type === "smokeThrow") {
      actor = g.players.find((p) => p.id === e.actor && nearby(p));
      line = e.type === "reload" ? "reloading" : "smoke";
      if (actor && actor.id !== 0 && (actor.id * 11 + g.tick) % 7 > 2) return;
    } else if (e.type === "artilleryCall" && e.team !== listener.team) {
      line = "incoming";
      actor = g.players
        .filter(
          (p) =>
            nearby(p) &&
            g.tick >= (this.actors.get(p.id) ?? 0) &&
            dist(p, e.target) < e.radius,
        )
        .sort(
          (a, b) =>
            Number(a.id === 0) - Number(b.id === 0) ||
            dist(a, listener) - dist(b, listener),
        )[0];
    } else if (e.type === "grenadeThrow") {
      const thrower = g.players.find((p) => p.id === e.actor);
      if (!thrower) return;
      line = "grenade";
      if (thrower.team === listener.team)
        actor = nearby(thrower) ? thrower : undefined;
      else
        actor = g.players
          .filter(
            (p) =>
              nearby(p) &&
              g.tick >= (this.actors.get(p.id) ?? 0) &&
              dist(p, e.from) < 10 &&
              g.collision.ray(
                { x: p.x, y: p.y + eyeHeightOf(p), z: p.z },
                e.from,
              ) > 0.99,
          )
          .sort((a, b) => dist(a, listener) - dist(b, listener))[0];
    }
    if (!actor || !line) return;
    const urgent = line === "incoming" || line === "grenade";
    if (
      g.tick < (this.lines.get(line) ?? 0) ||
      g.tick < (this.actors.get(actor.id) ?? 0)
    )
      return;
    if (g.tick < this.next && !(urgent && g.tick - this.last >= 75)) return;
    this.last = g.tick;
    this.next = g.tick + chatterRules.globalTicks;
    this.actors.set(actor.id, g.tick + chatterRules.soldierTicks);
    this.lines.set(line, g.tick + chatterRules.lineTicks);
    return { actor, line };
  }
}
