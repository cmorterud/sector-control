// What the shooter sees at the crosshair when a round strikes an enemy tank:
// a damage marker and the hull it took when the round went through (the
// anti-tank kit), or a "no penetration" marker when it only rang off the
// plate. Strings only; main.ts draws them.
import type { Event, Game } from "./simulation";
import { tankRules } from "./tanks";

export type TankHit = { kind: "pierced" | "knockedOut" | "ricochet"; text: string };

export class TankHitFeedback {
  // Rounds that went through, so their impact event doesn't also read as a ricochet.
  private pierced = new Set<number>();
  reset() { this.pierced.clear(); }
  event(g: Game, e: Event, player: number): TankHit | undefined {
    if (e.type === "tank" && e.phase === "pierced" && e.actor === player) {
      if (e.projectile !== undefined) this.pierced.add(e.projectile);
      if (this.pierced.size > 64) this.pierced = new Set([...this.pierced].slice(-32));
      const t = g.tanks.list.find(o => o.id === e.tank);
      if (!t) return undefined;
      if (t.state === "wreck") return { kind: "knockedOut", text: `${t.name.toUpperCase()} KNOCKED OUT` };
      const extras = [e.slit ? "SLIT" : "", e.crew ? "CREW HIT" : ""].filter(Boolean).join(" · ");
      return {
        kind: "pierced",
        text: `−${Math.round(e.damage ?? 0)} HULL · ${Math.ceil((t.hp / tankRules.hp) * 100)}%${extras ? ` · ${extras}` : ""}`,
      };
    }
    if (e.type === "impact" && e.tank !== undefined && e.actor === player && !this.pierced.has(e.projectile)) {
      const t = g.tanks.list.find(o => o.id === e.tank);
      const shooter = g.players.find(p => p.id === player);
      if (!t || !shooter || t.team === shooter.team || t.state === "wreck") return undefined;
      return { kind: "ricochet", text: "NO PENETRATION" };
    }
    return undefined;
  }
}
