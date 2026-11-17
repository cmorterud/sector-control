import {
  blocked,
  bodyBlocked,
  supportHeight,
  dist,
  groundHeight,
  walkSegment,
  type Vec,
  type MapDefinition,
} from "./map";
import { dominationRules, flagContains } from "./domination";
import type { Command, Game, Soldier } from "./simulation";

export interface VillagePlan {
  objective: number;
  goal: Vec;
  approach: Vec | null;
  cover: number;
  capture: boolean;
  until: number;
  revision: number;
  progress: Vec;
  progressAt: number;
}
type Post = Vec & { cover: number; capture: boolean };
const catalogs = new WeakMap<
  MapDefinition,
  Map<string, { until: number; posts: Post[] }>
>();
const forward = (p: Soldier) => (p.team === "blue" ? 1 : -1);
// Maps whose bots pick individual cover posts around a flag.
export const usesVillageTactics = (map: { id: string }) =>
  map.id === "village" || map.id === "verdun" || map.id === "headland";

// Probe actual geometry toward the opposing approach, or a recently observed
// threat. No hidden enemy position or future artillery plan is consulted.
export function villageCover(g: Game, p: Soldier, at: Vec, observed = false) {
  const y = at.y ?? groundHeight(at.x, at.z, g.map);
  const memory =
    observed && p.awareness.observed && g.tick - p.awareness.seenAt < 90
      ? p.awareness.observed
      : null;
  const end = memory ?? { x: at.x + forward(p) * 7, y: y + 0.65, z: at.z };
  if (dist(at, end) < 1.5) return 0;
  const low = g.collision.ray({ ...at, y: y + 0.65 }, end) < 0.98;
  if (!low) return 0;
  const headEnd = memory ?? { ...end, y: y + 1.65 };
  const high = g.collision.ray({ ...at, y: y + 1.65 }, headEnd) < 0.98;
  return high ? 0.6 : 1;
}

function posts(g: Game, p: Soldier) {
  let cache = catalogs.get(g.map);
  if (!cache) catalogs.set(g.map, (cache = new Map()));
  const key = `${p.team}:${p.objective}`,
    old = cache.get(key);
  if (old && old.until > g.tick) return old.posts;
  const flag = g.sectors[p.objective],
    found: Post[] = [];
  // Offset positions include both capture space and a wider supporting perimeter.
  for (let dx = -8.4; dx <= 8.5; dx += 2.1)
    for (let dz = -8.4; dz <= 8.5; dz += 2.1) {
      const at = { x: flag.x + dx, z: flag.z + dz };
      if (dist(at, flag) > 10 || blocked(at.x, at.z, 0.7, g.map)) continue;
      const y = groundHeight(at.x, at.z, g.map);
      if (
        [
          [-0.45, 0],
          [0.45, 0],
          [0, -0.45],
          [0, 0.45],
        ].some(
          ([x, z]) =>
            Math.abs(groundHeight(at.x + x, at.z + z, g.map) - y) > 0.22,
        )
      )
        continue;
      found.push({
        ...at,
        capture: flagContains(g, { ...at, y }, flag),
        cover: villageCover(g, p, at),
      });
    }
  // A kit capture room is too small for the coarse grid alone: its clear
  // navigation anchors give soldiers more distinct spots near the flag.
  for (const building of g.map.buildings ?? []) {
    if (!building.kit || Math.abs(building.x - flag.x) > building.w / 2 || Math.abs(building.z - flag.z) > building.d / 2) continue;
    for (const at of g.map.navigationPoints ?? []) {
      if (at.y !== undefined || dist(at, flag) > dominationRules.radius || Math.abs(at.x - building.x) > building.w / 2 ||
        Math.abs(at.z - building.z) > building.d / 2 || found.some((q) => dist(q, at) < 0.9) || blocked(at.x, at.z, 0.7, g.map)) continue;
      const y = groundHeight(at.x, at.z, g.map);
      found.push({ x: at.x, z: at.z, capture: flagContains(g, { ...at, y }, flag), cover: villageCover(g, p, at) });
    }
  }
  for(const building of g.map.buildings??[])for(const at of building.posts) {
    if(at.y===undefined || bodyBlocked(at.x,at.z,at.y,.6,g.map) || Math.abs(supportHeight(at.x,at.z,g.map,at.y+.02)-at.y)>.1)continue;
    found.push({...at,capture:false,cover:villageCover(g,p,at)});
  }
  cache.set(key, { until: g.tick + 180, posts: found });
  return found;
}

// Spread computer-controlled lives behind all three entrances. Human spawn
// remains unchanged. These are individual routes, not synchronized squads.
export function villageSpawn(g: Game, p: Soldier): Vec | null {
  if (!usesVillageTactics(g.map) || g.humanPlayerIds.includes(p.id)) return null;
  const routes =
    g.map.terrain?.communicationRoutes?.filter((r) => r.team === p.team) ?? [];
  if (!routes.length) return null;
  const entrance = routes[p.teamIndex % routes.length].entrance;
  const slot = Math.floor(p.teamIndex / routes.length),
    side = -forward(p);
  return {
    x: entrance.x + side * ((g.map.buildings ? 7 : 15) + ((slot % 4) - 1.5) * 1.8),
    z: entrance.z + (Math.floor(slot / 4) - 1.5) * 1.8,
  };
}

export function planVillageMove(
  g: Game,
  p: Soldier,
  route: (a: Vec, b: Vec) => Vec[],
) {
  const old = p.villagePlan;
  if (old && dist(p, old.progress) > 0.65) {
    old.progress = { x: p.x, z: p.z };
    old.progressAt = g.tick;
  }
  const stalled =
    !!old && dist(p, old.goal) > 1.2 && g.tick - old.progressAt >= 90;
  const unsafe =
    !!old && p.suppression > 0.3 && !villageCover(g, p, old.goal, true);
  const invalid =
    !!old &&
    ((old.goal.y !== undefined ? bodyBlocked(old.goal.x,old.goal.z,old.goal.y,.65,g.map) || Math.abs(supportHeight(old.goal.x,old.goal.z,g.map,old.goal.y+.02)-old.goal.y)>.1 : blocked(old.goal.x, old.goal.z, 0.65, g.map)) ||
      (old.revision !== g.map.destruction!.revision &&
        old.cover > villageCover(g, p, old.goal) + 0.1));
  if (
    !old ||
    old.objective !== p.objective ||
    old.until <= g.tick ||
    stalled ||
    unsafe ||
    invalid
  ) {
    if (invalid) catalogs.get(g.map)?.delete(`${p.team}:${p.objective}`);
    const flag = g.sectors[p.objective];
    const allies = g.players.filter(
      (q) => q !== p && q.hp > 0 && q.team === p.team,
    );
    const reserved = allies.filter(
      (q) => q.villagePlan?.objective === p.objective,
    );
    const capture =
      p.weapon !== "machineGun" &&
      (flag.owner !== p.team || flag.contested) &&
      reserved.filter((q) => q.villagePlan!.capture).length < 3;
    const manorPost = !!g.map.buildings && !capture && p.teamIndex%11===4;
    const candidates = posts(g, p).filter(at=>manorPost || at.y===undefined)
      .map((at, index) => {
        const distance = dist(at, flag);
        const crowd = allies.reduce(
          (n, q) =>
            n + Math.max(0, 2.4 - dist(at, q.villagePlan?.goal ?? q)) * 8,
          0,
        );
        const knownCover =
          p.suppression > 0.2 ? villageCover(g, p, at, true) : at.cover;
        return {
          at,
          index,
          score:
            (manorPost && at.y !== undefined ? -45 : 0) +
            crowd +
            dist(p, at) * 0.12 -
            knownCover * 11 +
            (capture ? (at.capture ? 0 : 35) : manorPost ? 0 : Math.abs(distance - 7) * 0.8) +
            (stalled && old && dist(at, old.goal) < 3 ? 15 : 0) +
            // Stable individual preference breaks ties without combat RNG.
            ((index * 17 + p.id * 13) % 23) * 0.035,
        };
      })
      .sort((a, b) => a.score - b.score || a.index - b.index);
    let chosen: Post | undefined;
    let path: Vec[] = [];
    let approach: Vec | null = null;
    const routes =
      g.map.terrain?.communicationRoutes?.filter((r) => r.team === p.team) ??
      [];
    const lane = routes[p.teamIndex % Math.max(1, routes.length)];
    if (lane) {
      const end = lane.points.at(-1)!;
      const exit = { x: end.x + forward(p) * 9.3, z: end.z };
      if ((exit.x - p.x) * forward(p) > 3 && !blocked(exit.x,exit.z,.7,g.map)) approach = exit;
    }
    // Reachability matters more than a cover score. Only a bounded shortlist
    // needs full A*: the shared catalog uses cheap footprint/height checks.
    for (const { at } of candidates.slice(0, 10)) {
      if (at.y !== undefined ? bodyBlocked(at.x,at.z,at.y,.65,g.map) : blocked(at.x, at.z, 0.65, g.map)) continue;
      if (
        capture &&
        !flagContains(g, { ...at, y: groundHeight(at.x, at.z, g.map) }, flag)
      )
        continue;
      const candidateRoute = route(approach ?? p, at);
      if (!candidateRoute.length) continue;
      chosen = at;
      path = candidateRoute;
      break;
    }
    if (chosen) {
      p.villagePlan = {
        objective: p.objective,
        goal: { x: chosen.x, z: chosen.z, ...(chosen.y===undefined ? {} : {y:chosen.y}) },
        approach,
        capture: chosen.capture,
        cover: villageCover(g, p, chosen),
        until: g.tick + 180 + (p.id % 31),
        revision: g.map.destruction!.revision,
        progress: { x: p.x, z: p.z },
        progressAt: g.tick,
      };
      g.emit({
        type: "botPosition",
        actor: p.id,
        objective: flag.id,
        goal: { ...p.villagePlan.goal },
        cover: p.villagePlan.cover,
        capture: p.villagePlan.capture,
        reason: !old
          ? "deploy"
          : old.objective !== p.objective
            ? "objective"
            : stalled
              ? "stuck"
              : invalid
                ? "coverLost"
                : unsafe
                  ? "underFire"
                  : "reposition",
      });
      p.path = approach ? route(p, approach) : path;
      if (approach && !p.path.length) {
        p.villagePlan.approach = null;
        p.path = route(p, chosen);
      }
    } else {
      p.villagePlan = null;
      p.path = route(p, flag);
    }
  } else if (old) {
    old.revision = g.map.destruction!.revision;
    if (old.approach && dist(p, old.approach) < 1.5) {
      old.approach = null;
      p.path = [];
    }
    const destination = old.approach ?? old.goal;
    if (!p.path.length || !walkSegment(p, p.path[0], g.map))
      p.path = route(p, destination);
  }
}

export function villageSteering(
  g: Game,
  p: Soldier,
  c: Command,
  targetDistance: number,
) {
  const plan = p.villagePlan;
  if (!plan) return;
  const relocating = dist(p, plan.goal) > 1.4;
  if (relocating && targetDistance > 7) {
    c.aim = false;
    c.sprint = dist(p, plan.goal) > 3 && p.suppression < 0.3;
    if (c.sprint) c.fire = false;
    p.mode = "Moving to cover";
  }
  const length = Math.hypot(c.x, c.z);
  if (length > 0.1) {
    const dx = c.x / length,
      dz = c.z / length;
    let steer = 0;
    for (const q of g.players) {
      if (q === p || q.hp <= 0 || q.team !== p.team || Math.abs(q.y-p.y)>1.8) continue;
      const x = q.x - p.x,
        z = q.z - p.z,
        d = Math.hypot(x, z);
      if (d < 0.01 || d > 2.6) continue;
      // Anticipate friends ahead, and give each pair a consistent passing side.
      if (x * dx + z * dz > 0 && Math.abs(x * dz - z * dx) < 1.1)
        steer +=
          (q.vx * dx + q.vz * dz < -0.4 ? 1 : p.id < q.id ? 1 : -1) *
          (2.6 - d) *
          0.55;
      if (d < 1.5) {
        c.x -= (x / d) * (1.5 - d) * 0.7;
        c.z -= (z / d) * (1.5 - d) * 0.7;
      }
    }
    const side = {
      x: p.x - dz * Math.sign(steer) * 0.8,
      z: p.z + dx * Math.sign(steer) * 0.8,
    };
    if (Math.abs(steer) > 0.05 && walkSegment(p, side, g.map)) {
      c.x -= dz * Math.max(-0.7, Math.min(0.7, steer));
      c.z += dx * Math.max(-0.7, Math.min(0.7, steer));
    }
  }
  const protectedPost = dist(p, plan.goal) < 1.5 && villageCover(g, p, p) > 0.8;
  if (protectedPost) {
    c.crouch =
      !!p.reloadAt ||
      c.reload ||
      p.suppression > 0.2 ||
      p.target < 0 ||
      (g.tick + p.id * 11) % 90 < 30;
    p.mode = c.crouch ? "Sheltering" : "Covering approach";
  }
}
