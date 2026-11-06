import type { Game, Soldier, V3 } from "./simulation";

export interface Awareness {
  confidence: number;
  visible: boolean;
  observed: V3 | null;
  velocity: { x: number; z: number };
  seenAt: number;
  nextLook: number;
  nextTrigger: number;
  stringShots: number;
}
export const freshAwareness = (): Awareness => ({
  confidence: 0,
  visible: false,
  observed: null,
  velocity: { x: 0, z: 0 },
  seenAt: -1000,
  nextLook: 0,
  nextTrigger: 0,
  stringShots: 0,
});
export function awarenessSample(p: Soldier, tick: number, salt: number) {
  let n = Math.imul(p.id + 1, 374761393) ^ Math.imul(tick + salt, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
export function canNotice(g: Game, p: Soldier, q: Soldier) {
  if (!g.botSettings.awareness) return true;
  const distance = Math.hypot(q.x - p.x, q.z - p.z);
  const angle = Math.abs(angleDelta(p.yaw, Math.atan2(q.x - p.x, p.z - q.z)));
  // A close silhouette or recent nearby gunshot can draw attention outside the forward view.
  return (
    distance < 7 || angle < 1.1 || (g.tick - q.lastShotAt < 20 && distance < 40)
  );
}
export function observeTarget(g: Game, p: Soldier, q: Soldier, aimY: number) {
  const a = p.awareness;
  if (a.observed && a.seenAt >= 0) {
    const seconds = Math.max(1 / 30, (g.tick - a.seenAt) / 30);
    const vx = Math.max(-7, Math.min(7, (q.x - a.observed.x) / seconds));
    const vz = Math.max(-7, Math.min(7, (q.z - a.observed.z) / seconds));
    a.velocity.x += (vx - a.velocity.x) * 0.35;
    a.velocity.z += (vz - a.velocity.z) * 0.35;
  }
  a.observed = { x: q.x, y: aimY, z: q.z };
  a.visible = true;
  a.seenAt = g.tick;
}
export function turnToward(from: number, to: number, rate: number) {
  return from + Math.max(-rate, Math.min(rate, angleDelta(from, to)));
}
export function semiAutoIntent(g: Game, p: Soldier) {
  if (
    p.triggerHeld ||
    g.tick < p.nextShot ||
    g.tick < p.awareness.nextTrigger ||
    p.reloadAt ||
    p.ammo <= 0 ||
    p.mantle ||
    g.tick < p.throwUntil
  )
    return false;
  const a = p.awareness;
  a.stringShots++;
  if (p.weapon === "machineGun") {
    const pause =
      a.stringShots >= 4 + Math.floor(awarenessSample(p, p.spottedAt, 311) * 3);
    a.nextTrigger =
      g.tick +
      (pause ? 45 + Math.floor(awarenessSample(p, g.tick, 313) * 46) : 3) +
      Math.floor(p.suppression * 10);
    if (pause) a.stringShots = 0;
    return true;
  }
  const pause =
    a.stringShots >= 2 + Math.floor(awarenessSample(p, p.spottedAt, 311) * 2);
  a.nextTrigger =
    g.tick +
    (pause
      ? 20 + Math.floor(awarenessSample(p, g.tick, 313) * 26)
      : 7 + Math.floor(awarenessSample(p, g.tick, 317) * 9)) +
    Math.floor(p.suppression * 10);
  if (pause) a.stringShots = 0;
  return true;
}
