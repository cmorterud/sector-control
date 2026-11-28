import { forwardDeployment } from "./deployment";
import { frontSpawn } from "./spawn-front";
import { advanceEmplacements, checkEmplacementSupport, damageEmplacements, dismount, emplacementCommand, emplacementView, mountedGun, operateGun, type Emplacement } from "./emplacements";
import { damageAt, soldierHealth, type HitZone } from "./weapon-stats";
import {rememberWound,reportDeath,type DamageDetails,type Wound,type DeathReport} from "./combat-history";
import { pitchedBoxRay } from "./box-geometry";
import { NavigationEdges, type NavigationBounds } from "./navigation-edges";
import { battlePerformance } from "./battle-performance";
import { advanceBoundary, boundaryRules, type BoundaryWarning } from "./boundary";
import { advanceGas, botGasTarget, createGasState, escapeGas, requestGasStrike, resetGas, type GasEscape, type GasEvent, type GasMask, type GasState } from "./gas";
import { reactToThreat, reactionCoverCommand, braceCommand, type CombatReaction, type CombatCover } from "./combat-reaction";
import { weaponDesign } from "./weapon-design";
import { reloadCue, switchPose, switchRules, updateAimMotion } from "./weapon-handling";
import { freshArtilleryAudit } from "./artillery-audit";
import { antiTankBotAim, antiTankHunt, blockAntiTankHunt } from "./anti-tank";
import { emplacementBotCommand } from "./bot-emplacement";
import { mortarBotCommand } from "./bot-mortar";
import { respectTarget } from "./bot-engage";
import { advanceMortars, createMortarState, mortarMap, operateMortar, type MortarState } from "./mortar";
import { floodAt, rainPace, supportsRain } from "./weather";
import { advanceTanks, bulletOnTank, createTanks, crewOnRespawn, crewTank, explosionOnTanks, keepClearOfTanks, leave as leaveTank, operateTank, rayTanks, tankBotCommand, tankInteraction, type TankEvent, type TankState } from "./tanks";
import { createFlames, pickupFlame, dropFlame, advanceFlames, fireFlame, evadeFlame, type FlameState } from "./flamethrower";
import { grenadeLook } from "./grenade-look";
import { advancePeriscope, breakMirror, mirrorOnPath, periscopeEye, periscopeLift, periscopeRaised, periscopeRules, type PeriscopeState } from "./periscope";
import { equipLoadout, kitFor, loadoutIds, switchWeapon, factionFor, factions, rosterLoadout, type FactionId, type Loadout, type WeaponSlot, type WeaponState } from "./loadouts";
import {
  planVillageMove,
  villageSpawn,
  villageSteering,
  villageCover,
  screenCrossing,
  usesVillageTactics,
  type VillagePlan,
} from "./village-tactics";
import { nearestCandidates } from "./navigation-nearest";
import { searchGraph } from "./navigation-search";
import {
  startMelee,
  cancelMelee,
  meleeMovement,
  advanceMelee,
  botMeleeIntent,
  type MeleeAttack,
} from "./melee";
import {
  freshAwareness,
  awarenessSample,
  canNotice,
  observeTarget,
  turnToward,
  angleDelta,
  semiAutoIntent,
  type Awareness,
} from "./awareness";
import {
  stanceDrop,
  eyeHeightOf,
  cameraHeightOf,
  hitHeights,
  hitRadius,
  updateCrouch,
  crouchRules,
} from "./crouch";
import { smokeBlocks, smokeRules, type SmokeCloud } from "./smoke";
import { burstRadius, sightLimit, type Burst } from "./night";
import { advanceFlares, botFlareTarget, createFlareState, requestFlare } from "./flares";
import { weaponAim, recoverRecoil, kickRecoil } from "./recoil";
import { addShotHeat, barrelReady, botHoldsFire, canOverheat, coolBarrel, type BarrelHeat } from "./weapon-heat";
import { hipFireOffset, maskBlocksAim, maskedBotAim } from "./hip-fire";
import { firstPersonView, viewMuzzle } from "./player-view";
import {
  suppressNearMiss,
  suppressionCommand,
  suppressionRules,
} from "./suppression";
import { createAssaultState, advanceAssaults, assaultCommand } from "./assault";
import {
  createArtilleryState,
  requestArtillery,
  advanceArtillery,
  botArtilleryTarget,
  evadeArtillery,
  type ArtilleryEvade,
} from "./artillery";
import { hillHeight,
  blocked,
  invalidateCoverLookup,
  dist,
  industrialMap,
  groundHeight,
  supportHeight,
  bodyBlocked,
  moveOnMap,
  mantleLanding,
  mantleRoute,
  walkSegment,
  terrainPatchSize,
  playArea,
  inWire,
  type Vec,
  type Box,
  type MapDefinition,
  trenchGround,
} from "./map";
import {
  runtimeMap,
  runtimeSource,
  deformExplosion,
  damageVegetation,
  advanceStructuralFailures,
  grenadeExplosionProfile,
  type DestructionChange,
  type ExplosionProfile,
} from "./destruction";
import {
  serviceRifleAction,
  rosterWeapon,
  weaponProfiles,
  weaponProfile,
  equippedStats,
  weaponMount,
  type WeaponKind,
} from "./weapons";
import { dominationRules, dominationPost, flagOccupant } from "./domination";
import { advanceCtf, createCtf, ctfBotCommand, ctfCommand, ctfGoal, ctfGoalUnroutable, ctfRules, type CtfEvent, type CtfState } from "./ctf";
import { terrainRayCeiling } from "./terrain-ray-bounds";
import { advanceOffensive, createOffensive, objectiveOpen, offensiveDuration, respawnTicks, teamSpawn, type OffensiveState } from "./offensive";
import { advanceReinforcements, createReinforcements, reinforcementsLeft, takeReinforcement, type ReinforcementState } from "./reinforcements";
import {
  advanceTactics, audible, checkCorners, collapseEscape, createTactics, dangerCost, formUp, grenadeCommand, heard, listen,
  observeTactics, overwatchHold, reloadCallout, reportContact, squadContact, squadObjective, stackAtDoor,
  suppressiveFire, squadFeatures, threatScore, type CalloutLine, type Tactics,
} from "./squads";
import {
  advanceCharges, chargeCommand, chargeRules, charging, createChargeState, observeCharges, blowWhistle, startLoneCharge,
  type ChargeEvent, type ChargeState, type Shaken, type SoldierCharge,
} from "./charge";
export type Team = "blue" | "red";
export type V3 = Vec & { y: number };
export interface CollisionWorld {
  setMap?(map: MapDefinition): void;
  updateWorld?(change: DestructionChange): void;
  move(from: Vec, delta: Vec): Vec;
  ray(from: V3, to: V3): number; // nearest world obstruction, fraction [0,1]
}
export interface Command {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  sprint: boolean;
  aim: boolean;
  fire: boolean;
  reload: boolean;
  mantle: boolean;
  grenade: boolean;
  artillery?: Vec & { area?: boolean };
  // Night maps: send up a flare over this point (src/flares.ts).
  flare?: Vec & { area?: boolean };
  smoke?: boolean;
  melee?: boolean;
  crouch?: boolean;
  firstPerson?: boolean;
  equip?: WeaponSlot;
  loadout?: Loadout;
  interact?: boolean;
  deployGun?: boolean;
  packGun?: boolean;
  redeploy?: boolean;
  // Pressed this tick: put the gas mask on or take it off; call gas shells.
  gasMask?: boolean;
  gasStrike?: Vec & { area?: boolean };
  // Bots only: launch speed for a planned short or lobbed frag.
  throwSpeed?: number;
  // Blow the whistle for a squad bayonet charge (src/charge.ts).
  whistle?: boolean;
  // Raw drive keys for a tank commander: forward/back and steer (src/tanks.ts).
  // On a mortar, forward/back wind the range card.
  drive?: { throttle: number; turn: number };
  // Bots on a mortar: the range they want the tube laid at (src/mortar.ts).
  mortarRange?: number;
}
export const idle = (): Command => ({
  x: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  sprint: false,
  aim: false,
  fire: false,
  reload: false,
  mantle: false,
  grenade: false,
});
export const grenadeFuseTicks = 90;
export const grenadeBlastRadius = grenadeExplosionProfile.radius;
export const grenadeRadius = 0.12;
export const collapseDamage = 50;
// The crossing part of a vault, and the tucked body's height above its root.
export const vaultTuck = { from: 0.25, to: 0.85, height: 1.3 };
export const timberPassDamage = 0.5;
// A thin timber partition the round has just struck, and where it exits.
export function timberPassage(map: MapDefinition, at: V3, d: V3): V3 | null {
  const length = Math.hypot(d.x, d.y, d.z);
  if (length < 1e-6) return null;
  const u = { x: d.x / length, y: d.y / length, z: d.z / length };
  const panel = map.boxes.find(b => b.kind === "wood" && b.architecture?.part === "wall" && !b.architecture.mansard &&
    Math.min(b.w, b.d) <= 0.2 && Math.abs(at.x - b.x) <= b.w / 2 + 0.03 && Math.abs(at.z - b.z) <= b.d / 2 + 0.03 &&
    at.y >= (b.baseY ?? 0) - 0.03 && at.y <= (b.baseY ?? 0) + b.h + 0.03);
  if (!panel) return null;
  let exit = Infinity;
  for (const [p, v, low, high] of [[at.x, u.x, panel.x - panel.w / 2, panel.x + panel.w / 2], [at.y, u.y, panel.baseY ?? 0, (panel.baseY ?? 0) + panel.h],
    [at.z, u.z, panel.z - panel.d / 2, panel.z + panel.d / 2]] as const)
    if (Math.abs(v) > 1e-9) exit = Math.min(exit, ((v > 0 ? high : low) - p) / v);
  // A grazing round skims along the panel rather than through it.
  if (!(exit >= 0) || exit > 0.6) return null;
  return { x: at.x + u.x * (exit + 0.02), y: at.y + u.y * (exit + 0.02), z: at.z + u.z * (exit + 0.02) };
}
// Throws fly 1.5x faster than they once did along the same arcs: speed is
// scaled by 1.5 and gravity by 1.5^2, so every throw still lands where it
// used to, only sooner.
export const grenadeSpeed = 30;
export const grenadeGravity = 22.5;
export const smokeSpeed = 19.5;
export const minThrowSpeed = 6;
export interface Grenade extends V3 {
  kind?: "smoke";
  id: number;
  actor: number;
  team: Team;
  vx: number;
  vy: number;
  vz: number;
  bornAt: number;
  explodeAt: number;
}
export const projectileSpeed = weaponProfiles.rifle.projectileSpeed;
export const projectileRange = 60;
export const rifleHeight = (map: MapDefinition, p?: Soldier) =>
  (map.terrain ? 1.65 : 1.45) - stanceDrop(p);
// Where a bot looks for and aims at an enemy. A raised periscope rifle shows
// only its mirror over the parapet, so that is what draws the fire.
export const exposedAimHeight = (map: MapDefinition, p?: Soldier) =>
  p?.periscope && !p.periscope.broken && p.periscope.lift > 0.05
    ? eyeHeightOf(p) + p.periscope.lift + periscopeRules.mirrorAbove
    : (map.terrain ? 1.65 : 1.25) - stanceDrop(p);
export function firingPosition(g: Game, p: Soldier): Vec | undefined {
  const positions = g.map.terrain?.firingPositions?.filter(
    (position) => position.team === p.team,
  );
  const original = positions?.[p.teamIndex % positions.length];
  const flagPost = dominationPost(g, p, original);
  if (flagPost) return flagPost;
  if (p.forwardPost) return p.forwardPost;
  if (!original || !g.map.destruction?.revision) return original;
  const intact = (v: Vec) =>
    groundHeight(v.x, v.z, g.map) - hillHeight(v.x, v.z, g.map) + rifleHeight(g.map) >=
    g.map.terrain!.bankHeight + 0.04;
  if (intact(original)) return original;
  return (
    positions!
      .filter(intact)
      .sort((a, b) => dist(a, original) - dist(b, original))[0] ?? original
  );
}
export interface Projectile extends V3 {
  origin?: V3;
  weapon?: WeaponKind;
  weaponId?: string;
  damage?: number;
  suppressed?: number[];
  id: number;
  actor: number;
  team: Team;
  vx: number;
  vy: number;
  vz: number;
  remaining: number;
  bornAt: number;
  // Set once a round has passed through a timber partition.
  penetrated?: boolean;
}
export interface Mantle {
  vault?: boolean;
  from: V3;
  to: V3;
  edge: V3;
  yaw: number;
  startTick: number;
  endTick: number;
}
export interface Hop {
  startTick: number;
  height: number;
  velocity: number;
  originY: number;
}
export interface Fall {
  startTick: number;
  velocity: number;
}
export const hopGravity = 16;
// Apex of a Space hop above its takeoff, in meters: 50% above the original 0.45 m.
export const hopHeight = 0.68;
export const hopSpeed = Math.sqrt(2 * hopGravity * hopHeight);
export const smooth = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};
export const mantleProgress = (m: Mantle, tick: number) =>
  Math.max(0, Math.min(1, (tick - m.startTick) / (m.endTick - m.startTick)));
// Root height represents a standing base. Tucked legs lift the actual feet while crossing.
export function mantleFootLift(m: Mantle, tick: number): number {
  const t = mantleProgress(m, tick);
  if(m.vault)return .45*smooth((t-.16)/.22)*(1-smooth((t-.78)/.22));
  return m.to.y > m.from.y
    ? 0.45 * smooth((t - 0.34) / 0.28) * (1 - smooth((t - 0.82) / 0.18))
    : 0.45 * smooth(t / 0.2) * (1 - smooth((t - 0.45) / 0.37));
}
export function mantlePosition(m: Mantle, tick: number): V3 {
  const t = mantleProgress(m, tick);
  const length = Math.hypot(m.to.x - m.from.x, m.to.z - m.from.z);
  const dx = (m.to.x - m.from.x) / Math.max(length, 0.001);
  const dz = (m.to.z - m.from.z) / Math.max(length, 0.001);
  const up = m.to.y > m.from.y;
  const approach = { x: m.edge.x - dx * 0.34, z: m.edge.z - dz * 0.34 };
  const points: { t: number; p: V3 }[] = m.vault
    ? [
      {t:0,p:m.from},
      {t:.18,p:{x:m.edge.x-dx*.65,z:m.edge.z-dz*.65,y:m.from.y}},
      {t:.4,p:{x:m.edge.x-dx*.65,z:m.edge.z-dz*.65,y:Math.max(m.from.y,m.edge.y-.2)}},
      {t:.78,p:{...m.to,y:Math.max(m.to.y,m.edge.y-.2)}},
      {t:1,p:m.to},
    ]
    : up ? [
        { t: 0, p: m.from },
        { t: 0.16, p: { ...approach, y: m.from.y } },
        {
          t: 0.34,
          p: {
            ...approach,
            y: m.from.y + Math.min(0.55, (m.to.y - m.from.y) * 0.45),
          },
        },
        {
          t: 0.62,
          p: {
            x: m.edge.x - dx * 0.18,
            z: m.edge.z - dz * 0.18,
            y: m.to.y - 0.25,
          },
        },
        {
          t: 0.82,
          p: {
            x: m.edge.x + dx * 0.5,
            z: m.edge.z + dz * 0.5,
            y: m.to.y - 0.25,
          },
        },
        { t: 1, p: m.to },
      ]
    : [
        { t: 0, p: m.from },
        { t: 0.2, p: { ...approach, y: m.from.y - 0.2 } },
        {
          t: 0.45,
          p: {
            x: m.edge.x + dx * 0.5,
            z: m.edge.z + dz * 0.5,
            y: m.from.y - 0.25,
          },
        },
        { t: 0.82, p: { ...m.to, y: m.to.y + 0.06 } },
        { t: 1, p: m.to },
      ];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (t <= b.t) {
      const blend = smooth((t - a.t) / (b.t - a.t));
      return {
        x: a.p.x + (b.p.x - a.p.x) * blend,
        y: a.p.y + (b.p.y - a.p.y) * blend,
        z: a.p.z + (b.p.z - a.p.z) * blend,
      };
    }
  }
  return { ...m.to };
}
export interface Soldier extends Vec {
  melee: MeleeAttack | null;
  nextMelee: number;
  meleeHeld: boolean;
  meleeThreat: { target: number; since: number; lastTick: number } | null;
  staggerAt: number;
  staggerUntil: number;
  weapon: WeaponKind;
  weaponId?: string;
  weaponChange?: {tick:number;from:WeaponKind;fromId?:string;fromSlot?:WeaponSlot;startLower?:number};
  faction?: FactionId;
  mountedGun?: number;
  // The tank this soldier is crewing (src/tanks.ts).
  tank?: number;
  emplacementLost?: boolean;
  packedEmplacement?: { ammo: number; reserve: number; hp: number; range?: number };
  loadout?: Loadout;
  pendingLoadout?: Loadout;
  equippedSlot?: WeaponSlot;
  inventory?: Record<WeaponSlot, WeaponState>;
  commandInteractHeld?: boolean;
  aimMotion?: {tick:number;from:number;to:number;duration:number};
  aimSince?: number;
  flameKit?: number;
  burnUntil?: number;
  burnSource?: number;
  burnTeam?: Team | null;
  burnFrom?: V3;
  lastFlameHitAt?: number;
  flameThreatUntil?: number;
  flameThreatFrom?: V3;
  crouched: boolean;
  y: number;
  teamIndex: number;
  mantle: Mantle | null;
  hop: Hop | null;
  fall: Fall | null;
  nextHop: number;
  landedAt: number;
  nextMantle: number;
  id: number;
  team: Team;
  hp: number;
  ammo: number;
  reserve: number;
  grenades: number;
  smokes: number;
  botSmokeReadyAt: number;
  suppression: number;
  combatReaction?: CombatReaction | null;
  combatCover?: CombatCover | null;
  nextCombatReaction?: number;
  nextCombatCover?: number;
  duckUntil: number;
  nextDuck: number;
  nextNearMiss: number;
  suppressionShelter: Vec | null;
  assaultId: number | null;
  forwardPost: Vec | null;
  throwUntil: number;
  throwAction: { startTick: number; releaseTick: number; smoke: boolean; released: boolean } | null;
  nextGrenade: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  reloadAt: number;
  nextShot: number;
  triggerHeld: boolean;
  triggerPressed: boolean;
  awareness: Awareness;
  aimBloom: number;
  // The periscope rifle's frame: how high it is raised, and whether its mirror is smashed.
  periscope?: PeriscopeState;
  recoilPitch: number;
  recoilYaw: number;
  recoilShots: number;
  lastShotAt: number;
  // Heat of the carried primary's barrel (src/weapon-heat.ts).
  barrel: BarrelHeat;
  respawnAt: number;
  protectedUntil: number;
  // Set while outside the play area; see boundary.ts.
  boundaryWarning?: BoundaryWarning | null;
  kills: number;
  assists: number;
  recentDamage?: Wound[];
  lastDeath?: DeathReport;
  deaths: number;
  captures: number;
  command: Command;
  objective: number;
  // The forward deployment point (a home flag id) this player chose, if any.
  deployAt?: string;
  villagePlan?: VillagePlan | null;
  path: Vec[];
  nextThink: number;
  target: number;
  spottedAt: number;
  focusUntil: number;
  distractedUntil: number;
  // The enemy a bot was fighting when its attention broke (src/bot-engage.ts).
  distractedFrom: number;
  mode: string;
  artilleryEvade: ArtilleryEvade | null;
  // Bayonet charges and the shock of one arriving (src/charge.ts).
  charge?: SoldierCharge | null;
  shaken?: Shaken | null;
  nextLoneCharge?: number;
  gasMask?: GasMask | null;
  gasEscape?: GasEscape | null;
  gasClearSince?: number;
  gasNoticed?: number;
}
export interface Sector extends Vec {
  name?: string;
  id: string;
  home?: Team;
  control: number;
  owner: Team | null;
  contested: boolean;
}
export interface BotSettings {
  awareness: boolean;
  reactionTicks: number;
  reactionJitterTicks: number;
  aimError: number;
  engagementRange: number;
  burstPeriodTicks: number;
  burstFireTicks: number;
  focusMinTicks: number;
  focusMaxTicks: number;
  distractionMinTicks: number;
  distractionMaxTicks: number;
  difficulty: Difficulty;
  // Squads, the commander and the other squad tactics; false keeps every
  // bot deciding alone, as before squads existed.
  squads: boolean;
  // Minimum gap between frag throws by one squad.
  grenadeGapTicks: number;
  // How long a squad remembers where a member last saw an enemy.
  squadMemoryTicks: number;
  overwatch: boolean;
  hearingRange: number;
}
export type Difficulty = "recruit" | "regular" | "veteran";
// Profiles scale the map's own settings: reaction time and aim error are
// multiplied, the rest replace the defaults.
export const difficultyProfiles: Record<Difficulty, {
  reaction: number; aim: number; grenadeGapTicks: number; squadMemoryTicks: number; overwatch: boolean; hearingRange: number;
}> = {
  recruit: { reaction: 1.35, aim: 1.35, grenadeGapTicks: 600, squadMemoryTicks: 75, overwatch: false, hearingRange: 10 },
  regular: { reaction: 1, aim: 1, grenadeGapTicks: 240, squadMemoryTicks: 150, overwatch: true, hearingRange: 15 },
  veteran: { reaction: 0.75, aim: 0.8, grenadeGapTicks: 150, squadMemoryTicks: 240, overwatch: true, hearingRange: 20 },
};
export const difficulties = Object.keys(difficultyProfiles) as Difficulty[];
export function botSettingsFor(map: MapDefinition, difficulty: Difficulty = "regular"): BotSettings {
  const base = {
    ...defaultBotSettings,
    ...(map.terrain?.firingPositions ? { engagementRange: 59, aimError: 0.04 } : {}),
  };
  const profile = difficultyProfiles[difficulty] ?? difficultyProfiles.regular;
  return {
    ...base,
    difficulty,
    reactionTicks: Math.round(base.reactionTicks * profile.reaction),
    reactionJitterTicks: Math.round(base.reactionJitterTicks * profile.reaction),
    aimError: base.aimError * profile.aim,
    grenadeGapTicks: profile.grenadeGapTicks,
    squadMemoryTicks: profile.squadMemoryTicks,
    overwatch: profile.overwatch,
    hearingRange: profile.hearingRange,
  };
}
export const defaultBotSettings: BotSettings = {
  awareness: true,
  reactionTicks: 27,
  reactionJitterTicks: 18,
  aimError: 0.05,
  engagementRange: 40,
  burstPeriodTicks: 24,
  burstFireTicks: 15,
  focusMinTicks: 60,
  focusMaxTicks: 120,
  distractionMinTicks: 24,
  distractionMaxTicks: 54,
  difficulty: "regular",
  squads: true,
  grenadeGapTicks: 240,
  squadMemoryTicks: 150,
  overwatch: true,
  hearingRange: 15,
};
export type Event = { id: number; tick: number } & (
  | {
      type: "botAttention";
      actor: number;
      target: number;
      phase: "acquired" | "lost" | "distracted";
      until: number;
    }
  | { type: "flare"; phase: "call" | "burst"; flare: number; actor: number; team: Team; at: Vec; burstAt: number; endsAt: number }
  | {
      type: "artilleryCall";
      actor: number;
      team: Team;
      mission: number;
      target: Vec;
      firstImpactAt: number;
      endsAt: number;
      radius: number;
      uncertainty?: number;
    }
  | {
      type: "artilleryLaunch";
      ambient?: boolean;
      actor: number;
      mission: number;
      shell: number;
      from: V3;
    }
  | {
      type: "artilleryImpact";
      ambient?: boolean;
      actor: number;
      mission: number;
      shell: number;
      at: V3;
      radius: number;
      hits: { target: number; damage: number }[];
    }
  | {
      type: "smokeBloom";
      actor: number;
      grenade: number;
      cloud: number;
      at: V3;
      expiresAt: number;
    }
  | {
      type: "botPosition";
      actor: number;
      objective: string;
      goal: Vec;
      cover: number;
      capture: boolean;
      reason:
        | "deploy"
        | "objective"
        | "stuck"
        | "underFire"
        | "coverLost"
        | "reposition";
    }
  | { type: "smokeEnd"; cloud: number }
  | { type: "suppression"; actor: number; source: number; level: number }
  | { type: "combatReaction"; actor: number; kind: import("./combat-reaction").ReactionKind; from: V3; strength: number; pauseUntil: number; braceUntil: number }
  | { type: "reactionCover"; actor: number; phase: "move" | "arrived" | "resume"; kind: import("./combat-reaction").ReactionKind; goal: Vec }
  | {
      type: "nearMiss";
      actor: number;
      source: number;
      at: V3;
      distance: number;
    }
  | { type: "duck"; actor: number; phase: "start" | "end" }
  | {
      type: "assaultStart";
      mission: number;
      team: Team;
      members: number[];
      launch: Vec;
      route: Vec[];
      objective?: string;
    }
  | {
      type: "assaultProgress";
      mission: number;
      actor: number;
      stage: "crater" | "forwardCrater" | "trench";
      at: Vec;
    }
  | { type: "assaultEnd"; mission: number; team: Team; reached: number }
  | { type: "artilleryEnd"; mission: number }
  | { type: "artilleryEvade"; actor: number; mission: number; to: Vec }
  | { type: "destruction"; actor: number; change: DestructionChange }
  | {
      type: "grenadeThrow" | "smokeThrow";
      actor: number;
      grenade: number;
      from: V3;
      velocity: V3;
      explodeAt: number;
    }
  | { type: "grenadeBounce"; actor: number; grenade: number; at: V3 }
  | {
      type: "grenadeExplosion";
      actor: number;
      grenade: number;
      at: V3;
      radius: number;
      hits: { target: number; damage: number }[];
      // A trench mortar bomb's burst (src/mortar.ts).
      mortar?: boolean;
    }
  | {
      type: "fire";
      weapon?: WeaponKind;
      weaponId?: string;
      actor: number;
      projectile: number;
      from: V3;
      to: V3;
      recoil: { pitch: number; yaw: number };
      // Barrel heat after this round, and the owner of the mounted gun that fired it.
      heat?: number;
      emplacement?: number;
    }
  | { type: "overheat"; actor: number; at: V3; emplacement?: number }
  | {
      type: "impact";
      actor: number;
      projectile: number;
      at: V3;
      target: number | null;
      hit: boolean;
      // A round that struck a tank's plates.
      tank?: number;
    }
  | {
      type: "melee";
      phase: "start" | "strike" | "end" | "cancel";
      actor: number;
      kind: MeleeAttack["kind"];
      target: number | null;
      at: V3;
      damage?: number;
      killed?: boolean;
    }
  | {
      type: "weaponAction";
      actor: number;
      weaponId?: string;
      action: "boltOpen" | "boltClose" | "clip" | "holster" | "draw" | "magazineOut" | "magazineIn" | "rack" | "cylinderOpen" | "cylinderClose" | "cartridges";
    }
  | { type:"flamePickup"|"flameDrop";actor:number;kit:number;fuel:number }
  | { type:"flame";actor:number;from:V3;to:V3;fuel:number }
  | { type: "damage"; actor: number; source: number; amount?:number; at?:V3; from?:V3; kind?:DamageDetails["kind"]; weapon?:string }
  | { type: "death"; actor: number; report?:DeathReport; killer?: number }
  | { type: "assist"; actor:number; target:number; damage:number }
  | { type: "respawn" | "reload"; actor: number }
  | { type: "hop"; actor: number; phase: "start" | "land"; at: V3 }
  | { type: "boundary"; actor: number; phase: "warning" | "clear" | "salvo"; deadline?: number }
  | GasEvent
  | { type: "mantle"; actor: number; phase: "start" | "end"; from: V3; to: V3 }
  | { type: "capture"; sector: string; team: Team }
  | { type: "neutralized"; sector: string; previous: Team; team: Team }
  | { type: "contested"; sector: string }
  | { type: "stance"; actor: number; crouched: boolean }
  | { type: "fall"; actor: number; phase: "start" | "land"; at: V3 }
  | {
      type: "score";
      points?: Record<Team, number>;
      held?: Record<Team, number>;
    }
  | { type: "end"; winner: Team | "draw" }
  | import("./reinforcements").ReinforcementEvent
  | import("./offensive").OffensiveEvent
  | { type: "periscope"; phase: "broken"; owner: number; actor: number; at: V3 }
  | { type: "emplacement"; actor: number; phase: "deploy" | "mount" | "dismount" | "reload" | "pack" | "destroy"; owner: number }
  // Trench mortar bombs: leaving the tube, whistling down, bursting, or an
  // aim point refused for being on a deployment line.
  | { type: "mortar"; phase: "launch" | "whistle" | "impact" | "refused"; actor: number; owner: number; at: V3; bomb?: number; landsAt?: number; aim?: Vec; from?: V3; hits?: { target: number; damage: number }[] }
  | { type: "callout"; actor: number; line: CalloutLine; at: Vec }
  | TankEvent
  | CtfEvent
  | ChargeEvent
);
type EventInput = Event extends infer E
  ? E extends Event
    ? Omit<E, "id" | "tick">
    : never
  : never;
export class TestCollision implements CollisionWorld {
  private boxBuckets?: {
    boxes: MapDefinition["boxes"];
    length: number;
    cells: Map<string, MapDefinition["boxes"]>;
  };
  constructor(public map: MapDefinition = industrialMap) {}
  setMap(map: MapDefinition) {
    this.map = map;
    this.boxBuckets = undefined;
    invalidateCoverLookup(map);
  }
  updateWorld(change: DestructionChange) {
    if (change.geometry !== false) {
      this.boxBuckets = undefined;
      invalidateCoverLookup(this.map);
    }
  }
  // Broad phase only: retain the exact existing slab and terrain intersections.
  // Most projectile/grenade sweeps touch one eight-meter cell, not every lining.
  private rayBoxes(minX: number, maxX: number, minZ: number, maxZ: number) {
    const x0 = Math.floor(minX / 8),
      x1 = Math.floor(maxX / 8),
      z0 = Math.floor(minZ / 8),
      z1 = Math.floor(maxZ / 8);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 16) return this.map.boxes;
    let index = this.boxBuckets;
    if (
      !index ||
      index.boxes !== this.map.boxes ||
      index.length !== this.map.boxes.length
    ) {
      const cells = new Map<string, MapDefinition["boxes"]>();
      for (const box of this.map.boxes) {
        for (
          let x = Math.floor((box.x - box.w / 2) / 8);
          x <= Math.floor((box.x + box.w / 2) / 8);
          x++
        )
          for (
            let z = Math.floor((box.z - box.d / 2) / 8);
            z <= Math.floor((box.z + box.d / 2) / 8);
            z++
          ) {
            const key = `${x},${z}`,
              bucket = cells.get(key);
            if (bucket) bucket.push(box);
            else cells.set(key, [box]);
          }
      }
      index = { boxes: this.map.boxes, length: this.map.boxes.length, cells };
      this.boxBuckets = index;
    }
    if (x0 === x1 && z0 === z1) return index.cells.get(`${x0},${z0}`) ?? [];
    const boxes = new Set<MapDefinition["boxes"][number]>();
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        for (const box of index.cells.get(`${x},${z}`) ?? []) boxes.add(box);
    return boxes;
  }
  move(p: Vec, d: Vec): Vec {
    // Decks stacked in the air need the support-aware walk the renderer uses.
    if (this.map.terrain || this.map.sky) return moveOnMap(p, d, this.map);
    let x = p.x,
      z = p.z;
    if (!blocked(x + d.x, z, 0.5, this.map)) x += d.x;
    if (!blocked(x, z + d.z, 0.5, this.map)) z += d.z;
    return { x, z };
  }
  ray(a: V3, b: V3): number {
    let nearest = 1;
    const minX = Math.min(a.x, b.x),
      maxX = Math.max(a.x, b.x),
      minY = Math.min(a.y, b.y),
      maxY = Math.max(a.y, b.y),
      minZ = Math.min(a.z, b.z),
      maxZ = Math.max(a.z, b.z);
    // Exact slabs matter for short grenade sweeps and very thin timber panels.
    for (const box of this.rayBoxes(minX, maxX, minZ, maxZ)) {
      if(box.architecture?.roofPitch) { nearest=Math.min(nearest,pitchedBoxRay(a,b,box));continue; }
      // Most bullet/near-miss/canister sweeps are short. Reject distant boxes
      // before allocating slab endpoints and testing all three axes.
      if (
        maxX < box.x - box.w / 2 ||
        minX > box.x + box.w / 2 ||
        maxZ < box.z - box.d / 2 ||
        minZ > box.z + box.d / 2 ||
        maxY < (box.baseY ?? 0) ||
        minY > (box.baseY ?? 0) + box.h
      )
        continue;
      let entry = 0,
        exit = 1;
      const low = {
        x: box.x - box.w / 2,
        y: box.baseY ?? 0,
        z: box.z - box.d / 2,
      };
      const high = {
        x: box.x + box.w / 2,
        y: (box.baseY ?? 0) + box.h,
        z: box.z + box.d / 2,
      };
      for (const axis of ["x", "y", "z"] as const) {
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < 1e-10) {
          if (a[axis] < low[axis] || a[axis] > high[axis]) {
            entry = 2;
            break;
          }
        } else {
          const t1 = (low[axis] - a[axis]) / delta,
            t2 = (high[axis] - a[axis]) / delta;
          entry = Math.max(entry, Math.min(t1, t2));
          exit = Math.min(exit, Math.max(t1, t2));
        }
      }
      if (entry <= exit) nearest = Math.min(nearest, entry);
    }
    if (
      minX > -this.map.width / 2 + 0.5 &&
      maxX < this.map.width / 2 - 0.5 &&
      minZ > -this.map.depth / 2 + 0.5 &&
      maxZ < this.map.depth / 2 - 0.5 &&
      minY > terrainRayCeiling(this.map, minX, maxX, minZ, maxZ)
    )
      return nearest;
    const n = Math.max(
      1,
      Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 5),
    );
    const terrainHit = (t: number) => {
      const x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = a.z + (b.z - a.z) * t;
      return (
        y < groundHeight(x, z, this.map) ||
        (y < 4 &&
          (Math.abs(x) > this.map.width / 2 - 0.5 ||
            Math.abs(z) > this.map.depth / 2 - 0.5))
      );
    };
    for (let i = 1; i <= n; i++) {
      if (terrainHit(i / n)) {
        let low = (i - 1) / n,
          high = i / n;
        for (let j = 0; j < 12; j++) {
          const middle = (low + high) / 2;
          if (terrainHit(middle)) high = middle;
          else low = middle;
        }
        return Math.min(nearest, high);
      }
    }
    return nearest;
  }
}
// A team's flags from its own spawn outward. Aboard the airship each side's
// soldiers start on flags in this order, so the team at the other end is
// sent soldier for soldier to the same places, turned about.
function nearestFlags(map: MapDefinition, team: Team) {
  const s = map.spawn[team];
  return map.sectors.map((f, i) => ({ i, d: dist(f, s) })).sort((a, b) => a.d - b.d || a.i - b.i).map((f) => f.i);
}
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export function resolveTeamSize(map: MapDefinition, requested?: number) {
  const fallback = map.defaultTeamSize ?? (map.id === "training" ? 4 : map.id === "industrial" ? 5 : 50);
  return clamp(
    Number.isFinite(requested) ? Math.round(requested!) : fallback,
    1,
    map.maxTeamSize ?? 50,
  );
}
export function raySphere(a: V3, b: V3, c: V3, r: number): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z,
    ox = a.x - c.x,
    oy = a.y - c.y,
    oz = a.z - c.z;
  const A = dx * dx + dy * dy + dz * dz,
    B = ox * dx + oy * dy + oz * dz,
    C = ox * ox + oy * oy + oz * oz - r * r,
    D = B * B - A * C;
  if (C <= 0) return 0;
  if (A === 0 || D < 0) return 1;
  const t = (-B - Math.sqrt(D)) / A;
  return t >= 0 && t <= 1 ? t : 1;
}
export function capture(
  s: Sector,
  blue: boolean,
  red: boolean,
  ticks = 300,
): Team | null {
  s.contested = blue && red;
  if (blue === red) return null;
  const previous = s.control,
    sign = blue ? 1 : -1;
  s.control = clamp(s.control + sign / ticks, -1, 1);
  if (
    (s.owner === "blue" && s.control <= 1e-8) ||
    (s.owner === "red" && s.control >= -1e-8)
  ) {
    s.owner = null;
    s.control = 0;
  }
  if (Math.abs(s.control) > 1 - 1e-8) {
    s.control = sign;
    const team = sign === 1 ? "blue" : "red";
    if (s.owner !== team) {
      s.owner = team;
      return team;
    }
  }
  if (previous === s.control) return null;
  return null;
}
export class Game {
  // Optional scenario director; ordinary matches always use the same bot AI.
  commandOverride?: (game: Game, soldier: Soldier) => Command;
  artilleryAudit = freshArtilleryAudit();
  flames: FlameState = {kits:[]};
  emplacements = new Map<number, Emplacement>();
  mortars: MortarState = createMortarState();
  // Tanks, when the briefing turns them on (src/tanks.ts).
  tanks: TankState;
  // Rain on the maps that have weather: rising water and heavy mud (src/weather.ts).
  rain = false;
  // The tick the water began rising from (the render review moves it back).
  rainSince = 0;
  tick = 0;
  // A performance.now() time after which this frame's navigation rebuild
  // work stops. The browser sets it once per frame; headless games leave it
  // unlimited so their results don't depend on the machine.
  navigationDeadline = Infinity;
  duration: number;
  phase: "playing" | "ended" = "playing";
  winner: Team | "draw" = "draw";
  scores: Record<Team, number> = { blue: 0, red: 0 };
  players: Soldier[] = [];
  projectiles: Projectile[] = [];
  grenades: Grenade[] = [];
  artillery = createArtilleryState();
  flares = createFlareState();
  bursts: Burst[] = [];
  assaults = createAssaultState();
  charges: ChargeState = createChargeState();
  smokeClouds: SmokeCloud[] = [];
  // Gas shell clouds; masks live on each soldier.
  gas: GasState = createGasState();
  smokeSequence = 0;
  grenadeSequence = 0;
  projectileSequence = 0;
  sectors: Sector[];
  readonly map: MapDefinition;
  readonly scoring: "sectors" | "eliminations" | "domination" | "ctf";
  readonly scoreLimit: number | null;
  private grenadeCollision: TestCollision;
  botSettings: BotSettings;
  readonly teamSize: number;
  readonly humanPlayerIds: readonly number[];
  events: Event[] = [];
  sequence = 0;
  seed: number;
  // Squads, the commander, shared contacts and the danger map; absent
  // without bots or with squads turned off.
  tactics?: Tactics;
  // Capture the flag's flags, drop points and bot orders (src/ctf.ts).
  ctf?: CtfState;
  // The final phase's team respawn pools; see reinforcements.ts.
  reinforcements: ReinforcementState;
  // Attack and defend's phases and clock (src/offensive.ts).
  offensive?: OffensiveState;
  constructor(
    public collision: CollisionWorld,
    public bots = true,
    duration = 14400,
    seed = 12345,
    botSettings?: Partial<BotSettings>,
    options: {
      map?: MapDefinition;
      teamSize?: number;
      humanPlayerIds?: readonly number[];
      assaults?: boolean;
      ambientArtillery?: boolean;
      tanks?: boolean;
      rain?: boolean;
    } = {},
  ) {
    this.rain = !!options.rain && supportsRain(options.map ?? industrialMap);
    this.humanPlayerIds = [...(options.humanPlayerIds ?? [0])];
    this.map = runtimeMap(options.map ?? industrialMap);
    this.tanks = createTanks(this, !!options.tanks,
      (p, n, source, team, details) => this.damage(p, n, source, team, details),
      (actor, change) => this.applyDestruction(actor, change));
    this.flames = createFlames(this.map);
    this.artillery = createArtilleryState(
      seed,
      this.map.artillery !== false && (options.ambientArtillery ?? (this.map.id !== "industrial" && this.map.id !== "training")),
    );
    this.artillery.enabled = this.map.artillery !== false;
    // Capture the flag sends its own raiding parties (src/ctf.ts).
    this.assaults.enabled =
      (options.assaults ?? true) && trenchGround(this.map) && this.map.scoring !== "ctf";
    this.collision.setMap?.(this.map);
    this.grenadeCollision = new TestCollision(this.map);
    this.scoring = this.map.scoring ?? "sectors";
    this.scoreLimit =
      this.scoring === "ctf" ? ctfRules.captureLimit :
      this.scoring === "domination" && this.map.id !== "training" && !this.map.offensive ? dominationRules.scoreLimit : null;
    this.ctf = createCtf(this.map);
    this.botSettings = {
      ...botSettingsFor(this.map, botSettings?.difficulty),
      ...botSettings,
    };
    this.teamSize = bots ? resolveTeamSize(this.map, options.teamSize) : 1;
    this.sectors = this.map.sectors.map((s) => ({
      ...s,
      control: 0,
      owner: null,
      contested: false,
    }));
    this.offensive = createOffensive(this.map, this.sectors);
    // The attack keeps its own clock; the match lasts as long as it could.
    this.duration = this.map.id === "training" ? Number.MAX_SAFE_INTEGER :
      this.map.offensive ? offensiveDuration(this.map.offensive) + 1 : duration;
    this.seed = seed;
    for (let i = 0; i < (bots ? this.teamSize * 2 : 1); i++) {
      const team: Team = i < this.teamSize ? "blue" : "red";
      this.players.push({
        id: i,
        weapon: rosterWeapon(
          i % this.teamSize,
          this.teamSize,
          this.humanPlayerIds.includes(i),
          this.map.id !== "industrial",
          // An army without a light machine gun gives those slots to riflemen.
          !!factions[factionFor(this.map, team)].support,
        ),
        team,
        teamIndex: i % this.teamSize,
        melee: null,
        nextMelee: 0,
        meleeHeld: false,
        meleeThreat: null,
        staggerAt: -1000,
        staggerUntil: 0,
        mantle: null,
        crouched: false,
        hop: null,
        fall: null,
        nextHop: 0,
        landedAt: -1000,
        nextMantle: 0,
        y: 0,
        x: 0,
        z: 0,
        hp: 100,
        ammo: 30,
        reserve: 120,
        grenades: 3,
        smokes: smokeRules.perSpawn,
        botSmokeReadyAt: 0,
        suppression: 0,
        combatReaction: null,
        combatCover: null,
        nextCombatReaction: 0,
        nextCombatCover: 0,
        duckUntil: 0,
        nextDuck: 0,
        nextNearMiss: 0,
        suppressionShelter: null,
        assaultId: null,
        forwardPost: null,
        throwUntil: 0,
        throwAction: null,
        nextGrenade: 0,
        yaw: 0,
        pitch: 0,
        vx: 0,
        vz: 0,
        reloadAt: 0,
        nextShot: 0,
        triggerHeld: false,
        triggerPressed: false,
        awareness: freshAwareness(),
        aimBloom: 0,
        recoilPitch: 0,
        recoilYaw: 0,
        recoilShots: 0,
        lastShotAt: -1000,
        barrel: { heat: 0, overheated: false },
        respawnAt: 0,
        protectedUntil: 0,
        kills: 0,
        assists: 0,
        deaths: 0,
        captures: 0,
        command: idle(),
        objective: this.map.sky ? nearestFlags(this.map, team)[(i % this.teamSize) % Math.max(1, this.sectors.length)] : i % Math.max(1, this.sectors.length),
        path: [],
        nextThink: 0,
        target: -1,
        spottedAt: 0,
        focusUntil: 0,
        distractedUntil: 0,
        distractedFrom: -1,
        mode: "Navigate",
        artilleryEvade: null,
      });
      this.respawn(this.players[i]);
    }
    this.tactics = createTactics(this);
    this.reinforcements = createReinforcements(this);
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  snapshot() {
    return structuredClone({
      tick: this.tick,
      mapId: this.map.id,
      scoring: this.scoring,
      scoreLimit: this.scoreLimit,
      teamSize: this.teamSize,
      humanPlayerIds: this.humanPlayerIds,
      duration: this.duration,
      phase: this.phase,
      winner: this.winner,
      scores: this.scores,
      players: this.players,
      projectiles: this.projectiles,
      projectileSequence: this.projectileSequence,
      grenades: this.grenades,
      grenadeSequence: this.grenadeSequence,
      artillery: this.artillery,
      flareState: this.flares,
      bursts: this.bursts,
      flames: this.flames,
      emplacements: [...this.emplacements.values()],
      mortars: this.mortars,
      artilleryAudit: this.artilleryAudit,
      assaults: this.assaults,
      charges: this.charges,
      smokeClouds: this.smokeClouds,
      smokeSequence: this.smokeSequence,
      gas: this.gas,
      sectors: this.sectors,
      sequence: this.sequence,
      seed: this.seed,
      tactics: this.tactics,
      ctf: this.ctf,
      reinforcements: this.reinforcements,
      offensive: this.offensive,
      world: this.map.destruction,
    });
  }
  emit(e: EventInput) {
    this.events.push({ ...e, id: ++this.sequence, tick: this.tick } as Event);
  }
  selectLoadout(p: Soldier, loadout: Loadout) {
    if (!loadoutIds.includes(loadout) || (loadout === "mortar" && !mortarMap(this.map)) || (loadout === "periscope" && !factions[p.faction ?? "british"].periscope)) return;
    p.pendingLoadout = loadout;
    if (this.tick === 0) equipLoadout(p, loadout, kitFor(this.map));
  }
  respawn(p: Soldier) {
    dismount(this, p, false);
    // A mortar left behind is lost with its bombs; the new life carries a fresh one.
    const left = this.emplacements.get(p.id);
    if (left?.mortar) {
      const operator = left.operator === undefined ? undefined : this.players[left.operator];
      if (operator) dismount(this, operator, false);
      this.emplacements.delete(p.id);
    }
    p.emplacementLost = false;
    p.packedEmplacement = undefined;
    dropFlame(this,p); p.burnUntil=0; p.flameThreatUntil=0;
    const retainedPrimary = p.pendingLoadout === p.loadout ? p.inventory?.primary : undefined;
    const legacyWeapon = p.inventory && p.inventory[p.equippedSlot ?? "primary"].kind !== p.weapon ? p.weapon : undefined;
    p.faction = factionFor(this.map, p.team);
    equipLoadout(p, p.pendingLoadout ?? (this.humanPlayerIds.includes(p.id) ? "rifleman" : rosterLoadout(p.teamIndex, this.teamSize, p.weapon, this.tanks.enabled, mortarMap(this.map))), kitFor(this.map));
    const retainedKind = legacyWeapon ?? (retainedPrimary?.kind !== "flamethrower" ? retainedPrimary?.kind : undefined);
    if (retainedKind && p.inventory && p.loadout !== "emplacement" && p.loadout !== "mortar") {
      p.weapon = retainedKind; p.inventory.primary.kind = retainedKind;
      p.weaponId = retainedPrimary?.id ?? p.weaponId; p.inventory.primary.id = p.weaponId!;
    }
    const s = teamSpawn(this, p.team);
    if (this.teamSize <= 5 && !this.map.terrain) {
      p.x = s.x + (p.teamIndex - 2) * 1.8;
      p.z = s.z;
    } else {
      const columns = Math.ceil(Math.sqrt(this.teamSize));
      const rows = Math.ceil(this.teamSize / columns);
      p.x = s.x + ((p.teamIndex % columns) - (columns - 1) / 2) * 1.8;
      p.z = s.z + (Math.floor(p.teamIndex / columns) - (rows - 1) / 2) * 1.8;
    }
    const line = frontSpawn(this, p);
    if (line) {
      p.x = line.x;
      p.z = line.z;
    }
    const deployment = line ? null : villageSpawn(this, p);
    if (deployment) {
      p.x = deployment.x;
      p.z = deployment.z;
    }
    const forward = forwardDeployment(this, p);
    if (forward) {
      p.x = forward.x;
      p.z = forward.z;
    }
    if (usesVillageTactics(this.map)) p.villagePlan = null;
    resetGas(p);
    const sky = this.map.sky;
    if (sky) {
      // The airship is the same both ways round, so the team at the other end
      // stands in the same places turned about: soldier for soldier, each
      // starts as far from its stair tower as its opposite number.
      if (p.team === "red") { p.x = 2 * s.x - p.x; p.z = 2 * s.z - p.z; }
      // Off the deck is a long fall: keep every slot inside the spawn area.
      const area = sky.spawnAreas[p.team];
      p.x = clamp(p.x, area.x0 + 0.5, area.x1 - 0.5);
      p.z = clamp(p.z, area.z0 + 0.5, area.z1 - 0.5);
      p.y = supportHeight(p.x, p.z, this.map, (s.y ?? 0) + 0.23, 0.45);
    } else p.y = groundHeight(p.x, p.z, this.map);
    p.yaw =
      this.map.id !== "industrial"
        ? p.team === "blue"
          ? Math.PI / 2
          : -Math.PI / 2
        : 0;
    p.hp = soldierHealth;
    p.recentDamage=[];
    p.melee = null;
    p.nextMelee = this.tick;
    p.meleeHeld = false;
    p.meleeThreat = null;
    p.staggerAt = -1000;
    p.staggerUntil = 0;
    p.crouched = false;
    const profile = weaponProfile(p);
    p.ammo = profile.magazine;
    p.reserve = profile.reserve;
    if (p.inventory) Object.assign(p.inventory[p.equippedSlot ?? "primary"], { ammo: p.ammo, reserve: p.reserve });
    // The mortarman's tube and bombs leave room for one grenade.
    p.grenades = p.loadout === "mortar" ? 1 : 3;
    p.smokes = smokeRules.perSpawn;
    p.botSmokeReadyAt = this.tick + smokeRules.botSpawnDelay;
    p.suppression = 0;
    p.combatReaction = p.combatCover = null;
    p.nextCombatReaction = p.nextCombatCover = this.tick;
    p.duckUntil = 0;
    p.nextDuck = this.tick;
    p.nextNearMiss = this.tick;
    p.suppressionShelter = null;
    p.assaultId = null;
    p.forwardPost = null;
    p.throwUntil = 0;
    p.throwAction = null;
    p.nextGrenade = this.tick;
    p.reloadAt = 0;
    p.mantle = null;
    p.hop = null;
    p.fall = null;
    p.boundaryWarning = null;
    p.nextHop = this.tick;
    p.landedAt = -1000;
    p.nextMantle = this.tick;
    p.vx = 0;
    p.vz = 0;
    p.nextShot = this.tick;
    p.triggerHeld = p.triggerPressed = false;
    p.awareness = freshAwareness();
    p.aimBloom = 0;
    p.recoilPitch = p.recoilYaw = p.recoilShots = 0;
    p.lastShotAt = -1000;
    p.barrel = { heat: 0, overheated: false };
    p.protectedUntil = this.tick + 60;
    p.path = [];
    p.artilleryEvade = null;
    p.target = -1;
    p.spottedAt = this.tick;
    p.focusUntil = 0;
    p.distractedUntil = 0;
    p.distractedFrom = -1;
    p.mode = "Navigate";
    p.nextThink = this.tick + (p.teamIndex % 30);
    p.command = idle();
    this.emit({ type: "respawn", actor: p.id });
  }
  redeploy(actor = 0): boolean {
    const p=this.players[actor];
    // With the pool spent there is nobody to redeploy as.
    if(this.phase!=="playing" || !p || p.hp<=0 || !reinforcementsLeft(this,p.team))return false;
    // Intentional self-death follows the same corpse/action/respawn lifecycle,
    // without awarding anyone a kill or changing domination team scores.
    this.damage(p,p.hp,-1,null,{kind:"redeploy",weapon:"Redeploy"});
    return true;
  }
  step(human: Command) {
    observeTactics(this, this.events);
    observeCharges(this, this.events);
    this.events = [];
    if (this.phase !== "playing") return;
    this.tick++;
    if(human.redeploy)this.redeploy(0);
    const failure = advanceStructuralFailures(this.map, this.tick);
    if (failure) this.structuralFailure(failure);
    advanceEmplacements(this);
    advanceMortars(this);
    for (const p of this.players) coolBarrel(p.barrel);
    advanceTanks(this);
    advanceNavigation(this.map, this.players.filter(p => p.hp > 0), navigationChecksPerTick, this.navigationDeadline);
    this.smokeClouds = this.smokeClouds.filter((s) => {
      if (this.tick < s.expiresAt) return true;
      this.emit({ type: "smokeEnd", cloud: s.id });
      return false;
    });
    advanceAssaults(this);
    advanceTactics(this);
    advanceCharges(this);
    for (const p of this.players) {
      if (p.hp <= 0) {
        if (this.tick >= p.respawnAt && takeReinforcement(this, p)) {
          const held = p.triggerHeld;
          const meleeHeld = p.meleeHeld;
          this.respawn(p);
          crewOnRespawn(this, p);
          if (p.id === 0) {
            p.triggerHeld = held;
            p.meleeHeld = meleeHeld;
          }
        } else {
          p.triggerHeld = p.id === 0 && human.fire;
          p.throwAction = null;
          p.triggerPressed = false;
          p.meleeHeld = p.id === 0 && !!human.melee;
          continue;
        }
      }
      p.suppression = Math.max(
        0,
        p.suppression - suppressionRules.recoveryPerTick,
      );
      const crewed = crewTank(this, p);
      p.command = crewed && !this.humanPlayerIds.includes(p.id) ? tankBotCommand(this, p, crewed) :
        p.id === 0 ? human : (this.commandOverride?.(this, p) ?? botCommand(this, p));
      const c = p.command;
      // No sights to the eye through a gas mask's eyepieces. A tank's main
      // gun is laid from inside the hull and fired by the right button, so a
      // masked commander can still fire it.
      if (maskBlocksAim(p) && p.tank === undefined) c.aim = false;
      ctfCommand(this, p, c);
      if (p.id !== 0) evadeFlame(this,p);
      const interactPressed = !!c.interact && !p.commandInteractHeld;
      p.commandInteractHeld = !!c.interact;
      const tankAction = tankInteraction(this, p, interactPressed);
      const tank = crewTank(this, p);
      if (tank) {
        operateTank(this, p, tank, c);
        continue;
      }
      const gunAction = emplacementCommand(this, p, c, interactPressed && !tankAction);
      const gun = mountedGun(this, p);
      if (gun) {
        if (gun.mortar) operateMortar(this, p, gun, c);
        else operateGun(this, p, gun, c);
        continue;
      }
      if (interactPressed && !gunAction && !tankAction) pickupFlame(this,p);
      if (c.loadout) this.selectLoadout(p, c.loadout);
      const switched = c.equip ? switchWeapon(p, c.equip, this.tick) : false;
      if(switched)this.emit({type:"weaponAction",actor:p.id,action:"holster",weaponId:p.weaponChange?.fromId});
      if(p.weaponChange && this.tick===p.weaponChange.tick+switchRules.lowerTicks)
        this.emit({type:"weaponAction",actor:p.id,action:"draw",weaponId:p.weaponId});
      updateAimMotion(p,this.tick);
      p.triggerPressed = !switched && c.fire && (!p.triggerHeld || (p.weapon === "machineGun" && p.id === 0) || p.weapon === "flamethrower");
      p.triggerHeld = c.fire;
      recoverRecoil(p);
      if (p.melee) c.crouch = p.crouched;
      updateCrouch(this, p, c);
      if (c.whistle) blowWhistle(this, p, c);
      if (c.melee && !p.meleeHeld) startMelee(this, p, c);
      p.meleeHeld = !!c.melee;
      const meleeSpeed = meleeMovement(this, p, c);
      if (c.artillery) requestArtillery(this, p, c.artillery);
      else if (c.gasStrike) requestGasStrike(this, p, c.gasStrike);
      if (c.flare) requestFlare(this, p, c.flare);
      if (
        !c.fire ||
        p.reloadAt ||
        p.mantle ||
        p.ammo <= 0 ||
        this.tick < p.throwUntil
      )
        p.aimBloom = Math.max(0, p.aimBloom - 1 / 18);
      p.yaw = c.yaw;
      p.pitch = clamp(c.pitch, -1.1, 1.1);
      if (p.throwAction && this.tick >= p.throwUntil) p.throwAction = null;
      if (p.throwAction && !p.throwAction.released && this.tick >= p.throwAction.releaseTick) {
        const action = p.throwAction;
        action.released = true;
        if (!p.mantle && !p.melee && !p.reloadAt && this.tick >= p.staggerUntil)
          this.throwGrenade(p, action.smoke);
        else {
          p.throwAction = null;
          p.throwUntil = this.tick;
        }
      }
      if (
        (c.grenade || c.smoke) &&
        !p.mantle &&
        !p.melee &&
        this.tick >= p.staggerUntil &&
        !p.reloadAt &&
        (c.smoke ? p.smokes > 0 : p.grenades > 0) &&
        this.tick >= p.nextGrenade
      ) {
        if (this.humanPlayerIds.includes(p.id)) {
          p.throwAction = { startTick: this.tick, releaseTick: this.tick + 6, smoke: !!c.smoke, released: false };
          p.throwUntil = this.tick + 21;
          p.nextGrenade = this.tick + 30;
          p.protectedUntil = 0;
        } else this.throwGrenade(p, !!c.smoke, c.throwSpeed);
      }
      if (
        c.mantle &&
        this.tick >= p.throwUntil &&
        !p.melee &&
        this.tick >= p.staggerUntil &&
        !p.crouched &&
        !p.mantle &&
        !p.hop &&
        !p.fall &&
        this.tick >= p.nextMantle &&
        this.tick >= p.nextHop &&
        !inWire(p.x, p.z, this.map, p.team)
      ) {
        if (!this.startMantle(p, c)) this.startHop(p);
      }
      if (p.mantle) {
        const m = p.mantle;
        p.yaw = m.yaw;
        Object.assign(p, mantlePosition(m, this.tick));
        p.vx = p.vz = 0;
        p.mode = "Mantle";
        if (this.tick >= m.endTick) {
          p.mantle = null;
          p.landedAt = this.tick;
          this.emit({
            type: "mantle",
            actor: p.id,
            phase: "end",
            from: m.from,
            to: m.to,
          });
        }
      } else {
        const len = Math.max(1, Math.hypot(c.x, c.z)),
          stride =
            this.tick < p.staggerUntil
              ? 1.2
              : (meleeSpeed ??
                (p.crouched
                  ? crouchRules.speed
                  : c.sprint && !c.aim
                    ? 7
                    : 4.5)),
          muddy = this.rain ? stride * rainPace(p, this.map, floodAt(this.tick - this.rainSince)) : stride,
          speed = inWire(p.x, p.z, this.map, p.team) ? Math.min(muddy, boundaryRules.wireSpeed) : muddy;
        p.vx += ((c.x / len) * speed - p.vx) * 0.24;
        p.vz += ((c.z / len) * speed - p.vz) * 0.24;
        const pos = this.collision.move(p, { x: p.vx / 30, z: p.vz / 30 });
        p.x = pos.x;
        p.z = pos.z;
        if (pos.y !== undefined && !p.hop && !p.fall) p.y = pos.y;
        keepClearOfTanks(this, p);
        const ground = supportHeight(p.x, p.z, this.map, p.y + 0.23, .45);
        if (p.hop) this.advanceHop(p);
        else {
          if (!p.fall && p.y - ground > 0.23) this.startFall(p);
          if (p.fall) this.advanceFall(p);
          else p.y = ground;
        }
        // Under an airship's decks there is only sky.
        if (this.map.sky && p.y < this.map.sky.fallLimit)
          this.damage(p, p.hp, -1, null, { kind: "fall", weapon: "Fell from the airship" });
      }
      const profile = weaponProfile(p);
      if (p.reloadAt && this.tick >= p.reloadAt) {
        const n = Math.min(
          profile.magazine - p.ammo,
          p.reserve,
        );
        p.ammo += n;
        p.reserve -= n;
        p.reloadAt = 0;
      }
      if (
        (c.reload || (p.triggerPressed && p.ammo === 0)) &&
        this.tick >= p.throwUntil &&
        !p.melee &&
        this.tick >= p.staggerUntil &&
        !p.mantle &&
        !p.reloadAt &&
        p.ammo < profile.magazine &&
        p.reserve > 0
      ) {
        p.reloadAt = this.tick + profile.reloadTicks + (switchPose(p,this.tick).active ? Math.max(0,p.weaponChange!.tick+switchRules.readyTicks-this.tick) : 0);
        this.emit({ type: "reload", actor: p.id });
      }
      if (p.weapon === "serviceRifle" && !p.melee) {
        const action = serviceRifleAction(p, this.tick);
        if (action) this.emit({ type: "weaponAction", actor: p.id, action:action === "clip" && weaponDesign(p)?.reload === "tube" ? "cartridges" : action, weaponId:p.weaponId });
      }
    }
    for(const p of this.players){const action=reloadCue(p,this.tick);if(action)this.emit({type:"weaponAction",actor:p.id,action,weaponId:p.weaponId});}
    for (const p of this.players) advancePeriscope(this, p);
    advanceMelee(this, (target, amount, source, team, kind) =>
      this.damage(target, amount, source, team,{kind:"melee",weapon:kind==="charge"?"Bayonet charge":kind==="bayonet"?"Bayonet":"Rifle butt",from:this.attackOrigin(source)}),
    );
    for (const p of this.players)
      if (
        p.hp > 0 &&
        !p.melee &&
        this.tick >= p.staggerUntil &&
        !p.mantle &&
        this.tick >= p.throwUntil &&
        p.triggerPressed &&
        !p.reloadAt &&
        p.ammo > 0 &&
        this.tick >= p.nextShot &&
        (!canOverheat(p.weapon) || barrelReady(p.barrel))
      )
        this.fire(p);
    for (const gun of this.emplacements.values()) {
      if (gun.operator === undefined || gun.mortar) continue;
      const p = this.players[gun.operator];
      if (p.hp > 0 && p.command.fire && gun.ammo > 0 && !gun.reloadAt &&
          this.tick >= gun.nextShot && this.tick >= p.staggerUntil && barrelReady(gun.barrel)) this.fire(p, gun);
    }
    advanceFlames(this,(p,n,source,team)=>this.damage(p,n,source,team,{kind:"burn",weapon:"Flamethrower burn",from:p.burnFrom}));
    this.advanceProjectiles();
    this.advanceGrenades();
    advanceBoundary(this);
    advanceGas(this, (p, n, source, team, weapon) => this.damage(p, n, source, team, { kind: "gas", weapon }));
    advanceArtillery(this);
    advanceFlares(this);
    advanceCtf(this);
    for (const s of this.scoring !== "eliminations" && this.scoring !== "ctf" ? this.sectors : []) {
      // Attack and defend: a flag outside the open phase is locked.
      if (!objectiveOpen(this, s)) {
        s.contested = false;
        continue;
      }
      const occupants = this.players.filter((p) =>
          this.scoring === "domination"
            ? flagOccupant(this, p, s)
            : p.hp > 0 && !p.mantle && dist(p, s) <= 8,
        ),
        was = s.contested,
        owner = s.owner;
      const team = capture(
        s,
        occupants.some((p) => p.team === "blue"),
        occupants.some((p) => p.team === "red"),
        this.scoring === "domination" ? dominationRules.captureTicks : 300,
      );
      if (this.scoring === "domination" && owner && !s.owner)
        this.emit({
          type: "neutralized",
          sector: s.id,
          previous: owner,
          team: owner === "blue" ? "red" : "blue",
        });
      if (s.contested && !was) this.emit({ type: "contested", sector: s.id });
      if (team) {
        for (const p of occupants) if (p.team === team) p.captures++;
        this.emit({ type: "capture", sector: s.id, team });
      }
    }
    if (this.scoring === "sectors" && this.tick % 150 === 0) {
      for (const s of this.sectors) if (s.owner) this.scores[s.owner]++;
      this.emit({ type: "score" });
    }
    if (
      this.scoring === "domination" && !this.offensive &&
      this.tick % dominationRules.scoreInterval === 0
    ) {
      const held = { blue: 0, red: 0 };
      for (const s of this.sectors)
        if (s.owner && !s.contested) {
          this.scores[s.owner] = Math.min(
            this.scoreLimit ?? Infinity,
            this.scores[s.owner] + 1,
          );
          held[s.owner]++;
        }
      this.emit({ type: "score", points: { ...this.scores }, held });
    }
    const decided = advanceOffensive(this) ?? advanceReinforcements(this);
    if (
      decided ||
      this.tick >= this.duration ||
      (this.scoreLimit !== null &&
        Math.max(this.scores.blue, this.scores.red) >= this.scoreLimit)
    ) {
      this.phase = "ended";
      for (const p of this.players) {
        cancelMelee(this, p);
        p.meleeThreat = null;
        p.throwAction = null;
        p.throwUntil = 0;
      }
      this.projectiles = [];
      this.grenades = [];
      this.artillery.missions = [];
      this.artillery.shells = [];
      this.smokeClouds = [];
      this.assaults.missions = [];
      this.winner = decided ?? (
        this.scores.blue === this.scores.red
          ? "draw"
          : this.scores.blue > this.scores.red
            ? "blue"
            : "red");
      this.emit({ type: "end", winner: this.winner });
    }
  }
  private startHop(p: Soldier) {
    if (
      this.collision.ray(
        { x: p.x, y: p.y + 1.9, z: p.z },
        { x: p.x, y: p.y + 2.05, z: p.z },
      ) < 0.99
    )
      return;
    p.hop = {
      startTick: this.tick,
      height: 0,
      velocity: hopSpeed,
      originY: p.y,
    };
    p.mode = "Hop";
    this.emit({
      type: "hop",
      actor: p.id,
      phase: "start",
      at: { x: p.x, y: p.y, z: p.z },
    });
  }
  private advanceHop(p: Soldier) {
    const h = p.hop!;
    const next = p.y + h.velocity / 30 - hopGravity / (2 * 30 * 30);
    h.velocity -= hopGravity / 30;
    const ground = supportHeight(p.x, p.z, this.map, p.y + 0.23, .45);
    let height = Math.max(ground, next);
    if (height > p.y) {
      const from = { x: p.x, y: p.y + 1.9, z: p.z };
      const to = { ...from, y: height + 1.9 };
      const fraction = this.collision.ray(from, to);
      if (fraction < 1) {
        height = Math.max(p.y, p.y + (height - p.y) * fraction - 0.01);
        h.velocity = Math.min(0, h.velocity);
      }
    }
    h.height = Math.max(0, height - h.originY);
    p.y = height;
    p.mode = "Hop";
    if (next <= ground && h.velocity < 0) {
      p.hop = null;
      p.nextHop = this.tick + 8;
      p.landedAt = this.tick;
      this.emit({
        type: "hop",
        actor: p.id,
        phase: "land",
        at: { x: p.x, y: p.y, z: p.z },
      });
    }
  }
  private startFall(p: Soldier) {
    p.fall = { startTick: this.tick, velocity: 0 };
    this.emit({
      type: "fall",
      actor: p.id,
      phase: "start",
      at: { x: p.x, y: p.y, z: p.z },
    });
  }
  private advanceFall(p: Soldier) {
    const fall = p.fall!;
    const ground = supportHeight(p.x, p.z, this.map, p.y + 0.23, .45);
    p.y += fall.velocity / 30 - hopGravity / (2 * 30 * 30);
    fall.velocity -= hopGravity / 30;
    p.mode = "Falling";
    if (p.y <= ground) {
      p.y = ground;
      p.fall = null;
      p.landedAt = this.tick;
      p.mode = "Navigate";
      p.nextHop = this.tick + 8;
      this.emit({
        type: "fall",
        actor: p.id,
        phase: "land",
        at: { x: p.x, y: p.y, z: p.z },
      });
    }
  }
  private startMantle(p: Soldier, c: Command): boolean {
    const direction =
      Math.hypot(c.x, c.z) > 0.1
        ? c
        : { x: Math.sin(c.yaw), z: -Math.cos(c.yaw) };
    const route = mantleRoute(p, direction, this.map);
    if (!route) return false;
    const to = {
      ...route.landing,
      y: route.landing.y ?? groundHeight(route.landing.x, route.landing.z, this.map),
    };
    const m: Mantle = {
      from: { x: p.x, y: p.y, z: p.z },
      to,
      edge: { ...route.edge, y: route.edge.y ?? Math.max(p.y, to.y) },
      ...(route.vault ? {vault:true} : {}),
      yaw: Math.atan2(to.x - p.x, -(to.z - p.z)),
      startTick: this.tick,
      endTick: this.tick + 36,
    };
    let previous = m.from;
    let previousLift = 0;
    for (let i = 1; i <= 36; i++) {
      const next = mantlePosition(m, this.tick + i);
      const lift = mantleFootLift(m, this.tick + i);
      const sideX=Math.cos(m.yaw)*.3,sideZ=Math.sin(m.yaw)*.3;
      // While crossing, a vaulting body is tucked low enough to dive through
      // a window opening; it stands fully at the run-up and the landing.
      const tucked = m.vault && i / 36 > vaultTuck.from && i / 36 < vaultTuck.to;
      for (const [ox,oz] of (m.vault ? [[0,0],[sideX,sideZ],[-sideX,-sideZ]] : [[0,0]]))
      for (const height of tucked ? [0.1, 0.8, vaultTuck.height] : [0.1, 0.8, 1.8])
        if (
          this.collision.ray(
            {
              ...previous, x:previous.x+ox,z:previous.z+oz,
              y: previous.y + height + (height < 0.2 ? previousLift : 0),
            },
            { ...next,x:next.x+ox,z:next.z+oz,y: next.y + height + (height < 0.2 ? lift : 0) },
          ) < 0.99
        )
          return false;
      previous = next;
      previousLift = lift;
    }
    p.mantle = m;
    p.nextMantle = m.endTick + 15;
    p.vx = p.vz = 0;
    this.emit({
      type: "mantle",
      actor: p.id,
      phase: "start",
      from: m.from,
      to: m.to,
    });
    return true;
  }
  fire(p: Soldier, gun?: Emplacement) {
    if (!gun && p.weapon === "flamethrower") { fireFlame(this,p,(q,n,source,team)=>this.damage(q,n,source,team,{kind:"flame",weapon:p.weaponId??"Flamethrower",from:this.attackOrigin(source)}),c=>this.applyDestruction(p.id,c)); return; }
    const weapon = gun ? "machineGun" : p.weapon;
    const weaponId = gun?.weaponId ?? p.weaponId;
    const pose = gun ? emplacementView(gun) : undefined;
    let { yaw, pitch } = gun ?? weaponAim(p);
    if (gun) {
      const spread = p.command.aim ? 0.005 : 0.011;
      yaw += (this.random() - 0.5) * spread;
      pitch += (this.random() - 0.5) * spread;
    } else {
      // Fired from the hip, or before the sights are up, a shot wanders.
      const hip = hipFireOffset(p, this.tick, () => this.random());
      yaw += hip.yaw; pitch += hip.pitch;
      // Laid from a mirror image, a periscope rifle's shot wanders a little.
      if (periscopeRaised(p)) {
        yaw += (this.random() - 0.5) * 2 * periscopeRules.spread;
        pitch += (this.random() - 0.5) * 2 * periscopeRules.spread;
      }
    }
    const shooter = gun ?? p;
    shooter.ammo--;
    const profile = weaponProfile({ weapon, weaponId });
    shooter.nextShot = this.tick + profile.shotTicks;
    if (gun) gun.lastShotAt = this.tick;
    // Bloom feeds bot aim drift; the shared recoil below applies to every rifle.
    p.aimBloom = Math.min(1, p.aimBloom + 0.25);
    p.protectedUntil = 0;
    const dir = {
      x: Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * Math.cos(pitch),
    };
    const pivot = pose?.pivot ?? periscopeEye(p),
      distance = p.command.aim ? 2.5 : 4;
    const desired = {
      x: p.x - dir.x * distance + Math.cos(yaw) * 0.65,
      y: p.y + cameraHeightOf(p) - dir.y * distance,
      z: p.z - dir.z * distance + Math.sin(yaw) * 0.65,
    };
    const f = this.collision.ray(pivot, desired) * 0.95;
    const camera = pose?.eye ?? (
      p.id === 0 && !firstPersonView(p)
        ? {
            x: pivot.x + (desired.x - pivot.x) * f,
            y: pivot.y + (desired.y - pivot.y) * f,
            z: pivot.z + (desired.z - pivot.z) * f,
          }
        : pivot);
    let aim = {
      x: camera.x + dir.x * projectileRange,
      y: camera.y + dir.y * projectileRange,
      z: camera.z + dir.z * projectileRange,
    };
    let first = Math.min(this.collision.ray(camera, aim), this.tanks.list.length ? rayTanks(this, camera, aim).t : 1);
    for (const q of this.players)
      if (q !== p && q.hp > 0 && q.tank === undefined)
        for (const y of hitHeights(q))
          first = Math.min(
            first,
            raySphere(
              camera,
              aim,
              { x: q.x, y: q.y + y, z: q.z },
              hitRadius(q),
            ),
          );
    aim = {
      x: camera.x + (aim.x - camera.x) * first,
      y: camera.y + (aim.y - camera.y) * first,
      z: camera.z + (aim.z - camera.z) * first,
    };
    const muzzle = profile.muzzle;
    // A raised periscope rifle's sights and muzzle are on the mirror's line.
    const from = pose?.muzzle ?? (periscopeRaised(p) ? { x: pivot.x + dir.x * 0.6, y: pivot.y + dir.y * 0.6, z: pivot.z + dir.z * 0.6 } : firstPersonView(p) ? viewMuzzle(p, this.tick) : {
      x: p.x + Math.cos(yaw) * weaponMount.x + dir.x * muzzle,
      y: p.y + rifleHeight(this.map, p) + periscopeLift(p),
      z: p.z + Math.sin(yaw) * weaponMount.x + dir.z * muzzle,
    });
    const length = Math.max(
      0.001,
      Math.hypot(aim.x - from.x, aim.y - from.y, aim.z - from.z),
    );
    const speed = profile.projectileSpeed;
    const shot: Projectile = {
      origin:{...from},weapon,weaponId,
      id: ++this.projectileSequence,
      damage: profile.damage,
      actor: p.id,
      team: p.team,
      ...from,
      vx: ((aim.x - from.x) / length) * speed,
      vy: ((aim.y - from.y) / length) * speed,
      vz: ((aim.z - from.z) / length) * speed,
      remaining: weapon === "pistol" && !equippedStats(p) ? 25 : projectileRange,
      bornAt: this.tick,
    };
    const barrel = gun?.barrel ?? p.barrel;
    const overheated = addShotHeat(barrel, gun ? "emplaced" : p.weapon);
    this.emit({
      type: "fire",
      weapon,
      weaponId,
      actor: p.id,
      projectile: shot.id,
      recoil: { pitch: p.recoilPitch, yaw: p.recoilYaw },
      heat: barrel.heat,
      ...(gun ? { emplacement: gun.owner } : {}),
      from,
      to: {
        x: from.x + (shot.vx / speed) * projectileRange,
        y: from.y + (shot.vy / speed) * projectileRange,
        z: from.z + (shot.vz / speed) * projectileRange,
      },
    });
    if (overheated) this.emit({ type: "overheat", actor: p.id, at: { ...from }, ...(gun ? { emplacement: gun.owner } : {}) });
    let obstruction = this.collision.ray(pivot, from);
    // Native mesh rays can miss a muzzle starting exactly on a bank face.
    // A crouched barrel must also clear the authoritative height field/cover.
    if (p.crouched)
      obstruction = Math.min(
        obstruction,
        this.grenadeCollision.ray(pivot, from),
      );
    let muzzleVictim: Soldier | undefined;
    for (const q of this.players)
      if (q !== p && q.hp > 0 && q.tank === undefined)
        for (const y of hitHeights(q)) {
          const t = raySphere(
            pivot,
            from,
            { x: q.x, y: q.y + y, z: q.z },
            hitRadius(q),
          );
          if (t < obstruction) {
            obstruction = t;
            muzzleVictim = q;
          }
        }
    if (obstruction < 1) {
      // Do not spawn beyond cover or a soldier intersecting the barrel.
      this.impact(
        shot,
        {
          x: pivot.x + (from.x - pivot.x) * obstruction,
          y: pivot.y + (from.y - pivot.y) * obstruction,
          z: pivot.z + (from.z - pivot.z) * obstruction,
        },
        muzzleVictim,
      );
    } else this.projectiles.push(shot);
    if (!gun) kickRecoil(p, this.tick);
  }
  private advanceProjectiles() {
    const active: Projectile[] = [];
    const cells = new Map<string, Soldier[]>();
    for (const p of this.players)
      if (p.hp > 0 && p.tank === undefined) {
        const key = `${Math.floor(p.x / 4)},${Math.floor(p.z / 4)}`;
        const list = cells.get(key);
        if (list) list.push(p);
        else cells.set(key, [p]);
      }
    const mirrors = this.players.filter((p) => p.periscope && !p.periscope.broken && p.periscope.lift > 0.05);
    for (const shot of this.projectiles) {
      // A newly fired round starts at the muzzle at this tick's boundary.
      if (shot.bornAt === this.tick) {
        active.push(shot);
        continue;
      }
      const speed = Math.hypot(shot.vx, shot.vy, shot.vz);
      if (speed < 1e-6 || !Number.isFinite(speed)) continue;
      const travel = Math.min(speed / 30, shot.remaining);
      const from = { x: shot.x, y: shot.y, z: shot.z };
      const to = {
        x: from.x + (shot.vx / speed) * travel,
        y: from.y + (shot.vy / speed) * travel,
        z: from.z + (shot.vz / speed) * travel,
      };
      let nearest = this.collision.ray(from, to);
      let victim: Soldier | undefined;
      // Rounds stop on a tank's plates and only splash it.
      const armour = this.tanks.list.length ? rayTanks(this, from, to) : { t: 1 };
      if (armour.t < nearest) nearest = armour.t;
      for (
        let cx = Math.floor((Math.min(from.x, to.x) - 0.38) / 4);
        cx <= Math.floor((Math.max(from.x, to.x) + 0.38) / 4);
        cx++
      )
        for (
          let cz = Math.floor((Math.min(from.z, to.z) - 0.38) / 4);
          cz <= Math.floor((Math.max(from.z, to.z) + 0.38) / 4);
          cz++
        )
          for (const q of cells.get(`${cx},${cz}`) ?? [])
            if (q.id !== shot.actor && q.hp > 0)
              for (const y of hitHeights(q)) {
                const t = raySphere(
                  from,
                  to,
                  { x: q.x, y: q.y + y, z: q.z },
                  hitRadius(q),
                );
                if (t < nearest) {
                  nearest = t;
                  victim = q;
                }
              }
      // A raised periscope's mirror, if the round reaches it first.
      const mirror = mirrors.length ? mirrorOnPath(mirrors, from, to, shot.actor, nearest) : undefined;
      if (mirror) {
        nearest = mirror.t;
        victim = undefined;
      }
      shot.x = from.x + (to.x - from.x) * nearest;
      shot.y = from.y + (to.y - from.y) * nearest;
      shot.z = from.z + (to.z - from.z) * nearest;
      for (
        let cx = Math.floor(
          (Math.min(from.x, shot.x) - suppressionRules.radius) / 4,
        );
        cx <=
        Math.floor((Math.max(from.x, shot.x) + suppressionRules.radius) / 4);
        cx++
      )
        for (
          let cz = Math.floor(
            (Math.min(from.z, shot.z) - suppressionRules.radius) / 4,
          );
          cz <=
          Math.floor((Math.max(from.z, shot.z) + suppressionRules.radius) / 4);
          cz++
        )
          for (const q of cells.get(`${cx},${cz}`) ?? [])
            suppressNearMiss(this, q, shot, from, shot);
      const before = shot.remaining;
      shot.remaining = Math.max(0, shot.remaining - travel);
      const through = nearest < 1 && !victim && !shot.penetrated && !(armour.tank && nearest === armour.t)
        ? timberPassage(this.map, shot, { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }) : null;
      if (mirror) {
        breakMirror(this, mirror.owner, shot.actor);
        this.emit({ type: "impact", actor: shot.actor, projectile: shot.id, at: { x: shot.x, y: shot.y, z: shot.z }, target: null, hit: false });
      } else if (through) {
        // Stone stops bullets, wood doesn't: one thin partition, at half damage.
        this.emit({ type: "impact", actor: shot.actor, projectile: shot.id, at: { x: shot.x, y: shot.y, z: shot.z }, target: null, hit: false });
        const crossed = travel * nearest + Math.hypot(through.x - shot.x, through.y - shot.y, through.z - shot.z);
        Object.assign(shot, through, { penetrated: true, damage: (shot.damage ?? 25) * timberPassDamage, remaining: Math.max(0, before - crossed) });
        if (shot.remaining > 0) active.push(shot);
      } else if (nearest < 1 && !victim && armour.tank && nearest === armour.t) {
        bulletOnTank(this, armour.tank, shot);
        this.emit({ type: "impact", actor: shot.actor, projectile: shot.id, at: { x: shot.x, y: shot.y, z: shot.z }, target: null, hit: false, tank: armour.tank.id });
      } else if (nearest < 1)
        this.impact(shot, { x: shot.x, y: shot.y, z: shot.z }, victim, from);
      else if (shot.remaining > 0) active.push(shot);
    }
    this.projectiles = active;
  }
  private attackOrigin(source:number):V3|undefined {
    const p=this.players.find(p=>p.id===source);
    return p?{x:p.x,y:p.y+eyeHeightOf(p),z:p.z}:undefined;
  }
  private damage(
    victim: Soldier,
    amount: number,
    source: number,
    team: Team | null,
    details?:DamageDetails,
  ) {
    if(victim.hp<=0||!Number.isFinite(amount)||amount<=0)return;
    const actual=Math.min(victim.hp,amount),shooter=this.players.find(p=>p.id===source);
    const wound:Wound={...(details??{kind:"bullet",weapon:shooter?.weaponId??(shooter?weaponProfiles[shooter.weapon].label:"Unknown attack"),from:this.attackOrigin(source)}),source,tick:this.tick,damage:actual};
    victim.hp = Math.max(0, victim.hp - actual);
    rememberWound(victim,wound);
    this.emit({ type: "damage", actor: victim.id, source,amount:actual,at:{x:victim.x,y:victim.y,z:victim.z},kind:wound.kind,weapon:wound.weapon,from:wound.from });
    if (!victim.hp) {
      dismount(this, victim);
      leaveTank(this, victim);
      dropFlame(this,victim);
      cancelMelee(this, victim);
      victim.meleeThreat = null;
      victim.deaths++;
      const report=reportDeath(this,victim,wound,team);victim.lastDeath=report;
      let killer: number | undefined;
      if (team !== null && victim.team !== team) {
        if (shooter) {
          shooter.kills++;
          killer = shooter.id;
        }
        if (this.scoring === "eliminations") {
          this.scores[team]++;
          this.emit({ type: "score" });
        }
      }
      for(const credit of report.assists) {
        this.players.find(p=>p.id===credit.actor)!.assists++;
        this.emit({type:"assist",actor:credit.actor,target:victim.id,damage:credit.damage});
      }
      victim.respawnAt = this.tick + respawnTicks(this, victim.team);
      victim.mode = "Respawn";
      victim.reloadAt = 0;
      victim.throwUntil = 0;
      victim.throwAction = null;
      victim.mantle = null;
      victim.crouched = false;
      victim.combatReaction = victim.combatCover = null;
      victim.hop = null;
      victim.fall = null;
      this.emit({ type: "death", actor: victim.id, report, ...(killer === undefined ? {} : { killer }) });
    }
  }
  private projectileDamage(shot: Projectile, at: V3, victim: Soldier) {
    const stats = shot.weapon ? equippedStats({ weapon: shot.weapon, weaponId: shot.weaponId }) : undefined;
    if (!stats) return shot.damage ?? 25;
    // Classify the impact on the stance-aware soldier collision volume, in the
    // target's frame so left and right distinguish arms from the torso.
    const height = (at.y - victim.y) * (victim.crouched ? crouchRules.standingTop / crouchRules.crouchingTop : 1);
    const side = Math.abs((at.x - victim.x) * Math.cos(victim.yaw) + (at.z - victim.z) * Math.sin(victim.yaw));
    let zone: HitZone = "legs";
    if (height >= 1.55) zone = "head";
    else if (height >= 0.91) {
      if (side > (victim.crouched ? 0.22 : 0.26)) zone = "arms";
      else zone = height >= 1.16 ? "chest" : "stomach";
    }
    const distance = shot.origin ? Math.hypot(at.x - shot.origin.x, at.y - shot.origin.y, at.z - shot.origin.z) : 0;
    return damageAt(stats, zone, distance) * (shot.penetrated ? timberPassDamage : 1);
  }
  private impact(shot: Projectile, at: V3, victim?: Soldier, from = at) {
    const hit =
      !!victim &&
      victim.team !== shot.team &&
      this.tick >= victim.protectedUntil;
    if (hit && victim) {
      this.damage(victim, this.projectileDamage(shot, at, victim), shot.actor, shot.team,{kind:"bullet",weapon:shot.weaponId??weaponProfiles[shot.weapon??this.players[shot.actor]?.weapon??"rifle"].label,from:shot.origin??this.attackOrigin(shot.actor)??from});
      reactToThreat(this, victim, from, "hit", .95);
    }
    if (!victim) {
      const change = damageVegetation(this.map, at);
      if (change) this.applyDestruction(shot.actor, change);
    }
    this.emit({
      type: "impact",
      actor: shot.actor,
      projectile: shot.id,
      at,
      target: victim?.id ?? null,
      hit,
    });
  }
  // Sweep the center and six points on the grenade shell, including during release.
  private grenadeSweep(from: V3, to: V3) {
    let fraction = 1;
    for (const offset of [
      { x: 0, y: 0, z: 0 },
      ...(["x", "y", "z"] as const).flatMap((axis) =>
        [-grenadeRadius, grenadeRadius].map((sign) => ({
          x: 0,
          y: 0,
          z: 0,
          [axis]: sign,
        })),
      ),
    ])
      fraction = Math.min(
        fraction,
        this.collision.ray(
          { x: from.x + offset.x, y: from.y + offset.y, z: from.z + offset.z },
          { x: to.x + offset.x, y: to.y + offset.y, z: to.z + offset.z },
        ),
        // Keep tiny sweeps outside the authoritative height field even when
        // the engine's short ray begins within a collider's contact tolerance.
        this.grenadeCollision.ray(
          { x: from.x + offset.x, y: from.y + offset.y, z: from.z + offset.z },
          { x: to.x + offset.x, y: to.y + offset.y, z: to.z + offset.z },
        ),
      );
    // Grenades bounce off tanks and can come to rest on the roof.
    if (this.tanks.list.length) fraction = Math.min(fraction, rayTanks(this, from, to).t);
    return fraction;
  }
  private throwGrenade(p: Soldier, smoke = false, botSpeed?: number) {
    const speed = smoke ? smokeSpeed : botSpeed && !this.humanPlayerIds.includes(p.id) ? clamp(botSpeed, minThrowSpeed, grenadeSpeed) : grenadeSpeed;
    const human = this.humanPlayerIds.includes(p.id);
    // A planned bot frag may skim low through a doorway.
    const elevation = human
      ? clamp(p.pitch + 0.1, -1.1, 1.25)
      : clamp(p.pitch + 0.65, botSpeed && !smoke ? 0.05 : 0.15, 1.25);
    // Timber can extend slightly beyond the height-field bank. Find clearance
    // within the soldier's footprint before releasing; never start inside it.
    const origin = {
      x: p.x + (human ? Math.cos(p.yaw) * 0.16 : 0),
      y: p.y + (human ? 1.73 : 1.8) - stanceDrop(p),
      z: p.z + (human ? Math.sin(p.yaw) * 0.16 : 0),
    };
    const from = [
      origin,
      {
        ...origin,
        x: origin.x - Math.sin(p.yaw) * 0.35,
        z: origin.z + Math.cos(p.yaw) * 0.35,
      },
      {
        ...origin,
        x: origin.x + Math.sin(p.yaw) * 0.35,
        z: origin.z - Math.cos(p.yaw) * 0.35,
      },
      { ...origin, y: origin.y + 0.4 },
    ].find((candidate) =>
      (!human || this.grenadeSweep({ x: p.x, y: origin.y, z: p.z }, candidate) >= 1) &&
      (["x", "y", "z"] as const).every((axis) =>
        [-1, 1].every((sign) => {
          const edge = {
            ...candidate,
            [axis]: candidate[axis] + sign * (grenadeRadius + 0.02),
          };
          return (
            this.collision.ray(candidate, edge) >= 1 &&
            this.collision.ray(edge, candidate) >= 1 &&
            this.grenadeCollision.ray(candidate, edge) >= 1 &&
            this.grenadeCollision.ray(edge, candidate) >= 1
          );
        }),
      ),
    );
    if (!from) return;
    const desired = {
      x: from.x + Math.sin(p.yaw) * (human ? Math.cos(p.pitch) * 0.32 : 0.55),
      y: from.y + (human ? Math.sin(p.pitch) * 0.32 : 0.15),
      z: from.z - Math.cos(p.yaw) * (human ? Math.cos(p.pitch) * 0.32 : 0.55),
    };
    const f = Math.max(0, this.grenadeSweep(from, desired) - 0.03);
    const grenade: Grenade = {
      id: ++this.grenadeSequence,
      actor: p.id,
      team: p.team,
      x: from.x + (desired.x - from.x) * f,
      y: from.y + (desired.y - from.y) * f,
      z: from.z + (desired.z - from.z) * f,
      vx: Math.sin(p.yaw) * Math.cos(elevation) * speed,
      vy: Math.sin(elevation) * speed,
      vz: -Math.cos(p.yaw) * Math.cos(elevation) * speed,
      bornAt: this.tick,
      explodeAt: this.tick + (smoke ? smokeRules.fuse : grenadeFuseTicks),
      ...(smoke ? { kind: "smoke" as const } : {}),
    };
    if (smoke) {
      p.smokes--;
      const mission = this.assaults.missions.find((m) => m.id === p.assaultId);
      if (mission)
        mission.screens[mission.progress[p.id]] = {
          actor: p.id,
          tick: this.tick,
        };
    } else p.grenades--;
    p.protectedUntil = 0;
    p.throwUntil = this.tick + 15;
    p.nextGrenade = this.tick + 24;
    this.grenades.push(grenade);
    this.emit({
      type: smoke ? "smokeThrow" : "grenadeThrow",
      actor: p.id,
      grenade: grenade.id,
      from: { x: grenade.x, y: grenade.y, z: grenade.z },
      velocity: { x: grenade.vx, y: grenade.vy, z: grenade.vz },
      explodeAt: grenade.explodeAt,
    });
  }
  private advanceGrenades() {
    const active: Grenade[] = [];
    for (const g of this.grenades) {
      if (
        this.tick >= g.explodeAt &&
        (g.kind !== "smoke" ||
          g.y - groundHeight(g.x, g.z, this.map) < 0.5 ||
          this.tick - g.bornAt >= 180)
      ) {
        this.explodeGrenade(g);
        continue;
      }
      if (g.bornAt < this.tick) {
        let bounced = false;
        // Short, axis-separated sweeps give banks/walls a deterministic bounce.
        for (let substep = 0; substep < 4; substep++) {
          const dt = 1 / 120;
          g.vy -= grenadeGravity * dt;
          for (const [axis, velocity] of [
            ["x", "vx"],
            ["z", "vz"],
            ["y", "vy"],
          ] as const) {
            const delta = g[velocity] * dt;
            if (Math.abs(delta) < 1e-8) continue;
            const from = { x: g.x, y: g.y, z: g.z };
            const to = { ...from, [axis]: from[axis] + delta };
            const f = this.grenadeSweep(from, to);
            g[axis] +=
              delta * (f < 1 ? Math.max(0, f - 0.003 / Math.abs(delta)) : 1);
            if (f < 1) {
              if (Math.abs(g[velocity]) > 2.25) bounced = true;
              g[velocity] *= -0.38;
              if (axis === "y") {
                g.vx *= 0.7;
                g.vz *= 0.7;
                if (Math.abs(g.vy) < 0.9) g.vy = 0;
              }
            }
          }
        }
        if (bounced)
          this.emit({
            type: "grenadeBounce",
            actor: g.actor,
            grenade: g.id,
            at: { x: g.x, y: g.y, z: g.z },
          });
      }
      active.push(g);
    }
    this.grenades = active;
  }
  private explodeGrenade(g: Grenade) {
    if (g.kind === "smoke") {
      const cloud: SmokeCloud = {
        id: ++this.smokeSequence,
        actor: g.actor,
        team: g.team,
        x: g.x,
        z: g.z,
        y: Math.max(g.y, groundHeight(g.x, g.z, this.map)) + 1.4,
        bornAt: this.tick,
        expiresAt: this.tick + smokeRules.lifetime,
      };
      this.smokeClouds.push(cloud);
      this.emit({
        type: "smokeBloom",
        actor: g.actor,
        grenade: g.id,
        cloud: cloud.id,
        at: { x: cloud.x, y: cloud.y, z: cloud.z },
        expiresAt: cloud.expiresAt,
      });
      return;
    }
    const at = { x: g.x, y: g.y, z: g.z };
    const hits = this.explode(at, g.actor, g.team, { ...grenadeExplosionProfile, label: grenadeLook(this.map, g.team).name });
    this.emit({
      type: "grenadeExplosion",
      actor: g.actor,
      grenade: g.id,
      at,
      radius: grenadeBlastRadius,
      hits,
    });
  }
  explode(at: V3, actor: number, team: Team | null, profile: ExplosionProfile) {
    const hits: { target: number; damage: number }[] = [];
    // At night the flash shows the ground around it for a moment (src/night.ts).
    if (this.map.night) {
      this.bursts.push({ x: at.x, z: at.z, tick: this.tick, radius: burstRadius(profile.radius) });
      if (this.bursts.length > 16) this.bursts.shift();
    }
    for (const p of this.players) {
      if (p.hp > 0 && this.tick >= p.protectedUntil) {
        const reach = profile.radius * 1.8;
        const distance = Math.hypot(p.x - at.x, p.y + 1 - at.y, p.z - at.z);
        if (distance < reach) {
          const sheltered = this.collision.ray(at, {x: p.x, y: p.y + 1, z: p.z}) < .98;
          reactToThreat(this, p, at, "blast", (1 - distance / reach) * (sheltered ? .3 : 1));
        }
      }
      if (
        p.hp <= 0 ||
        p.tank !== undefined ||
        (p.team === team && p.id !== actor && !profile.friendlyFire) ||
        this.tick < p.protectedUntil
      )
        continue;
      const distance = Math.hypot(
        p.x - at.x,
        p.y + (p.crouched ? 0.6 : 0.9) - at.y,
        p.z - at.z,
      );
      if (distance >= profile.radius) continue;
      const probes = hitHeights(p);
      const exposed = probes.filter(
        (height) =>
          this.collision.ray(at, { x: p.x, y: p.y + height, z: p.z }) >= 0.999,
      ).length;
      const rawDamage = Math.ceil(profile.damage * (1-distance/profile.radius));
      const artillery = profile.kind.startsWith("artillery");
      if (artillery) {
        this.artilleryAudit.exposedSoldiers++;
        if(exposed < probes.length) this.artilleryAudit.coveredSoldiers++;
      }
      if (!exposed) { if(artillery)this.artilleryAudit.damagePrevented+=rawDamage; continue; }
      const damage = Math.ceil(
        profile.damage *
          (1 - distance / profile.radius) *
          (profile.partialCover ? exposed / probes.length : 1),
      );
      const capturing = this.scoring === "domination" && this.sectors.some(s=>s.owner!==p.team && flagOccupant(this,p,s));
      hits.push({ target: p.id, damage });
      this.damage(p, damage, actor, team,{kind:artillery?"artillery":"grenade",weapon:profile.label??(artillery?(profile.kind==="artillery-ambient"?"Ambient artillery":profile.kind==="artillery-boundary"?"Left the battlefield":"Artillery strike"):profile.kind==="tank-shell"?"Tank gun":"Fragmentation grenade"),from:{...at}});
      if(artillery) {
        this.artilleryAudit.damagePrevented+=rawDamage-damage;
        if(p.hp<=0) { this.artilleryAudit.deaths++; if(capturing)this.artilleryAudit.captureInterruptions++; }
      }
    }
    damageEmplacements(this, at, profile.radius, profile.damage);
    explosionOnTanks(this, at, actor, team, profile);
    const deformStart = battlePerformance.begin();
    const change = deformExplosion(this.map, at, profile, (a, b) =>
      this.collision.ray(a, b),
    );
    battlePerformance.end("explosionDeform", deformStart);
    const applyStart = battlePerformance.begin();
    if (change) this.applyDestruction(actor, change);
    battlePerformance.end("explosionApply", applyStart);
    return hits;
  }
  // Falling kit floors and roofs hurt whoever is still beneath them when the
  // warning ends; the collapse itself never kills outright.
  private structuralFailure(change: DestructionChange) {
    const fallen = change.objects.map(o => this.map.destruction!.objects[o.id]?.original)
      .filter((b): b is Box => !!b?.architecture && (b.architecture.part === "floor" || b.architecture.part === "roof") && b.architecture.level > 0);
    const struck = this.players.filter(p => p.hp > 0 && fallen.some(b =>
      Math.abs(p.x - b.x) <= b.w / 2 + .2 && Math.abs(p.z - b.z) <= b.d / 2 + .2 &&
      p.y < (b.baseY ?? 0) && p.y > (b.baseY ?? 0) - 4.5));
    this.applyDestruction(-1, change);
    for (const p of struck) this.damage(p, collapseDamage, -1, null, { kind: "collapse", weapon: "Falling masonry", from: { ...change.at } });
  }
  private applyDestruction(actor: number, change: DestructionChange) {
    if (change.geometry === false) {
      // Cosmetic tree damage advances the global destruction revision, but does
      // not change walkability. Preserve a graph pending a local rebuild instead
      // of discarding all its directed checks on the next path request.
      const memo = navigationSegments.get(this.map);
      if (memo && memo.revision === change.revision - 1) memo.revision = change.revision;
      const cached = navigation.get(this.map), pending = navigationWork.get(this.map);
      if (cached?.revision === change.revision - 1) cached.revision = change.revision;
      if (pending) pending.revision = change.revision;
      this.collision.updateWorld?.(change);
      this.emit({ type: "destruction", actor, change });
      return;
    }
    const bounds = navigationChangeBounds(this.map, change);
    invalidateNavigationSegments(this.map, change, bounds);
    // Keep the last complete graph available while new checks are scheduled.
    // Completed local checks survive cancellation by overlapping shell edits.
    if (navigationWork.delete(this.map)) battlePerformance.count("navigationRestarts");
    this.collision.updateWorld?.(change);
    checkEmplacementSupport(this);
    for (const p of this.players) {
      let previous: Vec = p;
      const affected = !bounds || p.path.some(point => {
        const touches = navigationSegmentTouches(previous, point, bounds);
        previous = point; return touches;
      });
      if (affected) {
        p.path = [];
        p.nextThink = this.tick + (p.id % 30);
      }
      if (p.mantle) {
        const m = p.mantle;
        if (
          Math.abs(supportHeight(m.from.x,m.from.z,this.map,m.from.y+.05) - m.from.y) <
            0.02 &&
          Math.abs(supportHeight(m.to.x,m.to.z,this.map,m.to.y+.05) - m.to.y) < 0.02 && !bodyBlocked(m.to.x,m.to.z,m.to.y,.45,this.map)
        )
          continue;
        p.mantle = null;
        p.landedAt = this.tick;
      }
      const ground = supportHeight(p.x, p.z, this.map, p.y + 0.23, .45);
      if (!p.hop && !p.fall) {
        if (p.hp > 0 && p.y - ground > 0.23) this.startFall(p);
        else p.y = ground;
      }
    }
    this.emit({ type: "destruction", actor, change });
  }
}
// Each map owns a cached height-aware navigation graph.
const navigation = new WeakMap<
  MapDefinition,
  { nodes: Vec[]; edges: number[][]; revision: number }
>();
// Reuse unchanged graph-edge walk checks across local explosions. Directed keys
// preserve the original sample order and exact route tie-breaking.
const navigationSegments = new WeakMap<MapDefinition, {revision:number;edges:NavigationEdges}>();
export function navigationSegmentTouches(a: Vec, b: Vec, bounds: NavigationBounds) {
  return Math.min(a.x,b.x) - .7 <= bounds.maxX && Math.max(a.x,b.x) + .7 >= bounds.minX &&
    Math.min(a.z,b.z) - .7 <= bounds.maxZ && Math.max(a.z,b.z) + .7 >= bounds.minZ;
}
function navigationChangeBounds(map: MapDefinition, change: DestructionChange): NavigationBounds | undefined {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  const include = (x0: number, x1: number, z0: number, z1: number) => {
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x1);
    minZ = Math.min(minZ, z0);
    maxZ = Math.max(maxZ, z1);
  };
  for (const key of change.patches) {
    const [x, z] = key.split(",").map(Number);
    include(
      x * terrainPatchSize,
      (x + 1) * terrainPatchSize,
      z * terrainPatchSize,
      (z + 1) * terrainPatchSize,
    );
  }
  for (const object of change.objects) {
    const b = map.destruction?.objects[object.id]?.original;
    if (b) include(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2);
  }
  return Number.isFinite(minX) ? {minX,maxX,minZ,maxZ} : undefined;
}
function invalidateNavigationSegments(map: MapDefinition, change: DestructionChange, bounds?: NavigationBounds) {
  const memo = navigationSegments.get(map);
  if (!memo) return;
  memo.edges.invalidate(bounds);
  memo.revision = map.destruction?.revision ?? 0;
}
const navigationWork = new WeakMap<MapDefinition, {
  revision: number;
  work: Generator<boolean, { nodes: Vec[]; edges: number[][] }>;
}>();
function* navigationRebuild(map: MapDefinition, near: Vec[]): Generator<boolean, { nodes: Vec[]; edges: number[][] }> {
  const { nodes, nodeKeys } = yield* navigationNodeWork(map);
  const edges = yield* navigationMemo(map).slices(nodes, nodeKeys, map.navSpacing,
    (a,b) => { battlePerformance.count("navigationChecks"); return walkSegment(a,b,map); }, near);
  return { nodes, edges };
}
export const navigationChecksPerTick = 256;
// A deterministic limit of walk checks per tick keeps path scheduling
// independent of render FPS in headless games. The rebuild's bookkeeping
// (node sampling, cached rows) pauses too but doesn't count toward it.
// The browser also passes a wall-clock deadline shared by every tick of one
// frame, so catch-up ticks after a slow frame don't multiply the work.
export function advanceNavigation(map: MapDefinition, near: Vec[] = [], budget = navigationChecksPerTick, deadline = Infinity) {
  const revision = map.destruction?.revision ?? 0;
  const cached = navigation.get(map);
  if (cached?.revision === revision || (!cached && !revision)) return;
  const start = battlePerformance.begin();
  try {
    let pending = navigationWork.get(map);
    if (!pending || pending.revision !== revision) {
      pending = { revision, work: navigationRebuild(map, near) };
      navigationWork.set(map, pending);
    }
    for (let checks = 0; checks < budget;) {
      const result = pending.work.next();
      if (result.done) {
        navigation.set(map, { ...result.value, revision: pending.revision });
        navigationWork.delete(map);
        battlePerformance.count("navigationPublishes");
        return;
      }
      if (result.value) checks++;
      if (deadline !== Infinity && performance.now() >= deadline) return;
    }
  } finally { battlePerformance.end("navigationSlice", start); }
}
function navigationMemo(map: MapDefinition) {
  const revision = map.destruction?.revision ?? 0;
  let memo = navigationSegments.get(map);
  if (!memo || memo.revision !== revision) {
    memo = { revision, edges: new NavigationEdges() };
    navigationSegments.set(map, memo);
  }
  return memo.edges;
}
// Navigation nodes are sampled in two passes: cheap candidate points first,
// then the support and clearance tests, which yield so a rebuild can pause.
function navigationNodes(map: MapDefinition) {
  const work = navigationNodeWork(map);
  let result = work.next();
  while (!result.done) result = work.next();
  return result.value;
}
function* navigationNodeWork(map: MapDefinition): Generator<boolean, { nodes: Vec[]; nodeKeys: string[] }> {
  const step = map.navSpacing,
    nodes: Vec[] = [],
    nodeKeys: string[] = [];
  const unique = new Set<string>();
  const candidates: [number, number, number | undefined][] = [];
  const add = (x: number, z: number, y?: number) => { candidates.push([x, z, y]); };
  const evaluate = (x: number, z: number, y?: number) => {
    // Match soldiers' support footprint on narrow treads. A point sample can
    // leave an otherwise valid stair anchor embedded in the next riser.
    if(map.buildings) y = supportHeight(x,z,map,(y??groundHeight(x,z,map))+.23,.45);
    // In the sky, a point with no deck under it is open air, not a route.
    if (map.sky && y! < map.sky.fallLimit) return;
    const key = `${x},${z}${y === undefined ? "" : ","+y}`;
    if (!unique.has(key) && !(map.buildings ? bodyBlocked(x,z,y!,.6,map) || Math.abs(supportHeight(x,z,map,y!+.02,.45)-y!)>.1 : blocked(x, z, 0.7, map))) {
      unique.add(key);
      nodes.push(y === undefined ? { x, z } : { x, z, y });
      nodeKeys.push(key);
    }
  };
  // The lattice covers the play area only: bots never route through a dead zone.
  const area = playArea(map);
  for (let x = -area.width / 2 + step; x <= area.width / 2 - step; x += step)
    for (let z = -area.depth / 2 + step; z <= area.depth / 2 - step; z += step)
      add(x, z);
  for (const point of map.navigationPoints ?? []) add(point.x, point.z, point.y);
  for(const b of map.buildings??[])for(const post of b.posts)add(post.x,post.z,post.y);
  // Include the actual ends/middle of narrow ramps. A regular lattice alone can
  // strand one mirrored firing step when a node falls exactly on a bank edge.
  for (const r of map.terrain?.ramps ?? []) {
    for (const x of [r.x - r.w / 2, r.x, r.x + r.w / 2])
      for (const z of [r.z - r.d / 2 + 0.8, r.z, r.z + r.d / 2 - 0.8])
        add(x, z);
    // Leave a ramp on its low side before going around its longitudinal end.
    // Tight, offset sections may otherwise have no lattice point on that floor.
    const lowX = r.x - r.direction * (r.w / 2 + 0.4);
    for (const z of [r.z - r.d / 2 - 0.8, r.z + r.d / 2 + 0.8]) add(lowX, z);
  }
  // Authored communication bends can fall between the regular nav lattice.
  for (const line of map.terrain?.trenchLines ?? [])
    line.sections.forEach((s, index) => {
      for (let z = s.z - s.length / 2 + 0.5; z < s.z + s.length / 2; z += 1)
        add(s.x, z);
      const next = line.sections[index + 1];
      if (!next) return;
      const end = s.z + s.length / 2;
      for (let x = Math.min(s.x, next.x); x <= Math.max(s.x, next.x); x += 1)
        add(x, end);
    });
  for (const route of [
    ...(map.terrain?.communicationRoutes ?? []),
    ...(map.terrain?.branchRoutes ?? []),
  ])
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i],
        b = route.points[i + 1];
      const steps = Math.ceil(dist(a, b) / (step / 2));
      for (let j = 0; j <= steps; j++)
        add(a.x + ((b.x - a.x) * j) / steps, a.z + ((b.z - a.z) * j) / steps);
    }
  for (const crater of map.destruction?.craters ?? [])
    for (const [dx, dz] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ])
      add(crater.x + dx * crater.radius, crater.z + dz * crater.radius);
  for (let i = 0; i < candidates.length; i++) {
    evaluate(...candidates[i]);
    if (i % 64 === 63) yield false;
  }
  return { nodes, nodeKeys };
}
// The graph of each authored map before any destruction, built once on a
// private runtime copy and shared by every match on that map (each match
// gets its own copy of the retained walk checks).
type PristineGraph = { nodes: Vec[]; edges: number[][]; checks: NavigationEdges };
type NavigationGraph = { nodes: Vec[]; edges: number[][]; revision: number };
const pristineNavigation = new WeakMap<MapDefinition, PristineGraph>();
function pristineGraph(source: MapDefinition): PristineGraph {
  let pristine = pristineNavigation.get(source);
  if (!pristine) {
    const map = runtimeMap(source), built = graph(map, false);
    pristine = { nodes: built.nodes, edges: built.edges, checks: navigationMemo(map) };
    pristineNavigation.set(source, pristine);
  }
  return pristine;
}
function graph(map: MapDefinition, shared = true): NavigationGraph {
  const revision = map.destruction?.revision ?? 0;
  const cached = navigation.get(map);
  if (cached?.revision === revision) return cached;
  const source = shared && !revision && !navigationSegments.has(map) ? runtimeSource(map) : undefined;
  if (source) {
    const pristine = pristineGraph(source);
    const result = { nodes: pristine.nodes, edges: pristine.edges, revision };
    navigation.set(map, result);
    navigationSegments.set(map, { revision, edges: pristine.checks.clone() });
    navigationWork.delete(map);
    return result;
  }
  const start = battlePerformance.begin();
  const { nodes, nodeKeys } = navigationNodes(map);
  const edges = navigationMemo(map).build(nodes, nodeKeys, map.navSpacing, (a,b) => {
    battlePerformance.count("navigationChecks"); return walkSegment(a,b,map);
  });
  const result = { nodes, edges, revision };
  navigation.set(map, result);
  navigationWork.delete(map);
  battlePerformance.end("navigationBuild", start);
  return result;
}
// Build the graph ahead of a match, e.g. while the briefing is open. Passing
// the authored map prepares every later match on it.
export function prepareNavigation(map:MapDefinition) {
  if (runtimeSource(map)) graph(map);
  else pristineGraph(map);
}
// Weakly connected components of a navigation graph, cached per graph
// object (a rebuilt graph is a new object).
const componentCache = new WeakMap<object, Int32Array>();
const closestMemo = new WeakMap<object, { revision: number; found: Map<string, number | undefined> }>();
function navigationComponents(graph: { nodes: Vec[]; edges: number[][] }) {
  let component = componentCache.get(graph);
  if (component) return component;
  const n = graph.nodes.length, links: number[][] = Array.from({ length: n }, () => []);
  graph.edges.forEach((out, u) => { for (const v of out) { links[u].push(v); links[v]?.push(u); } });
  component = new Int32Array(n).fill(-1);
  for (let i = 0, id = 0; i < n; i++) {
    if (component[i] >= 0) continue;
    const stack = [i];
    component[i] = id;
    while (stack.length) for (const v of links[stack.pop()!]) if (component[v] < 0) { component[v] = id; stack.push(v); }
    id++;
  }
  componentCache.set(graph, component);
  return component;
}
export function pathfind(
  a: Vec,
  b: Vec,
  map: MapDefinition = industrialMap,
  deferred = false,
  // Optional extra cost per edge, never negative, such as a danger map.
  extra?: (a: Vec, b: Vec) => number,
): Vec[] {
  if (walkSegment(a, b, map)) return [{ ...b }];
  const available = deferred ? navigation.get(map) ?? ((map.destruction?.revision ?? 0) ? undefined : graph(map)) : graph(map);
  if (!available) return [];
  const { nodes, edges } = available;
  // Planners try several goals from one start, and many soldiers share goals:
  // remember each point's nearest reachable node for this graph and revision.
  let memo = closestMemo.get(available);
  const revision = map.destruction?.revision ?? 0;
  if (!memo || memo.revision !== revision || memo.found.size > 4096) closestMemo.set(available, memo = { revision, found: new Map() });
  const closest = (p: Vec) => {
    const key = p.x.toFixed(2) + "," + p.z.toFixed(2) + "," + (p.y === undefined ? "" : p.y.toFixed(2));
    if (memo!.found.has(key)) return memo!.found.get(key);
    const candidates = nearestCandidates(nodes, p);
    let i = candidates.find(({ i }) => walkSegment(p, nodes[i], map))?.i;
    // A soldier can stand nearer a wall than the planner's clearance allows,
    // and then no route leaves its feet. Plan from the nearest clear spot
    // beside it instead; it walks there on the way to the first node. The
    // airship's narrow stairs and catwalks need it, and so does a soldier
    // pressed against the corner of a prop on open ground.
    for (const reach of i === undefined ? [0.2, 0.4] : []) {
      for (let k = 0; k < 8 && i === undefined; k++) {
        const q = { ...p, x: p.x + Math.cos(k * Math.PI / 4) * reach, z: p.z + Math.sin(k * Math.PI / 4) * reach };
        i = candidates.find(({ i }) => walkSegment(q, nodes[i], map))?.i;
      }
      if (i !== undefined) break;
    }
    memo!.found.set(key, i);
    return i;
  };
  const start = closest(a),
    goal = closest(b);
  if (start === undefined || goal === undefined) return [];
  // Different components can never connect: skip a search that would visit
  // every node it can reach before failing.
  const component = navigationComponents(available);
  if (component[start] !== component[goal]) return [];
  const found = searchGraph(nodes, edges, start, goal, extra);
  if (!found) return [];
  const route: Vec[] = found.map((i) => nodes[i]);
  route.push({ ...b });
  // Do not walk back to a nearby lattice anchor when the next one is clear.
  while (route.length > 1 && walkSegment(a, route[1], map)) route.shift();
  return route;
}
export function botAimOffset(p: Soldier, tick: number, baseSpread: number) {
  const sample = (index: number) => {
    let seed =
      (Math.imul(index + 1, 374761393) + Math.imul(p.id + 1, 668265263)) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 13), 1274126177) >>> 0;
    const angle = (seed / 4294967296) * Math.PI * 2;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const radius = Math.sqrt(seed / 4294967296);
    return { yaw: Math.cos(angle) * radius, pitch: Math.sin(angle) * radius };
  };
  const time = (tick + p.id * 7) / 30;
  const index = Math.floor(time);
  const blend = smooth(time - index);
  const a = sample(index),
    b = sample(index + 1);
  const spread = baseSpread * (1 + 0.75 * p.aimBloom);
  return {
    yaw: (a.yaw + (b.yaw - a.yaw) * blend) * spread,
    pitch: (a.pitch + (b.pitch - a.pitch) * blend) * spread,
  };
}
// Per-soldier variation keeps attention breaks/reactions staggered without
// consuming the gameplay RNG or changing projectile randomness.
const botAttentionSample = awarenessSample;
function beginBotFocus(g: Game, p: Soldier) {
  const min = Math.max(1, g.botSettings.focusMinTicks),
    max = Math.max(min, g.botSettings.focusMaxTicks);
  p.focusUntil =
    g.botSettings.focusMaxTicks > 0
      ? g.tick +
        min +
        Math.floor(botAttentionSample(p, g.tick, 17) * (max - min + 1))
      : 0;
  g.emit({
    type: "botAttention",
    actor: p.id,
    target: p.target,
    phase: "acquired",
    until: p.focusUntil,
  });
}
function changeBotTarget(g: Game, p: Soldier, target: number) {
  if (p.target >= 0)
    g.emit({
      type: "botAttention",
      actor: p.id,
      target: p.target,
      phase: "lost",
      until: g.tick,
    });
  if (target >= 0) {
    const nextLook = p.awareness.nextLook;
    p.awareness = freshAwareness();
    p.awareness.nextLook = nextLook;
  } else p.awareness.visible = false;
  p.target = target;
  p.spottedAt = g.tick;
  p.focusUntil = 0;
  if (target >= 0) beginBotFocus(g, p);
}
const navigationSteps = new WeakMap<Soldier, { revision: number; point: Vec }>();
export function safeBotDestination(g: Game, p: Soldier): Vec | undefined {
  let dest: Vec | undefined = p.path[0];
  const revision = g.map.destruction?.revision ?? 0;
  const checked = navigationSteps.get(p);
  if (dest && (checked?.revision !== revision || checked.point !== dest)) {
    navigationSteps.set(p, { revision, point: dest });
    if (!walkSegment(p, dest, g.map)) {
      p.path = []; dest = undefined;
      p.nextThink = Math.min(p.nextThink, g.tick + 1 + p.id % 5);
    }
  }
  return dest;
}
export function botCommand(g: Game, p: Soldier): Command {
  if (!battlePerformance.enabled) return mortarBotCommand(g,p,emplacementBotCommand(g,p,chooseBotCommand(g,p)));
  const start = battlePerformance.begin();
  try { return mortarBotCommand(g,p,emplacementBotCommand(g,p,chooseBotCommand(g,p))); } finally { battlePerformance.end("bots",start); }
}
function chooseBotCommand(g: Game, p: Soldier): Command {
  const evasion = evadeArtillery(g, p);
  if (evasion) return evasion;
  const gasEscape = escapeGas(g, p);
  if (gasEscape) return gasEscape;
  const escape = collapseEscape(g, p);
  if (escape) return escape;
  const charge = chargeCommand(g, p);
  if (charge) return charge;
  const coverReaction = reactionCoverCommand(g, p);
  if (coverReaction) return coverReaction;
  const duck = suppressionCommand(g, p);
  if (duck) return braceCommand(g, p, duck);
  const c = idle();
  // Gas onto a tight knot of enemies, otherwise high explosive.
  c.gasStrike = botGasTarget(g, p) ?? undefined;
  if (!c.gasStrike) c.artillery = botArtilleryTarget(g, p) ?? undefined;
  c.flare = botFlareTarget(g, p) ?? undefined;
  c.reload =
    p.ammo < 1 ||
    (p.ammo < (p.weapon === "serviceRifle" ? 2 : 15) && p.target < 0);
  c.yaw = p.yaw;
  c.pitch = p.pitch;
  // A capture-the-flag order, or for the anti-tank kit an enemy tank to hunt
  // down (src/anti-tank.ts), outranks the firing step or the flag.
  const ctfRaid = ctfGoal(g, p), raid = ctfRaid ?? antiTankHunt(g, p);
  const station = raid ? undefined : firingPosition(g, p);
  if (g.tick >= p.nextThink && p.assaultId === null) {
    p.nextThink = g.tick + 30;
    const ordered = station || raid ? undefined : squadObjective(g, p);
    if (raid) {
      p.path = pathfind(p, raid, g.map, true, dangerCost(g, p.team));
      if (!p.path.length && dist(p, raid) > 1) {
        if (ctfRaid) ctfGoalUnroutable(g, p);
        else blockAntiTankHunt(g, p);
      }
    }
    else if (station) p.path = pathfind(p, station, g.map, true);
    else if (ordered !== undefined) {
      p.objective = ordered;
      if (usesVillageTactics(g.map))
        planVillageMove(g, p, (a, b) => pathfind(a, b, g.map, true, dangerCost(g, p.team)));
      else p.path = pathfind(p, g.sectors[p.objective], g.map, true, dangerCost(g, p.team));
    } else {
      const ranks = g.sectors.map((s, i) => ({
        i,
        open: objectiveOpen(g, i),
        weight:
          dist(p, s) +
          (s.owner === p.team ? 32 : 0) +
          (s.contested ? -10 : 0) +
          g.players.filter(
            (q) => q !== p && q.team === p.team && q.objective === i,
          ).length *
            14,
      }));
      ranks.sort((a, b) => Number(b.open) - Number(a.open) || a.weight - b.weight);
      const current = ranks.find((rank) => rank.i === p.objective)!;
      if (!current.open || ranks[0].weight + 12 < current.weight) p.objective = ranks[0].i;
      if (usesVillageTactics(g.map))
        planVillageMove(g, p, (a, b) => pathfind(a, b, g.map, true, dangerCost(g, p.team)));
      else p.path = pathfind(p, g.sectors[p.objective], g.map, true, dangerCost(g, p.team));
    }
  }
  const range = Math.min(projectileRange - 1, g.botSettings.engagementRange);
  if (
    p.target >= 0 &&
    p.focusUntil > 0 &&
    g.botSettings.focusMaxTicks > 0 &&
    g.tick >= p.focusUntil
  ) {
    const min = g.botSettings.distractionMinTicks,
      max = Math.max(min, g.botSettings.distractionMaxTicks);
    p.distractedUntil =
      g.tick +
      min +
      Math.floor(botAttentionSample(p, g.tick, 53) * (max - min + 1));
    g.emit({
      type: "botAttention",
      actor: p.id,
      target: p.target,
      phase: "distracted",
      until: p.distractedUntil,
    });
    p.distractedFrom = p.target;
    p.target = -1;
    p.spottedAt = g.tick;
    p.focusUntil = 0;
    p.awareness.confidence = 0;
    p.awareness.visible = false;
  }
  if (
    g.tick >= p.distractedUntil &&
    (g.botSettings.awareness
      ? g.tick >= p.awareness.nextLook
      : g.tick % 3 === p.id % 3)
  ) {
    p.awareness.nextLook = g.tick + 5 + (p.id % 5);
    const visible = (q: Soldier) =>
      q.team !== p.team &&
      q.hp > 0 &&
      (canNotice(g, p, q) || (!!g.tactics && audible(g, p, q))) &&
      // At night an unlit soldier is only seen close up (src/night.ts).
      dist(q, p) < Math.min(range, sightLimit(g, q)) &&
      !smokeBlocks(
        g,
        { x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z },
        { x: q.x, y: q.y + exposedAimHeight(g.map, q), z: q.z },
      ) &&
      g.collision.ray(
        { x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z },
        { x: q.x, y: q.y + exposedAimHeight(g.map, q), z: q.z },
      ) > 0.99;
    const existing = g.players.find((q) => q.id === p.target);
    const candidates = g.players.filter((q) => q.team !== p.team && q.hp > 0 && dist(q, p) < range);
    // With squad tactics, the most dangerous visible enemy among the nearest
    // few comes first; otherwise the nearest.
    const near = candidates.sort((a, b) => dist(a, p) - dist(b, p)).slice(0, 6);
    if (g.tactics) near.sort((a, b) => threatScore(g, p, a) - threatScore(g, p, b));
    const target = existing && visible(existing) ? existing : near.find(visible);
    if ((target?.id ?? -1) !== p.target)
      changeBotTarget(g, p, target?.id ?? -1);
    if (target) {
      observeTarget(g, p, target, target.y + exposedAimHeight(g.map, target));
      reportContact(g, p, target);
    } else listen(g, p);
  }
  let target = g.players.find((q) => q.id === p.target && q.hp > 0);
  if (target && p.focusUntil === 0 && g.botSettings.focusMaxTicks > 0)
    beginBotFocus(g, p);
  if (
    target &&
    (smokeBlocks(
      g,
      { x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z },
      {
        x: target.x,
        y: target.y + exposedAimHeight(g.map, target),
        z: target.z,
      },
    ) ||
      ((target.crouched ||
        (g.tick >= p.awareness.nextTrigger && g.tick >= p.nextShot)) &&
        g.collision.ray(
          { x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z },
          {
            x: target.x,
            y: target.y + exposedAimHeight(g.map, target),
            z: target.z,
          },
        ) < 0.99))
  ) {
    changeBotTarget(g, p, -1);
    target = undefined;
  }
  p.awareness.confidence = clamp(
    p.awareness.confidence + (target && p.awareness.visible ? 1 / 30 : -1 / 20),
    0,
    1,
  );
  if (startLoneCharge(g, p, target)) return chargeCommand(g, p) ?? c;
  if (botMeleeIntent(g, p, target, c)) return c;
  const objective = raid ?? station ?? p.villagePlan?.goal ?? g.sectors[p.objective];
  while (
    p.path.length &&
    (!g.map.buildings || Math.abs(p.y-(p.path[0].y ?? groundHeight(p.path[0].x,p.path[0].z,g.map)))<.24) &&
    dist(p, p.path[0]) < (station ? (p.path.length === 1 ? 0.15 : 0.6) : 1) &&
    (p.path.length === 1 || walkSegment(p, p.path[1], g.map))
  )
    p.path.shift();
  const dest = safeBotDestination(g, p);
  if (
    dest &&
    (dist(p, objective) > (p.villagePlan ? 0.8 : station ? 0.15 : raid ? 1 : 4) ||
      (usesVillageTactics(g.map) && !flagOccupant(g, p, g.sectors[p.objective])))
  ) {
    const d = dist(p, dest);
    c.x = (dest.x - p.x) / Math.max(0.1, d);
    c.z = (dest.z - p.z) / Math.max(0.1, d);
    c.sprint = !target;
    p.mode = "Navigate";
    if (g.tactics && !formUp(g, p, c) && !stackAtDoor(g, p, c) && !overwatchHold(g, p, c, !!target, (at) => villageCover(g, p, at, true)) && !target)
      checkCorners(g, p, c);
  } else {
    const flag =
      g.scoring === "domination"
        ? g.sectors.find((s) => flagOccupant(g, p, s))
        : undefined;
    p.mode = flag
      ? flag.contested
        ? "Contesting flag"
        : flag.owner === p.team
          ? "Defending flag"
          : "Capturing flag"
      : station
        ? "Firing step"
        : "Capture";
    if (station) c.yaw = p.team === "blue" ? Math.PI / 2 : -Math.PI / 2;
  }
  for (const q of g.players)
    if (
      (!p.villagePlan || q.team !== p.team) &&
      q !== p &&
      q.hp > 0 &&
      dist(p, q) < (station ? 0.75 : 1.4)
    ) {
      const d = Math.max(0.1, dist(p, q));
      c.x += ((p.x - q.x) / d) * 0.7;
      c.z += ((p.z - q.z) / d) * 0.7;
    }
  // A short lapse of attention mid-fight is not a cue to set off along the
  // route again: the enemy is still there, so keep the same footing on him.
  const lapsed = !target && !station && g.tick < p.distractedUntil
    ? g.players.find((q) => q.id === p.distractedFrom && q.hp > 0)
    : undefined;
  if (lapsed) {
    if (!p.villagePlan) {
      c.x *= 0.2;
      c.z *= 0.2;
      c.sprint = false;
    }
    respectTarget(p, lapsed, c, !!p.villagePlan);
  }
  if (target) {
    p.mode = "Engage";
    const d = dist(p, target);
    // A charger runs straight at you in the open: easier to lead and to hit.
    const exposed = charging(target);
    const error = botAimOffset(
      p,
      g.tick,
      (exposed ? chargeRules.chargerAim : 1) *
      g.botSettings.aimError *
        (p.weapon === "machineGun" ? 1.35 : 1) *
        (1 +
          p.suppression * 1.5 +
          (g.botSettings.awareness
            ? (1 - p.awareness.confidence) * 0.8 + Math.hypot(p.vx, p.vz) * 0.08
            : 0)),
    );
    const seen =
      g.botSettings.awareness && p.awareness.observed
        ? p.awareness.observed
        : {
            x: target.x,
            y: target.y + exposedAimHeight(g.map, target),
            z: target.z,
          };
    const velocity = g.botSettings.awareness
      ? p.awareness.velocity
      : { x: target.vx, z: target.vz };
    // Aim from delayed observations and estimated movement, not live target velocity.
    const rx = seen.x - p.x,
      rz = seen.z - p.z;
    const speed = weaponProfile(p).projectileSpeed;
    const a = velocity.x ** 2 + velocity.z ** 2 - speed ** 2;
    const b = 2 * (rx * velocity.x + rz * velocity.z);
    const lead = clamp(
      (-b - Math.sqrt(Math.max(0, b * b - 4 * a * d * d))) / (2 * a),
      0,
      projectileRange / speed,
    );
    const estimate = g.botSettings.awareness
      ? Math.min(0.7, lead) *
        (exposed ? chargeRules.chargerLead : 0.35 + awarenessSample(p, p.spottedAt, 337) * 0.35)
      : lead;
    const aimX = rx + velocity.x * estimate,
      aimZ = rz + velocity.z * estimate;
    const aimDistance = Math.hypot(aimX, aimZ);
    const aimYaw = Math.atan2(aimX, -aimZ);
    // Engagement commands use ADS, including the optional driver in slot zero.
    const eyeHeight = p.y + eyeHeightOf(p);
    c.yaw = aimYaw + error.yaw;
    c.pitch = Math.atan2(seen.y - eyeHeight, aimDistance) + error.pitch;
    if (g.botSettings.awareness) {
      c.yaw = turnToward(p.yaw, c.yaw, 0.075);
      c.pitch = p.pitch + clamp(c.pitch - p.pitch, -0.035, 0.035);
    }
    c.aim = true;
    c.sprint = false;
    c.fire =
      g.tick - p.spottedAt >=
        g.botSettings.reactionTicks +
          Math.floor(
            (g.botSettings.reactionTicks > 0
              ? g.botSettings.reactionJitterTicks + 1
              : 0) * botAttentionSample(p, p.spottedAt, 89),
          ) &&
      (g.botSettings.awareness
        ? g.botSettings.burstFireTicks > 0
        : g.tick % g.botSettings.burstPeriodTicks <
          g.botSettings.burstFireTicks) &&
      (!g.botSettings.awareness ||
        (p.awareness.confidence >= 0.75 &&
          Math.abs(angleDelta(c.yaw, aimYaw)) < 0.12));
    if (p.combatReaction && g.tick < p.combatReaction.pauseUntil) c.fire = false;
    if (c.fire) {
      c.fire = semiAutoIntent(g, p);
      if (c.fire && p.weapon === "machineGun" && botHoldsFire(p.barrel)) c.fire = false;
      if (c.fire && g.botSettings.awareness) {
        const scatter =
          maskedBotAim(p) *
          g.botSettings.aimError *
          (p.weapon === "machineGun" ? 0.9 : 0.65) *
          (1 + p.suppression);
        c.yaw += (awarenessSample(p, g.tick, 401) * 2 - 1) * scatter;
        c.pitch += (awarenessSample(p, g.tick, 409) * 2 - 1) * scatter;
      }
    }
    const advance =
      p.villagePlan && dist(p, p.villagePlan.goal) > 1.4 ? 0.75 : 0.2;
    c.x *= advance;
    c.z *= advance;
    // Don't creep on along the route past (or away from) the man being shot at.
    if (!station) respectTarget(p, target, c, !!p.villagePlan);
    if (!station && !p.villagePlan && g.tick % 90 < 30) {
      c.x += Math.cos(c.yaw) * 0.5;
      c.z += Math.sin(c.yaw) * 0.5;
      p.mode = "Reposition";
    }
  } else if (Math.hypot(c.x, c.z) > 0.1) c.yaw = Math.atan2(c.x, -c.z);
  if (
    !target &&
    g.botSettings.awareness &&
    p.awareness.observed &&
    g.tick - p.awareness.seenAt < 60
  ) {
    const seen = p.awareness.observed;
    c.yaw = turnToward(
      p.yaw,
      Math.atan2(seen.x - p.x, p.z - seen.z) +
        Math.sin((g.tick + p.id) * 0.08) * 0.25,
      0.04,
    );
    p.mode = "Searching";
  }
  if (!target && g.tactics && !station && g.tick >= p.distractedUntil) {
    // A heard enemy, or one a squadmate saw, draws the eyes; gunners and
    // some riflemen fire at a position they can no longer see.
    const sound = heard(g, p), contact = squadContact(g, p);
    if (!suppressiveFire(g, p, c) && p.mode !== "Searching") {
      // Moving soldiers watch their way ahead; a close sound still turns them.
      const holding = Math.hypot(c.x, c.z) < 0.1;
      const toward = sound && (holding || dist(p, sound) < 15) ? sound : holding ? contact : null;
      if (toward && squadFeatures.attention && dist(p, toward) < 60) {
        c.yaw = turnToward(p.yaw, Math.atan2(toward.x - p.x, p.z - toward.z), 0.05);
        p.mode = sound ? "Listening" : "Watching contact";
      }
    }
    if (grenadeCommand(g, p, c)) return braceCommand(g, p, c);
  }
  if (g.tactics) reloadCallout(g, p, c);
  if (g.tick < p.distractedUntil) p.mode = "Scanning";
  if (
    g.map.terrain &&
    !station &&
    !p.mantle &&
    !p.hop &&
    !p.fall &&
    g.tick >= p.nextMantle &&
    Math.abs(p.x) < 34 &&
    g.tick % 6 === p.id % 6
  ) {
    const landing = mantleLanding(p, c, g.map);
    c.mantle = !!landing && dist(landing, objective) + 0.3 < dist(p, objective);
  }
  if (usesVillageTactics(g.map)) {
    villageSteering(g, p, c, target ? dist(p, target) : Infinity);
    screenCrossing(g, p, c, objective);
  }
  // The anti-tank kit turns on an enemy tank in sight (src/anti-tank.ts).
  antiTankBotAim(g, p, c, target);
  return braceCommand(g, p, assaultCommand(g, p, ctfBotCommand(g, p, c)));
}
