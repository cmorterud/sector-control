import { availableCraterCover, craterDepth } from "./crater-cover";
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
  launch: Vec;
  departure: Vec;
  approach: Vec;
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
    g.emit({
      type: "assaultEnd",
      mission: m.id,
      team: m.team,
      reached: living.filter((id) => m.progress[id] === 3).length,
    });
    return false;
  });
  if (g.tick % 30) return;
  const cover = availableCraterCover(g.map);
  for (const team of ["blue", "red"] as const) {
    const side = team === "blue" ? -1 : 1,
      enemy = team === "blue" ? "red" : "blue";
    const front = g.map.terrain.trenchLines?.find(
      (l) => l.team === team && l.role === "front",
    );
    const opposing = g.map.terrain.trenchLines?.find(
      (l) => l.team === enemy && l.role === "front",
    );
    if (!front || !opposing) continue;
    const edge = (line: typeof front, sign: number) =>
      sign * (Math.min(...line.sections.map((p) => sign * p.x)) - 7);
    const active = g.assaults.missions.filter((m) => m.team === team);
    // Include returning survivors from expired plans, not just current squads.
    const attackers = g.players.filter(
      (p) =>
        p.team === team &&
        p.hp > 0 &&
        !g.humanPlayerIds.includes(p.id) &&
        (p.assaultId !== null ||
          p.forwardPost ||
          side * (p.x - edge(front, side)) < 0),
    );
    if (
      g.tick < g.assaults.readyAt[team] ||
      active.length >= 2 ||
      attackers.length > 5
    )
      continue;
    const centerX = (edge(front, side) + edge(opposing, -side)) / 2;
    const near = cover.filter((c) => side * (c.x - centerX) > 0),
      far = cover.filter((c) => side * (c.x - centerX) < 0);
    if (!near.length || !far.length) continue;
    const candidates = front.sections
      .map((section, index) => {
        const launch = {
          x: section.x - side * 2,
          z: section.stepZ ?? section.z,
        };
        const members = g.players.filter(
          (p) =>
            p.team === team &&
            !g.humanPlayerIds.includes(p.id) &&
            p.hp > 0 &&
            p.ammo >= 10 &&
            !p.mantle &&
            !p.hop &&
            !p.fall &&
            !p.duckUntil &&
            !p.forwardPost &&
            p.assaultId === null &&
            !artilleryThreat(g, p) &&
            p.y > 0.65 &&
            p.y < 1.5 &&
            dist(p, launch) < 4,
        );
        const first = near
          .slice()
          .sort(
            (a, b) =>
              dist(launch, a) - a.depth * 2 - (dist(launch, b) - b.depth * 2),
          )[0];
        const last = far
          .slice()
          .sort(
            (a, b) =>
              dist(first, a) - a.depth * 2 - (dist(first, b) - b.depth * 2),
          )[0];
        const target = opposing.sections
          .map((s) => ({ x: s.x + side * 1.6, z: s.stepZ ?? s.z }))
          .sort((a, b) => dist(a, last) - dist(b, last))[0];
        const screened = g.smokeClouds.some(
          (c) => smokeDensity(c, g.tick) > 0.65 && dist(c, first) < 7,
        );
        return {
          launch,
          members,
          first,
          last,
          target,
          score:
            dist(launch, first) -
            (screened ? 8 : 0) +
            ((index + g.assaults.sequence) % front.sections.length) * 0.01,
        };
      })
      .filter(
        (c) =>
          c.members.length >= 3 &&
          !active.some((m) => dist(m.launch, c.launch) < 12),
      )
      .sort((a, b) => a.score - b.score);
    for (const { launch, members, first, last, target } of candidates) {
      const leader = members.find((p) => p.smokes > 0 && !p.reloadAt);
      if (!leader) continue;
      const m: Assault = {
        id: ++g.assaults.sequence,
        team,
        members: members
          .slice(0, Math.min(4, 8 - attackers.length))
          .map((p) => p.id),
        leader: leader.id,
        startedAt: g.tick,
        expiresAt: g.tick + 45 * 30,
        launch,
        departure: { x: edge(front, side), z: launch.z },
        approach: { x: edge(opposing, -side), z: target.z },
        route: [{ x: first.x, z: first.z }, { x: last.x, z: last.z }, target],
        progress: {},
        waitUntil: {},
        screens: {},
      };
      if (!m.members.includes(leader.id)) m.members[0] = leader.id;
      for (const id of m.members) {
        g.players[id].assaultId = m.id;
        m.progress[id] = 0;
        m.waitUntil[id] = g.tick + 4 * 30 + (id % 4) * 5;
        g.players[id].path = [];
      }
      g.assaults.missions.push(m);
      // The next launch can overlap this wave, rather than waiting for its end.
      g.assaults.readyAt[team] = g.tick + (12 + (m.id % 3) * 3) * 30;
      g.emit({
        type: "assaultStart",
        mission: m.id,
        team,
        members: m.members,
        launch: m.launch,
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
  const offset = (m.members.indexOf(p.id) - 1.5) * 0.6;
  const side = p.team === "blue" ? -1 : 1;
  // Clear the whole friendly parapet before turning diagonally across the field.
  const departing = stage === 0 && side * (p.x - m.departure.x) > 0.5;
  const approaching =
    stage === 2 &&
    -side * (p.x - m.approach.x) < 0.5 &&
    Math.abs(p.z - m.approach.z - offset) > 1;
  const goal = departing
    ? m.departure
    : approaching
      ? m.approach
      : m.route[stage];
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
    const desired =
      stage === 0
        ? m.route[0]
        : { x: (p.x + goal.x) / 2, z: (p.z + goal.z) / 2 };
    const fraction = Math.min(1, 15 / Math.max(1, dist(p, desired)));
    const target = {
      x: p.x + (desired.x - p.x) * fraction,
      z: p.z + (desired.z - p.z) * fraction,
    };
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
    c.crouch = stage > 0 && craterDepth(g.map, p) > 0.5;
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
    !departing &&
    !approaching &&
    !p.mantle &&
    !p.hop &&
    !p.fall &&
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
  if (!p.mantle && !p.hop && !p.fall && g.tick >= p.nextMantle) {
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
