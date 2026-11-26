import type { CharacterShape } from "./character-geometry";

// Period field kit for the three national armies, as parts in a soldier's
// upper-body or hip space (metres; -z is the soldier's front). Each list is
// merged into the soldier's one torso mesh or its hip batch, so a pouch costs
// triangles but never a draw call.
export type KitFaction = "british" | "german" | "french";
export type KitPart = {
  name: string;
  at: [number, number, number];
  size: [number, number, number];
  tint: string;
  shape: CharacterShape;
  rotation?: [number, number, number];
  parent?: "upper" | "hips";
  // Below a pixel or two beyond the far-detail distance; left out of the far mesh.
  small?: boolean;
};

export const kitFactions: readonly KitFaction[] = ["british", "german", "french"];
export const isKitFaction = (faction?: string): faction is KitFaction =>
  faction === "british" || faction === "german" || faction === "french";

// Four faces per army: skin tone, hair colour and moustache. Picked from the
// soldier's id, so a squad is not one face repeated.
export const soldierLooks = [
  { skin: "#bba185", hair: "#4a3a2a", moustache: "none" },
  { skin: "#c6aa8c", hair: "#5e4a33", moustache: "clipped" },
  { skin: "#ad9073", hair: "#2e261e", moustache: "full" },
  { skin: "#b89b7c", hair: "#6f5a42", moustache: "none" },
] as const;
export const soldierLookFor = (id: number) => {
  const n = Math.sin((id + 1) * 91.7 + 17.3) * 43758.5453;
  return Math.floor((n - Math.floor(n)) * soldierLooks.length);
};

const webbing = { british: "#8d8466", german: "#4b4136", french: "#5a4a37" };
const brass = "#7d7556";
// A point on the front of the torso at height-independent width x, standing
// `lift` off the cloth, with the yaw that turns a part's face along the curve.
function front(x: number, lift: number, rx = .29, rz = .175) {
  const u = Math.min(.97, Math.abs(x) / rx), surface = rz * Math.sqrt(1 - u * u);
  const yaw = -Math.atan2(x / (rx * rx), surface / (rz * rz)) * 180 / Math.PI;
  return { z: -(surface + lift), yaw };
}
function sideStrap(name: string, from: [number, number, number], to: [number, number, number], width: number, tint: string): KitPart {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  // Roll in the xy plane, then pitch toward the body's curve.
  const roll = Math.atan2(-dx, dy) * 180 / Math.PI, pitch = Math.atan2(dz, Math.hypot(dx, dy)) * 180 / Math.PI;
  return { name, at: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], size: [width, length, .016], tint, shape: "limb", rotation: [pitch, 0, roll] };
}

export function faceParts(look: number): KitPart[] {
  const { skin, hair, moustache } = soldierLooks[look % soldierLooks.length];
  const parts: KitPart[] = [
    { name: "nose", at: [0, .662, -.138], size: [.04 + (look % 2) * .008, .07, .052], tint: skin, shape: "soft", rotation: [-8, 0, 0], small: true },
  ];
  for (const side of [-1, 1])
    parts.push({ name: "brow", at: [side * .054, .724, -.13], size: [.062, .017, .022], tint: hair, shape: "limb", rotation: [0, side * 12, side * 8], small: true });
  if (moustache === "clipped")
    parts.push({ name: "moustache", at: [0, .617, -.142], size: [.058, .019, .024], tint: hair, shape: "pouch", small: true });
  if (moustache === "full") {
    parts.push({ name: "moustache", at: [0, .616, -.14], size: [.112, .028, .034], tint: hair, shape: "pouch", small: true });
    for (const side of [-1, 1])
      parts.push({ name: "moustache end", at: [side * .052, .602, -.133], size: [.026, .03, .024], tint: hair, shape: "soft", rotation: [0, 0, side * 25], small: true });
  }
  return parts;
}

// The national kit, on top of the shared tunic, belt, braces and pack.
export function factionKit(faction: KitFaction, shirt: string, helmet: string): KitPart[] {
  const parts: KitPart[] = [], strap = webbing[faction];
  const pouch = (name: string, x: number, y: number, w: number, h: number, d: number, tint: string, lift = .03) => {
    const { z, yaw } = front(x, lift + d / 2);
    parts.push({ name, at: [x, y, z], size: [w, h, d], tint, shape: "pouch", rotation: [0, yaw, 0] });
    parts.push({ name: "pouch flap", at: [x, y + h * .36, z - d * .5], size: [w * 1.04, h * .3, .012], tint, shape: "pouch", rotation: [0, yaw, 0], small: true });
  };
  if (faction === "british") {
    // 1908 web equipment: five pockets a side in two tiers on the chest.
    for (const side of [-1, 1]) {
      for (const x of [.065, .13, .195]) pouch("ammunition pouch", side * x, .12, .062, .11, .07, strap);
      for (const x of [.095, .165]) pouch("ammunition pouch", side * x, .235, .066, .1, .062, strap);
      parts.push({ name: "breast pocket", at: [side * .12, .4, front(.12, .008).z], size: [.11, .04, .016], tint: shirt, shape: "pouch", rotation: [0, front(side * .12, 0).yaw, 0], small: true });
    }
    // The Brodie: a shallow bowl on a broad flat brim.
    parts.push({ name: "helmet brim", at: [0, .748, -.008], size: [.5, .022, .53], tint: helmet, shape: "disc" });
    parts.push({ name: "helmet rim", at: [0, .752, -.008], size: [.505, .012, .535], tint: "#4f513f", shape: "disc", small: true });
    parts.push({ name: "water bottle", at: [.255, -.02, .07], size: [.085, .17, .075], tint: "#6c6650", shape: "limb" });
    parts.push({ name: "spade carrier", at: [0, -.03, .2], size: [.19, .13, .06], tint: strap, shape: "pouch" });
    parts.push({ name: "spade helve", at: [-.245, -.06, .1], size: [.032, .34, .032], tint: "#6e5338", shape: "limb", rotation: [-14, 0, 0] });
    parts.push({ name: "bayonet scabbard", at: [-.235, -.13, .02], size: [.034, .42, .022], tint: "#3b3428", shape: "limb", rotation: [-18, 0, 4] });
  }
  if (faction === "german") {
    // M1909 belt pouches, three a side, on Y-straps.
    for (const side of [-1, 1])
      for (const x of [.085, .15, .215]) pouch("ammunition pouch", side * x, .075, .062, .105, .078, "#4f4436");
    for (const side of [-1, 1])
      parts.push({ name: "helmet lug", at: [side * .197, .835, -.03], size: [.034, .016, .034], tint: helmet, shape: "disc", rotation: [0, 0, 90], small: true });
    // Fluted gas mask canister on its sling across the chest.
    parts.push({ name: "gas mask canister", at: [-.235, .14, -.07], size: [.098, .16, .098], tint: "#59604f", shape: "limb", rotation: [0, 0, -6] });
    parts.push({ name: "gas mask canister lid", at: [-.239, .225, -.07], size: [.104, .02, .104], tint: "#4b5143", shape: "disc", rotation: [0, 0, -6], small: true });
    parts.push(sideStrap("gas mask sling", [.15, .47, -.15], [-.215, .23, -.115], .022, "#5d5546"));
    parts.push({ name: "bread bag", at: [.235, -.05, .09], size: [.1, .19, .2], tint: "#6f6852", shape: "pouch" });
    parts.push({ name: "canteen", at: [.29, -.05, .14], size: [.07, .16, .11], tint: "#5d4e3b", shape: "pouch" });
    parts.push({ name: "spade blade", at: [-.2, -.09, .15], size: [.04, .17, .14], tint: "#3d352a", shape: "pouch", rotation: [-8, 0, 0] });
    parts.push({ name: "spade haft", at: [-.2, .07, .15], size: [.03, .2, .03], tint: "#6e5338", shape: "limb", rotation: [-8, 0, 0] });
    parts.push({ name: "bayonet scabbard", at: [-.25, -.12, .0], size: [.034, .38, .022], tint: "#2f2b25", shape: "limb", rotation: [-16, 0, 4] });
  }
  if (faction === "french") {
    // Three Lebel pouches: two in front, one behind.
    for (const side of [-1, 1]) pouch("ammunition pouch", side * .14, .075, .12, .12, .085, "#5f4c37");
    parts.push({ name: "back ammunition pouch", at: [0, .03, .21], size: [.13, .11, .075], tint: "#5f4c37", shape: "pouch" });
    // Musette and round bidon, their slings crossing on the chest.
    parts.push({ name: "musette bag", at: [-.245, -.05, .07], size: [.09, .2, .22], tint: "#7a7258", shape: "pouch" });
    parts.push({ name: "canteen", at: [.265, -.03, .06], size: [.19, .07, .19], tint: "#5b5444", shape: "disc", rotation: [0, 0, 90] });
    parts.push(sideStrap("musette sling", [.16, .47, -.145], [-.235, .06, -.1], .026, "#6d664f"));
    parts.push(sideStrap("canteen sling", [-.16, .47, -.145], [.25, .07, -.1], .022, "#4c4232"));
    // Double-breasted greatcoat: the second row of buttons.
    for (let i = 0; i < 5; i++)
      parts.push({ name: "coat button", at: [-.07, .09 + i * .073, front(-.07, .002).z], size: [.017, .017, .009], tint: "#515345", shape: "disc", rotation: [90, 0, 0], small: true });
    parts.push({ name: "bayonet scabbard", at: [-.23, -.16, .03], size: [.03, .5, .02], tint: "#2f2f2a", shape: "limb", rotation: [-16, 0, 4] });
    // The skirts buttoned back for marching, showing the lighter lining.
    for (const side of [-1, 1])
      parts.push({ name: "turned coat tail", at: [side * .2, -.02, -.07], size: [.12, .16, .03], tint: "#7d97a3", shape: "pouch", rotation: [4, side * -55, side * -8], parent: "hips" });
  }
  return parts;
}

// First person only: the cuffs and wrists of your own arms, which fill the
// bottom of the screen. y is measured up the forearm from the wrist.
export function viewCuffParts(faction: KitFaction, shirt: string, skin: string): KitPart[] {
  const cuff = {
    // Field-grey Brandenburg cuff, a shade darker than the sleeve.
    german: { at: .046, size: [.164, .08, .184], tint: "#56665c", rotation: [0, 0, 0] },
    // Horizon blue, cut at a slant.
    french: { at: .04, size: [.162, .06, .182], tint: "#7d96a3", rotation: [0, 0, 9] },
    // Plain khaki band.
    british: { at: .044, size: [.16, .05, .18], tint: "#6c6749", rotation: [0, 0, 0] },
  }[faction];
  return [
    { name: "wrist", at: [0, .004, 0], size: [.074, .07, .068], tint: skin, shape: "limb" },
    { name: "turned cuff", at: [0, cuff.at, 0], size: cuff.size as [number, number, number], tint: cuff.tint, shape: "pouch", rotation: cuff.rotation as [number, number, number] },
    { name: "cuff seam", at: [0, cuff.at + cuff.size[1] / 2, 0], size: [cuff.size[0] * 1.01, .008, cuff.size[2] * 1.01], tint: shirt, shape: "disc", rotation: cuff.rotation as [number, number, number] },
  ];
}
