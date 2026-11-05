import { eyeHeightOf } from "./crouch";
import { smokeBlocks } from "./smoke";
import { blocked, dist, groundHeight, walkSegment, type Vec } from "./map";
import {
  idle,
  pathfind,
  type Game,
  type Soldier,
  type Team,
  type V3,
  type Command,
} from "./simulation";
import { artilleryExplosionProfile } from "./destruction";

export const artilleryRules = {
  initialDelay: 20 * 30,
  cooldown: 50 * 30,
  warning: 6 * 30,
  shellCount: 5,
  interval: 30,
  flightTicks: 30,
  scatterRadius: 10,
  dangerRadius: 22,
  minRange: 15,
  maxRange: 70,
};
export interface FireMission {
  id: number;
  actor: number;
  team: Team;
  target: Vec;
  calledAt: number;
  firstImpactAt: number;
  endsAt: number;
  launched: number;
  impacts: Vec[];
}
export interface ArtilleryShell extends V3 {
  id: number;
  mission: number;
  actor: number;
  team: Team;
  vx: number;
  vy: number;
  vz: number;
  bornAt: number;
}
export interface ArtilleryState {
  enabled: boolean;
  readyAt: Record<Team, number>;
  missions: FireMission[];
  shells: ArtilleryShell[];
  missionSequence: number;
  shellSequence: number;
}
export interface ArtilleryEvade {
  mission: number;
  until: number;
  destination: Vec;
  checkedAt: number;
  lastPosition: Vec;
}
export function createArtilleryState(): ArtilleryState {
  return {
    enabled: true,
    readyAt: {
      blue: artilleryRules.initialDelay,
      red: artilleryRules.initialDelay,
    },
    missions: [],
    shells: [],
    missionSequence: 0,
    shellSequence: 0,
  };
}
function teamHasHuman(g: Game, p: Soldier): boolean {
  return g.players.some(
    (q) => q.team === p.team && g.humanPlayerIds.includes(q.id),
  );
}
export function artilleryTargetReason(
  g: Game,
  p: Soldier,
  target: Vec,
): string | null {
  if (!g.artillery.enabled || g.phase !== "playing")
    return "Artillery unavailable";
  if (teamHasHuman(g, p) && !g.humanPlayerIds.includes(p.id))
    return "Artillery is reserved for your team's human player";
  if (p.hp <= 0 || p.mantle || p.hop || p.fall)
    return "Stand on solid ground to spot";
  if (!Number.isFinite(target.x) || !Number.isFinite(target.z))
    return "Choose a target";
  if (g.map.terrain && p.y + eyeHeightOf(p) < g.map.terrain.bankHeight + 0.04)
    return "Use a firing step to spot over the parapet";
  const range = dist(p, target);
  if (range < artilleryRules.minRange || range > artilleryRules.maxRange)
    return "Mark ground 15–70 m away";
  const margin = artilleryRules.scatterRadius + 1;
  if (
    Math.abs(target.x) > g.map.width / 2 - margin ||
    Math.abs(target.z) > g.map.depth / 2 - margin
  )
    return "Target too close to the map boundary";
  const from = { x: p.x, y: p.y + eyeHeightOf(p), z: p.z };
  const to = {
    ...target,
    y: Math.max(
      groundHeight(target.x, target.z, g.map) + 0.15,
      (g.map.terrain?.bankHeight ?? 0) + 0.1,
    ),
  };
  if (smokeBlocks(g, from, to) || g.collision.ray(from, to) < 0.995)
    return "No clear view of that area";
  if (g.tick < g.artillery.readyAt[p.team]) return "Artillery is reloading";
  if (g.artillery.missions.some((m) => m.team === p.team))
    return "Fire mission already active";
  return null;
}
export function requestArtillery(g: Game, p: Soldier, target: Vec): boolean {
  if (artilleryTargetReason(g, p, target)) return false;
  const mission: FireMission = {
    id: ++g.artillery.missionSequence,
    actor: p.id,
    team: p.team,
    target: { ...target },
    calledAt: g.tick,
    firstImpactAt: g.tick + artilleryRules.warning,
    endsAt:
      g.tick +
      artilleryRules.warning +
      (artilleryRules.shellCount - 1) * artilleryRules.interval +
      30,
    launched: 0,
    impacts: [],
  };
  for (let i = 0; i < artilleryRules.shellCount; i++) {
    const angle = g.random() * Math.PI * 2,
      radius = Math.sqrt(g.random()) * artilleryRules.scatterRadius;
    mission.impacts.push({
      x: target.x + Math.cos(angle) * radius,
      z: target.z + Math.sin(angle) * radius,
    });
  }
  g.artillery.readyAt[p.team] = g.tick + artilleryRules.cooldown;
  g.artillery.missions.push(mission);
  p.protectedUntil = 0;
  g.emit({
    type: "artilleryCall",
    actor: p.id,
    team: p.team,
    mission: mission.id,
    target: { ...target },
    firstImpactAt: mission.firstImpactAt,
    endsAt: mission.endsAt,
    radius: artilleryRules.dangerRadius,
  });
  return true;
}
export function advanceArtillery(g: Game) {
  for (const mission of g.artillery.missions) {
    while (
      mission.launched < artilleryRules.shellCount &&
      g.tick >=
        mission.firstImpactAt -
          artilleryRules.flightTicks +
          mission.launched * artilleryRules.interval
    ) {
      const target = mission.impacts[mission.launched++];
      const side = mission.team === "blue" ? -1 : 1;
      // Land on the first solid surface (including roofs), retaining the warning
      // interval instead of starting a roof-bound shell too close to its impact.
      const floor = groundHeight(target.x, target.z, g.map);
      const above = { ...target, y: floor + 50 },
        below = { ...target, y: floor + 0.025 };
      const surface =
        above.y + (below.y - above.y) * g.collision.ray(above, below);
      const shell: ArtilleryShell = {
        id: ++g.artillery.shellSequence,
        mission: mission.id,
        actor: mission.actor,
        team: mission.team,
        x: target.x + side * 12,
        y: surface + 35,
        z: target.z,
        vx: -side * 12,
        vy: -30,
        vz: 0,
        bornAt: g.tick,
      };
      g.artillery.shells.push(shell);
      g.emit({
        type: "artilleryLaunch",
        actor: shell.actor,
        mission: mission.id,
        shell: shell.id,
        from: { x: shell.x, y: shell.y, z: shell.z },
      });
    }
  }
  const active: ArtilleryShell[] = [];
  for (const shell of g.artillery.shells) {
    if (shell.bornAt === g.tick) {
      active.push(shell);
      continue;
    }
    const from = { x: shell.x, y: shell.y, z: shell.z };
    const to = {
      x: shell.x + shell.vx / 30,
      y: shell.y + shell.vy / 30 - 5 / (30 * 30),
      z: shell.z + shell.vz / 30,
    };
    shell.vy -= 10 / 30;
    let fraction = g.collision.ray(from, to);
    // Ground crossing fallback handles short native-ray contact tolerances.
    if (to.y <= groundHeight(to.x, to.z, g.map) + 0.025) {
      let low = 0,
        high = 1;
      for (let i = 0; i < 12; i++) {
        const t = (low + high) / 2;
        const x = from.x + (to.x - from.x) * t,
          y = from.y + (to.y - from.y) * t,
          z = from.z + (to.z - from.z) * t;
        if (y <= groundHeight(x, z, g.map) + 0.025) high = t;
        else low = t;
      }
      fraction = Math.min(fraction, high);
    }
    shell.x = from.x + (to.x - from.x) * fraction;
    shell.y = from.y + (to.y - from.y) * fraction;
    shell.z = from.z + (to.z - from.z) * fraction;
    if (
      fraction < 1 ||
      to.y <= groundHeight(to.x, to.z, g.map) + 0.026 ||
      g.tick - shell.bornAt >= 90
    ) {
      const at = { x: shell.x, y: shell.y + 0.025, z: shell.z };
      const hits = g.explode(
        at,
        shell.actor,
        shell.team,
        artilleryExplosionProfile,
      );
      g.emit({
        type: "artilleryImpact",
        actor: shell.actor,
        mission: shell.mission,
        shell: shell.id,
        at,
        radius: artilleryExplosionProfile.radius,
        hits,
      });
    } else active.push(shell);
  }
  g.artillery.shells = active;
  g.artillery.missions = g.artillery.missions.filter((mission) => {
    if (g.tick < mission.endsAt || active.some((s) => s.mission === mission.id))
      return true;
    g.emit({ type: "artilleryEnd", mission: mission.id });
    return false;
  });
}
export function artilleryThreat(g: Game, p: Vec): FireMission | undefined {
  return g.artillery.missions.find(
    (m) => dist(p, m.target) < artilleryRules.dangerRadius + 2,
  );
}
export function botArtilleryTarget(g: Game, p: Soldier): Vec | null {
  if (
    !g.artillery.enabled ||
    g.tick < g.artillery.readyAt[p.team] ||
    g.tick % 30 !== p.id % 30 ||
    teamHasHuman(g, p)
  )
    return null;
  const targets = g.players.filter(
    (q) =>
      q.hp > 0 &&
      q.team !== p.team &&
      g.tick >= q.protectedUntil &&
      dist(p, q) >= 35 &&
      dist(p, q) <= 70,
  );
  targets.sort(
    (a, b) =>
      g.players.filter((q) => q.hp > 0 && q.team !== p.team && dist(q, b) < 10)
        .length -
        g.players.filter(
          (q) => q.hp > 0 && q.team !== p.team && dist(q, a) < 10,
        ).length || dist(p, a) - dist(p, b),
  );
  const target = targets.find((target) => !artilleryTargetReason(g, p, target));
  return target ? { x: target.x, z: target.z } : null;
}
export function evadeArtillery(g: Game, p: Soldier): Command | null {
  const threat = artilleryThreat(g, p);
  if (!p.artilleryEvade && !threat) return null;
  if (p.artilleryEvade && g.tick >= p.artilleryEvade.until) {
    p.artilleryEvade = null;
    p.path = [];
    p.nextThink = g.tick;
    if (!threat) return null;
  }
  if (
    threat &&
    (!p.artilleryEvade ||
      (p.artilleryEvade.mission !== threat.id &&
        artilleryThreat(g, p.artilleryEvade.destination)))
  ) {
    const candidates: Vec[] = g.map.terrain?.firingPositions
      ? g.map.terrain.firingPositions
          .filter((s) => s.team === p.team)
          .map((s) => ({ x: s.x + (p.team === "blue" ? -3 : 3), z: s.z }))
      : Array.from({ length: 12 }, (_, i) => ({
          x: p.x + Math.sin((i * Math.PI) / 6) * 24,
          z: p.z + Math.cos((i * Math.PI) / 6) * 24,
        }));
    const safe = candidates.filter(
      (v) => !blocked(v.x, v.z, 0.6, g.map) && !artilleryThreat(g, v),
    );
    safe.sort((a, b) => dist(p, a) - dist(p, b));
    let destination: Vec | undefined,
      route: Vec[] = [];
    for (const candidate of safe.slice(0, 8)) {
      const path = pathfind(p, candidate, g.map);
      if (
        path.length &&
        (!g.map.terrain ||
          path.every((v) => (p.team === "blue" ? v.x <= -18 : v.x >= 18)))
      ) {
        destination = candidate;
        route = path;
        break;
      }
    }
    if (!destination) {
      destination = { x: p.x + (p.team === "blue" ? -3 : 3), z: p.z };
      route = walkSegment(p, destination, g.map) ? [destination] : [];
      if (!route.length) destination = { x: p.x, z: p.z };
    }
    p.artilleryEvade = {
      mission: threat!.id,
      until: threat!.endsAt,
      destination,
      checkedAt: g.tick,
      lastPosition: { x: p.x, z: p.z },
    };
    p.path = route;
    p.nextThink = g.tick + 30;
    g.emit({
      type: "artilleryEvade",
      actor: p.id,
      mission: threat!.id,
      to: { ...destination },
    });
  }
  const evade = p.artilleryEvade!;
  if (threat) evade.until = Math.max(evade.until, threat.endsAt);
  if (
    dist(p, evade.destination) > 0.6 &&
    !p.path.length &&
    g.tick >= p.nextThink
  ) {
    p.path = pathfind(p, evade.destination, g.map);
    p.nextThink = g.tick + 30;
  }
  if (g.tick - evade.checkedAt >= 15) {
    if (p.path.length && dist(p, evade.lastPosition) < 0.3) {
      // Axis-wise walking can snag where a sampled diagonal grazes a step.
      // Back off onto the trench floor, then resume the existing safe route.
      const away = p.team === "blue" ? -1 : 1;
      const detour = [
        { x: p.x + away * 3, z: p.z },
        { x: p.x, z: p.z + 1.5 },
        { x: p.x, z: p.z - 1.5 },
      ].find((v) => !blocked(v.x, v.z, 0.6, g.map) && walkSegment(p, v, g.map));
      if (detour) p.path.unshift(detour);
    }
    evade.checkedAt = g.tick;
    evade.lastPosition = { x: p.x, z: p.z };
  }
  // Do not round a ramp corner until the following segment is walkable from
  // the actual position; an early waypoint skip can leave a bot above its edge.
  while (
    p.path.length &&
    dist(p, p.path[0]) < 0.35 &&
    (p.path.length === 1 || walkSegment(p, p.path[1], g.map))
  )
    p.path.shift();
  const c = idle();
  const destination = p.path[0];
  if (destination) {
    const distance = Math.max(0.7, dist(p, destination));
    c.x = (destination.x - p.x) / distance;
    c.z = (destination.z - p.z) / distance;
    c.yaw = Math.atan2(c.x, -c.z);
    c.sprint = true;
  } else c.yaw = p.yaw;
  c.reload = p.ammo < 30 && p.reserve > 0;
  p.mode = destination ? "Evade artillery" : "Artillery shelter";
  return c;
}

// The normal horizon aim marks ground ahead; looking down traces the surface precisely.
export function artilleryAim(
  g: Game,
  p: Soldier,
  yaw: number,
  pitch: number,
): Vec {
  const from = { x: p.x, y: p.y + eyeHeightOf(p), z: p.z };
  const to = {
    x: from.x + Math.sin(yaw) * Math.cos(pitch) * 70,
    y: from.y + Math.sin(pitch) * 70,
    z: from.z - Math.cos(yaw) * Math.cos(pitch) * 70,
  };
  const hit = g.collision.ray(from, to);
  if (hit < 1)
    return {
      x: from.x + (to.x - from.x) * hit,
      z: from.z + (to.z - from.z) * hit,
    };
  const range = Math.max(16, Math.min(68, 45 + pitch * 30));
  return { x: p.x + Math.sin(yaw) * range, z: p.z - Math.cos(yaw) * range };
}
