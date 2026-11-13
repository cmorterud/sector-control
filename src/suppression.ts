import { weaponProfiles } from "./weapons";
import { reactToThreat } from "./combat-reaction";
import { stanceDrop } from "./crouch";
import type { Game, Soldier, Projectile, V3, Command } from "./simulation";
import { idle, firingPosition } from "./simulation";
import { dist, walkSegment } from "./map";
export const suppressionRules = {
  radius: 1.8,
  threshold: 0.65,
  recoveryPerTick: 0.24 / 30,
  duckTicks: 45,
};
export function suppressNearMiss(
  g: Game,
  p: Soldier,
  shot: Projectile,
  from: V3,
  to: V3,
) {
  if (
    p.hp <= 0 ||
    p.team === shot.team ||
    g.tick < p.protectedUntil ||
    shot.suppressed?.includes(p.id)
  )
    return;
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z,
    length2 = dx * dx + dy * dy + dz * dz;
  const head = { x: p.x, y: p.y + 1.5 - stanceDrop(p), z: p.z };
  const t = length2
    ? Math.max(
        0,
        Math.min(
          1,
          ((head.x - from.x) * dx +
            (head.y - from.y) * dy +
            (head.z - from.z) * dz) /
            length2,
        ),
      )
    : 0;
  const at = { x: from.x + dx * t, y: from.y + dy * t, z: from.z + dz * t };
  const distance = Math.hypot(head.x - at.x, head.y - at.y, head.z - at.z);
  if (distance >= suppressionRules.radius || g.collision.ray(at, head) < 0.99)
    return;
  (shot.suppressed ??= []).push(p.id);
  const previous = p.suppression;
  p.suppression = Math.min(
    1,
    p.suppression + 0.16 + 0.12 * (1 - distance / suppressionRules.radius),
  );
  if (distance < .9 || p.suppression >= .5)
    reactToThreat(g, p, from, "nearMiss", .35 + .45 * (1 - distance / suppressionRules.radius));
  if (
    previous < suppressionRules.threshold &&
    p.suppression >= suppressionRules.threshold
  )
    g.emit({
      type: "suppression",
      actor: p.id,
      source: shot.actor,
      level: p.suppression,
    });
  if (g.humanPlayerIds.includes(p.id) && g.tick >= p.nextNearMiss) {
    p.nextNearMiss = g.tick + 5;
    g.emit({ type: "nearMiss", actor: p.id, source: shot.actor, at, distance });
  }
}
export function suppressionCommand(g: Game, p: Soldier): Command | null {
  if (
    !p.duckUntil &&
    p.suppression >= suppressionRules.threshold &&
    g.tick >= p.nextDuck &&
    !p.mantle &&
    !p.hop
  ) {
    const station = firingPosition(g, p);
    const shelter = { x: p.x + (p.team === "blue" ? -2.5 : 2.5), z: p.z };
    if (
      station &&
      dist(p, station) < 2 &&
      !p.forwardPost &&
      walkSegment(p, shelter, g.map)
    ) {
      p.duckUntil = g.tick + suppressionRules.duckTicks;
      p.nextDuck = g.tick + 100;
      p.suppressionShelter = shelter;
      p.path = [];
      p.target = -1;
      g.emit({ type: "duck", actor: p.id, phase: "start" });
    }
  }
  if (!p.duckUntil) return null;
  if (g.tick >= p.duckUntil) {
    p.duckUntil = 0;
    p.suppressionShelter = null;
    p.nextThink = g.tick;
    p.path = [];
    g.emit({ type: "duck", actor: p.id, phase: "end" });
    return null;
  }
  const c = idle(),
    s = p.suppressionShelter!;
  const distance = Math.max(0.6, dist(p, s));
  c.x = (s.x - p.x) / distance;
  c.z = (s.z - p.z) / distance;
  c.sprint = true;
  c.yaw = p.yaw;
  c.reload =
    p.ammo < Math.min(15, weaponProfiles[p.weapon].magazine) && p.reserve > 0;
  p.mode = "Taking cover";
  return c;
}
