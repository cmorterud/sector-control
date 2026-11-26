import { describe, expect, it } from "vitest";
import { controlHints } from "./control-hints";
import { freshControls } from "./controls";

const bold = (hints: ReturnType<typeof controlHints>) => hints.filter(h => h.context).map(h => h.text);

describe("control hints", () => {
  const settings = freshControls();
  it("marks nothing as special for a plain rifleman", () => {
    const hints = controlHints(settings);
    expect(bold(hints)).toEqual([]);
    expect(hints.map(h => h.text)).toContain("RMB AIM");
  });
  it("leads with the emplacement kit's key and swaps the mouse buttons for kit versions", () => {
    expect(bold(controlHints(settings, { kind: "foot", emplacement: "carry" }))[0]).toBe("B SET UP MACHINE GUN");
    expect(bold(controlHints(settings, { kind: "foot", emplacement: "placed" }))).toEqual(["B PACK UP GUN"]);
    expect(bold(controlHints(settings, { kind: "foot", scoped: true }))).toEqual(["RMB SCOPE 4×"]);
    expect(bold(controlHints(settings, { kind: "foot", antiTank: true }))).toEqual(["LMB FIRE AP ROUND"]);
    expect(controlHints(settings, { kind: "foot", scoped: true }).map(h => h.text)).not.toContain("RMB AIM");
  });
  it("shows the gas mask key only in gas", () => {
    expect(controlHints(settings).map(h => h.text)).not.toContain("M GAS MASK");
    expect(bold(controlHints(settings, { kind: "foot", gas: true }))).toEqual(["M GAS MASK"]);
  });
  it("lists only tank controls in a tank, following rebinds", () => {
    const rebound = freshControls(); rebound.bindings.interact = "KeyF";
    const hints = controlHints(rebound, { kind: "tank" });
    expect(bold(hints)).toEqual(["WASD DRIVE", "LMB MACHINE GUNS", "RMB MAIN GUN", "F CLIMB OUT"]);
    expect(hints.map(h => h.text)).not.toContain("Shift SPRINT");
  });
  it("lists only gun controls on a mounted gun", () => {
    expect(bold(controlHints(settings, { kind: "gun" }))).toEqual(["LMB FIRE", "R RELOAD", "E DISMOUNT"]);
  });
});
