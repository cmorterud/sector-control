// Support's anti-tank kit: the German Tankgewehr M1918, and steel-cored
// armour-piercing rounds in the British and French service rifles.
//
// Their rounds go through a tank's plate (src/tanks.ts bulletOnTank): each
// takes hull points, a round through the vision slits counts for more, and
// some wound the crewman inside. The numbers live with the weapons
// (src/weapon-stats.ts armour). Bots carrying the kit (src/loadouts.ts
// antiTankSlots) turn their rifle on an enemy tank they can see.
import { angleDelta, semiAutoIntent, turnToward } from "./awareness";
import { dist } from "./map";
import { eyeHeightOf } from "./crouch";
import { botAimOffset, type Command, type Game, type Soldier } from "./simulation";
import { tankRules, type Tank } from "./tanks";

export const antiTankRules = {
  // How far a bot will engage a tank from, in metres.
  range: 75,
  // A soldier closer than this still comes first.
  closeThreat: 12,
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
