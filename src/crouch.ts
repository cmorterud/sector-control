import { groundHeight } from "./map";
import type { Game, Soldier, Command } from "./simulation";

export const crouchRules = {
  drop: 0.55,
  speed: 2.25,
  standingTop: 1.98,
  crouchingTop: 1.37,
};
export const stanceDrop = (p?: { crouched?: boolean }) =>
  p?.crouched ? crouchRules.drop : 0;
export const eyeHeightOf = (p?: { crouched?: boolean }) => 1.65 - stanceDrop(p);
export const cameraHeightOf = (p?: { crouched?: boolean }) =>
  2.5 - stanceDrop(p);
const standingHits = [0.6, 1.1, 1.6] as const;
const crouchingHits = [0.32, 0.67, 1.05] as const;
export const hitHeights = (p: { crouched?: boolean }) =>
  p.crouched ? crouchingHits : standingHits;
export const hitRadius = (p: { crouched?: boolean }) =>
  p.crouched ? 0.32 : 0.38;

export function canStand(g: Game, p: Soldier): boolean {
  // Check the crown and the horizontal footprint before raising the capsule.
  return [
    [0, 0],
    [0.3, 0],
    [-0.3, 0],
    [0, 0.3],
    [0, -0.3],
    [0.22, 0.22],
    [-0.22, 0.22],
    [0.22, -0.22],
    [-0.22, -0.22],
  ].every(([dx, dz]) => {
    const x = p.x + dx,
      z = p.z + dz;
    // Terrain walking admits a root right up to a bank edge. Raise probes
    // above adjacent earth so its side/top is not mistaken for a ceiling.
    // Neighbor samples cover the native collider's float/contact tolerance.
    const earth = Math.max(
      groundHeight(x, z, g.map),
      groundHeight(x - 0.025, z, g.map),
      groundHeight(x + 0.025, z, g.map),
      groundHeight(x, z - 0.025, g.map),
      groundHeight(x, z + 0.025, g.map),
    );
    const fromY = Math.max(p.y + crouchRules.crouchingTop + 0.01, earth + 0.04);
    const toY = p.y + crouchRules.standingTop;
    return (
      fromY >= toY ||
      g.collision.ray({ x, y: fromY, z }, { x, y: toY, z }) >= 0.999
    );
  });
}
export function updateCrouch(g: Game, p: Soldier, c: Command) {
  let crouched = p.crouched;
  if (p.mantle || p.hop) crouched = false;
  else if (c.crouch && !c.mantle) crouched = true;
  else if (!p.crouched || canStand(g, p)) crouched = false;
  if (crouched !== p.crouched) {
    p.crouched = crouched;
    g.emit({ type: "stance", actor: p.id, crouched });
  }
}
