import { dist, type Vec } from "./map";
import { clearSpawnSpot, frontSlot, spawnFrontRules } from "./spawn-front";
import type { Game, Soldier, Team } from "./simulation";

// Forward deployment (MapDefinition.deployments). While a side holds one of its
// own home flags, its soldiers may deploy at that flag's deployment point: set
// back behind the flag, outside its capture ring, so a soldier never appears on
// a flag that is being fought over. Lose the flag and the point closes.

export interface DeploymentPoint extends Vec {
  sector: string;
  name: string;
}

export function deploymentPoints(g: Game, team: Team): DeploymentPoint[] {
  return (g.map.deployments ?? []).flatMap((d) => {
    const s = g.sectors.find((q) => q.id === d.sector);
    return s && s.home === team && s.owner === team ? [{ sector: d.sector, name: s.name ?? s.id, x: d.x, z: d.z }] : [];
  });
}

// Spread across the width of the flag's sector, not packed on the point: a
// line 32 m long (up to three staggered rows when busy) centred on it, each soldier's place
// clear of walls, flags and teammates (src/spawn-front.ts).
export const deploymentRules = { width: 32 };
export function deploymentSlot(g: Game, p: Soldier, point: Vec): Vec {
  const half = deploymentRules.width / 2;
  const slot = frontSlot({ x: point.x, z0: point.z - half, z1: point.z + half }, p.teamIndex, g.teamSize);
  const back = Math.sign(point.x - g.map.spawn[p.team === "blue" ? "red" : "blue"].x) || (p.team === "blue" ? -1 : 1);
  return clearSpawnSpot(g, p, { x: point.x + back * slot.row * spawnFrontRules.rowGap, z: slot.z }, back) ??
    clearSpawnSpot(g, p, point, back) ?? { x: point.x, z: point.z };
}

// Where a respawning soldier deploys, or null for the main spawn. A player
// picks a point (Soldier.deployAt); a bot takes the open point that is nearer
// its objective than the main spawn.
export function forwardDeployment(g: Game, p: Soldier): Vec | null {
  const points = deploymentPoints(g, p.team);
  if (!points.length) return null;
  let point: DeploymentPoint | undefined;
  if (g.humanPlayerIds.includes(p.id)) point = points.find((q) => q.sector === p.deployAt);
  else {
    const objective = g.sectors[p.objective];
    if (!objective) return null;
    const best = points.reduce((a, b) => (dist(a, objective) <= dist(b, objective) ? a : b));
    if (dist(best, objective) < dist(g.map.spawn[p.team], objective)) point = best;
  }
  return point ? deploymentSlot(g, p, point) : null;
}
