// While a bot fights someone, its walk respects where that enemy is. The
// route to an objective is only followed as far as it closes on the target:
// a bot no longer creeps on along its path past the man it is shooting at,
// or away from him while it turns to fire over its shoulder. It still
// strafes, closes distance and moves between covered posts; it picks the
// route up again once the fight is over.

export const engageRules = {
  // Share of the route kept sideways to the target. In the open a bot
  // hardly drifts across his front; among buildings a move to the next
  // covered post keeps its sideways part and only loses the part away.
  sideways: 0.15,
  coverSideways: 1,
  // A target further round than this from the way a bot is heading lies
  // behind it (about 100 degrees).
  behindCos: -0.17,
};

type At = { x: number; z: number };
type Move = { x: number; z: number };

/**
 * Reshape a route step `c` (world x/z) so that it never carries `p` away
 * from or past `target`: the component away from the target is dropped,
 * the part toward it is kept and the sideways part is cut down.
 */
export function respectTarget(p: At, target: At, c: Move, cover = false) {
  const dx = target.x - p.x, dz = target.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) return;
  const tx = dx / d, tz = dz / d;
  const along = Math.max(0, c.x * tx + c.z * tz);
  const side = (c.x * tz - c.z * tx) * (cover ? engageRules.coverSideways : engageRules.sideways);
  c.x = tx * along + tz * side;
  c.z = tz * along - tx * side;
}

/** True when `target` lies behind a bot heading along `heading`. */
export function behind(p: At, target: At, heading: Move) {
  const h = Math.hypot(heading.x, heading.z), d = Math.hypot(target.x - p.x, target.z - p.z);
  if (h < 0.01 || d < 0.01) return false;
  return ((target.x - p.x) * heading.x + (target.z - p.z) * heading.z) / (h * d) < engageRules.behindCos;
}
