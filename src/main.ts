import { emplacementRules, emplacementWeapon, mountedGun, nearbyGun, placementFor } from "./emplacements";
import { frameSeconds } from "./frame-timing";
import {CombatFeedback} from "./combat-feedback";
import {scoreboardTable} from "./scoreboard";
import type {Entity} from "playcanvas";
import {trainingMap} from "./training-map";
import {TrainingSession} from "./training";
import {trainingHUD,trainingMenu} from "./training-ui";
import { prepareNavigation } from "./simulation";
import { battlePerformance } from "./battle-performance";
import { nearestFlame } from "./flamethrower";
import { verdunMap } from "./verdun-map";
import { factions, factionFor, scoped, type Loadout, type WeaponSlot, type FactionId } from "./loadouts";
import { battlefieldCard } from "./battlefield-info";
import { loadControls, saveControls, keyLabel, SprintInput, type ControlAction } from "./controls";
import { ControlsPanel } from "./controls-panel";
import { EscapePause } from "./escape-pause";
import { sighted } from "./player-view";
import { villageMap } from "./village-map";
import { headlandMap } from "./headland-map";
import { fortVauxMap } from "./fort-vaux-map";
import { weaponProfiles } from "./weapons";
import "./style.css";
import { ArtilleryMap } from "./artillery-map";
import { flagContains } from "./domination";
import { Renderer } from "./rendering";
import {
  Game,
  idle,
  botCommand,
  resolveTeamSize,
  botSettingsFor,
  difficulties,
  type Command,
  type Difficulty,
  type Event,
  type Soldier,
} from "./simulation";
import { calloutText } from "./squads";
import { BattleAudio } from "./battle-audio";
import { BattlefieldFeedback } from "./battlefield";
import { weaponAim } from "./recoil";
import { CrouchToggle, eyeHeightOf } from "./crouch";
import { PlaytestRecorder } from "./playtest";
import { AutoQuality, parseQuality, qualityStorageKey, type Quality, type QualityChoice } from "./graphics-quality";
import { mantleLanding, dist, groundHeight, industrialMap, blocked } from "./map";
import { trenchMap } from "./trench-map";
const root = document.querySelector<HTMLDivElement>("#ui")!;
root.innerHTML = `<div id="hud"><header><div class="brand">SC <span>SECTOR CONTROL</span></div><div class="match"><div><b class="blue" id="blue">0</b><span id="clock">08:00</span><b class="red" id="red">0</b></div><nav id="sectors"></nav></div><div class="hint">TAB · SCOREBOARD<br>ESC · PAUSE</div></header><div id="labels"></div><div id="reticle">＋</div><div id="hit">×</div><div id="capture"></div><div id="artillery-status"></div><footer><div id="health"></div><div class="controls">WASD MOVE　 SHIFT SPRINT　 RMB AIM　 LMB FIRE　 R RELOAD　 V MELEE</div><div id="ammo"></div></footer><div id="suppression"></div><div id="damage"></div></div><div id="menu" class="overlay"></div><div id="scoreboard" class="overlay hidden"></div>`;
const el = (id: string) => document.getElementById(id)!;
const combatFeedback=new CombatFeedback(),combatOverlay=document.createElement("div");
combatOverlay.id="combat-feedback";el("hud").append(combatOverlay);
const escapePause = new EscapePause();
let mouseCaptureNeeded = false,
  mouseCapturePending = false;
let renderer: Renderer,
  game: Game,
  paused = true,
  started = false,
  yaw = 0,
  pitch = 0,
  hitUntil = 0,
  damageUntil = 0,
  last = 0,
  accumulator = 0,
  uiTime = 0;
const keys = new Set<string>();
const crouchInput = new CrouchToggle();
const sprintInput = new SprintInput();
let settings = loadControls();
try { settings = loadControls(localStorage); } catch { /* Storage can be blocked. */ }
function persistSettings() {
  preferredFirstPerson = settings.firstPerson;
  sprintInput.reset();
  try { saveControls(settings, localStorage); } catch { /* Keep session settings. */ }
  updateControlHints();
  updateBriefControls();
  tacticalMap.setShortcut(keyLabel(settings.bindings.tactical));
}
const controlsPanel = new ControlsPanel(settings, persistSettings);
const isKey = (action: ControlAction, code: string) => settings.bindings[action] === code ||
  (settings.bindings[action] === "ShiftLeft" && code === "ShiftRight");
const held = (action: ControlAction) => [...keys].some(code => isKey(action, code));
function updateControlHints() {
  const hint = (action: ControlAction) => keyLabel(settings.bindings[action]);
  document.querySelector(".controls")!.textContent =
    `${hint("forward")}${hint("left")}${hint("backward")}${hint("right")} MOVE　 ${hint("sprint")} SPRINT　 RMB AIM　 LMB FIRE　 ${hint("reload")} RELOAD　 ${hint("melee")} MELEE　 ${hint("grenade")} GRENADE　 ${hint("smoke")} SMOKE　 ${hint("crouch")} CROUCH　 ${hint("mantle")} HOP / MANTLE　 ${hint("view")} CHANGE VIEW　 ${hint("primary")} / ${hint("sidearm")} WEAPONS　 ${hint("interact")} INTERACT　 ${hint("tactical")} TACTICAL MAP`;
  document.querySelector(".hint")!.innerHTML = `${hint("scoreboard")} · SCOREBOARD<br>ESC · PAUSE`;
}

let triggerDown = false;
let fire = false,
  aim = false,
  reload = false,
  mantle = false,
  grenade = false,
  smoke = false,
  melee = false;
let pendingEquip: WeaponSlot | undefined;
let placingGun = false, kitCommand: "deploy" | "pack" | undefined;
let pendingInteract = false;
let pendingRedeploy = false;
let chosenLoadout: Loadout = "rifleman";
const storedDifficulty = (() => { try { return localStorage.getItem("sector-control-difficulty"); } catch { return null; } })();
let difficulty: Difficulty = (difficulties as string[]).includes(new URLSearchParams(location.search).get("difficulty") ?? "")
  ? new URLSearchParams(location.search).get("difficulty") as Difficulty
  : (difficulties as string[]).includes(storedDifficulty ?? "") ? storedDifficulty as Difficulty : "regular";
// Short text callouts from nearby friendly soldiers and enemy grenade warnings.
let callout = "", calloutUntil = 0;
let pendingArtillery: Command["artillery"];
const tacticalMap = new ArtilleryMap(
  () => game,
  (target) => {
    pendingArtillery = target;
  },
  ()=>training?.station.target,
  ()=>combatFeedback.marker(game),
);
let artilleryNotice = "",
  artilleryNoticeUntil = 0;
let audio: BattleAudio | undefined;
const battlefield = new BattlefieldFeedback((cue) => audio?.play(cue));
let audioVolume = 0.65;
let cameraReactions = true;
let recording: PlaytestRecorder | undefined;
let rawFrameMs = 0;
const params = new URLSearchParams(location.search),
  bots = params.get("bots") !== "0",
  autoplay = params.has("autoplay"),
  demo = params.has("demo") || autoplay;
battlePerformance.enabled = params.has("perf") || params.has("playtest");
const renderReview = autoplay && params.has("playtest") && params.has("renderReview");
// Graphics quality: ?quality= wins, then the stored choice, then Auto. Auto
// stores the level it settles on as "auto:<level>" so later visits start there.
const storedQuality = (() => { try { return localStorage.getItem(qualityStorageKey); } catch { return null; } })();
let qualityChoice: QualityChoice = parseQuality(params.get("quality")) ?? parseQuality(storedQuality?.split(":")[0]) ?? "auto";
let autoQuality = new AutoQuality();
const settledQuality = storedQuality?.startsWith("auto:") ? parseQuality(storedQuality.slice(5)) : undefined;
if (qualityChoice === "auto" && settledQuality && settledQuality !== "auto") {
  autoQuality.quality = settledQuality;
  autoQuality.done = true;
}
let autoQualityStored = autoQuality.done;
const activeQuality = (): Quality => qualityChoice === "auto" ? autoQuality.quality : qualityChoice;
const qualityLabel = (q: Quality) => q[0].toUpperCase() + q.slice(1);
const saveQuality = (value: string) => { try { localStorage.setItem(qualityStorageKey, value); } catch { /* per-viewer convenience only */ } };
let reviewFrames = 0;
let reviewManual = false;
const duration = Number(params.get("duration") ?? 480);
const map =
  params.get("map") === "training"
    ? trainingMap
    : params.get("map") === "verdun"
    ? verdunMap
    : params.get("map") === "village"
    ? villageMap
    : params.get("map") === "headland"
    ? headlandMap
    : params.get("map") === "fort-vaux"
    ? fortVauxMap
    : params.get("map") === "trenches"
      ? trenchMap
      : industrialMap;
const training=map.id==="training"?new TrainingSession():undefined;
root.classList.toggle("training-active",!!training);
let trainingReset=false;
const trainingOverlay=document.createElement("aside");trainingOverlay.id="training-lesson";trainingOverlay.hidden=true;
document.querySelector("#ui")!.append(trainingOverlay);
const requestedTeamSize = params.has("teamSize")
  ? Number(params.get("teamSize"))
  : undefined;
let preferredFirstPerson = params.has("view") ? params.get("view") === "first" : settings.firstPerson;
updateControlHints();
tacticalMap.setShortcut(keyLabel(settings.bindings.tactical));
const teamSize = resolveTeamSize(map, requestedTeamSize);
function battlefieldChoices() {
  const choices = [trainingMap, industrialMap, trenchMap, villageMap, verdunMap, headlandMap, fortVauxMap].map((battlefield) => {
    if (battlefield.id === map.id)
      return battlefieldCard(battlefield);
    const query = new URLSearchParams();
    if (battlefield.id !== "industrial") query.set("map", battlefield.id);
    query.set("view", preferredFirstPerson ? "first" : "third");
    return battlefieldCard(battlefield, `?${query}`);
  });
  return `<nav class="map-choice" aria-label="Battlefield">${choices.join("")}</nav>`;
}
function updateBriefControls() {
  const menuKeys: Record<string, ControlAction> = { WASD: "forward", Shift: "sprint", T: "view", R: "reload", V: "melee", G: "grenade", C: "crouch", F: "smoke", Space: "mantle", Q: "tactical" };
  for (const paragraph of Array.from(el("menu").querySelectorAll(".brief p")).slice(1)) {
    const original = (paragraph as HTMLElement).dataset.original ?? paragraph.textContent!;
    (paragraph as HTMLElement).dataset.original = original;
    paragraph.textContent = original.replace(/\b(WASD|Shift|T|R|V|G|C|F|Space|Q)\b/g, (token: string) =>
      token === "WASD" ? ["forward", "left", "backward", "right"].map(a => keyLabel(settings.bindings[a as ControlAction])).join("") : keyLabel(settings.bindings[menuKeys[token]]));
  }
}
function sound(freq: number, length = 0.08, volume = 0.04) {
  audio?.tone(freq, length, volume);
}
function clear() {
  keys.clear();
  sprintInput.reset();
  tacticalMap.close();
  fire = false;
  triggerDown = false;
  aim = false;
  reload = false;
  mantle = false;
  grenade = false;
  smoke = false;
  melee = false;
  pendingArtillery = undefined;
  pendingEquip = undefined;
  kitCommand = undefined;
  placingGun = pendingInteract = false;
  pendingRedeploy = false;
  if (renderer) renderer.artilleryPreview = null;
}
function menu(
  title: string,
  subtitle: string,
  button: string,
  action: () => void,
  extra = "",
) {
  el("menu").classList.remove("hidden");
  el("menu").innerHTML =
    `<section class="panel"><div class="eyebrow">LOCAL OPERATIONS / ${map.name.toUpperCase()}</div><h1>${title}</h1><p>${subtitle}</p>${extra}${training?trainingMenu(training,started):""}<a class="secondary armoury-link" href="armoury/" target="_blank" rel="noopener">Weapons</a><button class="secondary" id="controls-settings">Controls</button><div class="audio-settings"><label>Battlefield volume <input id="volume" type="range" min="0" max="100" value="${Math.round(audioVolume * 100)}"></label><label><input id="camera-reactions" type="checkbox" ${cameraReactions ? "checked" : ""}> Blast camera motion</label><label>Graphics <select id="quality"><option value="auto">Auto · ${qualityLabel(autoQuality.quality)}${autoQuality.done ? "" : ", testing"}</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><button id="primary">${button} <span>→</span></button><div class="fine">DESKTOP · HEADPHONES RECOMMENDED · WEBGL 2</div></section>`;
  if(training){
    (el("training-station") as HTMLSelectElement).onchange=e=>{training.select(Number((e.target as HTMLSelectElement).value));trainingReset=true;};
    (el("training-loadout") as HTMLSelectElement).onchange=e=>{training.loadout=(e.target as HTMLSelectElement).value as Loadout;trainingReset=true;};
    (el("training-faction") as HTMLSelectElement).onchange=e=>{training.faction=(e.target as HTMLSelectElement).value as FactionId;trainingReset=true;};
    (el("training-free") as HTMLInputElement).onchange=e=>{training.free=(e.target as HTMLInputElement).checked;};
    if(started){
      el("training-refill").onclick=()=>{if(trainingReset||game.players[0].hp<=0)start();else{training.resupply(game);resume();}};
      el("training-replay").onclick=()=>{training.select(training.lesson,true);start();};
    }
  } else {
  const faction = factions[factionFor(map,"blue")];
  const loadouts = document.createElement("div"); loadouts.className = "loadout-choice";
  loadouts.innerHTML = `<label>Deployment loadout <select id="loadout"><option value="rifleman">Rifleman · ${faction.rifle}</option><option value="marksman">Marksman · ${faction.scoped} · 4×</option><option value="support">Support · ${faction.support}</option><option value="emplacement">Support · Emplacement kit</option></select></label><small>${faction.pistol} sidearm · ${started ? "Changes apply on your next spawn" : "Choose before deployment"}</small>`;
  el("controls-settings").before(loadouts);
  const select = el("loadout") as HTMLSelectElement; select.value = chosenLoadout;
  select.onchange = () => { chosenLoadout = select.value as Loadout; if (game) game.selectLoadout(game.players[0], chosenLoadout); };
  if (bots) {
    const skill = document.createElement("div"); skill.className = "loadout-choice";
    skill.innerHTML = `<label>Bot difficulty <select id="difficulty"><option value="recruit">Recruit · slower, looser, fewer grenades</option><option value="regular">Regular</option><option value="veteran">Veteran · quicker, sharper, more grenades</option></select></label><small>Both teams' soldiers: reaction, aim, grenades and squad coordination</small>`;
    el("controls-settings").before(skill);
    const pick = el("difficulty") as HTMLSelectElement; pick.value = difficulty;
    pick.onchange = () => {
      difficulty = pick.value as Difficulty;
      try { localStorage.setItem("sector-control-difficulty", difficulty); } catch { /* per-viewer convenience only */ }
      if (game) Object.assign(game.botSettings, botSettingsFor(game.map, difficulty));
    };
  }
  }
  updateBriefControls();
  el("primary").onclick = action;
  el("controls-settings").onclick = () => controlsPanel.show(el("controls-settings"));
  el("volume").oninput = (e) => {
    audioVolume = Number((e.target as HTMLInputElement).value) / 100;
    audio?.volume(audioVolume);
  };
  const quality = el("quality") as HTMLSelectElement;
  quality.value = qualityChoice;
  quality.onchange = () => {
    qualityChoice = quality.value as QualityChoice;
    if (qualityChoice === "auto") { autoQuality = new AutoQuality(); autoQualityStored = false; }
    saveQuality(qualityChoice);
    renderer?.setQuality(activeQuality());
  };
  el("camera-reactions").onchange = (e) =>
    (cameraReactions = (e.target as HTMLInputElement).checked);
}
function unpause() {
  controlsPanel.close();
  paused = false;
  last = performance.now();
  accumulator = 0;
  el("menu").classList.add("hidden");
}
function mouseCaptureFailed() {
  mouseCapturePending = false;
  // Escape resumes immediately. A denied recapture must not pause it again;
  // wait for another fresh gameplay key/click instead of retrying on a timer.
  if (mouseCaptureNeeded && !paused) return;
  pause();
  el("menu").querySelector("p")!.textContent =
    "Mouse capture was denied. Click Resume to retry.";
}
function captureMouse() {
  if (mouseCapturePending) return;
  mouseCapturePending = true;
  try {
    const request = renderer.canvas.requestPointerLock();
    if (request) void request.catch(mouseCaptureFailed);
  } catch {
    mouseCaptureFailed();
  }
}
function resume(fromEscape = false) {
  if(trainingReset&&started){trainingReset=false;start();return;}
  audio ??= new BattleAudio();
  audio.volume(audioVolume);
  audio.resume();
  if (demo || fromEscape) {
    mouseCaptureNeeded = !demo;
    unpause();
    return;
  }
  mouseCaptureNeeded = false;
  captureMouse();
}
function start() {
  trainingReset=false;
  recording?.dispose();
  recording = undefined;
  game = new Game(
    renderer,
    training?true:bots,
    Math.round(
      (Number.isFinite(duration) && duration > 0 ? duration : 480) * 30,
    ),
    12345,
    training ? undefined : { difficulty },
    { map, teamSize:training?4:teamSize, humanPlayerIds: autoplay&&!training ? [] : [0],ambientArtillery:training?false:undefined },
  );
  game.selectLoadout(game.players[0], chosenLoadout);
  training?.begin(game);
  if (bots||training) prepareNavigation(game.map);
  renderer.reset(game);
  battlefield.reset(game);
  combatFeedback.reset();
  audio ??= new BattleAudio();
  audio.reset();
  audio.volume(audioVolume);
  if (params.has("playtest"))
    recording = new PlaytestRecorder(
      renderer.canvas,
      Math.max(5, Math.min(renderReview ? 600 : 120, Number(params.get("clip") ?? 60) || 60)),
      params.get("video") !== "0",
      audio.capture.stream,
    );
  yaw = game.players[0].yaw;
  pitch = 0;
  battlePerformance.reset();
  started = true;
  hitUntil = damageUntil = 0;
  artilleryNotice = "";
  artilleryNoticeUntil = 0;
  callout = "";
  calloutUntil = 0;
  crouchInput.reset();
  clear();
  resume();
  sound(500, 0.3);
}
function pause() {
  escapePause.paused(performance.now());
  mouseCaptureNeeded = mouseCapturePending = false;
  paused = true;
  audio?.pause();
  clear();
  accumulator = 0;
  if (!started || game.phase !== "playing") return;
  menu(
    "Operation paused",
    training?"Resume your exercise, change gear, resupply or choose another station below.":"Press Escape or click Resume to continue. Redeploy ends this life and respawns you in five seconds.",
    "Resume operation",
    () => resume(),
    `<div class="pause-actions">
      <button class="secondary" id="redeploy" ${game.players[0].hp<=0 ? "disabled" : ""} title="Die now and redeploy at your team spawn in five seconds">Redeploy</button>
      <button class="secondary" id="restart">Restart match</button>
      <button class="secondary" id="select-map" aria-expanded="false" aria-controls="pause-map-picker">Select map</button>
    </div>
    <div id="pause-map-picker" class="pause-map-picker hidden">
      <p>Choosing a different battlefield ends this match.</p>
      ${battlefieldChoices()}
    </div>`,
  );
  el("redeploy").onclick = () => { pendingRedeploy = true; resume(true); };
  el("restart").onclick = () => {if(training)training.select(training.lesson,true);start();};
  const selectMap = el("select-map");
  selectMap.onclick = () => {
    const expanded = !el("pause-map-picker").classList.toggle("hidden");
    selectMap.setAttribute("aria-expanded", String(expanded));
  };
}
function handle(e: Event) {
  combatFeedback.event(game,e);
  if (["death","artilleryImpact","grenadeExplosion","destruction"].includes(e.type)) battlePerformance.count(e.type);
  if (e.type === "melee" && e.phase === "strike" && e.actor === 0 && e.damage)
    hitUntil = performance.now() + 150;
  if ((e.type === "death" || e.type === "respawn") && e.actor === 0) {
    crouchInput.reset();
    sprintInput.reset();
  }
  renderer.effect(e);
  battlefield.event(game, e);
  if (e.type === "smokeThrow" && e.actor === 0) sound(300, 0.12, 0.035);
  if (e.type === "smokeBloom" && dist(game.players[0], e.at) < 45)
    sound(200, 0.9, 0.025);
  if (e.type === "artilleryCall" && e.actor === 0) {
    artilleryNotice = "FIRE MISSION CONFIRMED · FIRST IMPACT IN 4s";
    artilleryNoticeUntil = performance.now() + 3500;
    sound(620, 0.3, 0.07);
  }
  if (e.type === "artilleryImpact") {
    if (e.actor === 0 && e.hits.some((hit) => hit.target !== 0))
      hitUntil = performance.now() + 200;
  }
  if (e.type === "grenadeThrow" && e.actor === 0) sound(320, 0.12, 0.035);
  const listener = game.players[0];
  if (e.type === "callout" && listener.hp > 0 && e.actor !== 0) {
    const speaker = game.players.find((q) => q.id === e.actor);
    if (speaker?.team === listener.team && dist(listener, e.at) < 30) {
      callout = calloutText[e.line].toUpperCase();
      calloutUntil = performance.now() + 2200;
    }
  }
  // Every bot frag is called out: the thrower shouts within earshot.
  if (e.type === "grenadeThrow" && e.actor !== 0 && listener.hp > 0) {
    const thrower = game.players.find((q) => q.id === e.actor);
    if (thrower && thrower.team !== listener.team && dist(listener, e.from) < 30) {
      callout = "GRENADE!";
      calloutUntil = performance.now() + 2500;
    }
  }
  if (e.type === "grenadeBounce" && dist(game.players[0], e.at) < 25)
    sound(180, 0.04, 0.025);
  if (e.type === "grenadeExplosion") {
    if (e.actor === 0 && e.hits.some((hit) => hit.target !== 0))
      hitUntil = performance.now() + 200;
  }
  if (e.type === "impact" && e.hit && e.actor === 0) {
    hitUntil = performance.now() + 150;
    sound(700, 0.035, 0.02);
  }
  if (e.type === "damage" && e.actor === 0) {
    damageUntil = performance.now() + 250;
    sound(60, 0.2, 0.12);
  }
  if (
    e.type === "reload" &&
    e.actor === 0 &&
    game.players[0].weapon !== "serviceRifle"
  )
    sound(240, 0.15);
  if (e.type === "capture") sound(740, 0.35);
  if (e.type === "end") {
    paused = true;
    document.exitPointerLock();
    sound(440, 0.6);
    const result =
      e.winner === "draw" ? "Draw" : e.winner === "blue" ? "Victory" : "Defeat";
    menu(
      result,
      `Operation complete · ${game.scoring === "domination" ? "Domination · " : game.scoring === "eliminations" ? "Eliminations · " : ""}${factions[factionFor(map,"blue")].name} ${game.scores.blue} / ${factions[factionFor(map,"red")].name} ${game.scores.red}`,
      "Deploy again",
      start,
      battlefieldChoices() + table(),
    );
  }
}
function table() {
  return scoreboardTable(game);
}
function hud(now: number) {
  const p = game.players[0];
  root.classList.toggle("dead",p.hp<=0);
  combatOverlay.innerHTML=paused||held("scoreboard")?"":combatFeedback.html(game,renderer.deathView?.yaw??weaponAim(p).yaw);
  el("reticle").classList.toggle("hidden", sighted(p, game.tick) && !scoped(p));
  el("blue").textContent = String(game.scores.blue);
  el("red").textContent = String(game.scores.red);
  const t = Math.ceil((game.duration - game.tick) / 30);
  el("clock").textContent = `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${(t % 60).toString().padStart(2, "0")}`;
  if(training)el("clock").textContent="TRAINING";
  el("sectors").innerHTML =
    game.scoring === "eliminations"
      ? '<span class="sector">TRENCH DUEL · ELIMINATIONS</span>'
      : (game.scoring === "domination"
          ? `<span class="mode-tag">DOMINATION<small>FIRST TO ${game.scoreLimit}</small></span>`
          : "") +
        game.sectors
          .map(
            (s) =>
              `<span class="sector flag-sector ${s.contested ? "contested" : (s.owner ?? "")}" title="${s.id}${s.name ? " · " + s.name : ""} · ${s.contested ? "Contested · scoring paused" : (s.owner ?? "Neutral")}">${s.id}<div class="bar"><i class="${s.control < 0 ? "redbar" : ""}" style="width:${Math.abs(s.control) * 100}%"></i></div></span>`,
          )
          .join("");
  if(training){
    el("blue").textContent=String(training.completed);el("red").textContent="8";
    el("sectors").innerHTML='<span class="mode-tag">FIELD EXERCISES<small>NO TIME LIMIT</small></span>';
    trainingOverlay.hidden=paused;trainingOverlay.innerHTML=trainingHUD(training,game,settings);
  }
  el("health").innerHTML =
    `<small>VITALS / ${factions[p.faction ?? factionFor(map,p.team)].name.toUpperCase()}</small><strong>${Math.ceil(p.hp)}<em> HP</em></strong><div class="bar"><i style="width:${p.hp}%"></i></div>${game.tick < p.protectedUntil && p.hp > 0 ? "<small>SPAWN PROTECTION</small>" : ""}`;
  root.classList.toggle("scoped", !paused && !tacticalMap.open && scoped(p) && sighted(p,game.tick));
  el("ammo").innerHTML =
    `<small>${p.weaponId ?? weaponProfiles[p.weapon].label}</small><strong>${p.ammo}<em> / ${p.reserve}</em></strong><small>${p.melee ? (p.melee.kind === "charge" ? "BAYONET CHARGE / RECOVERY" : "MELEE / RECOVERY") : p.reloadAt ? "RELOADING · " + ((p.reloadAt - game.tick) / 30).toFixed(1) + "s" : p.weapon === "serviceRifle" && game.tick < p.nextShot ? "CYCLING BOLT · " + ((p.nextShot - game.tick) / 30).toFixed(1) + "s" : p.weapon === "serviceRifle" ? "BOLT ACTION · CLICK TO FIRE" : p.weapon === "machineGun" ? "AUTO · HOLD TO FIRE / BRACE FOR ACCURACY" : "SEMI · CLICK TO FIRE"}</small><small>${keyLabel(settings.bindings.grenade)} · GRENADES ${p.grenades}　 ${keyLabel(settings.bindings.smoke)} · SMOKE ${p.smokes}</small>`;
  const readyIn = Math.max(
    0,
    Math.ceil((game.artillery.readyAt[p.team] - game.tick) / 30),
  );
  el("ammo").innerHTML += `<small>${keyLabel(settings.bindings.tactical)} · ${game.map.artillery === false
    ? "FLOOR PLAN" : `ARTILLERY ${readyIn ? readyIn + "s" : "READY"}`}</small>`;
  tacticalMap.update();
  el("artillery-status").textContent =
    now < artilleryNoticeUntil ? artilleryNotice : now < calloutUntil ? callout : "";
  const sector =
    game.scoring !== "eliminations"
      ? game.sectors.find((s) =>
          game.scoring === "domination"
            ? flagContains(game, p, s)
            : dist(s, p) <= 8,
        )
      : undefined;
  if (sector)
    el("health").innerHTML +=
      `<small>${game.scoring === "domination" ? "FLAG" : "SECTOR"} ${sector.id}${sector.name ? " · " + sector.name.toUpperCase() : ""} · ${sector.contested ? "CONTESTED" : (sector.owner?.toUpperCase() ?? "NEUTRAL")}</small>`;
  const ledge =
    map.terrain &&
    !p.mantle &&
    !p.hop &&
    !p.fall &&
    mantleLanding(p, { x: Math.sin(p.yaw), z: -Math.cos(p.yaw) }, game.map);
  el("capture").innerHTML =
    p.hp <= 0
      ? `<h2>SOLDIER DOWN</h2><p>Redeploying in ${Math.ceil((p.respawnAt - game.tick) / 30)}s</p>`
      : p.mantle
        ? "<small>CLIMBING TRENCH EDGE</small>"
        : ledge && !(game.scoring === "domination" && sector)
          ? `<small>${keyLabel(settings.bindings.mantle)} · MANTLE</small>`
          : sector
            ? `<small>${game.scoring === "domination" ? "FLAG" : "SECTOR"} ${sector.id}${sector.name ? " · " + sector.name.toUpperCase() : ""} · ${sector.contested ? "CONTESTED" : sector.owner === p.team ? "DEFENDING" : sector.owner ? "NEUTRALIZING" : "CAPTURING"}</small><div class="bar"><i class="${sector.control < 0 ? "redbar" : ""}" style="width:${Math.abs(sector.control) * 100}%"></i></div>`
            : "";
  const gun = mountedGun(game, p);
  const nearby = p.hp > 0 && !gun && game.emplacements.size ? nearbyGun(game, p) : undefined;
  const deployKey = keyLabel(settings.bindings.emplace), useKey = keyLabel(settings.bindings.interact);
  const placement = renderer.machineGunPreview;
  if (gun) {
    const loading = gun.reloadAt ? `RELOADING · ${((gun.reloadAt - game.tick) / 30).toFixed(1)}s` : "90° TRAVERSE · HOLD FIRE";
    const traverse = 50 + (gun.yaw - gun.baseYaw) / emplacementRules.traverse * 50;
    el("ammo").innerHTML = `<small>${gun.weaponId} · ${Math.ceil(gun.hp)} HP</small><strong>${gun.ammo}<em> / ${gun.reserve}</em></strong><small>${loading}</small><div class="gun-traverse" aria-label="Gun traverse"><i style="left:${traverse}%"></i></div><small>${useKey} · DISMOUNT</small>`;
  } else if (placement) {
    el("capture").innerHTML = placement.valid
      ? `<small>LMB · SET UP ${emplacementWeapon(p).toUpperCase()}　 ${deployKey} · CANCEL</small>`
      : `<small>${placement.reason}　 ${deployKey} · CANCEL</small>`;
  } else if (nearby) {
    const setup = nearby.readyAt - game.tick;
    const pack = nearby.owner === p.id && p.loadout === "emplacement" ? `　 ${deployKey} · PACK UP` : "";
    const action = setup > 0 ? `SETTING UP · ${(setup/30).toFixed(1)}s`
      : nearby.operator !== undefined ? "IN USE" : `${useKey} · MOUNT${pack}`;
    el("capture").innerHTML = `<small>${nearby.weaponId} · ${action}</small>`;
  } else if (p.hp > 0 && p.loadout === "emplacement") {
    el("ammo").innerHTML += `<small>${p.emplacementLost ? "EMPLACEMENT LOST · RESUPPLY ON RESPAWN" :
      game.emplacements.has(p.id) ? deployKey + " · PACK UP WHEN NEAR YOUR GUN" : deployKey + " · PREVIEW EMPLACEMENT"}</small>`;
  }
  const pickup = !gun && !nearby && !placement && p.hp > 0 && p.flameKit === undefined && nearestFlame(game,p);
  if (pickup) el("capture").innerHTML = `<small>${keyLabel(settings.bindings.interact)} · EXCHANGE PRIMARY FOR FLAME KIT · ${(pickup.fuel/30).toFixed(1)}s FUEL</small>`;
  if (!gun && p.weapon === "flamethrower") el("ammo").innerHTML = `<small>WEX-INSPIRED FLAME KIT · 8m</small><strong>${(p.ammo/30).toFixed(1)}<em>s FUEL</em></strong><small>HOLD FIRE · ${keyLabel(settings.bindings.sidearm)} PISTOL</small>`;
  el("suppression").style.opacity =
    p.hp > 0 ? String(p.suppression * 0.22) : "0";
  el("hit").style.opacity = now < hitUntil ? "1" : "0";
  el("damage").style.opacity = now < damageUntil ? ".65" : "0";
  if (held("scoreboard")) {
    el("scoreboard").classList.remove("hidden");
    el("scoreboard").innerHTML =
      `<section class="panel"><div class="eyebrow">LIVE OPERATION</div><h2>Scoreboard</h2>${table()}</section>`;
  } else el("scoreboard").classList.add("hidden");
  el("labels").classList.toggle("aiming", aim);
  el("labels").innerHTML =
    game.scoring === "eliminations" || (training&&training.lesson<6)
      ? ""
      : game.sectors
          .map((s) => {
            const v = renderer.project({
              x: s.x,
              y: groundHeight(s.x, s.z, game.map) + 4,
              z: s.z,
            });
            return v.z > 0
              ? `<div class="objective ${s.contested ? "contested" : (s.owner ?? "")}" aria-label="${s.id}${s.name ? " · " + s.name : ""}${s.contested ? " · Contested" : ""}" style="left:${v.x}px;top:${v.y}px">${s.id}${s.contested ? " · !" : ""}<small>${Math.round(dist(p, s))}m</small></div>`
              : "";
          })
          .join("");
}
function command(): Command {
  const c = idle();
  const x = Number(held("right")) - Number(held("left")),
    z = Number(held("forward")) - Number(held("backward"));
  c.x = x * Math.cos(yaw) + z * Math.sin(yaw);
  c.z = x * Math.sin(yaw) - z * Math.cos(yaw);
  c.yaw = yaw;
  c.pitch = pitch;
  c.crouch = crouchInput.active;
  c.sprint = settings.toggleSprint ? sprintInput.active : held("sprint");
  c.fire = !placingGun && (fire || (triggerDown && (game.players[0].mountedGun !== undefined || game.players[0].weapon === "machineGun" || game.players[0].weapon === "flamethrower"))) && !tacticalMap.open;
  c.interact = !tacticalMap.open && (pendingInteract || held("interact"));
  pendingInteract = false;
  c.deployGun = kitCommand === "deploy";
  c.packGun = kitCommand === "pack";
  kitCommand = undefined;
  c.equip = pendingEquip; pendingEquip = undefined;
  fire = false;
  c.artillery = pendingArtillery;
  pendingArtillery = undefined;
  c.aim = aim && !tacticalMap.open;
  c.firstPerson = preferredFirstPerson;
  c.reload = reload;
  c.mantle = mantle;
  c.grenade = grenade;
  c.smoke = smoke;
  c.melee = melee;
  melee = false;
  reload = false;
  mantle = false;
  grenade = false;
  smoke = false;
  return c;
}
window.addEventListener("keydown", (e) => {
  if (controlsPanel.key(e)) return;
  if (e.code === "Escape") {
    const action = escapePause.press(e, {
      started,
      playing: started && game.phase === "playing",
      paused,
    });
    if (action === "resume") {
      e.preventDefault();
      resume(true);
    } else if (action === "pause") {
      pause();
      document.exitPointerLock();
    }
    return;
  }
  if (paused) return;
  if (Object.values(settings.bindings).includes(e.code))
    e.preventDefault();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if(training&&isKey("interact",e.code)&&!e.repeat&&!tacticalMap.open &&
     !mountedGun(game, game.players[0]) && !nearbyGun(game, game.players[0])){
    const index=training.interaction(game);
    if(index!==null){training.select(index);start();return;}
  }
  if (mouseCaptureNeeded && !e.repeat && Object.values(settings.bindings).includes(e.code)) captureMouse();
  keys.add(e.code);
  if (isKey("sprint", e.code)) sprintInput.press(e.repeat, settings.toggleSprint);
  if (isKey("crouch", e.code) && game.players[0].hp > 0) crouchInput.press(e.repeat);
  if (isKey("tactical", e.code) && !e.repeat && game.players[0].mountedGun === undefined) {
    fire = aim = grenade = smoke = mantle = melee = placingGun = false;
    tacticalMap.toggle();
  }
  if (tacticalMap.open && !isKey("reload", e.code)) return;
  const player = game.players[0];
  if (isKey("interact", e.code) && !e.repeat) pendingInteract = true;
  if (isKey("emplace", e.code) && !e.repeat && player.hp > 0 && player.loadout === "emplacement" &&
      player.mountedGun === undefined && !player.emplacementLost) {
    if (game.emplacements.has(player.id)) kitCommand = "pack";
    else placingGun = !placingGun;
  }
  if (isKey("view", e.code) && !e.repeat) {
    preferredFirstPerson = !preferredFirstPerson;
    settings.firstPerson = preferredFirstPerson;
    try { saveControls(settings, localStorage); } catch { /* Session preference remains. */ }
  }
  if (isKey("primary", e.code) && !e.repeat) pendingEquip = "primary";
  if (isKey("sidearm", e.code) && !e.repeat) pendingEquip = "sidearm";
  if (isKey("reload", e.code)) reload = true;
  if (isKey("mantle", e.code) && !e.repeat) mantle = true;
  if (isKey("grenade", e.code) && !e.repeat) grenade = true;
  if (isKey("smoke", e.code) && !e.repeat) smoke = true;
  if (isKey("melee", e.code) && !e.repeat) melee = true;
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "Escape") escapePause.release();
});
window.addEventListener("mousemove", (e) => {
  if (paused) return;
  if (tacticalMap.open) {
    tacticalMap.move(e, document.pointerLockElement === renderer.canvas);
    return;
  }
  const sensitivity = aim ? scoped(game.players[0]) ? 0.0005 : 0.0013 : 0.002;
  yaw += e.movementX * sensitivity;
  pitch = Math.max(-1.1, Math.min(1.1, pitch - e.movementY * sensitivity));
});
window.addEventListener("mousedown", (e) => {
  if (paused) return;
  if (mouseCaptureNeeded && !tacticalMap.open && e.target === renderer.canvas) {
    captureMouse();
    return;
  }
  if (tacticalMap.open) {
    fire = aim = false;
    if (e.button === 2) tacticalMap.close();
    if (e.button === 0) {
      triggerDown = true;
      if (document.pointerLockElement === renderer.canvas) tacticalMap.select();
    }
    return;
  }
  if (placingGun) {
    if (e.button === 0 && placementFor(game, game.players[0], yaw).valid) {
      kitCommand = "deploy";
      placingGun = false;
      fire = triggerDown = false;
    }
    if (e.button === 2) placingGun = false;
    return;
  }
  if (e.button === 0) {
    if (!triggerDown) fire = true;
    triggerDown = true;
  }
  if (e.button === 2) aim = true;
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 0) triggerDown = false;
  if (e.button === 2) aim = false;
});
window.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === renderer?.canvas) {
    mouseCaptureNeeded = mouseCapturePending = false;
    unpause();
  } else if (started && game.phase === "playing") pause();
});
document.addEventListener("pointerlockerror", mouseCaptureFailed);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && started) {
    escapePause.release();
    document.exitPointerLock();
    if (game.phase === "playing") pause();
  }
});
window.addEventListener("blur", () => {
  escapePause.release();
  if (!demo && started && game.phase === "playing") {
    document.exitPointerLock();
    pause();
  }
});
function stepSimulation() {
  renderer.remember(game);
  const input =
    autoplay && !reviewManual && game.players[0].hp > 0
      ? botCommand(game, game.players[0])
      : command();
  input.firstPerson = preferredFirstPerson;
  input.redeploy = pendingRedeploy; pendingRedeploy = false;
  const simStart = battlePerformance.begin();
  game.step(input);
  training?.observe(game,input);
  battlePerformance.end("simulation",simStart);
  const player = game.players[0];
  if (player.melee || player.mountedGun !== undefined) yaw = player.yaw;
  if (player.mountedGun !== undefined) pitch = player.pitch;
  if (player.hp <= 0) placingGun = false;
  const eventStart = battlePerformance.begin();
  for (const e of game.events) handle(e);
  battlePerformance.end("events",eventStart);
  const feedbackStart = battlePerformance.begin();
  battlefield.step(game);
  battlePerformance.end("feedback",feedbackStart);
  const diagnosticsStart = battlePerformance.begin();
  if (recording)
    recording.log.presentation = {
      feedback: { ...battlefield.stats },
      audio: audio ? structuredClone(audio.stats) : undefined,
      recent: [...battlefield.recent],
      soldiers: { ...renderer.soldierStats },
    };
  recording?.tick(game, input);
  battlePerformance.end("diagnostics",diagnosticsStart);
}
function advanceReview(ticks:number) {
  if(!renderReview||!started||paused||!Number.isInteger(ticks)||ticks<0||ticks>900)throw Error("Invalid review advance");
  for(let i=0;i<ticks&&game.phase==="playing";i++) {
    stepSimulation();
    renderer.deathView=combatFeedback.camera(game,game.tick,weaponAim(game.players[0]));
    renderer.draw(game,1,1/30,params.has("overview"));
  }
  accumulator=0;hud(performance.now());return {tick:game.tick,frames:reviewFrames};
}
function combatReview(stage:string) {
  if(!renderReview||map.id!=="industrial"||!["hit","death","respawn","assist"].includes(stage))throw Error("Unknown combat review");
  reviewManual=true;keys.clear();triggerDown=fire=aim=reload=mantle=grenade=smoke=melee=false;
  pendingEquip=pendingArtillery=undefined;pendingRedeploy=false;preferredFirstPerson=true;chosenLoadout="rifleman";
  start();game.commandOverride=()=>idle();
  const player=game.players[0],ally=game.players[1],enemy=game.players[game.teamSize];
  for(const [p,x,z] of [[player,0,6],[ally,-6,6],[enemy,0,-6]] as const) {
    game.selectLoadout(p,"rifleman");Object.assign(p,{x,y:0,z,vx:0,vz:0,protectedUntil:0,command:{...idle(),firstPerson:p.id===0}});
  }
  if(stage==="death"){game.selectLoadout(player,"marksman");aim=true;}
  yaw=player.yaw=0;pitch=player.pitch=0;renderer.remember(game);
  const shoot=(source:Soldier,target:Soldier,count:number)=>{
    for(let i=0;i<count;i++) {
      if(game.tick<source.nextShot)advanceReview(source.nextShot-game.tick);
      const dx=target.x-source.x,dz=target.z-source.z;
      source.yaw=Math.atan2(dx,-dz)-source.recoilYaw;
      source.pitch=Math.atan2(target.y+1.1-source.y-eyeHeightOf(source),Math.hypot(dx,dz))-source.recoilPitch;
      if(source.id===0){yaw=source.yaw;pitch=source.pitch;}
      const hp=target.hp;game.events=[];game.fire(source);for(const e of game.events)handle(e);advanceReview(2);
      if(target.hp>=hp)throw Error("Combat review round did not hit its target");
    }
  };
  if(stage==="assist"){shoot(player,enemy,1);shoot(ally,enemy,3);}
  else {shoot(enemy,player,stage==="hit"?1:4);if(stage!=="hit")advanceReview(stage==="respawn"?150:20);}
  renderer.remember(game);hud(performance.now());
  return {hp:player.hp,assists:player.assists,tick:game.tick};
}
// At most this many simulation ticks run in one frame, and navigation
// rebuilds after explosions get this many milliseconds of each frame.
const maxCatchUpTicks = 2, navigationFrameMs = 3;
function frame(now: number) {
  battlePerformance.frame(now, game?.tick ?? 0, !started || paused);
  rawFrameMs = now - last;
  if (started && !paused && !renderReview && qualityChoice === "auto" && !autoQualityStored) {
    const next = autoQuality.frame(rawFrameMs);
    if (next) renderer.setQuality(next);
    if (autoQuality.done) { saveQuality("auto:" + autoQuality.quality); autoQualityStored = true; }
  }
  const dt = frameSeconds(now,last);
  last = Math.max(last,now);
  if (started) {
    if (!paused && !renderReview) {
      const p = game.players[0],
        view = weaponAim(p);
      audio?.listener(
        { x: p.x, y: p.y + eyeHeightOf(p), z: p.z },
        combatFeedback.camera(game,game.tick,view)?.yaw??view.yaw,
        combatFeedback.camera(game,game.tick,view)?.pitch??view.pitch,
      );
      audio?.muffle(battlefield.state(game.tick).muffle);
      accumulator += dt;
      let steps = 0;
      // All of this frame's ticks share one navigation rebuild budget.
      game.navigationDeadline = performance.now() + navigationFrameMs;
      while (accumulator >= 1 / 30 && steps++ < maxCatchUpTicks) {
        stepSimulation();
        accumulator -= 1 / 30;
        if (paused) break;
      }
      game.navigationDeadline = Infinity;
      // After a long frame, catch up over the next frames instead of
      // running a burst of ticks that makes the next frame long too. A
      // machine that can't keep up runs slower rather than spiralling.
      accumulator = Math.min(accumulator, maxCatchUpTicks / 30);
    }
    renderer.artilleryPreview = null;
    renderer.machineGunPreview = placingGun && !paused && !tacticalMap.open
      ? placementFor(game, game.players[0], yaw) : undefined;
    // Ticks still owed are drawn at the latest state rather than extrapolated.
    const alpha = Math.min(1, accumulator * 30);
    renderer.cameraReaction = battlefield.state(
      game.tick - 1 + alpha,
      cameraReactions && !paused,
    );
    const drawStart = battlePerformance.begin();
    renderer.deathView=combatFeedback.camera(game,game.tick-1+alpha,weaponAim(game.players[0]));
    renderer.draw(
      game,
      alpha,
      paused ? 0 : dt,
      params.has("overview"),
    );
    battlePerformance.end("presentation",drawStart);
    if (now - uiTime > 50) {
      const hudStart = battlePerformance.begin();
      hud(now);
      battlePerformance.end("hud",hudStart);
      uiTime = now;
    }
  }
  requestAnimationFrame(frame);
}
try {
  renderer = new Renderer(document.querySelector("#game")!, map, activeQuality());
  let renderStart: number | undefined;
  renderer.app.on("prerender", () => { renderStart = started && !paused ? battlePerformance.begin() : undefined; });
  // Copy the WebGL surface while its drawing buffer is still available.
  renderer.app.on("postrender", () => {
    battlePerformance.end("renderSubmit",renderStart);
    if (started) { reviewFrames++; recording?.frame(game, rawFrameMs, paused); }
  });
  // Explicit diagnostic mode: advance the real simulation and presentation
  // without waiting for a software GPU to display every intermediate frame.
  // Normal play never installs this bridge or changes its frame loop.
  if(renderReview)Object.assign(window,{sectorRenderReview:{
    state:()=>({frames:reviewFrames,tick:started?game.tick:0,paused,...(started?{player:{x:game.players[0].x,z:game.players[0].z,crouched:game.players[0].crouched,firstPerson:preferredFirstPerson,ammo:game.players[0].ammo,hp:game.players[0].hp,assists:game.players[0].assists},combat:{marker:combatFeedback.marker(game),view:renderer.deathView,report:game.players[0].lastDeath,fov:renderer.camera.camera!.fov}}:{}),...(training&&started?{training:{id:training.id,loadout:game.players[0].loadout,faction:game.players[0].faction,free:training.free}}:{})}),
    emplacement: () => ({
      count: game.emplacements.size,
      preview: renderer.machineGunPreview?.valid,
      gun: game.emplacements.get(0),
      mounted: game.players[0].mountedGun !== undefined,
      goals: training ? [...training.progress[training.lesson]] : [],
    }),
    manual:()=>{reviewManual=true;},
    training:(index:number)=>{if(!training)throw Error("Not a training operation");training.select(index);start();return training.id;},
    advance:advanceReview,
    combat:combatReview,
    survey:(firstPerson:boolean,detail?:string)=>{
      const poses:Record<string,[number,number,number,number]>={training:[0,66,0,47],industrial:[-18,3,0,0],trenches:[-10,-16,8,-8],verdun:[-10,-18,8,0],village:[-23,-30,0,-15],headland:[-35,-4,5,-9],"fort-vaux":[-7.4,3,6,-2.2]};
      const villageDetails:Record<string,[number,number,number,number]>={school:[-41,-63,-46,-48],inn:[41,-63,46,-48],street:[-36,-19,-17,-5],"manor-room":[-3.3,-2.4,-6.8,-5.6]};
      const fortDetails:Record<string,[number,number,number,number]>={cistern:poses["fort-vaux"],barracks:[-35.4,2,-23,-1],casemate:[34.5,1,23,-1],yard:[-6,19,7,18]};
      const view = detail ? (map.fort ? fortDetails[detail] : map.id === "village" ? villageDetails[detail] : undefined) : poses[map.id];
      if (!view) throw Error("Unknown review viewpoint");
      const [x,z,tx,tz]=view,p=game.players[0];
      let at={x,z};
      for(const dx of [0,-2,2,-4,4])for(const dz of [0,-2,2,-4,4])if(!blocked(x+dx,z+dz,.7,game.map)&&blocked(at.x,at.z,.7,game.map))at={x:x+dx,z:z+dz};
      if(blocked(at.x,at.z,.7,game.map))throw Error("Review camera has no clear footing");
      game.respawn(p);Object.assign(p,{...at,y:groundHeight(at.x,at.z,game.map),yaw:Math.atan2(tx-at.x,-(tz-at.z)),pitch:-.04,protectedUntil:Infinity});
      preferredFirstPerson=firstPerson;p.command={...idle(),firstPerson};
      battlefield.reset(game);renderer.remember(game);renderer.draw(game,1,0,false);hud(performance.now());
      const weapon=renderer.app.root.findByName("first-person weapon and arms") as Entity|null;
      for(const component of weapon?.findComponents("render")??[])component.enabled=!detail;
      return {tick:game.tick,frames:reviewFrames};
    },
    finish:()=>recording?.stop(),
  }});
  menu(
    map.id !== "industrial" ? map.name : "Sector Control",
    training
      ? "Learn by doing: eight resettable field exercises teach movement, every weapon, grenades, smoke, bayonets, artillery, destruction and squad combat. No match timer or random shelling. Visit the numbered boards, or use Escape to change exercise, resupply and choose faction equipment."
      : map.id === "verdun"
      ? `France faces Imperial Germany across a longer forest front. Capture the ruined Broken Relay between the trench systems. ${teamSize} soldiers per team · five-flag domination. Verdun-inspired, 1917.`
      : map.id === "headland"
      ? `France pushes out along the headland from the mainland road; Imperial Germany holds the lighthouse on the tip. Take the park, the fountain square and the walled green. Low garden walls and street cover break up the approaches; shellfire clears a path through them. ${teamSize} soldiers per team · three-flag domination · first to 300 or eight minutes.`
      : map.fort
      ? `France and Imperial Germany fight for the flooded cistern under Fort Vaux. The service passage and open yard connect the barracks and east casemate. ${teamSize} soldiers per team · three-flag domination · no artillery.`
      : map.id === "village"
      ? `Fight through orchard gardens, workyards and paved courtyards to hold Saint-Martin Manor. Use low destructible cover between the houses; smoke screens the streets and artillery opens new routes. ${teamSize} soldiers per team · domination · first to 300 or eight minutes.`
      : map.id === "trenches"
        ? `Capture flags A–D in the front trenches and hold them to score. Use smoke and advancing squads to take enemy flags. Step down when pinned. ${teamSize} soldiers per team · domination · first to 300 or eight minutes.`
        : "Capture. Hold. Prevail. Lead Blue Team through an eight-minute fight for three industrial sectors.",
    "Begin operation",
    start,
    training ? `<details class="training-settings"><summary>Choose another battlefield</summary>${battlefieldChoices()}</details>` : `${battlefieldChoices()}<div class="brief"><b>01 / ${map.scoring === "domination" ? "DOMINATION" : map.scoring === "eliminations" ? "HOLD THE LINE" : "CAPTURE"}</b><p>${map.scoring === "domination" ? `Capture flags ${map.sectors[0].id}–${map.sectors.at(-1)!.id}. Each uncontested flag earns one point every three seconds. Neutral flags take 15 seconds to capture; enemy flags must first be neutralized. Stay near the flag with a clear path to it. First to 300 points wins, or the higher score after eight minutes. Kills do not award team points.` : map.scoring === "eliminations" ? "Eliminate exposed enemies from the firing step. The trench floor hides you from opposing trenches. Near misses can drive bots into cover, opening a chance to advance." : "Hold sectors A, B, and C to earn points."}</p><b>02 / ENGAGE</b><p>Move with WASD. Press T to switch first/third person. Hold right mouse to aim through the iron sights; release to return to your chosen view. Click left mouse once per shot.${map.id !== "industrial" ? " Your five-round service rifle cycles its bolt between shots; R loads a clip. V thrusts with the bayonet; sprint forward before pressing V to charge. Charges turn slowly and leave a longer recovery. Machine gunners provide covering bursts." : ""} Press G for a brief overhand grenade throw: three per spawn, three-second fuse after release. Press C to crouch and move slowly behind cover; press C again to stand. Space stands you up to hop or mantle when there is room. Press F for a smoke grenade: two per spawn, about 20 seconds of concealing smoke. Bots lose sight through it. Throws follow your look direction in a shallow arc; aim higher for more range. Throwing keeps your chosen view.${map.terrain ? ` Press Space to hop or climb out of a trench; walk over an edge to drop in.${map.id === "trenches" ? " Use raised firing steps to shoot and throw over the trench lip." : " Use ruined walls and sunken approaches for cover."}` : " Press Space for a small hop."}</p><b>03 / SURVIVE</b><p>${map.artillery === false ? "Press Q to open the floor plan. Use the service passage or sunken yard to go around a blocked gallery. Grenades can break timber cover." : "Press Q for the tactical map, then click a broad sector. Press Q or right-click to cancel. You can call from cover; blind calls drift farther, and shells scatter. The battle continues while choosing. First charge at 10 seconds, then a shared 30-second cooldown. Listen for falling shells and use earth cover; direct hits remain deadly."} Reload with R; trying to fire an empty weapon reloads it if you have reserve ammo. You redeploy five seconds after death.</p></div>`,
  );
  requestAnimationFrame(frame);
} catch (error) {
  menu(
    "Unable to initialize",
    "A WebGL 2 capable desktop browser is required. " + String(error),
    "Reload",
    () => location.reload(),
  );
  console.error(error);
}
