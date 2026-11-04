import {
  groundHeight,
  dist,
  mantleLanding,
  walkSegment,
  type Vec,
} from "./map";
import { artilleryThreat } from "./artillery";
import { smokeDensity } from "./smoke";
import type { Game, Soldier, Team, Command } from "./simulation";
export interface Assault {
  id: number;
  team: Team;
  members: number[];
  leader: number;
  startedAt: number;
  expiresAt: number;
  route: Vec[];
  progress: Record<number, number>;
  waitUntil: Record<number, number>;
  screens: Record<number, { actor: number; tick: number; ready?: boolean }>;
}
export interface AssaultState {
  enabled: boolean;
  readyAt: Record<Team, number>;
  sequence: number;
  missions: Assault[];
}
export const createAssaultState = (): AssaultState => ({
  enabled: true,
  readyAt: { blue: 18 * 30, red: 29 * 30 },
  sequence: 0,
  missions: [],
});
export function advanceAssaults(g: Game) {
  if (!g.assaults.enabled || !g.map.terrain?.firingPositions) return;
  g.assaults.missions = g.assaults.missions.filter((m) => {
    const living = m.members.filter(
      (id) => g.players[id]?.hp > 0 && g.players[id].assaultId === m.id,
    );
    if (g.tick < m.expiresAt && living.some((id) => m.progress[id] < 3))
      return true;
    for (const id of m.members) {
      const p = g.players[id];
      if (p.assaultId === m.id) {
        p.assaultId = null;
        p.path = [];
        p.nextThink = g.tick;
      }
    }
    // Stagger the next small wave without leaving a failed attack idle for a minute.
    g.assaults.readyAt[m.team] = g.tick + (18 + (m.id % 3) * 3) * 30;
    g.emit({
      type: "assaultEnd",
      mission: m.id,
      team: m.team,
      reached: living.filter((id) => m.progress[id] === 3).length,
    });
    return false;
  });
  if (g.tick % 30) return;
  for (const team of ["blue", "red"] as const) {
    if (
      g.tick < g.assaults.readyAt[team] ||
      g.assaults.missions.some((m) => m.team === team)
    )
      continue;
    const side = team === "blue" ? -1 : 1;
    const lanes = [-33, -1, 31];
    for (const z of lanes
      .slice(g.assaults.sequence % 3)
      .concat(lanes.slice(0, g.assaults.sequence % 3))) {
      const members = g.players.filter(
        (p) =>
          p.team === team &&
          !g.humanPlayerIds.includes(p.id) &&
          p.hp > 0 &&
          p.ammo >= 10 &&
          !p.mantle &&
          !p.hop &&
          !p.duckUntil &&
          !p.forwardPost &&
          !artilleryThreat(g, p) &&
          Math.abs(p.x - side * 19) < 1.6 &&
          Math.abs(p.z - z) < 4,
      );
      if (members.length < 3) continue;
      const leader = members.find((p) => p.smokes > 0 && !p.reloadAt);
      if (!leader) continue;
      const craters = [...(g.map.terrain.craters ?? [])]
        .filter((c) => Math.abs(c.z - z) < 12 && Math.abs(c.x) < 15)
        .sort((a, b) => side * (b.x - a.x));
      if (!craters.length) continue;
      const first = craters[0],
        last = craters[craters.length - 1];
      const m: Assault = {
        id: ++g.assaults.sequence,
        team,
        members: members.slice(0, 4).map((p) => p.id),
        leader: leader.id,
        startedAt: g.tick,
        expiresAt: g.tick + 45 * 30,
        route: [
          { x: first.x, z: first.z },
          { x: last.x, z: last.z },
          { x: -side * 19.4, z },
        ],
        progress: {},
        waitUntil: {},
        screens: {},
      };
      // Always include the smoke carrier when more than four soldiers share this lane.
      if (!m.members.includes(leader.id)) m.members[0] = leader.id;
      for (const id of m.members) {
        g.players[id].assaultId = m.id;
        m.progress[id] = 0;
        m.waitUntil[id] = g.tick + 4 * 30 + (id % 4) * 5;
        g.players[id].path = [];
      }
      g.assaults.missions.push(m);
      g.emit({
        type: "assaultStart",
        mission: m.id,
        team,
        members: m.members,
        route: m.route,
      });
      break;
    }
  }
}
export function assaultCommand(g: Game, p: Soldier, c: Command): Command {
  const m = g.assaults.missions.find((m) => m.id === p.assaultId);
  if (!m) return c;
  let stage = m.progress[p.id];
  if (stage === 3) {
    c.x = c.z = 0;
    p.mode = "Holding forward trench";
    return c;
  }
  const goal = m.route[stage];
  const offset = (m.members.indexOf(p.id) - 1.5) * 0.6;
  const destination = { x: goal.x, z: goal.z + offset };
  const screen = m.screens[stage];
  const carriers = m.members
    .map((id) => g.players[id])
    .filter(
      (q) =>
        q.hp > 0 &&
        q.assaultId === m.id &&
        m.progress[q.id] === stage &&
        q.smokes > 0 &&
        !q.reloadAt,
    );
  const carrier = carriers.find((q) => q.id === m.leader) ?? carriers[0];
  if (!screen && carrier?.id === p.id && !p.reloadAt && p.smokes > 0) {
    const target =
      stage === 0
        ? m.route[0]
        : { x: (p.x + goal.x) / 2, z: (p.z + goal.z) / 2 };
    const range = Math.max(1, dist(p, target)),
      speed2 = 13 * 13;
    const dy = groundHeight(target.x, target.z, g.map) + 0.15 - (p.y + 1.95);
    const discriminant =
      speed2 * speed2 - 10 * (10 * range * range + 2 * dy * speed2);
    const elevation =
      discriminant >= 0
        ? Math.atan((speed2 - Math.sqrt(discriminant)) / (10 * range))
        : 0.65;
    c.x = c.z = 0;
    c.fire = false;
    c.aim = false;
    c.smoke = true;
    c.yaw = Math.atan2(target.x - p.x, -(target.z - p.z));
    c.pitch = Math.max(0.15, elevation) - 0.65;
    p.mode = "Screening the advance";
    return c;
  }
  if (g.tick < m.waitUntil[p.id]) {
    c.x = c.z = 0;
    p.mode = stage ? "Regrouping in crater" : "Covering the assault";
    return c;
  }
  if (screen && !screen.ready)
    screen.ready = g.smokeClouds.some(
      (s) =>
        s.actor === screen.actor &&
        s.bornAt >= screen.tick &&
        smokeDensity(s, g.tick) > 0.65,
    );
  // Once a leg starts, finish it even if its smoke fades. Survivors without
  // another canister make a short, exposed dash rather than freeze in the field.
  const dashWithoutSmoke =
    stage > 0 && !screen && !carrier && g.tick >= m.waitUntil[p.id] + 3 * 30;
  if (!screen?.ready && !dashWithoutSmoke) {
    c.x = c.z = 0;
    p.mode = "Waiting for smoke";
    return c;
  }
  const distance = dist(p, destination);
  if (
    distance < 1.7 &&
    !p.mantle &&
    !p.hop &&
    (stage < 2 || p.y < g.map.terrain!.bankHeight - 0.5)
  ) {
    stage = ++m.progress[p.id];
    m.waitUntil[p.id] = g.tick + (stage === 1 ? 90 : 45);
    if (stage === 3) p.forwardPost = { x: p.x, z: p.z };
    g.emit({
      type: "assaultProgress",
      mission: m.id,
      actor: p.id,
      stage: stage === 1 ? "crater" : stage === 2 ? "forwardCrater" : "trench",
      at: { x: p.x, z: p.z },
    });
    c.x = c.z = 0;
    return c;
  }
  // Route directly across the walkable field; mantle only at a terrain edge.
  // Regrouping in each bowl supplies pauses between the exposed sprints.
  c.x = (destination.x - p.x) / Math.max(0.7, distance);
  c.z = (destination.z - p.z) / Math.max(0.7, distance);
  c.yaw = Math.atan2(c.x, -c.z);
  c.pitch = 0;
  c.sprint = true;
  c.aim = false;
  c.fire = false;
  c.reload = p.ammo < 10 && p.reserve > 0;
  if (!p.mantle && !p.hop && g.tick >= p.nextMantle) {
    const landing = mantleLanding(p, c, g.map);
    c.mantle = !!landing && dist(landing, destination) + 0.2 < distance;
  }
  // A rock/lining corner can be skirted while staying in the same crater lane.
  if (
    !c.mantle &&
    g.tick % 15 === p.id % 15 &&
    !walkSegment(p, { x: p.x + c.x, z: p.z + c.z }, g.map)
  ) {
    const step = { x: p.x + c.x, z: p.z };
    if (walkSegment(p, step, g.map)) c.z = 0;
  }
  p.mode = "Advancing with squad";
  return c;
}
