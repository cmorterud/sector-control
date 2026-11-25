// Tests that call fire() or botCommand() directly, without stepping a raise,
// put the sights up first: a round fired from the hip wanders (src/hip-fire.ts)
// and bots hold fire until the sights are up.
import type { Soldier } from "./simulation";
export function raiseSights(p: Pick<Soldier, "aimMotion" | "command">) {
  p.aimMotion = { tick: -1e9, from: 1, to: 1, duration: 6 };
  p.command = { ...p.command, aim: true };
}
