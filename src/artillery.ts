import { auditArtilleryCall } from "./artillery-audit";
import { eyeHeightOf } from "./crouch";
import { smokeBlocks } from "./smoke";
import { spawnLineDistance } from "./spawn-front";
import { teamSpawn } from "./offensive";
import { deadGround, shellProfileFor } from "./naval-gunfire";
import { hillHeight, beyondPlayArea, blocked, dist, groundHeight, playArea, walkSegment, type Vec } from "./map";
import {
  idle,
  pathfind,
  safeBotDestination,
  type Game,
  type Soldier,
  type Team,
  type V3,
  type Command,
} from "./simulation";
import {
  artilleryExplosionProfile,
  ambientArtilleryExplosionProfile,
  boundaryArtilleryExplosionProfile,
} from "./destruction";
import { artillerySector } from "./artillery-sectors";
import { sightLimit } from "./night";
import { cloudExposure } from "./gas";

export const ambientArtilleryRules = {
  minInterval: 8 * 30,
  maxInterval: 22 * 30,
  edgeMargin: 8,
  spawnClearance: 34,
  // Beyond a stray shell's 18 m reach of the line a side spreads along to deploy.
  spawnLineClearance: 20,
};
const shellsPerBarrage = 8;
const barrageDuration = 4 * 30;
const shellHeight = 35;
const shellApproach = 12;
const shellGravity = 10;
export const artilleryRules = {
  initialDelay: 10 * 30,
  cooldown: 30 * 30,
  warning: 4 * 30,
  shellCount: shellsPerBarrage,
  barrageDuration,
  interval: barrageDuration / (shellsPerBarrage - 1),
  // 1.5x the old 24-tick drop: shells fall faster, impacts stay on schedule.
  flightTicks: 16,
  // Shells land within this distance of the aim point (1.5x the old 14 m).
  scatterRadius: 21,
  dangerRadius: 21 + artilleryExplosionProfile.radius,
  minRange: 15,
  maxRange: 70,
};
// Jitter interior arrivals, anchoring the first/last shell to the same window.
// A local random stream keeps timing from consuming combat/scatter randomness.
export function barrageOffsets(seed: number): number[] {
  const offsets = Array.from({ length: shellsPerBarrage }, (_, i) => {
    const nominal = Math.round(i * artilleryRules.interval);
    if (i === 0 || i === shellsPerBarrage - 1) return nominal;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return nominal + Math.floor((seed / 4294967296) * 11) - 5;
  });
  const gaps = offsets.slice(1).map((n, i) => n - offsets[i]);
  // Avoid a rare draw that still sounds almost evenly spaced.
  if (Math.max(...gaps) - Math.min(...gaps) < 8) {
    offsets[2] = Math.round(2 * artilleryRules.interval) - 5;
    offsets[3] = Math.round(3 * artilleryRules.interval) + 5;
  }
  return offsets;
}
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
  impactOffsets: number[];
  uncertainty?: number;
  dangerRadius?: number;
}
export interface ArtilleryShell extends V3 {
  ambient?: boolean;
  // A gas shell: the cloud it bursts into instead of exploding.
  gas?: number;
  boundary?: boolean;
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
  ambient: { enabled: boolean; seed: number; nextAt: number };
  readyAt: Record<Team, number>;
  missions: FireMission[];
  shells: ArtilleryShell[];
  missionSequence: number;
  shellSequence: number;
  reports: { mission: number; at: Vec; tick: number }[];
  // Boundary salvo shells waiting for their launch tick.
  boundary?: { mission: number; launchAt: number; target: Vec }[];
}
export interface ArtilleryEvade {
  mission: number;
  until: number;
  destination: Vec;
  checkedAt: number;
  lastPosition: Vec;
}
export function createArtilleryState(
  seed = 12345,
  ambientEnabled = false,
): ArtilleryState {
  const ambient = {
    enabled: ambientEnabled,
    seed: (seed ^ 0x51a7e11) >>> 0,
    nextAt: 0,
  };
  ambient.nextAt = ambientGap(ambient);
  return {
    ambient,
    enabled: true,
    readyAt: {
      blue: artilleryRules.initialDelay,
      red: artilleryRules.initialDelay,
    },
    missions: [],
    shells: [],
    missionSequence: 0,
    shellSequence: 0,
    reports: [],
    boundary: [],
  };
}
// A snapshot-owned stream keeps stray timing/placement independent of combat RNG.
function ambientRandom(state: { seed: number }): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}
function ambientGap(state: ArtilleryState["ambient"]): number {
  return (
    ambientArtilleryRules.minInterval +
    Math.floor(
      ambientRandom(state) *
        (ambientArtilleryRules.maxInterval -
          ambientArtilleryRules.minInterval +
          1),
    )
  );
}
// Where a shell starts its final 16-tick drop onto `target`, and how fast:
// 35 m above the surface it falls on, 12 m out on the firing side.
export function shellStart(g: Game, target: Vec, team: Team) {
  const side = team === "blue" ? -1 : 1;
  const floor = groundHeight(target.x, target.z, g.map);
  const above = { ...target, y: floor + 50 },
    below = { ...target, y: floor + 0.025 };
  const surface = above.y + (below.y - above.y) * g.collision.ray(above, below);
  const flightSeconds = artilleryRules.flightTicks / 30;
  return {
    x: target.x + side * shellApproach,
    y: surface + shellHeight,
    z: target.z,
    vx: (-side * shellApproach) / flightSeconds,
    vy: -shellHeight / flightSeconds + (shellGravity * flightSeconds) / 2,
    vz: 0,
  };
}
export function launchShell(
  g: Game,
  target: Vec,
  mission: number,
  actor: number,
  team: Team,
  ambient = false,
  boundary = false,
  gas?: number,
) {
  const shell: ArtilleryShell = {
    id: ++g.artillery.shellSequence,
    mission,
    actor,
    team,
    ...(ambient ? { ambient: true } : {}),
    ...(boundary ? { boundary: true } : {}),
    ...(gas !== undefined ? { gas } : {}),
    ...shellStart(g, target, team),
    bornAt: g.tick,
  };
  g.artillery.shells.push(shell);
  g.emit({
    type: "artilleryLaunch",
    actor,
    mission,
    shell: shell.id,
    ...(ambient ? { ambient: true } : {}),
    from: { x: shell.x, y: shell.y, z: shell.z },
  });
}
// Where the next stray shell will fall and whose it is, drawn from the
// stream after the gap to it. Bounded rejection sampling over authored spawn
// positions only, never live targets, so it can be read ahead of time.
function ambientPick(g: Game, state: { seed: number }): { target: Vec; team: Team } | null {
  for (let i = 0; i < 64; i++) {
    const target = {
      x:
        (ambientRandom(state) - 0.5) *
        (playArea(g.map).width - ambientArtilleryRules.edgeMargin * 2),
      z:
        (ambientRandom(state) - 0.5) *
        (playArea(g.map).depth - ambientArtilleryRules.edgeMargin * 2),
    };
    if (
      Object.values(g.map.spawn).some(
        (s) => dist(s, target) < ambientArtilleryRules.spawnClearance,
      ) ||
      (["blue", "red"] as const).some(
        (team) => spawnLineDistance(g.map, team, target, teamSpawn(g, team)) < ambientArtilleryRules.spawnLineClearance,
      )
    )
      continue;
    const team: Team = ambientRandom(state) < 0.5 ? "blue" : "red";
    // A stray into ground the fleet cannot reach comes from the other side.
    return { target, team: deadGround(g.map, team, target) ? (team === "blue" ? "red" : "blue") : team };
  }
  return null;
}
// Presentation: the stray shell due next, read from a copy of the stream so
// the match itself is untouched. Its final drop starts at `tick`.
export function nextAmbientShell(g: Game): { tick: number; target: Vec; team: Team } | null {
  const state = g.artillery.ambient;
  if (!g.artillery.enabled || !state.enabled) return null;
  const copy = { seed: state.seed };
  ambientRandom(copy);
  const pick = ambientPick(g, copy);
  return pick && { tick: state.nextAt, ...pick };
}
function advanceAmbient(g: Game) {
  const state = g.artillery.ambient;
  if (
    g.phase !== "playing" ||
    !g.artillery.enabled ||
    !state.enabled ||
    g.tick < state.nextAt
  )
    return;
  state.nextAt = g.tick + ambientGap(state);
  const pick = ambientPick(g, state);
  if (pick)
    launchShell(g, pick.target, ++g.artillery.missionSequence, -1, pick.team, true);
}
export function teamHasHuman(g: Game, p: Soldier): boolean {
  return g.players.some(
    (q) => q.team === p.team && g.humanPlayerIds.includes(q.id),
  );
}
export function artilleryTargetReason(
  g: Game,
  p: Soldier,
  target: Vec & { area?: boolean },
): string | null {
  if (!g.artillery.enabled || g.phase !== "playing")
    return "Artillery unavailable";
  if (teamHasHuman(g, p) && !g.humanPlayerIds.includes(p.id))
    return "Artillery is reserved for your team's human player";
  if (target.area && !g.humanPlayerIds.includes(p.id))
    return "Tactical map calls require a human soldier";
  if (p.hp <= 0) return "Redeploy before calling artillery";
  if (!target.area && (p.mantle || p.hop || p.fall))
    return "Stand on solid ground to spot";
  if (!Number.isFinite(target.x) || !Number.isFinite(target.z))
    return "Choose a target";
  if (
    target.area &&
    (Math.abs(target.x) > playArea(g.map).width / 2 ||
      Math.abs(target.z) > playArea(g.map).depth / 2)
  )
    return "Choose a sector on the map";
  if (target.area) target = { ...artillerySector(g.map, target), area: true };
  if (
    !target.area &&
    g.map.terrain &&
    p.y - hillHeight(p.x, p.z, g.map) + eyeHeightOf(p) < g.map.terrain.bankHeight + 0.04
  )
    return "Use a firing step to spot over the parapet";
  const range = dist(p, target);
  if (range < artilleryRules.minRange || range > artilleryRules.maxRange)
    return "Mark ground 15–70 m away";
  const margin = target.area ? 1 : artilleryRules.scatterRadius + 1;
  if (
    Math.abs(target.x) > playArea(g.map).width / 2 - margin ||
    Math.abs(target.z) > playArea(g.map).depth / 2 - margin
  )
    return "Target too close to the map boundary";
  const from = { x: p.x, y: p.y + eyeHeightOf(p), z: p.z };
  const to = {
    ...target,
    y: Math.max(
      groundHeight(target.x, target.z, g.map) + 0.15,
      (g.map.terrain?.bankHeight ?? 0) + hillHeight(target.x, target.z, g.map) + 0.1,
    ),
  };
  if (
    !target.area &&
    (smokeBlocks(g, from, to) || g.collision.ray(from, to) < 0.995)
  )
    return "No clear view of that area";
  if (deadGround(g.map, p.team, target)) return "Dead ground: the ships' guns can't reach it";
  if (g.tick < g.artillery.readyAt[p.team]) return "Artillery is reloading";
  if (g.artillery.missions.some((m) => m.team === p.team))
    return "Fire mission already active";
  return null;
}
export function artilleryUncertainty(g: Game, p: Soldier, target: Vec): number {
  const from = { x: p.x, y: p.y + eyeHeightOf(p), z: p.z };
  const to = {
    ...target,
    y: Math.max(
      groundHeight(target.x, target.z, g.map) + 0.15,
      (g.map.terrain?.bankHeight ?? 0) + hillHeight(target.x, target.z, g.map) + 0.1,
    ),
  };
  return (g.map.terrain && from.y - hillHeight(p.x, p.z, g.map) < g.map.terrain.bankHeight + 0.04) ||
    smokeBlocks(g, from, to) ||
    g.collision.ray(from, to) < 0.995
    ? 10
    : 6;
}
export function requestArtillery(
  g: Game,
  p: Soldier,
  target: Vec & { area?: boolean },
): boolean {
  if (artilleryTargetReason(g, p, target)) return false;
  const area = !!target.area;
  if (area) target = artillerySector(g.map, target);
  const uncertainty = area ? artilleryUncertainty(g, p, target) : 0;
  const angle = uncertainty ? g.random() * Math.PI * 2 : 0;
  const drift = uncertainty ? Math.sqrt(g.random()) * uncertainty : 0;
  const center = {
    x: target.x + Math.cos(angle) * drift,
    z: target.z + Math.sin(angle) * drift,
  };
  const mission: FireMission = {
    id: ++g.artillery.missionSequence,
    actor: p.id,
    team: p.team,
    target: { x: target.x, z: target.z },
    uncertainty,
    dangerRadius: artilleryRules.dangerRadius + uncertainty + shellProfileFor(g.map, p.team).radius - artilleryExplosionProfile.radius,
    calledAt: g.tick,
    firstImpactAt: g.tick + artilleryRules.warning,
    endsAt:
      g.tick + artilleryRules.warning + artilleryRules.barrageDuration + 30,
    launched: 0,
    impacts: [],
    impactOffsets: barrageOffsets(
      g.seed ^ Math.imul(g.artillery.missionSequence, 83492791) ^ g.tick,
    ),
  };
  for (let i = 0; i < artilleryRules.shellCount; i++) {
    const angle = g.random() * Math.PI * 2,
      radius = Math.sqrt(g.random()) * artilleryRules.scatterRadius;
    mission.impacts.push({
      x: Math.max(
        -playArea(g.map).width / 2 + 1,
        Math.min(playArea(g.map).width / 2 - 1, center.x + Math.cos(angle) * radius),
      ),
      z: Math.max(
        -playArea(g.map).depth / 2 + 1,
        Math.min(playArea(g.map).depth / 2 - 1, center.z + Math.sin(angle) * radius),
      ),
    });
  }
  auditArtilleryCall(g,p.team,target);
  g.artillery.readyAt[p.team] = g.tick + artilleryRules.cooldown;
  g.artillery.missions.push(mission);
  p.protectedUntil = 0;
  g.emit({
    type: "artilleryCall",
    actor: p.id,
    team: p.team,
    mission: mission.id,
    target: { x: target.x, z: target.z },
    firstImpactAt: mission.firstImpactAt,
    endsAt: mission.endsAt,
    radius: mission.dangerRadius!,
    uncertainty,
  });
  return true;
}
// Queue a salvo on a soldier outside the play area. Each shell approaches from
// the nearer map edge, so it flies in over the dead zone.
export function boundarySalvo(g: Game, targets: Vec[], delays: number[]) {
  const mission = ++g.artillery.missionSequence;
  targets.forEach((target, i) =>
    (g.artillery.boundary ??= []).push({ mission, launchAt: g.tick + (delays[i] ?? 0), target }),
  );
}
export function advanceArtillery(g: Game) {
  advanceAmbient(g);
  if (g.artillery.boundary?.length) g.artillery.boundary = g.artillery.boundary.filter((s) => {
    if (g.tick < s.launchAt) return true;
    launchShell(g, s.target, s.mission, -1, s.target.x < 0 ? "blue" : "red", false, true);
    return false;
  });
  g.artillery.reports = (g.artillery.reports ?? []).filter(
    (r) => g.tick - r.tick < 90,
  );
  for (const mission of g.artillery.missions) {
    while (
      mission.launched < artilleryRules.shellCount &&
      g.tick >=
        mission.firstImpactAt -
          artilleryRules.flightTicks +
          mission.impactOffsets[mission.launched]
    ) {
      const target = mission.impacts[mission.launched++];
      launchShell(g, target, mission.id, mission.actor, mission.team);
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
      y: shell.y + shell.vy / 30 - shellGravity / (2 * 30 * 30),
      z: shell.z + shell.vz / 30,
    };
    shell.vy -= shellGravity / 30;
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
      if (shell.gas !== undefined) {
        // A small bursting charge cracks the case open: no blast, a jet of gas.
        g.gas.clouds.find((c) => c.id === shell.gas)?.bursts?.push({ x: at.x, y: at.y, z: at.z, tick: g.tick });
        g.emit({ type: "gasShellImpact", actor: shell.actor, cloud: shell.gas, shell: shell.id, at });
        continue;
      }
      const profile = shell.boundary
        ? boundaryArtilleryExplosionProfile
        : shell.ambient
          ? ambientArtilleryExplosionProfile
          : shellProfileFor(g.map, shell.team);
      const hits = g.explode(
        at,
        shell.actor,
        shell.ambient || shell.boundary ? null : shell.team,
        profile,
      );
      g.artillery.reports.push({
        mission: shell.mission,
        at: { x: at.x, z: at.z },
        tick: g.tick,
      });
      g.emit({
        type: "artilleryImpact",
        actor: shell.actor,
        mission: shell.mission,
        shell: shell.id,
        at,
        radius: profile.radius,
        ...(shell.ambient ? { ambient: true } : {}),
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
    (m) =>
      dist(p, m.target) < (m.dangerRadius ?? artilleryRules.dangerRadius) + 2,
  );
}
// React to real nearby flight/impacts, never a newly ordered mission's hidden zone.
export function perceivedArtillery(
  g: Game,
  p: Vec,
): { id: number; at: Vec; endsAt: number } | undefined {
  const shell = g.artillery.shells.find((s) => dist(s, p) < 22);
  if (shell) return { id: shell.mission, at: shell, endsAt: g.tick + 90 };
  const report = (g.artillery.reports ?? []).find(
    (r) => g.tick - r.tick < 60 && dist(p, r.at) < 24,
  );
  if (report)
    return { id: report.mission, at: report.at, endsAt: report.tick + 90 };
}
export function botArtilleryTarget(g: Game, p: Soldier): Vec | null {
  if (
    !g.artillery.enabled ||
    g.tick < g.artillery.readyAt[p.team] ||
    g.tick % 30 !== p.id % 30 ||
    teamHasHuman(g, p)
  )
    return null;
  // An enemy tank in reach is worth a fire mission on its own.
  const armour = g.tanks?.list.find((t) => t.team !== p.team && t.state !== "wreck" &&
    dist(p, t) >= 35 && dist(p, t) <= 70 && dist(p, t) < sightLimit(g, t) && !artilleryTargetReason(g, p, t));
  if (armour) return { x: armour.x, z: armour.z };
  const targets = g.players.filter(
    (q) =>
      q.hp > 0 &&
      q.tank === undefined &&
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
  // At night a spotter must be able to see what it calls fire onto: lit by a
  // flare or a fire, or close. Darkness hides the rest (src/night.ts).
  const target = targets.find((target) => dist(p, target) < sightLimit(g, target) && !artilleryTargetReason(g, p, target));
  return target ? { x: target.x, z: target.z } : null;
}
export function evadeArtillery(g: Game, p: Soldier): Command | null {
  const threat = perceivedArtillery(g, p);
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
        dist(threat.at, p.artilleryEvade.destination) < 10))
  ) {
    const candidates: Vec[] = g.map.terrain?.firingPositions
      ? g.map.terrain.firingPositions
          .filter((s) => s.team === p.team)
          .map((s) => ({ x: s.x + (p.team === "blue" ? -2.5 : 2.5), z: s.z }))
          .concat(
            g.map.terrain.shelterBays?.filter((s) => s.team === p.team) ?? [],
          )
      : Array.from({ length: 12 }, (_, i) => ({
          x: p.x + Math.sin((i * Math.PI) / 6) * 24,
          z: p.z + Math.cos((i * Math.PI) / 6) * 24,
        }));
    // Never run from a barrage into the dead zone beyond the boundary wire.
    const safe = candidates.filter(
      (v) =>
        beyondPlayArea(v.x, v.z, g.map) < -1.5 &&
        // Nor into a gas cloud.
        !cloudExposure(g, v, 2) &&
        !blocked(v.x, v.z, 0.6, g.map) &&
        (dist(v, threat!.at) >= 10 ||
          groundHeight(v.x, v.z, g.map) < groundHeight(p.x, p.z, g.map) - 0.3 ||
          g.collision.ray(
            {
              x: threat!.at.x,
              y: groundHeight(threat!.at.x, threat!.at.z, g.map) + 0.2,
              z: threat!.at.z,
            },
            { x: v.x, y: groundHeight(v.x, v.z, g.map) + 0.8, z: v.z },
          ) < 0.99),
    );
    safe.sort((a, b) => dist(p, a) - dist(p, b));
    let destination: Vec | undefined,
      route: Vec[] = [];
    for (const candidate of safe.slice(0, 8)) {
      const path = pathfind(p, candidate, g.map, true);
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
      destination = { x: p.x + (p.team === "blue" ? -2.5 : 2.5), z: p.z };
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
    p.path = pathfind(p, evade.destination, g.map, true);
    p.nextThink = g.tick + 30;
  }
  if (g.tick - evade.checkedAt >= 15) {
    if (p.path.length && dist(p, evade.lastPosition) < 0.3) {
      // Axis-wise walking can snag where a sampled diagonal grazes a step.
      // Back off onto the trench floor, then resume the existing safe route.
      const away = p.team === "blue" ? -1 : 1;
      const detour = [
        { x: p.x + away * 2.5, z: p.z },
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
  const destination = safeBotDestination(g, p);
  if (destination) {
    const distance = Math.max(0.7, dist(p, destination));
    c.x = (destination.x - p.x) / distance;
    c.z = (destination.z - p.z) / distance;
    c.yaw = Math.atan2(c.x, -c.z);
    c.sprint = true;
  } else c.yaw = p.yaw;
  c.crouch = dist(p, evade.destination) < 1.2;
  c.reload = p.ammo < (p.weapon === "serviceRifle" ? 5 : 30) && p.reserve > 0;
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
