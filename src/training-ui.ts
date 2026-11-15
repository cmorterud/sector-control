import {TrainingSession,trainingInstructions} from "./training";
import {trainingStations} from "./training-map";
import {keyLabel,type ControlSettings,type ControlAction} from "./controls";
import {dist} from "./map";
import type {Game} from "./simulation";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function trainingHUD(session:TrainingSession,g:Game,settings:ControlSettings){
  const s=session.station,goal=session.nextGoal,done=session.progress[session.lesson],next=trainingStations[(session.lesson+1)%8];
  const key=(a:ControlAction)=>escape(keyLabel(settings.bindings[a]));
  const instruction=goal?trainingInstructions[goal].replace(/\{(\w+)\}/g,(_,a:ControlAction)=>`<kbd>${key(a)}</kbd>`):
    session.completed===8?"All eight exercises passed. Choose a battlefield from Escape → Select map, or keep practising.":
      `Exercise passed. Follow the camp road to ${escape(next.name)} and press <kbd>${key("interact")}</kbd> beside its numbered board.`;
  const movement:Partial<Record<string,{x:number;z:number}>>={walk:{x:-48,z:62},sprint:{x:-48,z:58},crouch:{x:-48,z:57},hop:{x:-56,z:63},mantle:{x:-48,z:57},step:{x:-48,z:46}};
  const destination=session.passed?{x:next.x-7,z:next.z}:session.lesson===0&&goal&&movement[goal]?movement[goal]!:s.target;
  const bearing=Math.atan2(destination.x-g.players[0].x,-(destination.z-g.players[0].z))-g.players[0].yaw;
  return `<small>${session.free?"FREE PRACTICE":"FIELD TRAINING"} · ${session.completed}/8 EXERCISES PASSED</small><h2>${session.lesson+1}. ${escape(s.name)}</h2>
    ${session.free?"":`<div class="training-progress" aria-label="Exercise progress">${session.goals.map(id=>`<i class="${done.has(id)?"passed":""}"></i>`).join("")}</div>`}
    <p>${session.free?"Choose any numbered board with your interact key. Escape opens the armory, unlimited resupply and exercise resets. There is no required order.":instruction}</p>
    <small><span class="training-bearing" style="transform:rotate(${bearing}rad)">↑</span> ${Math.round(dist(g.players[0],destination))} m · ${session.passed?escape(next.name):"EXERCISE AREA"}</small>
    <small>ESC · ARMORY / RESUPPLY / REPLAY / SKIP</small>`;
}
export function trainingMenu(session:TrainingSession,started:boolean){
  return `<details class="training-settings" ${started?"open":""}><summary>Training menu · exercises & armory</summary><fieldset class="training-menu"><legend>Training setup</legend>
    <label>Exercise <select id="training-station">${trainingStations.map((s,i)=>`<option value="${i}" ${i===session.lesson?"selected":""}>${i+1}. ${escape(s.name)}</option>`).join("")}</select></label>
    <label>Armory <select id="training-loadout">${[["rifleman","Rifleman · standard rifle"],["marksman","Marksman · 4× scope"],["support","Support · machine gun"]].map(([id,name])=>`<option value="${id}" ${session.loadout===id?"selected":""}>${name}</option>`).join("")}</select></label>
    <label>Faction equipment <select id="training-faction">${[["british","Britain"],["french","France"],["german","Imperial Germany"],["trainingBlue","Industrial training kit"]].map(([id,name])=>`<option value="${id}" ${session.faction===id?"selected":""}>${name}</option>`).join("")}</select></label>
    <label><input id="training-free" type="checkbox" ${session.free?"checked":""}> Free practice</label>
    <small>Gear or exercise changes reset the exercise when you deploy or resume. Completed tasks stay checked. Collect the flame kit beside each supply table with your interact key.</small>
    ${started?'<div class="training-actions"><button class="secondary" id="training-refill">Resupply & recharge artillery</button><button class="secondary" id="training-replay">Reset this exercise</button></div>':""}
  </fieldset></details>`;
}
