// Support's anti-tank kit: the German Tankgewehr M1918, and steel-cored
// armour-piercing rounds in the British and French service rifles.
//
// Their rounds go through a tank's plate (src/tanks.ts bulletOnTank): each
// takes hull points, a round through the vision slits counts for more, and
// some wound the crewman inside. The numbers live with the weapons
// (src/weapon-stats.ts armour). Bots carrying the kit (src/loadouts.ts
// antiTankSlots) turn their rifle on an enemy tank they can see.
import { angleDelta, semiAutoIntent, turnToward } from "./awareness";
import { dist, type Vec } from "./map";
import { eyeHeightOf } from "./crouch";
import { botAimOffset, type Command, type Game, type Soldier } from "./simulation";
import { tankRules, type Tank } from "./tanks";

export const antiTankRules = {
  // How far a bot will engage a tank from, in metres.
  range: 75,
  // Only a soldier this close (at bayonet reach) comes before a tank.
  closeThreat: 5,
  // A bot carrying the kit goes after an enemy tank this far off that it
  // cannot yet see or reach, closing to `huntStandoff` metres.
  huntRange: 150,
  huntStandoff: 35,
  // Ticks a hunter with no route to its standoff point keeps to its other orders.
  huntRetryTicks: 150,
  // Where on the hull a bot aims, above the bottom of the tracks: the cab and
  // the slits on a tank coming on, the side plates otherwise.
  aimHeight: 1.5,
  // How tightly the sights must sit on the aim point before a bot fires.
  fireCone: 0.035,
};

export const carriesAntiTank = (p: Pick<Soldier, "loadout" | "equippedSlot">) =>
  p.loadout === "antiTank" && p.equippedSlot !== "sidearm";

// The enemy tank a soldier at `p` can see and reach, nearest first.
export function antiTankTarget(g: Game, p: Soldier): Tank | undefined {
  if (!g.tanks?.list.length) return undefined;
  const eye = { x: p.x, y: p.y + eyeHeightOf(p), z: p.z };
  return g.tanks.list
    .filter(t => t.team !== p.team && t.state !== "wreck" && dist(p, t) < antiTankRules.range)
    .sort((a, b) => dist(p, a) - dist(p, b))
    .find(t => g.collision.ray(eye, { x: t.x, y: t.y + antiTankRules.aimHeight, z: t.z }) > 0.99);
}

// Hunters whose standoff point had no route, until the tick they try again.
const huntBlocked = new WeakMap<Soldier, number>();
// The planner found no route to the hunt point (it may lie in a shell hole,
// wire or a building): go on with the soldier's other orders for a while
// instead of standing still. Without this, anti-tank riflemen waited at the
// spawn for the whole battle when the tank sat beyond a trench.
export function blockAntiTankHunt(g: Pick<Game, "tick">, p: Soldier) {
  huntBlocked.set(p, g.tick + antiTankRules.huntRetryTicks);
}
// Where a kit-carrying bot should go to get a shot at an enemy tank it can't
// yet see or reach: a spot short of the tank, on its own side of it. Nothing
// once it has a shot (antiTankBotAim takes over) or no tank is in the field.
export function antiTankHunt(g: Game, p: Soldier): Vec | undefined {
  if (!carriesAntiTank(p) || p.tank !== undefined || p.hp <= 0 || !g.tanks?.list.length) return undefined;
  if (g.tick < (huntBlocked.get(p) ?? -Infinity)) return undefined;
  const tank = g.tanks.list
    .filter(t => t.team !== p.team && t.state !== "wreck" && dist(p, t) < antiTankRules.huntRange)
    .sort((a, b) => dist(p, a) - dist(p, b))[0];
  if (!tank) return undefined;
  const d = dist(p, tank);
  if (d < antiTankRules.range && antiTankTarget(g, p) === tank) return undefined;
  if (d <= antiTankRules.huntStandoff) return { x: tank.x + (p.x - tank.x) * 0.8, z: tank.z + (p.z - tank.z) * 0.8 };
  const k = antiTankRules.huntStandoff / d;
  return { x: tank.x + (p.x - tank.x) * k, z: tank.z + (p.z - tank.z) * k };
}

// Turns a bot's command onto an enemy tank. Returns whether it did.
export function antiTankBotAim(g: Game, p: Soldier, c: Command, soldier?: Soldier): boolean {
  if (!carriesAntiTank(p) || p.tank !== undefined || p.hp <= 0) return false;
  if (soldier && dist(p, soldier) < antiTankRules.closeThreat) return false;
  const t = antiTankTarget(g, p);
  if (!t) return false;
  const eye = p.y + eyeHeightOf(p);
  const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
  // A tank makes about 1.3 m/s: lead it by the round's flight time.
  const flight = d / 300;
  const ax = dx + Math.sin(t.yaw) * t.speed * flight, az = dz - Math.cos(t.yaw) * t.speed * flight;
  const yaw = Math.atan2(ax, -az);
  const pitch = Math.atan2(t.y + antiTankRules.aimHeight - eye, Math.hypot(ax, az));
  const error = botAimOffset(p, g.tick, g.botSettings.aimError * 0.45);
  c.yaw = turnToward(p.yaw, yaw + error.yaw, 0.06);
  c.pitch = p.pitch + Math.max(-0.03, Math.min(0.03, pitch + error.pitch - p.pitch));
  c.aim = true;
  c.sprint = false;
  c.crouch = true;
  c.x *= 0.15;
  c.z *= 0.15;
  c.reload = p.ammo < 1;
  c.fire = !c.reload && Math.abs(angleDelta(p.yaw, yaw)) < antiTankRules.fireCone + Math.atan2(tankRules.width / 2, d) * 0.5 &&
    semiAutoIntent(g, p);
  p.mode = "Engage tank";
  return true;
}
