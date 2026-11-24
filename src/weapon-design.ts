import type { RiflePart, RifleShape } from "./rifle-geometry";
import type { WeaponKind } from "./weapons";

type V = [number, number, number];
export type ReloadStyle = "clip" | "tube" | "pan" | "belt" | "crescent" | "box" | "revolver";
export interface WeaponDesign {
  family: string;
  kind: WeaponKind;
  parts: RiflePart[];
  actionParts: RiflePart[];
  viewParts?: RiflePart[];
  magazine: RiflePart;
  reload: ReloadStyle;
  muzzle: number;
  front: number;
  rear: number;
  feed: V;
  grip: V;
  actionOrigin: V;
  boltGrip: V;
  lift: number;
  travel: number;
  soundPitch: number;
  trigger?: V;
}
const part = (name: string, shape: RifleShape, at: V, size: V, tint = "steel", rotation?: V): RiflePart =>
  ({ name, shape, at, size, tint, ...(rotation ? { rotation } : {}) });
const round = (name: string, at: V, size: V, tint = "steel") => part(name, name.includes("barrel") || name === "Ruby muzzle" || name === "Lewis cooling shroud" ? "barrel" : "shroud", at, size, tint, [90, 0, 0]);
const box = (name: string, at: V, size: V, tint = "steel") => part(name, "slot", at, size, tint);
const stock = (length: number, width = .105, height = .17, z = .04) =>
  part("wooden stock", "stock", [0, -.045, z], [width, length, height], "walnut", [90, 0, 0]);
const guard = () => part("open trigger guard", "guard", [0, -.105, .18], [.012, .09, .14]);
// A band hugs the wood and metal it wraps, a few millimetres proud of them. Each
// piece is [width, bottom, top]: one around the stock or fore-end, and where the
// barrel or handguard rides above the wood, a second around that.
type BandPiece = [number, number, number];
const band = (z: number, pieces: BandPiece[]) => pieces.map(([width, bottom, top]) =>
  round("barrel band", [0, (bottom + top) / 2, z], [width, .025, top - bottom]));
// `swivel` is the underside of the stock where the front sling swivel hangs.
const furniture: Record<string, { rear: [number, BandPiece[]]; front: [number, BandPiece[]]; swivel: number }> = {
  smle: { rear: [-.56, [[.095, -.08, .045]]], front: [-.32, [[.088, -.0775, .0055], [.085, 0, .05]]], swivel: -.0722 },
  gewehr: { rear: [-.42, [[.075, -.074, .007], [.05, .003, .0455]]], front: [-.55, [[.04, .005, .045]]], swivel: -.0728 },
  berthier: { rear: [-.42, [[.06, -.069, .005], [.05, .003, .0455]]], front: [-.55, [[.08, -.0675, .0475]]], swivel: -.0672 },
  lebel: { rear: [-.42, [[.072, -.0792, .0144], [.05, .003, .0455]]], front: [-.55, [[.065, -.0675, .004], [.04, .002, .045]]], swivel: -.0778 },
};
// The bayonet is fixed at the muzzle: the blade runs forward tucked beneath the
// barrel, and its guard covers the blade's root and reaches up to ring the barrel.
export function bayonetMount(muzzle: number): { blade: { at: V; size: V }; guard: { at: V; size: V } } {
  return {
    blade: { at: [0, -.012, muzzle - .12], size: [.025, .3, .03] },
    guard: { at: [0, .0035, muzzle + .03], size: [.03, .083, .014] },
  };
}
const rifleAction = (straight: boolean, knob: V): RiflePart[] => [
  round("bolt body", [-.05, .005, .02], [.052, .24, .052]),
  part("bolt handle", "steel", [.015, 0, 0], [.018, .075, .018], "steel", [0, 0, -90]),
  ...(!straight ? [part("bolt handle bend", "shroud", [.075, -.028, 0], [.016, .07, .016], "steel", [0, 0, -140])] : []),
  part("bolt knob", "knob", knob, [.041, .041, .041]),
  round("cocking piece", [-.05, .005, .15], [.06, .075, .06]),
];
// A carbine is its rifle with 18 cm off the barrel and no cleaning rod under it.
function rifle(family: string, carbine = false): WeaponDesign {
  const smle = family === "smle", berthier = family === "berthier", lebel = family === "lebel";
  const muzzle = (smle ? -.7 : berthier ? -.79 : lebel ? -.8 : -.78) + (carbine ? .18 : 0);
  const grip: V = smle ? [.105, -.055, 0] : [.115, 0, 0];
  const receiver = round("receiver", [0, .025, .055], [smle ? .075 : .068, .29, .075]);
  const fit = furniture[family], rearBand = band(...fit.rear), frontBand = band(...fit.front);
  const parts: RiflePart[] = [
    stock(smle ? .94 : lebel ? 1.02 : 1, smle ? .11 : .095, lebel ? .19 : .165),
    receiver,
    round("barrel", [0, .025, (muzzle + .03) / 2], [.035, Math.abs(muzzle - .03), .035]),
    part("upper handguard", "handguard", [0, .025, smle ? -.3 : -.23], [smle ? .08 : .065, smle ? .49 : .37, .045], "walnut", [90, 0, 0]),
    guard(), ...rearBand, ...frontBand,
    box("ejection port", [.029, .058, .035], [.018, .018, .15], "dark"),
    ...(carbine ? [] : [round("cleaning rod", [0, -.035, -.53], [.007, .36, .007])]),
    // The top of the loop is sunk 3 mm into the underside of the stock.
    part("sling swivel", "sling", [0, fit.swivel - .012, -.38], [.009, .03, .05]),
    part("buttplate", "buttplate", [0, -.09, .54], [.1, .015, .17], "steel", [90, 0, 0]),
  ];
  if (smle) {
    parts.push(round("SMLE full wooden fore-end", [0, -.02, -.51], [.09, .21, .115], "walnut"));
    parts.push(round("SMLE full nose cap", [0, .005, -.61], [.106, .1, .14]));
    for (const side of [-1, 1]) parts.push(box("SMLE protective sight wing", [side * .026, .095, -.65], [.012, .08, .055]));
    parts.push(box("SMLE charger bridge", [0, .08, .035], [.082, .025, .045]));
  } else if (lebel) {
    parts.push(round("Lebel tubular magazine", [0, -.035, -.34], [.06, .65, .06], "walnut"));
    parts.push(box("Lebel side loading gate", [-.039, .012, -.015], [.008, .055, .09], "dark"));
  } else if (berthier) {
    parts.push(box("Berthier charger guide", [0, .066, .07], [.065, .028, .04]));
    // The nose ferrule closes over the tip of the stock and the barrel above it.
    parts.push(round("Berthier long nose ferrule", [0, -.01, -.5175], [.075, .105, .11]));
  } else {
    parts.push(part("Gewehr Lange sight ramp", "handguard", [0, .067, -.16], [.055, .16, .047], "steel", [90, 0, 0]));
    parts.push(box("Gewehr straight bolt stop", [-.047, .038, .12], [.018, .045, .055]));
  }
  const upgraded = berthier || family === "gewehr";
  const sightLeaf = box("rear sight leaf seat", [0, .054, -.172], [.048, .034, .14]);
  if (upgraded) {
    const furniture = parts[0];
    furniture.shape = berthier ? "berthierStock" : "gewehrStock";
    furniture.size = [berthier ? .091 : .102, berthier ? 1.03 : 1.01, berthier ? .17 : .18];
    // The rails are machined into the receiver. Their inner edges stay inside
    // its curved side through the full length of each rail, including during reloads.
    const railX = receiver.size[0] * .36;
    parts.push(box("receiver left rail", [-railX, .052, .025], [.017, .015, .18], "edge"));
    parts.push(box("receiver right rail", [railX, .052, .025], [.017, .015, .18]));
    parts.push(sightLeaf);
    parts.push(part("rear sling loop", "sling", [.034, -.105, .38], [.009, .04, .055]));
    parts.push(box("recessed stock channel", [-furniture.size[0] * .30, -.021, -.13], [.010, .012, .24], "dark"));
    parts.push(box("stock wrist transition", [0, -.05, .24], [.067, .07, .11], "walnut"));
  }
  const viewParts: RiflePart[] = !upgraded ? [] : [
    ...[-.1, .31].flatMap(z => {
      const x = parts[0].size[0] * (z < 0 ? .33 : .27);
      return [
        part("flush stock screw", "screw", [x, -.048, z], [.018, .009, .018], "edge", [0, 0, 90]),
        box("engraved screw slot", [x + .004, -.048, z], [.001, .003, .012], "dark"),
      ];
    }),
    box("receiver proof stamp", [-.033, .031, .035], [.003, .008, .025], "dark"),
    ...Array.from({ length: 5 }, (_, i) => box("sight graduation",
      [-sightLeaf.size[0] / 2, .064, sightLeaf.at[2] + (i - 2) * .014], [.002, .005, .003], "edge")),
    part("rear sling washer", "band", [parts[0].size[0] * .40, -.09, .4], [.027, .010, .027], "steel", [0, 0, 90]),
    box("barrel band spring", [-frontBand[0].size[0] * .43, frontBand[0].at[1], frontBand[0].at[2] + .014], [.011, .022, .045]),
  ];
  return {
    family: carbine ? `${family}Carbine` : family, kind: "serviceRifle", parts, viewParts, actionParts: rifleAction(!smle, grip),
    magazine: box("weapon magazine", [0, smle ? -.115 : berthier ? -.12 : -.08, .09], [smle ? .09 : .067, smle ? .13 : berthier ? .15 : .025, smle ? .18 : .13]),
    reload: lebel ? "tube" : "clip", muzzle, front: muzzle + .055, rear: smle ? -.17 : -.13,
    feed: lebel ? [-.045, .09, -.015] : [.015, .15, .035], grip: [-.035, -.06, -.17],
    actionOrigin: [.05, .045, .13], boltGrip: grip, lift: smle ? 55 : 75, travel: smle ? .1 : .14,
    soundPitch: (smle ? 1.12 : berthier ? 1.03 : lebel ? .9 : .97) + (carbine ? .05 : 0),
  };
}
function support(family: string): WeaponDesign {
  const lewis = family === "lewis", chauchat = family === "chauchat";
  const parts: RiflePart[] = [stock(.46, .115, .18, .22), guard(),
    round("barrel", [0, .025, -.39], [.035, .82, .035]),
    box("receiver", [0, .018, -.02], [lewis ? .1 : .14, .13, lewis ? .28 : .35]),
  ];
  if (lewis) {
    parts.push(round("Lewis cooling shroud", [0, .02, -.49], [.145, .56, .145]));
    for (let i = 0; i < 12; i++) parts.push(round("Lewis radiator ring", [0, .02, -.25 - i * .035], [.154, .007, .154]));
    parts.push(box("Lewis pan spindle", [0, .112, -.055], [.025, .065, .025]));
  } else if (chauchat) {
    parts.push(round("Chauchat perforated jacket", [0, .025, -.44], [.09, .62, .09]));
    for (const side of [-1, 1]) for (let i = 0; i < 7; i++)
      parts.push(box("Chauchat cooling slot", [side * .044, .025, -.22 - i * .07], [.006, .035, .04], "dark"));
    parts.push(box("Chauchat forward grip", [0, -.14, -.27], [.065, .2, .085], "walnut"));
    parts.push(box("Chauchat pistol grip", [0, -.12, .16], [.075, .18, .08], "walnut"));
  } else {
    parts.push(round("MG08 water jacket", [0, .025, -.44], [.18, .58, .18]));
    parts.push(box("MG08 squared breech", [0, .07, -.02], [.17, .16, .34]));
    parts.push(round("MG08 muzzle booster", [0, .025, -.75], [.07, .1, .07]));
    parts.push(box("MG08 pistol grip", [0, -.125, .17], [.075, .19, .085], "walnut"));
    parts.push(round("water filler cap", [.025, .13, -.24], [.035, .04, .035], "edge"));
  }
  for (const side of [-1, 1]) parts.push(part("folded bipod", "steel", [side * .06, -.065, -.45], [.025, .36, .025], "steel", [88, 0, side * 5]));
  return {
    family, kind: "machineGun", parts,
    actionParts: [box("charging handle", [.07, 0, 0], [.065, .025, .04]), ...(family === "mg08" ? [box("hinged feed cover", [-.05, .075, -.13], [.17, .035, .26])] : [])],
    magazine: lewis ? part("weapon magazine", "band", [0, .14, -.055], [.34, .065, .34])
      : chauchat ? part("weapon magazine", "crescent", [0, -.19, -.06], [.045, .55, .36])
        : box("weapon magazine", [.19, .025, -.07], [.27, .045, .1], "walnut"),
    reload: lewis ? "pan" : chauchat ? "crescent" : "belt", muzzle: -.8, front: -.73, rear: .09,
    feed: lewis ? [0, .2, -.055] : chauchat ? [0, -.16, -.06] : [.16, .075, -.07],
    grip: chauchat ? [-.025, -.18, -.27] : [-.035, -.07, -.2],
    actionOrigin: [.05, .045, .13], boltGrip: [.07, 0, 0], lift: 0, travel: .08,
    soundPitch: lewis ? 1.13 : chauchat ? .79 : .92,
  };
}
function pistol(family: string): WeaponDesign {
  const webley = family === "webley", luger = family === "luger";
  const origin: V = webley ? [0, -.035, -.065] : [0, .045, .025];
  const parts = [part("pistol grip", "handguard", [0, -.085, .09], [.078, .19, .1], "walnut", [luger ? -28 : -12, 0, 0]),
    part("open trigger guard", "guard", [0, -.065, -.015], [.01, .075, .12]),
    box("pistol frame", [0, -.005, .025], [.075, .07, .18]),
  ];
  const absoluteAction: RiflePart[] = [];
  if (webley) {
    absoluteAction.push(round("Webley heavy barrel", [0, .025, -.225], [.05, .31, .05]));
    absoluteAction.push(box("Webley top strap", [0, .082, -.015], [.055, .025, .16]));
    parts.push(box("Webley stirrup latch", [0, .09, .095], [.08, .03, .045]));
    parts.push(box("Webley hammer", [0, .085, .15], [.025, .065, .025]));
  } else if (luger) {
    parts.push(round("P08 slender barrel", [0, .025, -.225], [.033, .31, .033]));
    absoluteAction.push(box("Luger toggle rear link", [0, .035, .035], [.052, .027, .085]));
    absoluteAction.push(box("Luger toggle front link", [0, .035, -.045], [.052, .027, .085]));
    for (const side of [-1, 1]) absoluteAction.push(part("knurled toggle knob", "knob", [side * .04, .035, .04], [.028, .036, .036], "edge"));
  } else {
    absoluteAction.push(box("Ruby slide", [0, .034, -.07], [.077, .078, .31]));
    parts.push(round("Ruby muzzle", [0, .025, -.19], [.027, .12, .027]));
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) absoluteAction.push(box("Ruby slide serration", [side * .039, .04, .045 - i * .012], [.003, .04, .004], "edge"));
  }
  const magazine = webley ? round("weapon magazine", [0, .023, .025], [.103, .12, .103])
    : box("weapon magazine", [0, -.1, .09], [.057, .15, .075]);
  return {
    family, kind: "pistol", parts, actionParts: absoluteAction.map(p => ({...p, at: p.at.map((v,i)=>v-origin[i]) as V})), magazine,
    reload: webley ? "revolver" : "box", muzzle: webley || luger ? -.38 : -.25, front: webley || luger ? -.345 : -.225, rear: .085,
    feed: webley ? [.035, .04, .025] : [0, -.18, .09], grip: [-.035, -.075, .08],
    actionOrigin: origin, boltGrip: [0, 0, 0], lift: 0, travel: .035, soundPitch: webley ? .83 : luger ? 1.18 : 1.3, trigger: [0,-.045,.07],
  };
}
const designs = {
  smle: rifle("smle"), gewehr: rifle("gewehr"), berthier: rifle("berthier"), lebel: rifle("lebel"),
  gewehrCarbine: rifle("gewehr", true), berthierCarbine: rifle("berthier", true),
  lewis: support("lewis"), mg08: support("mg08"), chauchat: support("chauchat"),
  webley: pistol("webley"), luger: pistol("luger"), ruby: pistol("ruby"),
};
const ids: Record<string, keyof typeof designs> = {
  "SMLE Mk III":"smle", "Scoped SMLE":"smle", "Gewehr 98":"gewehr", "Scoped Gewehr 98":"gewehr",
  "Karabiner 98AZ":"gewehrCarbine", "Berthier Mle 1892 M16":"berthierCarbine",
  "Berthier Mle 1916":"berthier", "Scoped Lebel":"lebel", "Lewis Mk I":"lewis", "MG 08/15":"mg08", "Chauchat":"chauchat",
  "Webley Mk VI":"webley", "P08":"luger", "P08 Luger":"luger", "Ruby":"ruby",
};
export function weaponDesign(p: {weapon: WeaponKind; weaponId?: string}): WeaponDesign | undefined {
  const key = p.weaponId && ids[p.weaponId], design = key ? designs[key] : undefined;
  return design?.kind === p.weapon ? design : undefined;
}
