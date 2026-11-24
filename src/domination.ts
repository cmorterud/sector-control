import { dist, groundHeight, type Vec } from "./map";
import type { Game, Sector, Soldier } from "./simulation";

export const dominationRules = {
  captureTicks: 15 * 30,
  radius: 6,
  heightTolerance: 1.1,
  scoreInterval: 3 * 30,
  scoreLimit: 300,
};

// A flag belongs to the trench around it. The nearby bank top or another
// corridor behind solid earth must not capture it through the wall.
export function flagContains(g: Game, p: Vec & { y: number }, s: Vec): boolean {
  if (dist(p, s) > dominationRules.radius + 1e-6) return false;
  // A flag on a deck carries its own height; elsewhere it stands on the ground.
  const y = s.y ?? groundHeight(s.x, s.z, g.map);
  return (
    Math.abs(p.y - y) <= dominationRules.heightTolerance &&
    g.collision.ray(
      { x: p.x, y: p.y + 0.9, z: p.z },
      { x: s.x, y: y + 0.9, z: s.z },
    ) > 0.995
  );
}

export function flagOccupant(g: Game, p: Soldier, s: Sector): boolean {
  return p.hp > 0 && !p.mantle && !p.hop && !p.fall && flagContains(g, p, s);
}

const floorPost = (p: Soldier, s: Sector): Vec => ({
  x: s.x + ((p.id % 3) - 1) * 0.3,
  z: s.z + ((Math.floor(p.id / 3) % 3) - 1) * 0.8,
});

export function dominationPost(
  g: Game,
  p: Soldier,
  original?: Vec,
): Vec | undefined {
  if (g.scoring !== "domination") return undefined;
  if (p.forwardPost) {
    const s = g.sectors
      .filter((s) => s.home !== p.team)
      .sort((a, b) => dist(a, p.forwardPost!) - dist(b, p.forwardPost!))[0];
    if (!s) return p.forwardPost;
    if (s.owner !== p.team || s.contested) return floorPost(p, s);
    const posts =
      g.map.terrain?.firingPositions?.filter(
        (v) => v.team !== p.team && dist(v, s) <= dominationRules.radius,
      ) ?? [];
    return posts[p.id % Math.max(1, posts.length)] ?? floorPost(p, s);
  }
  if (!original || p.weapon === "machineGun" || p.teamIndex % 2)
    return undefined;
  const threatened = g.sectors.find(
    (s) =>
      s.home === p.team &&
      (s.contested || (s.owner && s.owner !== p.team)) &&
      dist(original, s) < 8,
  );
  return threatened ? floorPost(p, threatened) : undefined;
}
