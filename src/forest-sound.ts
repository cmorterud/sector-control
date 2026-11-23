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
    // Trench ambience: wind keening through the wire, a far machine gun, crows.
    case "wireWind": return { length:5, frequency:1250, attack:1.4, rate:.74, band:true };
    case "distantGun": return { length:1.5, frequency:520, attack:.004, rate:.66, band:false };
    case "wireSnag": return { length:.17, frequency:3100, attack:.002, rate:.92, band:true };
    case "crow": return { length:.75, frequency:1150, attack:.012, rate:.8, band:true };
    default: return undefined;
  }
}
