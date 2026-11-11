import {weaponDesign} from "./weapon-design";
const designFor=(id?:string)=> (["serviceRifle","machineGun","pistol"] as const).map(weapon=>weaponDesign({weapon,weaponId:id})).find(Boolean);
export const shotVoice=(id?:string)=>designFor(id)?.soundPitch??1;
export function mechanicalVoice(kind:string,action?:string,id?:string) {
 const pitch=shotVoice(id);
 const spec = action === "holster" ? [.18,650,.8,.65] : action === "draw" ? [.16,1200,1,.8]
  : action === "magazineOut" ? [.11,1500,.9,.85] : action === "magazineIn" ? [.12,2700,1.1,1]
  : action === "cylinderOpen" ? [.14,1100,.85,1] : action === "cylinderClose" ? [.1,1900,.9,1]
  : action === "rack" ? [.16,2300,.85,1] : action === "cartridges" ? [.17,3600,1.2,.8]
  : kind === "clip" ? [.16,2800,1.1,1] : [.09,1800,.95,1];
 return {length:spec[0],frequency:spec[1]*pitch,rate:spec[2]*pitch,volume:spec[3]};
}
