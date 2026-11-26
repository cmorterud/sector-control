import { blocked, dist, groundHeight, type Vec } from "./map";
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

// Slots in a 4 x 3 block 1.8 m apart, centred on the point.
export function deploymentSlot(g: Game, point: Vec, index: number): Vec {
  for (let k = 0; k < 12; k++) {
    const i = (index + k) % 12;
    const at = { x: point.x + ((i % 4) - 1.5) * 1.8, z: point.z + (Math.floor(i / 4) - 1) * 1.8 };
    if (!blocked(at.x, at.z, 0.5, g.map) && Math.abs(groundHeight(at.x, at.z, g.map) - groundHeight(point.x, point.z, g.map)) < 0.3) return at;
  }
  return { x: point.x, z: point.z };
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
  return point ? deploymentSlot(g, point, p.teamIndex) : null;
}
