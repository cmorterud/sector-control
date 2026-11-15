import {expect,it} from "vitest";
import {frameSeconds} from "./frame-timing";
it("starts simulation immediately after a stale pre-start RAF callback",()=>{
 let last=5000,accumulator=0,ticks=0;
 for(const now of [3000,5017,5034,5051,5068]) {
  accumulator+=frameSeconds(now,last);last=Math.max(last,now);
  while(accumulator>=1/30){ticks++;accumulator-=1/30;}
  expect(accumulator).toBeGreaterThanOrEqual(0);
 }
 expect(ticks).toBe(2);
});
it("bounds long foreground stalls while preserving normal frame intervals",()=>{
 expect(frameSeconds(10000,0)).toBe(.1);
 expect(frameSeconds(1016,1000)).toBe(.016);
 expect(frameSeconds(1000,1000)).toBe(0);
});
