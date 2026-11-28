import {type TrainingSession} from "./training";
import {demolitionMarks,movementMarks,trainingStations} from "./training-map";
import {keyLabel,type ControlSettings,type ControlAction} from "./controls";
import {dist,type Vec} from "./map";
import {canDropEmptyFlame,flameRules} from "./flamethrower";
import {masked} from "./gas";
import {weaponProfile} from "./weapons";
import type {Game} from "./simulation";

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const controlsIn=(text:string,settings:ControlSettings)=>escape(text).replace(/\{(\w+)\}/g,
  (_,action:ControlAction)=>`<kbd>${escape(keyLabel(settings.bindings[action]))}</kbd>`);

export interface TrainingCue {
  at:Vec;
  label:string;
  height?:number;
  radius?:number;
}

export function trainingCue(session:TrainingSession,g:Game):TrainingCue|undefined {
  if(session.free || session.passed) return;
  const p=g.players[0],goal=session.nextGoal,s=session.station;
  switch(goal){
    case "walk": return {at:movementMarks.walk,label:"Walk here",radius:1.4};
    case "sprint": return {at:movementMarks.sprint,label:"Sprint here",radius:1.3};
    case "hop": return {at:movementMarks.hop,label:"Jump lane",radius:1.2};
    case "mantle": return {at:movementMarks.mantle,label:"Climb this wall",radius:.85};
    case "step": return p.y>-.3 && p.z>49
      ? {at:movementMarks.trench,label:"Enter the trench",radius:.85}
      : {at:movementMarks.step,label:"Firing step",radius:.75};
    case "crouch": case "view": case "gasMask": return;
    case "deployGun": return {at:s,label:"Gun setup area",radius:1.6};
    case "reloadGun": case "packGun": case "fireGun": {
      const gun=g.emplacements.get(0);
      if(!gun) return {at:s,label:"Gun setup area",radius:1.6};
      if(p.mountedGun===undefined || goal==="packGun") return {at:gun.at,label:"Your gun",height:1.7,radius:.9};
      if(goal==="reloadGun") return;
      break;
    }
    case "flame": {
      const kit=g.flames.kits[0];
      if(kit.at) return {at:kit.at,label:"Flame kit",radius:.8};
      break;
    }
    case "reload": return;
    case "grenade": return {at:s.target,label:"Grenade target",height:2.7,radius:3};
    case "smoke": return {at:{x:s.x,z:s.z-12},label:"Smoke practice area",radius:2.5};
    case "call": case "impact": return {at:s.target,label:"Target house",height:4.5};
    case "breach": return {at:demolitionMarks.breach,label:"Demolition house",height:8};
    case "tree": return {at:demolitionMarks.tree,label:"Marked pine",height:7.8};
    case "crater": return {at:demolitionMarks.crater,label:"Crater practice area",radius:2.5};
    case "gasCall": case "gasLand": return {at:s.target,label:"Gas target sector",radius:3.5};
    case "capture": return {at:s.target,label:"Capture flag C",height:3,radius:2.5};
  }
  const target=g.players.filter(q=>q.team==="red" && q.hp>0 && session.active.has(q.id))
    .reduce<typeof p|undefined>((nearest,q)=>!nearest || dist(p,q)<dist(p,nearest)?q:nearest,undefined);
  return target && {at:target,label:goal==="thrust" || goal==="charge" ? "Bayonet target" : "Practice target",height:2.6};
}

export function trainingHUD(session:TrainingSession,g:Game){
  const done=session.progress[session.lesson],cue=trainingCue(session,g),p=g.players[0];
  const bearing=cue ? Math.atan2(cue.at.x-p.x,-(cue.at.z-p.z))-p.yaw : 0;
  return `<small>${session.free?"FREE PRACTICE":`STATION ${session.lesson+1} OF ${trainingStations.length}`}</small>
    <h2>${escape(session.station.name)}</h2>
    ${session.free?"":`<div class="training-progress" aria-label="Exercise progress">${session.goals.map(id=>`<i class="${done.has(id)?"passed":""}"></i>`).join("")}</div>`}
    ${cue?`<small class="training-direction"><span class="training-bearing" style="transform:rotate(${bearing}rad)">↑</span> ${escape(cue.label)} · ${Math.round(dist(p,cue.at))} m</small>`:""}
    <small>ESC · TRAINING MENU</small>`;
}

export function trainingPrompt(session:TrainingSession,g:Game,settings:ControlSettings){
  if(session.free) return "";
  const p=g.players[0],goal=session.nextGoal;
  if(!goal){
    const next=session.nextStation;
    const action=next===null ? "Press Escape to replay a station, enter Free practice or choose a battlefield." :
      canDropEmptyFlame(g,p) ? "Press {interact} to drop the empty kit first." :
        `Press {interact} to deploy to ${trainingStations[next].name}.`;
    const title=session.completed===trainingStations.length ? "Training course complete" : "Station complete";
    return `<strong class="training-passed">✓ ${title}</strong><span>${controlsIn(action,settings)}</span>`;
  }
  const cue=trainingCue(session,g),distance=cue?dist(p,cue.at):Infinity;
  let instruction:string;
  switch(goal){
    case "walk": instruction="Hold {forward} to walk into the highlighted circle.";break;
    case "sprint": instruction=`${settings.toggleSprint?"Tap":"Hold"} {sprint} while moving into the next circle.`;break;
    case "crouch": instruction=session.standingAfterCrouch && p.crouched ? "Press {crouch} again to stand." : p.crouched ? "Stand with {crouch}, then press it to crouch again." : "Press {crouch} to crouch.";break;
    case "hop": instruction=distance>1.8?"Move to the highlighted jump lane.":"Press {mantle} to jump inside the lane.";break;
    case "mantle": instruction=distance>1.25?"Move to the circle at the brick wall.":"Face the brick wall and press {mantle} to climb over.";break;
    case "view": instruction="Press {view} to switch camera views.";break;
    case "step": instruction=p.y>-.3 && p.z>49 ? "Walk into the marked trench." : distance>.95 || p.y<-.7 ?
      "Face the raised shelf and press {mantle} as you move toward it." : "Hold RMB and click LMB to fire over the trench lip.";break;
    case "rifle": instruction=p.weapon==="pistol"?"Press {primary} to draw your service rifle.":"Hold RMB to aim at the highlighted target. Click LMB to hit it.";break;
    case "reload": instruction=p.weapon==="pistol"?"Press {primary} to draw your service rifle.":p.reloadAt ? "Wait for your rifle to finish reloading." : p.ammo===weaponProfile(p).magazine ? "Fire a round, then press {reload}." : "Press {reload} to reload your service rifle.";break;
    case "scope": instruction=p.weapon==="pistol"?"Press {primary} to draw your scoped rifle.":"Scoped rifle issued. Hold RMB and click LMB to hit a target.";break;
    case "machineGun": instruction=p.weapon==="pistol"?"Press {primary} to draw your machine gun.":"Machine gun issued. Hold LMB to hit a target.";break;
    case "pistol": instruction=p.weapon==="pistol"?"Click LMB to hit a target with the pistol.":"Press {sidearm} to draw your pistol, then hit a target.";break;
    case "flame": {
      const kit=g.flames.kits[0];
      instruction=canDropEmptyFlame(g,p) ? "Press {interact} to drop the empty kit and try again." :
        kit.at ? (distance>1.7?"Move to the highlighted flame kit.":"Press {interact} to pick up the flame kit.") :
        p.weapon!=="flamethrower" ? "Press {primary} to ready the flame kit." :
        distance>flameRules.range-1 ? "Move closer to the highlighted target." : "Aim at the target and hold LMB.";
      break;
    }
    case "semi": instruction=p.weapon==="pistol"?"Press {primary} to draw the AR-01.":"AR-01 issued. Click LMB to hit a target.";break;
    case "deployGun": instruction=distance>4?"Return to the highlighted gun setup area.":
      "Face the range targets. Press {emplace}, then click LMB to set up the gun.";break;
    case "fireGun": case "reloadGun": case "packGun": {
      const gun=g.emplacements.get(0);
      if(!gun) instruction="Face the range. Press {emplace}, then click LMB to set up the gun.";
      else if(goal==="packGun") instruction=p.mountedGun!==undefined ? "Press {interact} to dismount." : "Stand beside the gun and press {emplace} to pack it.";
      else if(gun.readyAt>g.tick) instruction="Wait for the gun to finish setting up.";
      else if(p.mountedGun===undefined) instruction="Approach the gun and press {interact} to mount it.";
      else if(goal==="reloadGun") instruction="Fire a short burst if the gun is full, then press {reload}.";
      else instruction="Hold LMB to hit a target with the mounted gun.";
      break;
    }
    case "grenade": instruction=p.throwAction || g.grenades.some(q=>q.actor===0 && !q.kind) ?
      "Watch where the grenade lands." : "Aim slightly above the highlighted group and press {grenade} to throw.";break;
    case "smoke": instruction=p.throwAction || g.grenades.some(q=>q.actor===0 && q.kind==="smoke") ?
      "Wait for the smoke to bloom." : "Press {smoke} to throw smoke into the lane.";break;
    case "thrust": instruction=distance>2?"Close in on the highlighted target.":"Press {melee} to thrust with your bayonet.";break;
    case "charge": instruction=distance<4?"Use {backward} to back up and leave room for a run-up.":"Sprint toward the target. Press {melee} when the charge prompt appears. In battle, {whistle} calls nearby riflemen to charge with you.";break;
    case "call": instruction="Press {tactical} and select the highlighted sector to call artillery.";break;
    case "impact": instruction="Stay back and watch for the shells to land.";break;
    case "breach": instruction="Press {tactical} and shell the highlighted house to breach a wall.";break;
    case "tree": instruction="Press {tactical} and shell the marked pine.";break;
    case "crater": instruction="Use {grenade} or the tactical map ({tactical}) to blast open ground.";break;
    case "gasCall": instruction="Press {tactical} to open the map and call Gas Shells on the marked sector.";break;
    case "gasMask": instruction=masked(p,g.tick)?"Press {mask} to remove the mask, then put it back on.":
      p.gasMask?.worn?"Wait for the mask to seal.":"Press {mask} to put on your gas mask.";break;
    case "gasLand": instruction="Stay here and watch the marked sector for the gas cloud.";break;
    case "reaction": instruction="Fire close to an enemy to make them take cover.";break;
    case "defeat": instruction=`Help your squad defeat two opponents (${Math.min(2,p.kills)}/2).`;break;
    case "clear": instruction="Clear the remaining defenders near flag C.";break;
    case "capture": instruction="Enter flag C’s circle and stay there until the drill completes.";break;
  }
  const step=session.goals.indexOf(goal)+1;
  return `<small>STEP ${step} / ${session.goals.length}</small><span>${controlsIn(instruction,settings)}</span>`;
}

export function trainingMenu(session:TrainingSession,started:boolean){
  return `<details class="training-settings" ${started?"open":""}><summary>Training menu · exercises & armory</summary><fieldset class="training-menu"><legend>Training setup</legend>
    <label><input id="training-free" type="checkbox" ${session.free?"checked":""}> Free practice</label>
    <label>Exercise <select id="training-station">${trainingStations.map((s,i)=>`<option value="${i}" ${i===session.lesson?"selected":""}>${i+1}. ${escape(s.name)}</option>`).join("")}</select></label>
    <label>Armory <select id="training-loadout">${[["rifleman","Rifleman · standard rifle"],["marksman","Marksman · 4× scope"],["support","Support · carried machine gun"],["emplacement","Support · Emplacement kit"]].map(([id,name])=>`<option value="${id}" ${session.loadout===id?"selected":""}>${name}</option>`).join("")}</select></label>
    <label>Faction equipment <select id="training-faction">${[["british","Britain"],["french","France"],["german","Imperial Germany"],["trainingBlue","Industrial training kit"]].map(([id,name])=>`<option value="${id}" ${session.faction===id?"selected":""}>${name}</option>`).join("")}</select></label>
    <small>Guided drills issue the required kit. Choose Free practice to use your own kit throughout and switch exercises at any numbered board.</small>
    ${started?'<div class="training-actions"><button class="secondary" id="training-refill">Resupply & recharge artillery</button><button class="secondary" id="training-replay">Reset this exercise</button></div>':""}
  </fieldset></details>`;
}
