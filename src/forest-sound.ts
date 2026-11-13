import type { SoundKind } from "./battlefield";

// Unpitched noise profiles use the same master mix, capture and voice budgets
// as combat. Background sounds stay quieter and lower priority than weapons.
export function forestVoice(kind: SoundKind) {
  switch(kind) {
    case "leaves": return { length:.24, frequency:2600, attack:.004, rate:.82, band:true };
    case "forestWind": return { length:6, frequency:850, attack:1.2, rate:.71, band:false };
    case "forestCreak": return { length:1.7, frequency:480, attack:.12, rate:.63, band:true };
    case "branchSnap": return { length:.28, frequency:1800, attack:.002, rate:.85, band:true };
    case "distantBattle": return { length:2.6, frequency:480, attack:.012, rate:.64, band:false };
    default: return undefined;
  }
}
