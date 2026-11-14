import {test,expect} from 'vitest';
import {Game,TestCollision,idle} from './simulation';
import {industrialMap} from './map';
import {weaponProfiles,type WeaponKind} from './weapons';
import {switchRules} from './weapon-handling';

const kinds=['rifle','serviceRifle','machineGun','pistol'] as const;
function scene(weapon:WeaponKind='serviceRifle',reserve=3){
 const map={...industrialMap,boxes:[]};
 const g=new Game(new TestCollision(map),false,3000,12345,undefined,{map,ambientArtillery:false});
 const p=g.players[0];Object.assign(p,{weapon,ammo:0,reserve,protectedUntil:0});
 return {g,p};
}

test.each(kinds)('empty %s fire starts one full reload, preserves reserve until completion and then fires normally',weapon=>{
 const {g,p}=scene(weapon);
 g.step({...idle(),fire:true});
 const deadline=p.reloadAt;
 expect(deadline-g.tick).toBe(weaponProfiles[weapon].reloadTicks);
 expect(g.events.filter(e=>e.type==='reload')).toHaveLength(1);
 expect(g.events.some(e=>e.type==='fire')).toBe(false);
 for(let i=1;i<weaponProfiles[weapon].reloadTicks;i++){
  g.step({...idle(),fire:true});expect(p.reloadAt).toBe(deadline);
  expect(p.ammo).toBe(0);expect(p.reserve).toBe(3);
  expect(g.events.some(e=>e.type==='reload'||e.type==='fire')).toBe(false);
 }
 g.step(idle());expect(p.reloadAt).toBe(0);expect(p.ammo).toBe(3);expect(p.reserve).toBe(0);
 g.step({...idle(),fire:true});expect(p.ammo).toBe(2);expect(g.events.some(e=>e.type==='fire')).toBe(true);
});

test.each(kinds)('empty %s with no reserve never starts a reload or spends negative ammo',weapon=>{
 const {g,p}=scene(weapon,0);
 for(let i=0;i<60;i++){
  g.step({...idle(),fire:i%2===0});expect(p.reloadAt).toBe(0);expect(p.ammo).toBe(0);
  expect(g.events.some(e=>e.type==='reload'||e.type==='fire')).toBe(false);
 }
});

test('a semi-automatic only reloads after an empty trigger attempt and still needs a new click to fire after reloading',()=>{
 const {g,p}=scene();p.ammo=1;
 g.step({...idle(),fire:true});expect(p.ammo).toBe(0);expect(p.reloadAt).toBe(0);
 g.step({...idle(),fire:true});expect(p.reloadAt).toBe(0);
 g.step(idle());expect(p.reloadAt).toBe(0);
 g.step({...idle(),fire:true});expect(p.reloadAt-g.tick).toBe(48);
 for(let i=0;i<53;i++)g.step({...idle(),fire:true});
 expect(p.ammo).toBe(3);expect(p.reserve).toBe(0);
 g.step(idle());g.step({...idle(),fire:true});expect(p.ammo).toBe(2);
});

test('holding a machine gun through empty fire reloads and resumes its normal automatic fire',()=>{
 const {g,p}=scene('machineGun',7);p.ammo=1;
 g.step({...idle(),fire:true});expect(p.ammo).toBe(0);expect(p.reloadAt).toBe(0);
 g.step({...idle(),fire:true});expect(p.reloadAt-g.tick).toBe(45);
 for(let i=0;i<45;i++)g.step({...idle(),fire:true});
 expect(p.reloadAt).toBe(0);expect(p.reserve).toBe(0);expect(p.ammo).toBe(6);
 expect(g.events.some(e=>e.type==='fire')).toBe(true);
});

test('empty fire respects throw/stagger/death locks and an idle empty weapon does not reload by itself',()=>{
 for(const lock of ['throw','stagger','death','idle']){
  const {g,p}=scene();
  if(lock==='throw')p.throwUntil=100;
  if(lock==='stagger')p.staggerUntil=100;
  if(lock==='death'){p.hp=0;p.respawnAt=100;}
  g.step({...idle(),fire:lock!=='idle'});
  expect(p.reloadAt).toBe(0);expect(p.ammo).toBe(0);expect(p.reserve).toBe(3);
  expect(g.events.some(e=>e.type==='reload')).toBe(false);
 }
});

test('switching and firing together cannot start a reload; a later empty pistol click follows the existing drawing delay',()=>{
 const {g,p}=scene();p.inventory!.sidearm.ammo=0;p.inventory!.sidearm.reserve=12;
 g.step({...idle(),equip:'sidearm',fire:true});expect(p.weapon).toBe('pistol');expect(p.reloadAt).toBe(0);
 g.step(idle());g.step({...idle(),fire:true});
 expect(p.reloadAt).toBe(p.weaponChange!.tick+switchRules.readyTicks+weaponProfiles.pistol.reloadTicks);
 expect(g.events.filter(e=>e.type==='reload')).toHaveLength(1);
});
