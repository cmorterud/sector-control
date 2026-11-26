import { keyLabel, type ControlAction, type ControlSettings } from "./controls";

// The controls strip along the bottom of the HUD. Controls that only work in
// the player's current situation (their kit, a mounted gun, a tank, a gas
// cloud) come first and are marked `context`, so they can be drawn bold.
export interface ControlHint { text: string; context?: boolean }
export type HintSituation =
  | { kind: "foot"; scoped?: boolean; antiTank?: boolean; flame?: boolean; emplacement?: "carry" | "placed" | "preview"; gas?: boolean }
  | { kind: "gun" }
  | { kind: "tank" };

export function controlHints(settings: Pick<ControlSettings, "bindings">, s: HintSituation = { kind: "foot" }): ControlHint[] {
  const key = (action: ControlAction) => keyLabel(settings.bindings[action]);
  const move = `${key("forward")}${key("left")}${key("backward")}${key("right")}`;
  const special = (text: string): ControlHint => ({ text, context: true });
  const plain = (text: string): ControlHint => ({ text });
  if (s.kind === "tank") return [
    special(`${move} DRIVE`), special("LMB MACHINE GUNS"), special("RMB MAIN GUN"), special(`${key("interact")} CLIMB OUT`),
    plain(`${key("tactical")} TACTICAL MAP`),
  ];
  if (s.kind === "gun") return [
    special("LMB FIRE"), special(`${key("reload")} RELOAD`), special(`${key("interact")} DISMOUNT`),
  ];
  const context: ControlHint[] = [];
  if (s.gas) context.push(special(`${key("mask")} GAS MASK`));
  if (s.emplacement === "preview") context.push(special("LMB SET UP GUN"), special(`${key("emplace")} CANCEL`));
  else if (s.emplacement === "carry") context.push(special(`${key("emplace")} SET UP MACHINE GUN`));
  else if (s.emplacement === "placed") context.push(special(`${key("emplace")} PACK UP GUN`));
  // Kit-specific versions of the two mouse buttons replace the general ones.
  const aim = s.scoped ? special("RMB SCOPE 4×") : plain("RMB AIM");
  const fire = s.flame ? special("LMB FLAME") : s.antiTank ? special("LMB FIRE AP ROUND") : plain("LMB FIRE");
  return [
    ...context,
    plain(`${move} MOVE`), plain(`${key("sprint")} SPRINT`), aim, fire,
    plain(`${key("reload")} RELOAD`), plain(`${key("melee")} MELEE`), plain(`${key("sprint")} + ${key("melee")} BAYONET CHARGE`), plain(`${key("whistle")} WHISTLE`),
    plain(`${key("grenade")} GRENADE`), plain(`${key("smoke")} SMOKE`),
    plain(`${key("crouch")} CROUCH`), plain(`${key("mantle")} HOP / MANTLE`), plain(`${key("view")} CHANGE VIEW`),
    plain(`${key("primary")} / ${key("sidearm")} WEAPONS`), plain(`${key("interact")} INTERACT`), plain(`${key("tactical")} TACTICAL MAP`),
  ];
}
