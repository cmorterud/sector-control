// Tanks on the HUD and in the briefing: strings only (src/tanks.ts).
import { factionFor, factions } from "./loadouts";
import type { MapDefinition } from "./map";
import type { Event, Game, Soldier } from "./simulation";
import { cannonBears, crewTank, nearbyTank, supportsTanks, tankGun, tankLabel, tankModelFor, tankRules } from "./tanks";

export const tankStorageKey = "sector-control-tanks";

// The commander's panel in place of the weapon panel.
export function tankPanel(g: Game, p: Soldier, keys: { interact: string; forward: string; backward: string; left: string; right: string }) {
  const t = crewTank(g, p);
  if (!t) return "";
  const mg = t.mg.reloadAt ? `RELOADING · ${((t.mg.reloadAt - g.tick) / 30).toFixed(1)}s` : `${t.mg.ammo}<em> / ${t.mg.reserve}</em>`;
  const gunReady = g.tick >= t.cannon.nextShot;
  const bears = cannonBears(t, p.yaw);
  const gun = !t.cannon.ammo ? "NO ROUNDS" : !gunReady ? `LOADING · ${((t.cannon.nextShot - g.tick) / 30).toFixed(1)}s`
    : bears ? "READY · RMB" : t.model === "mark-iv" ? "TRAVERSE TO A SPONSON ARC" : "TURN THE HULL TO BEAR";
  return `<small>${t.name.toUpperCase()} · ${Math.ceil((t.hp / tankRules.hp) * 100)}% HULL</small><div class="bar"><i style="width:${(t.hp / tankRules.hp) * 100}%"></i></div>` +
    `<small>${tankLabel(t)}${t.splash > 0.35 ? " · SPLASH ON THE SLITS" : ""}</small>` +
    `<strong>${mg}</strong><small>MACHINE GUNS · HOLD LMB</small>` +
    `<small>${tankGun(t.model).toUpperCase()} · ${t.cannon.ammo} ROUNDS · ${gun}</small>` +
    `<small>${keys.forward}/${keys.backward} THROTTLE · ${keys.left}/${keys.right} STEER · ${keys.interact} · CLIMB OUT</small>`;
}

// The prompt beside a friendly tank.
export function tankPrompt(g: Game, p: Soldier, interact: string) {
  const t = nearbyTank(g, p);
  if (!t) return "";
  const crew = t.driver !== undefined ? " · ITS BOT CREW CLIMBS OUT" : "";
  return `<small>${interact} · TAKE COMMAND OF THE ${t.name.toUpperCase()}${crew}</small>`;
}

// A line for the status strip when something happens to a tank the player
// would care about.
export function tankNotice(g: Game, e: Event, p: Soldier): string | undefined {
  if (e.type !== "tank") return undefined;
  const own = e.team === p.team, mine = crewTank(g, p)?.id === e.tank;
  const name = tankModelFor(g.map, e.team).name.toUpperCase();
  switch (e.phase) {
    case "spawn": return own ? `OUR ${name} IS MOVING UP` : `ENEMY ${name} REPORTED`;
    case "knockedOut": return own ? `OUR ${name} IS KNOCKED OUT` : `ENEMY ${name} KNOCKED OUT`;
    case "immobilized": return mine ? "TRACK THROWN · GUNS STILL FIGHT" : own ? `OUR ${name} HAS THROWN A TRACK` : `ENEMY ${name} IMMOBILIZED`;
    case "ditched": return mine ? "DITCHED · THE CREW ARE WORKING HER FREE" : undefined;
    case "stalled": return mine ? "ENGINE STALLED · RESTARTING" : undefined;
    case "restarted": return mine ? "ENGINE RUNNING" : undefined;
    case "unditched": return mine ? "CLEAR OF THE DITCH" : undefined;
    default: return undefined;
  }
}

// The briefing's switch, on the maps that have tanks.
export function tankChoice(map: Pick<MapDefinition, "id">, on: boolean) {
  if (!supportsTanks(map)) return "";
  const names = (["blue", "red"] as const).map(team => `${factions[factionFor(map, team)].name}: ${tankModelFor(map, team).name}`).join(" · ");
  return `<label class="tank-choice"><input id="tanks" type="checkbox" ${on ? "checked" : ""}> Tanks<small>One a side, crewed by bots until you climb in · ${names}</small></label>`;
}

export const tankBrief = (interact: string) => `With tanks on, each side fields one at a time, crewed by a bot. Tanks are slow, slower than walking, and cross ordinary trenches but ditch in wider gaps. Bullets only splash them, blurring the crew's view; knock them out with grenades on or against the plates, artillery, or another tank's gun. Walk up to your own and press ${interact} to take command: its bot climbs out. W and S drive, A and D steer, the mouse lays the guns, left button fires the machine guns and right button the main gun.`;
