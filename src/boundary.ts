import { boundarySalvo } from "./artillery";
import { beyondPlayArea, playArea, type MapDefinition, type Vec } from "./map";
import type { Game, Soldier } from "./simulation";

// Leaving the play area starts a countdown; staying out draws a salvo that
// walks along the boundary onto the soldier, repeating until they return or
// die. A short pause inside clears it, so stepping in and out does not reset it.
export const boundaryRules = {
  // Walking pace through the wire: no sprint or hop, and only mantles that
  // lead sideways or back in (see boundaryAllowsMantle).
  wireSpeed: 1.8,
  clearTicks: 30,
  repeatTicks: 45,
  // Each shell's launch delay in ticks and distance along the boundary from the
  // soldier's position when the salvo is called; the last lands on them.
  salvo: [
    { delay: 0, along: 8 },
    { delay: 6, along: -4 },
    { delay: 12, along: 0 },
  ],
};

export type BoundaryWarning = { deadline: number; insideSince?: number };

export function boundaryCountdown(g: Pick<Game, "tick">, p: Pick<Soldier, "boundaryWarning">) {
  return p.boundaryWarning ? Math.max(0, Math.ceil((p.boundaryWarning.deadline - g.tick) / 30)) : null;
}

// Salvo impacts run along the nearest edge of the play area, at the soldier's
// own distance out, so they stay in the dead zone rather than the trenches.
export function salvoTargets(map: MapDefinition, p: Vec): Vec[] {
  const area = playArea(map),
    alongZ = Math.abs(p.x) - area.width / 2 >= Math.abs(p.z) - area.depth / 2;
  return boundaryRules.salvo.map(({ along }) =>
    alongZ ? { x: p.x, z: p.z + along } : { x: p.x + along, z: p.z },
  );
}

export function advanceBoundary(g: Game) {
  const rule = g.map.boundary;
  if (!rule || g.phase !== "playing") return;
  for (const p of g.players) {
    if (p.hp <= 0) {
      p.boundaryWarning = null;
      continue;
    }
    const outside = beyondPlayArea(p.x, p.z, g.map) > 0,
      warning = p.boundaryWarning;
    if (!warning) {
      if (!outside) continue;
      p.boundaryWarning = { deadline: g.tick + rule.warningTicks };
      // Spawn protection does not extend beyond the battlefield.
      p.protectedUntil = Math.min(p.protectedUntil, g.tick);
      g.emit({ type: "boundary", actor: p.id, phase: "warning", deadline: p.boundaryWarning.deadline });
      continue;
    }
    if (!outside) {
      warning.insideSince ??= g.tick;
      if (g.tick - warning.insideSince >= boundaryRules.clearTicks) {
        p.boundaryWarning = null;
        g.emit({ type: "boundary", actor: p.id, phase: "clear" });
      }
      continue;
    }
    warning.insideSince = undefined;
    if (g.tick < warning.deadline) continue;
    boundarySalvo(g, salvoTargets(g.map, p), boundaryRules.salvo.map((s) => s.delay));
    warning.deadline = g.tick + boundaryRules.repeatTicks;
    g.emit({ type: "boundary", actor: p.id, phase: "salvo" });
  }
}
