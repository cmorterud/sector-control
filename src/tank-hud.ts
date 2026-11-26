// Tanks on the HUD and in the briefing: strings only (src/tanks.ts).
import { factionFor, factions } from "./loadouts";
import type { MapDefinition } from "./map";
import type { Event, Game, Soldier } from "./simulation";
import { cannonBears, crewTank, machineGunMounts, nearbyTank, supportsTanks, tankGun, tankLabel, tankModelFor, tankRules } from "./tanks";

export const tankStorageKey = "sector-control-tanks";

// The commander's panel in place of the weapon panel: the hull, then the
// machine guns and the main gun side by side, each with its ammunition, a
// loading bar and whether it can bear on the crosshair.
export function tankPanel(g: Game, p: Soldier, keys: { interact: string; forward: string; backward: string; left: string; right: string }) {
  const t = crewTank(g, p);
  if (!t) return "";
  const bar = (fraction: number) => `<div class="bar"><i style="width:${Math.max(0, Math.min(1, fraction)) * 100}%"></i></div>`;
  const line = (text: string, warn = false) => `<small${warn ? ' class="warn"' : ""}>${text}</small>`;
  // Machine guns.
  const mount = machineGunMounts[t.model][t.mg.mount];
  const mgLoading = t.mg.reloadAt ? 1 - (t.mg.reloadAt - g.tick) / tankRules.mgReloadTicks : 1;
  const mgStatus = t.mg.reloadAt ? line(`NEW BELT · ${((t.mg.reloadAt - g.tick) / 30).toFixed(1)}s`)
    : !t.mg.ammo ? line("OUT OF BELTS", true)
    : mount ? line(`${mount.name.toUpperCase()} BEARS · LMB`)
    : line("NO GUN BEARS · TURN THE HULL", true);
  const mg = `<div>${line(`${t.mg.weaponId.toUpperCase()} MACHINE GUNS`)}<strong>${t.mg.ammo}<em> / ${t.mg.reserve}</em></strong>${bar(mgLoading)}${mgStatus}</div>`;
  // Main gun.
  const loading = Math.max(0, t.cannon.nextShot - g.tick);
  const bears = cannonBears(t, p.yaw);
  const refused = t.cannon.held || g.tick - t.cannon.refused < 45;
  const arc = t.model === "mark-iv" ? "SPONSONS FIRE TO THE SIDES · AIM LEFT OR RIGHT" : "NOSE GUN · TURN THE HULL TO BEAR";
  const gunStatus = !t.cannon.ammo ? line("NO ROUNDS LEFT", true)
    : loading ? line(`LOADING · ${(loading / 30).toFixed(1)}s${t.cannon.held ? " · FIRES WHEN LOADED" : ""}`)
    : !bears ? line(arc, refused)
    : !t.cannon.clear ? line("GROUND IN THE WAY · THE GUN SITS LOW · AIM FARTHER OUT", refused)
    : line("READY · RMB");
  const gun = `<div>${line(tankGun(t.model).toUpperCase())}<strong>${t.cannon.ammo}<em> RDS</em></strong>${bar(1 - loading / tankRules.cannonReloadTicks)}${gunStatus}</div>`;
  return `<small>${t.name.toUpperCase()} · ${Math.ceil((t.hp / tankRules.hp) * 100)}% HULL · ${tankLabel(t)}${t.splash > 0.35 ? " · SPLASH ON THE SLITS" : ""}</small>` +
    `<div class="bar"><i style="width:${(t.hp / tankRules.hp) * 100}%"></i></div>` +
    `<div class="tank-guns">${mg}${gun}</div>` +
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

export const tankBrief = (interact: string) => `With tanks on, each side fields one at a time, crewed by a bot. Tanks are slow, slower than walking, and cross ordinary trenches but ditch in wider gaps. Bullets only splash them, blurring the crew's view; knock them out with grenades on or against the plates, artillery, or another tank's gun. Walk up to your own and press ${interact} to take command: its bot climbs out. W and S drive, A and D steer, the mouse lays the guns, left button fires whichever machine gun can swing onto the crosshair, and holding the right button fires the main gun each time it is loaded and bears. The Mark IV's 6-pounders sit in side sponsons, so aim left or right of the hull; the A7V and Saint-Chamond carry theirs in the nose.`;
