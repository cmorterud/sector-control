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
import { factions, factionFor, kitFor, riflemanWeapon, scoped, type Loadout, type WeaponSlot, type FactionId } from "./loadouts";
import { battlefieldCard } from "./battlefield-info";
import { loadControls, saveControls, keyLabel, SprintInput, type ControlAction } from "./controls";
import { ControlsPanel } from "./controls-panel";
import { EscapePause } from "./escape-pause";
import { sighted } from "./player-view";
import { villageMap } from "./village-map";
import { headlandMap } from "./headland-map";
import { fortVauxMap } from "./fort-vaux-map";
import { zeppelinMap } from "./zeppelin-map";
import { weaponProfiles } from "./weapons";
import "./style.css";
import { ArtilleryMap, mapCallKey } from "./artillery-map";
import { Minimap } from "./minimap";
import { flagContains } from "./domination";
import { Renderer } from "./rendering";
import {
  Game,
  TestCollision,
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
import { chargePromptReady, whistleNotice, whistleReadyIn } from "./charge";
import { playChargeYell, playWhistle } from "./charge-audio";
import { BattleAudio } from "./battle-audio";
import { smokeRules } from "./smoke";
import { BattlefieldFeedback } from "./battlefield";
import { weaponAim } from "./recoil";
import { CrouchToggle, eyeHeightOf } from "./crouch";
import { PlaytestRecorder } from "./playtest";
import { AutoQuality, parseQuality, qualityStorageKey, type Quality, type QualityChoice } from "./graphics-quality";
import { mantleLanding, dist, groundHeight, industrialMap, blocked, beyondPlayArea, trenchGround, bodyBlocked, supportHeight } from "./map";
import { boundaryCountdown } from "./boundary";
import { dugouts, signboards } from "./trench-dressing";
import { trenchMap } from "./trench-map";
import { nightRaidMap } from "./night-map";
import { lightAt } from "./night";
import { flareRules } from "./flares";
import { carriedFlag, ctfMap, ctfRules, supportsCtf } from "./ctf";
import { CtfAnnouncer, ctfBrief, ctfLabels, ctfPrompt, ctfStrip, modeChoice } from "./ctf-hud";
import { masked } from "./gas";
import { GasAudio, GasOverlay, GasScreen, gasNotice, gasStatus } from "./gas-ui";
import { reinforcementsLeft } from "./reinforcements";
import { ReinforcementNotices, outOfReinforcements, reinforcementEndReason, reinforcementTally, spectateTarget } from "./reinforcement-hud";
import { soldierName } from "./soldier-names";
const root = document.querySelector<HTMLDivElement>("#ui")!;
root.innerHTML = `<div id="hud"><header><div class="brand">SC <span>SECTOR CONTROL</span></div><div class="match"><div><b class="blue" id="blue">0</b><span id="clock">08:00</span><b class="red" id="red">0</b></div><nav id="sectors"></nav></div><div class="hint">TAB · SCOREBOARD<br>ESC · PAUSE</div></header><div id="labels"></div><div id="reticle">＋</div><div id="hit">×</div><div id="capture"></div><div id="artillery-status"></div><footer><div id="health"></div><div class="controls">WASD MOVE　 SHIFT SPRINT　 RMB AIM　 LMB FIRE　 R RELOAD　 V MELEE</div><div id="ammo"></div></footer><div id="suppression"></div><div id="damage"></div></div><div id="menu" class="overlay"></div><div id="scoreboard" class="overlay hidden"></div>`;
const el = (id: string) => document.getElementById(id)!;
const combatFeedback=new CombatFeedback(),combatOverlay=document.createElement("div");
combatOverlay.id="combat-feedback";el("hud").append(combatOverlay);
const battleSidebar = document.createElement("aside");
battleSidebar.className = "battle-sidebar";
battleSidebar.hidden = true;
battleSidebar.innerHTML = '<div id="minimap" role="img" aria-label="North-up battlefield minimap"></div><ol id="kill-feed" aria-label="Kill feed"></ol>';
const killNotice = document.createElement("div");
killNotice.className = "kill-notice";
killNotice.setAttribute("role", "status");
const boundaryNotice = document.createElement("div");
boundaryNotice.className = "boundary-warning";
boundaryNotice.setAttribute("role", "alert");
// Capture the flag's announcer line, across the upper middle of the screen.
const flagNotice = document.createElement("div");
flagNotice.className = "ctf-announcer";
flagNotice.setAttribute("role", "status");
const ctfAnnouncer = new CtfAnnouncer();
const reinforcementNotice = document.createElement("div");
reinforcementNotice.className = "reinforcement-notice";
reinforcementNotice.setAttribute("role", "status");
const reinforcementTallyBox = document.createElement("section");
const spectateLabel = document.createElement("div");
spectateLabel.className = "spectate-label";
spectateLabel.setAttribute("role", "status");
let spectateNext = false;
const gasWarning = document.createElement("div");
gasWarning.className = "gas-warning";
gasWarning.setAttribute("role", "status");
el("hud").append(battleSidebar, killNotice, boundaryNotice, flagNotice, reinforcementNotice, spectateLabel, gasWarning);
const gasScreen = new GasScreen(el("hud")), minimapGas = new GasOverlay(), tacticalGas = new GasOverlay();
const gasAudio = new GasAudio(() => audio);
root.querySelector(".match")!.append(reinforcementTallyBox);
const reinforcementNotices = new ReinforcementNotices(), teamName = (team: "blue" | "red") => factions[factionFor(map, team)].name;
const minimap = new Minimap(el("minimap")), killFeed = el("kill-feed");
let displayedFeed = "";
let displayedScoreboard = "";
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
  // One span per hint so a wrapping bar never splits a key from its action.
  const hints = [
    `${hint("forward")}${hint("left")}${hint("backward")}${hint("right")} MOVE`, `${hint("sprint")} SPRINT`, "RMB AIM", "LMB FIRE",
    `${hint("reload")} RELOAD`, `${hint("melee")} MELEE`, `${hint("sprint")} + ${hint("melee")} BAYONET CHARGE`, `${hint("whistle")} WHISTLE`,
    `${hint("grenade")} GRENADE`, `${hint("smoke")} SMOKE`,
    `${hint("crouch")} CROUCH`, `${hint("mantle")} HOP / MANTLE`, `${hint("view")} CHANGE VIEW`,
    `${hint("primary")} / ${hint("sidearm")} WEAPONS`, `${hint("interact")} INTERACT`, `${hint("tactical")} TACTICAL MAP`,
  ];
  document.querySelector(".controls")!.replaceChildren(...hints.map(text => {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }));
  document.querySelector(".hint")!.innerHTML = `${hint("scoreboard")} · SCOREBOARD<br>ESC · PAUSE`;
}

let triggerDown = false;
let fire = false,
  aim = false,
  reload = false,
  mantle = false,
  grenade = false,
  smoke = false,
  melee = false,
  whistle = false;
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
let pendingArtillery: Command["artillery"], pendingFlare: Command["flare"], pendingGas: Command["gasStrike"];
let pendingMask = false;
const tacticalMap = new ArtilleryMap(
  () => game,
  (target, kind) => {
    if (kind === "flare") pendingFlare = target;
    else if (kind === "gas") pendingGas = target;
    else pendingArtillery = target;
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
tacticalMap.decorate = (grid) => tacticalGas.update(game, grid);
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
// Maps offered in the briefing. Industrial is no longer offered, but ?map=industrial
// still opens it for the CI combat and Armory browser checks.
const battlefields = [fortVauxMap, zeppelinMap, trainingMap, trenchMap, nightRaidMap, villageMap, verdunMap, headlandMap];
const requestedMap = params.get("map");
const chosenMap = [...battlefields, industrialMap].find(battlefield => battlefield.id === requestedMap) ?? fortVauxMap;
// ?mode=ctf plays capture the flag on a map that lays it out; domination stays the default.
const ctfMode = params.get("mode") === "ctf" && supportsCtf(chosenMap);
const map = ctfMode ? ctfMap(chosenMap) : chosenMap;
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
  const choices = battlefields.map((battlefield) => {
    if (battlefield.id === map.id)
      return battlefieldCard(battlefield);
    const query = new URLSearchParams({ map: battlefield.id, view: preferredFirstPerson ? "first" : "third" });
    return battlefieldCard(battlefield, `?${query}`);
  });
  return `<nav class="map-choice" aria-label="Battlefield">${choices.join("")}</nav>`;
}
function updateBriefControls() {
  const menuKeys: Record<string, ControlAction> = { WASD: "forward", Shift: "sprint", T: "view", R: "reload", V: "melee", G: "grenade", C: "crouch", F: "smoke", Space: "mantle", Q: "tactical", Z: "whistle" };
  for (const paragraph of Array.from(el("menu").querySelectorAll(".brief p")).slice(1)) {
    const original = (paragraph as HTMLElement).dataset.original ?? paragraph.textContent!;
    (paragraph as HTMLElement).dataset.original = original;
    paragraph.textContent = original.replace(/\b(WASD|Shift|T|R|V|G|C|F|Space|Q|Z)\b/g, (token: string) =>
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
  whistle = false;
  pendingArtillery = pendingGas = undefined;
  pendingMask = false;
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
    `<section class="panel"><div class="eyebrow">LOCAL OPERATIONS / ${map.name.toUpperCase()}</div><h1>${title}</h1><p>${subtitle}</p><a class="secondary armory-link" href="armory/" target="_blank" rel="noopener">Armory</a>${extra}${training?trainingMenu(training,started):""}<button class="secondary" id="controls-settings">Controls</button><div class="audio-settings"><label>Battlefield volume <input id="volume" type="range" min="0" max="100" value="${Math.round(audioVolume * 100)}"></label><label><input id="camera-reactions" type="checkbox" ${cameraReactions ? "checked" : ""}> Blast camera motion</label><label>Graphics <select id="quality"><option value="auto">Auto · ${qualityLabel(autoQuality.quality)}${autoQuality.done ? "" : ", testing"}</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><button id="primary">${button} <span>→</span></button><div class="fine">DESKTOP · HEADPHONES RECOMMENDED · WEBGL 2</div></section>`;
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
  loadouts.innerHTML = `<label>Deployment loadout <select id="loadout"><option value="rifleman">Rifleman · ${riflemanWeapon(factionFor(map,"blue"),kitFor(map))}</option><option value="marksman">Marksman · ${faction.scoped} · 4×</option><option value="support">Support · ${faction.support}</option><option value="emplacement">Support · Emplacement kit</option></select></label><small>${faction.pistol} sidearm · ${started ? "Changes apply on your next spawn" : "Choose before deployment"}</small>`;
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
// Phones and some embedded browsers have no Pointer Lock API at all.
const pointerLockSupported = "requestPointerLock" in Element.prototype;
function mouseCaptureFailed() {
  mouseCapturePending = false;
  // Escape resumes immediately. A denied recapture must not pause it again;
  // wait for another fresh gameplay key/click instead of retrying on a timer.
  if (mouseCaptureNeeded && !paused) return;
  pause();
  el("menu").querySelector("p")!.textContent = pointerLockSupported
    ? "Mouse capture was denied. Click Resume to retry."
    : "This browser can't capture the mouse, so Sector Control can't be played here. Open it in a desktop browser with a keyboard and mouse.";
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
  ctfAnnouncer.reset();
  reinforcementNotices.reset();
  displayedScoreboard = "";
  el("scoreboard").replaceChildren();
  audio ??= new BattleAudio();
  audio.reset();
  audio.volume(audioVolume);
  if (params.has("playtest"))
    recording = new PlaytestRecorder(
      renderer.canvas,
      // The render review ends its own recording with finish(). A wall-clock limit
      // there would publish the log early whenever a slow renderer took its time.
      renderReview ? Infinity : Math.max(5, Math.min(120, Number(params.get("clip") ?? 60) || 60)),
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
    training?"Resume your exercise, change gear, resupply or choose another station below.":reinforcementsLeft(game,game.players[0].team)?"Press Escape or click Resume to continue. Redeploy ends this life and respawns you in five seconds.":"Press Escape or click Resume to continue. Your side has no reinforcements left, so there is no redeploy.",
    "Resume operation",
    () => resume(),
    `<div class="pause-actions">
      <button class="secondary" id="redeploy" ${game.players[0].hp<=0 || !reinforcementsLeft(game,game.players[0].team) ? "disabled" : ""} title="Die now and redeploy at your team spawn in five seconds">Redeploy</button>
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
  reinforcementNotices.event(game, e, performance.now(), teamName);
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
  // The pop of the burst and the hiss of it burning, heard across the field.
  if (e.type === "flare" && e.phase === "burst" && dist(game.players[0], e.at) < 130) {
    const near = Math.max(0.25, 1 - dist(game.players[0], e.at) / 130);
    sound(1500, 0.1, 0.05 * near);
    sound(2700, 2.4, 0.012 * near);
  }
  if (e.type === "flare" && e.phase === "call" && e.actor === 0) {
    artilleryNotice = "FLARE AWAY · LIGHT IN 3s";
    artilleryNoticeUntil = performance.now() + 3000;
    sound(880, 0.2, 0.05);
  }
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
  const whistled = whistleNotice(game, e, listener);
  if (whistled) {
    callout = whistled;
    calloutUntil = performance.now() + 2600;
  }
  if (e.type === "whistle" && audio && dist(listener, e.at) < 120) {
    playWhistle(audio, e.actor === 0 ? null : e.at);
    const men = e.recruits.map((id) => game.players.find((q) => q.id === id)!).filter((q) => q && q.hp > 0);
    const voices = men.length + Number(e.actor !== 0);
    if (voices) {
      const at = [...men, ...(e.actor !== 0 ? [game.players.find((q) => q.id === e.actor)!] : [])]
        .reduce((a, q) => ({ x: a.x + q.x / voices, y: a.y + (q.y + 1.6) / voices, z: a.z + q.z / voices }), { x: 0, y: 0, z: 0 });
      playChargeYell(audio, at, voices);
    }
  }
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
    // Gas burns every half second; a thud each time would drown everything.
    if (e.kind !== "gas") sound(60, 0.2, 0.12);
  }
  if (e.type === "gasMask" && e.actor === 0) gasAudio.seal();
  if (e.type === "gasStrike" && e.phase === "call" && e.actor === 0) {
    artilleryNotice = "GAS SHELLS AWAY · CLOUD IN 3s";
    artilleryNoticeUntil = performance.now() + 3000;
    sound(520, 0.25, 0.06);
  }
  // Soft pops rather than blasts; close by, someone shouts it.
  if (e.type === "gasStrike" && e.phase === "land" && game.players[0].hp > 0 && dist(game.players[0], e.at) < 40) {
    sound(140, 0.25, 0.05);
    if (dist(game.players[0], e.at) < 25) { callout = "GAS! GAS!"; calloutUntil = performance.now() + 2500; gasAudio.gong(0.5); }
  }
  if (
    e.type === "reload" &&
    e.actor === 0 &&
    game.players[0].weapon !== "serviceRifle"
  )
    sound(240, 0.15);
  if (e.type === "capture") sound(740, 0.35);
  if (e.type === "flag") {
    ctfAnnouncer.event(game, e);
    const ours = e.team === game.players[0].team;
    // A rising call for good news, a low one for bad.
    if (e.action === "capture") { sound(ours ? 330 : 880, 0.5, 0.05); sound(ours ? 247 : 1175, 0.6, 0.03); }
    else if (e.action === "take" || e.action === "pickup") sound(ours ? 280 : 660, 0.3, 0.04);
    else if (e.action === "return") sound(ours ? 620 : 360, 0.25, 0.035);
    else if (e.action === "overtime") sound(500, 0.8, 0.05);
  }
  if (e.type === "end") {
    paused = true;
    document.exitPointerLock();
    sound(440, 0.6);
    const result =
      e.winner === "draw" ? "Draw" : e.winner === "blue" ? "Victory" : "Defeat";
    const reason = reinforcementEndReason(game, teamName);
    menu(
      result,
      `Operation complete · ${reason ? reason + " · " : ""}${game.scoring === "ctf" ? "Capture the flag · " : game.scoring === "domination" ? "Domination · " : game.scoring === "eliminations" ? "Eliminations · " : ""}${factions[factionFor(map,"blue")].name} ${game.scores.blue} / ${factions[factionFor(map,"red")].name} ${game.scores.red}`,
      "Deploy again",
      start,
      battlefieldChoices() + table(),
    );
  }
}
function table() {
  return scoreboardTable(game);
}
const hudTargets = {
  combat: () => combatOverlay, training: () => trainingOverlay,
  health: () => el("health"), ammo: () => el("ammo"), capture: () => el("capture"),
  sectors: () => el("sectors"), labels: () => el("labels"),
};
const displayedHud: Partial<Record<keyof typeof hudTargets, string>> = {};
function hud(now: number) {
  // Build this tick's HUD markup first and touch the DOM only where it changed:
  // rewriting unchanged innerHTML every 50 ms reparses and relayouts it.
  const staged: Partial<Record<keyof typeof hudTargets, string>> = {};
  const p = game.players[0];
  const playing = !paused && !held("scoreboard");
  const aimingScope = p.hp > 0 && !paused && !tacticalMap.open && scoped(p) && sighted(p,game.tick);
  const clearHUD = playing && !tacticalMap.open;
  root.classList.toggle("dead",p.hp<=0);
  staged.combat=playing?combatFeedback.html(game,renderer.deathView?.yaw??weaponAim(p).yaw):"";
  battleSidebar.hidden = !clearHUD || aimingScope;
  if (!battleSidebar.hidden) {
    minimap.update(game, game.scoring !== "eliminations" && (!training || training.lesson >= 6));
    minimapGas.update(game, el("minimap"));
    const feed = (game.ctf ? ctfAnnouncer.killFeed(game) : "") + combatFeedback.killFeed(game);
    if (feed !== displayedFeed) {
      killFeed.innerHTML = displayedFeed = feed;
    }
  }
  const confirmation = clearHUD ? combatFeedback.killConfirmation(game) : "";
  if (killNotice.textContent !== confirmation) killNotice.textContent = confirmation;
  const flagLine = clearHUD && game.ctf ? ctfAnnouncer.notice(game) : "";
  if (flagNotice.innerHTML !== flagLine) flagNotice.innerHTML = flagLine;
  root.classList.toggle("flag-carrier", !!game.ctf && p.hp > 0 && !!carriedFlag(game, p));
  const countdown = boundaryCountdown(game, p),
    outside = !paused && p.hp > 0 && countdown !== null && beyondPlayArea(p.x, p.z, game.map) > 0,
    boundaryText = outside ? `OUT OF BOUNDS · RETURN TO THE LINE · ${countdown ? `ARTILLERY IN ${countdown}` : "ARTILLERY INBOUND"}` : "";
  if (boundaryNotice.textContent !== boundaryText) boundaryNotice.textContent = boundaryText;
  const gasLine = paused ? { text: "", danger: false } : gasNotice(game, p, keyLabel(settings.bindings.mask));
  if (gasWarning.textContent !== gasLine.text) gasWarning.textContent = gasLine.text;
  gasWarning.classList.toggle("danger", gasLine.danger);
  gasScreen.update(game, p, preferredFirstPerson && !renderer.deathView, !paused && !tacticalMap.open);
  root.classList.toggle("out-of-bounds", outside);
  const tally = training ? "" : reinforcementTally(game), notice = paused ? "" : reinforcementNotices.text(now);
  if (reinforcementTallyBox.innerHTML !== tally) reinforcementTallyBox.innerHTML = tally;
  if (reinforcementNotice.textContent !== notice) reinforcementNotice.textContent = notice;
  reinforcementNotice.classList.toggle("urgent", reinforcementNotices.urgent(now));
  renderer.spectating = spectateTarget(game, renderer.spectating, spectateNext);
  spectateNext = false;
  const watched = renderer.spectating === null ? undefined : game.players[renderer.spectating];
  const watching = watched && !paused ? `WATCHING ${soldierName(watched, game.map)} · LMB NEXT` : "";
  if (spectateLabel.textContent !== watching) spectateLabel.textContent = watching;
  el("reticle").classList.toggle("hidden", sighted(p, game.tick) && !scoped(p));
  el("blue").textContent = String(game.scores.blue);
  el("red").textContent = String(game.scores.red);
  const t = Math.ceil((game.duration - game.tick) / 30);
  el("clock").textContent = `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${(t % 60).toString().padStart(2, "0")}`;
  if(training)el("clock").textContent="TRAINING";
  staged.sectors = game.ctf ? ctfStrip(game) :
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
    staged.sectors='<span class="mode-tag">FIELD EXERCISES<small>NO TIME LIMIT</small></span>';
    trainingOverlay.hidden=paused;staged.training=trainingHUD(training,game,settings);
  }
  staged.health =
    `<small>VITALS / ${factions[p.faction ?? factionFor(map,p.team)].name.toUpperCase()}</small><strong>${Math.ceil(p.hp)}<em> HP</em></strong><div class="bar"><i style="width:${p.hp}%"></i></div>${game.tick < p.protectedUntil && p.hp > 0 ? "<small>SPAWN PROTECTION</small>" : ""}`;
  root.classList.toggle("scoped", aimingScope);
  staged.ammo =
    `<small>${p.weaponId ?? weaponProfiles[p.weapon].label}</small><strong>${p.ammo}<em> / ${p.reserve}</em></strong><small>${p.melee ? (p.melee.kind === "charge" ? "BAYONET CHARGE / RECOVERY" : "MELEE / RECOVERY") : p.reloadAt ? "RELOADING · " + ((p.reloadAt - game.tick) / 30).toFixed(1) + "s" : p.weapon === "serviceRifle" && game.tick < p.nextShot ? "CYCLING BOLT · " + ((p.nextShot - game.tick) / 30).toFixed(1) + "s" : p.weapon === "serviceRifle" ? "BOLT ACTION · CLICK TO FIRE" : p.weapon === "machineGun" ? "AUTO · HOLD TO FIRE / BRACE FOR ACCURACY" : "SEMI · CLICK TO FIRE"}</small><small>${keyLabel(settings.bindings.grenade)} · GRENADES ${p.grenades}　 ${keyLabel(settings.bindings.smoke)} · SMOKE ${p.smokes}</small>`;
  const readyIn = Math.max(
    0,
    Math.ceil((game.artillery.readyAt[p.team] - game.tick) / 30),
  );
  const flareIn = Math.max(0, Math.ceil((game.flares.readyAt[p.team] - game.tick) / 30));
  const whistleIn = Math.ceil(whistleReadyIn(game, p.team) / 30);
  staged.ammo += `<small>${keyLabel(settings.bindings.whistle)} · WHISTLE ${whistleIn ? whistleIn + "s" : "READY"}</small>`;
  staged.ammo += `<small>${keyLabel(settings.bindings.tactical)} · ${game.map.artillery === false
    ? "FLOOR PLAN" : `ARTILLERY ${readyIn ? readyIn + "s" : "READY"}${game.map.night ? ` · FLARE ${flareIn ? flareIn + "s" : "READY"}` : ""}`}</small>`;
  if (game.map.artillery !== false) staged.ammo += `<small>${gasStatus(game, p, keyLabel(settings.bindings.mask))}</small>`;
  tacticalMap.update();
  el("artillery-status").textContent =
    now < artilleryNoticeUntil ? artilleryNotice : now < calloutUntil ? callout : "";
  const sector =
    game.scoring !== "eliminations" && !game.ctf
      ? game.sectors.find((s) =>
          game.scoring === "domination"
            ? flagContains(game, p, s)
            : dist(s, p) <= 8,
        )
      : undefined;
  if (sector)
    staged.health +=
      `<small>${game.scoring === "domination" ? "FLAG" : "SECTOR"} ${sector.id}${sector.name ? " · " + sector.name.toUpperCase() : ""} · ${sector.contested ? "CONTESTED" : (sector.owner?.toUpperCase() ?? "NEUTRAL")}</small>`;
  const ledge =
    map.terrain &&
    !p.mantle &&
    !p.hop &&
    !p.fall &&
    mantleLanding(p, { x: Math.sin(p.yaw), z: -Math.cos(p.yaw) }, game.map);
  staged.capture =
    p.hp <= 0
      ? outOfReinforcements(game, p) ? "<h2>NO REINFORCEMENTS</h2>" : `<h2>SOLDIER DOWN</h2><p>Redeploying in ${Math.ceil((p.respawnAt - game.tick) / 30)}s</p>`
      : p.mantle
        ? "<small>CLIMBING TRENCH EDGE</small>"
        : ledge && !(game.scoring === "domination" && sector)
          ? `<small>${keyLabel(settings.bindings.mantle)} · MANTLE</small>`
          : p.melee?.kind === "charge" && !p.melee.struck
            ? "<small class=\"charge-prompt\">BAYONET CHARGE · KEEP SPRINTING</small>"
          : chargePromptReady(game, p)
            ? `<small class="charge-prompt">${keyLabel(settings.bindings.melee)} · BAYONET CHARGE</small>`
          : sector
            ? `<small>${game.scoring === "domination" ? "FLAG" : "SECTOR"} ${sector.id}${sector.name ? " · " + sector.name.toUpperCase() : ""} · ${sector.contested ? "CONTESTED" : sector.owner === p.team ? "DEFENDING" : sector.owner ? "NEUTRALIZING" : "CAPTURING"}</small><div class="bar"><i class="${sector.control < 0 ? "redbar" : ""}" style="width:${Math.abs(sector.control) * 100}%"></i></div>`
            : "";
  const flagPrompt = game.ctf && !p.mantle ? ctfPrompt(game, p) : "";
  if (flagPrompt) staged.capture = flagPrompt + (ledge ? `<small>${keyLabel(settings.bindings.mantle)} · MANTLE</small>` : "");
  const gun = mountedGun(game, p);
  const nearby = p.hp > 0 && !gun && game.emplacements.size ? nearbyGun(game, p) : undefined;
  const deployKey = keyLabel(settings.bindings.emplace), useKey = keyLabel(settings.bindings.interact);
  const placement = renderer.machineGunPreview;
  if (gun) {
    const loading = gun.reloadAt ? `RELOADING · ${((gun.reloadAt - game.tick) / 30).toFixed(1)}s` : "90° TRAVERSE · HOLD FIRE";
    const traverse = 50 + (gun.yaw - gun.baseYaw) / emplacementRules.traverse * 50;
    staged.ammo = `<small>${gun.weaponId} · ${Math.ceil(gun.hp)} HP</small><strong>${gun.ammo}<em> / ${gun.reserve}</em></strong><small>${loading}</small><div class="gun-traverse" aria-label="Gun traverse"><i style="left:${traverse}%"></i></div><small>${useKey} · DISMOUNT</small>`;
  } else if (placement) {
    staged.capture = placement.valid
      ? `<small>LMB · SET UP ${emplacementWeapon(p).toUpperCase()}　 ${deployKey} · CANCEL</small>`
      : `<small>${placement.reason}　 ${deployKey} · CANCEL</small>`;
  } else if (nearby) {
    const setup = nearby.readyAt - game.tick;
    const pack = nearby.owner === p.id && p.loadout === "emplacement" ? `　 ${deployKey} · PACK UP` : "";
    const action = setup > 0 ? `SETTING UP · ${(setup/30).toFixed(1)}s`
      : nearby.operator !== undefined ? "IN USE" : `${useKey} · MOUNT${pack}`;
    staged.capture = `<small>${nearby.weaponId} · ${action}</small>`;
  } else if (p.hp > 0 && p.loadout === "emplacement") {
    staged.ammo += `<small>${p.emplacementLost ? "EMPLACEMENT LOST · RESUPPLY ON RESPAWN" :
      game.emplacements.has(p.id) ? deployKey + " · PACK UP WHEN NEAR YOUR GUN" : deployKey + " · PREVIEW EMPLACEMENT"}</small>`;
  }
  const pickup = !gun && !nearby && !placement && p.hp > 0 && p.flameKit === undefined && nearestFlame(game,p);
  if (pickup) staged.capture = `<small>${keyLabel(settings.bindings.interact)} · EXCHANGE PRIMARY FOR FLAME KIT · ${(pickup.fuel/30).toFixed(1)}s FUEL</small>`;
  if (!gun && p.weapon === "flamethrower") staged.ammo = `<small>WEX-INSPIRED FLAME KIT · 8m</small><strong>${(p.ammo/30).toFixed(1)}<em>s FUEL</em></strong><small>HOLD FIRE · ${keyLabel(settings.bindings.sidearm)} PISTOL</small>`;
  el("suppression").style.opacity =
    p.hp > 0 ? String(p.suppression * 0.22) : "0";
  el("hit").style.opacity = now < hitUntil ? "1" : "0";
  el("damage").style.opacity = now < damageUntil ? ".65" : "0";
  const scoreboard = el("scoreboard");
  const showScoreboard = held("scoreboard");
  scoreboard.classList.toggle("hidden", !showScoreboard);
  if (showScoreboard) {
    const standings = table();
    if (standings !== displayedScoreboard) {
      const scroll = scoreboard.querySelector(".rosters")?.scrollTop ?? 0;
      scoreboard.innerHTML = `<section class="panel"><div class="eyebrow">LIVE OPERATION</div><h2>Scoreboard</h2>${standings}</section>`;
      scoreboard.querySelector(".rosters")!.scrollTop = scroll;
      displayedScoreboard = standings;
    }
  }
  el("labels").classList.toggle("aiming", aim);
  staged.labels =
    game.ctf ? ctfLabels(game, (v) => renderer.project(v), p)
    : game.scoring === "eliminations" || (training&&training.lesson<6)
      ? ""
      : game.sectors
          .map((s) => {
            const v = renderer.project({
              x: s.x,
              y: (s.y ?? groundHeight(s.x, s.z, game.map)) + 4,
              z: s.z,
            });
            return v.z > 0
              ? `<div class="objective ${s.contested ? "contested" : (s.owner ?? "")}" aria-label="${s.id}${s.name ? " · " + s.name : ""}${s.contested ? " · Contested" : ""}" style="left:${v.x}px;top:${v.y}px">${s.id}${s.contested ? " · !" : ""}<small>${Math.round(dist(p, s))}m</small></div>`
              : "";
          })
          .join("");
  for (const key of Object.keys(staged) as (keyof typeof hudTargets)[]) {
    const markup = staged[key]!;
    if (displayedHud[key] !== markup) hudTargets[key]().innerHTML = displayedHud[key] = markup;
  }
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
  c.flare = pendingFlare;
  c.gasStrike = pendingGas;
  c.gasMask = pendingMask;
  pendingArtillery = pendingFlare = pendingGas = undefined;
  pendingMask = false;
  c.aim = aim && !tacticalMap.open;
  c.firstPerson = preferredFirstPerson;
  c.reload = reload;
  c.mantle = mantle;
  c.grenade = grenade;
  c.smoke = smoke;
  c.melee = melee;
  c.whistle = whistle && !tacticalMap.open;
  melee = whistle = false;
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
  if (tacticalMap.open && e.code === mapCallKey && !e.repeat) tacticalMap.toggleMode();
  // The mask works with the map open too: gas does not wait.
  if (isKey("mask", e.code) && !e.repeat && game.players[0].hp > 0) pendingMask = true;
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
  if (isKey("whistle", e.code) && !e.repeat) whistle = true;
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
  // Out of reinforcements, the trigger cycles which teammate you watch.
  if (outOfReinforcements(game, game.players[0])) {
    if (e.button === 0) spectateNext = true;
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
  if(!renderReview||map.id!=="industrial"||!["hit","death","respawn","assist","kill"].includes(stage))throw Error("Unknown combat review");
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
  else if(stage==="kill")shoot(player,enemy,4);
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
      gasAudio.volume(audioVolume);
      gasAudio.update(game.players[0].hp > 0 && masked(game.players[0], game.tick));
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
    if (renderStart !== undefined && reviewFrames % 30 === 0) {
      const drawables = renderer.drawables();
      battlePerformance.gauge("drawables", drawables.total);
      for (const [root, n] of Object.entries(drawables.roots)) battlePerformance.gauge(`drawables: ${root}`, n);
    }
    if (started) { reviewFrames++; recording?.frame(game, rawFrameMs, paused); }
  });
  // Explicit diagnostic mode: advance the real simulation and presentation
  // without waiting for a software GPU to display every intermediate frame.
  // Normal play never installs this bridge or changes its frame loop.
  if(renderReview)Object.assign(window,{sectorRenderReview:{
    state:()=>({frames:reviewFrames,tick:started?game.tick:0,paused,...(started?{teamSize:game.teamSize,player:{x:game.players[0].x,z:game.players[0].z,crouched:game.players[0].crouched,firstPerson:preferredFirstPerson,ammo:game.players[0].ammo,hp:game.players[0].hp,assists:game.players[0].assists},combat:{marker:combatFeedback.marker(game),view:renderer.deathView,report:game.players[0].lastDeath,fov:renderer.camera.camera!.fov}}:{}),...(training&&started?{training:{id:training.id,loadout:game.players[0].loadout,faction:game.players[0].faction,free:training.free}}:{})}),
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
    // Night maps: put a flare over a point at once, and read the light the rule sees there.
    flare:(x:number,z:number)=>{game.flares.flares.push({id:++game.flares.sequence,team:"blue",actor:0,x,z,heading:Math.PI/2,burstAt:game.tick,endsAt:game.tick+flareRules.burnTicks});},
    light:(x:number,z:number)=>lightAt(game,{x,z}),
    combat:combatReview,
    // Capture the flag: stand a few metres from Red's north stand, or carry Red's centre flag.
    ctf:(stage:"pickup"|"carry")=>{
      const ctf=game.ctf;if(!ctf)throw Error("Not a capture-the-flag operation");
      reviewManual=true;keys.clear();preferredFirstPerson=false;
      const p=game.players[0],f=ctf.flags.find(f=>f.id===(stage==="pickup"?"D":"E"))!;
      const [x,z,tx,tz]=stage==="pickup"?[f.home.x+0.6,f.home.z+5,f.home.x,f.home.z]:[-20.5,-12,-20.5,-30];
      if(stage==="carry")Object.assign(f,{state:"carried",carrier:0,at:null});
      Object.assign(p,{x,z,y:groundHeight(x,z,game.map),vx:0,vz:0,yaw:Math.atan2(tx-x,-(tz-z)),pitch:-.12,protectedUntil:Infinity});
      yaw=p.yaw;pitch=p.pitch;p.command={...idle(),firstPerson:false};
      renderer.remember(game);advanceReview(2);
      return {flag:f.id,state:f.state,carrier:f.carrier};
    },
    survey:(firstPerson:boolean,detail?:string)=>{
      const poses:Record<string,[number,number,number,number]>={training:[0,66,0,47],industrial:[-18,3,0,0],trenches:[-10,-16,8,-8],"night-raid":[-10,-16,8,-8],verdun:[-10,-18,8,0],village:[-23,-30,0,-15],headland:[-35,-4,5,-9],"fort-vaux":[-6.4,5.6,5,-3]};
      const villageDetails:Record<string,[number,number,number,number]>={school:[-41,-63,-46,-48],inn:[41,-63,46,-48],street:[-36,-19,-17,-5],"manor-room":[-3.3,-2.4,-6.8,-5.6]};
      const fortDetails:Record<string,[number,number,number,number]>={cistern:poses["fort-vaux"],barracks:[-35.4,2,-23,-1],casemate:[34.5,1,23,-1],yard:[-6,19,7,18]};
      if (map.fort) {
        const { yard, yardPassage: { z } } = map.fort;
        fortDetails["yard-west"] = [yard.x0 - 5.5, z, 0, z];
        fortDetails["yard-east"] = [yard.x1 + 5.5, z, 0, z];
      }
      // Across the boundary wire behind Blue's spawn, and up Blue's front line to its trench block.
      // "no-mans-land" looks from the centre over a crater pond to Blue's wire belt.
      const trenchDetails:Record<string,[number,number,number,number]>={"boundary-wire":[-76,30,-84,42],"trench-block":[-28,54,-28,72],"boundary-walk":[-76,22,-92,22],"no-mans-land":[-3,-15,-12,-7]};
      // Along a rear trench to its first dugout, and in front of the first signboard.
      const dressed=map.backdrop&&!!map.terrain?.trenchLines?.length,dugout=dressed?dugouts(map)[0]:undefined,sign=dressed?signboards(map)[0]:undefined;
      // From the trench floor behind a Blue firing step, east toward the parapet
      // and the low sun: the shadowed bank a Blue player looks at most.
      const step=map.terrain?.firingPositions?.find(f=>f.team==="blue"&&Math.abs(f.z)<12);
      if(step)trenchDetails["firing-step"]=[step.x-2.6,step.z+0.6,step.x+40,step.z+0.6];
      if(dugout)trenchDetails["trench-dugout"]=[dugout.x-dugout.rear*1.2,dugout.z+4.5,dugout.x,dugout.z];
      if(sign)trenchDetails["trench-sign"]=[sign.x+sign.facing*1.6,sign.z+1.6,sign.x,sign.z];
      // Zeppelin viewpoints carry the deck they stand on: [x, z, toward x, toward z, deck].
      const zeppelinDetails:Record<string,[number,number,number,number,number]>={keel:[-47,-1,-20,-1,0],station:[-35,3,-25,-3,0],gallery:[-48,0,-30,0,5.1],"bomb-bay":[-8.5,-3.5,3,2,0],top:[-50,-1.2,0,0,12.75],"engine-car":[-25.5,9.6,40,8.5,0]};
      // Verdun: across the boundary wire behind Blue's spawn, and a walk out through it;
      // north out of the woods past the wire; west to the village, east to the fort's
      // ridge; and south along the continuing front.
      const verdunDetails:Record<string,[number,number,number,number]>={"boundary-wire":[-99,22,-108,32],"boundary-walk":[-100,6,-116,6],
        "dead-zone-woods":[-52,-57,-58,-96],"west-horizon":[-97,30,-186,46],"east-horizon":[97,-36,222,-46],"south-front":[58,56,68,140],
        // Through the woods to Shattered Wood (B), across Broken Relay (C), and along Blue's front trench.
        "woods":[-36,-53,-54,-36],"relay":[-15,5,0,0],"front-trench":[-67,-28,-67,-48],
        // Past a flooded shell scar to Blue's wire in front of its front line.
        "no-mans-land":[-46,-12,-58,-21]};
      if(map.id==="verdun"){if(trenchDetails["trench-dugout"])verdunDetails["trench-dugout"]=trenchDetails["trench-dugout"];if(trenchDetails["trench-sign"])verdunDetails["trench-sign"]=trenchDetails["trench-sign"];}
      const view = detail ? (map.fort ? fortDetails[detail] : map.sky ? zeppelinDetails[detail] : map.id === "village" ? villageDetails[detail] : map.id === "verdun" ? verdunDetails[detail] : trenchGround(map) ? trenchDetails[detail] : undefined) : map.sky ? zeppelinDetails.keel : poses[map.id];
      if (!view) throw Error("Unknown review viewpoint");
      const [x,z,tx,tz]=view,p=game.players[0],deck=map.sky?view[4]:undefined;
      const floor=(x:number,z:number)=>deck===undefined?groundHeight(x,z,game.map):supportHeight(x,z,game.map,deck+.23,.45);
      const unclear=(x:number,z:number)=>deck===undefined?blocked(x,z,.7,game.map):Math.abs(floor(x,z)-deck)>.3||bodyBlocked(x,z,floor(x,z),.6,game.map);
      let at={x,z};
      for(const dx of [0,-2,2,-4,4])for(const dz of [0,-2,2,-4,4])if(!unclear(x+dx,z+dz)&&unclear(at.x,at.z))at={x:x+dx,z:z+dz};
      if(unclear(at.x,at.z))throw Error("Review camera has no clear footing");
      game.respawn(p);Object.assign(p,{...at,y:floor(at.x,at.z),yaw:Math.atan2(tx-at.x,-(tz-at.z)),pitch:-.04,protectedUntil:Infinity});
      yaw = p.yaw;
      pitch = p.pitch;
      preferredFirstPerson=firstPerson;p.command={...idle(),firstPerson};
      battlefield.reset(game);renderer.remember(game);renderer.draw(game,1,0,false);hud(performance.now());
      const weapon=renderer.app.root.findByName("first-person weapon and arms") as Entity|null;
      for(const component of weapon?.findComponents("render")??[])component.enabled=!detail;
      return {tick:game.tick,frames:reviewFrames};
    },
    // Gas shells: skip ahead and stand the player at a point looking at
    // another, masked or not, optionally beside a gas shell cloud.
    gas:(tick:number,x:number,z:number,tx:number,tz:number,mask:boolean,firstPerson=true,cloud?:{x:number;z:number})=>{
      reviewManual=true;game.tick=Math.max(game.tick,Math.round(tick));const p=game.players[0];
      game.respawn(p);Object.assign(p,{x,z,y:groundHeight(x,z,game.map),yaw:Math.atan2(tx-x,-(tz-z)),pitch:-.04,protectedUntil:Infinity,vx:0,vz:0});
      p.gasMask=mask?{worn:true,since:game.tick-60,from:1}:null;
      if(cloud)game.gas.clouds.push({id:++game.gas.sequence,team:"red",actor:game.teamSize,...cloud,heading:Math.PI/2,landAt:game.tick-120,endsAt:game.tick+630});
      yaw=p.yaw;pitch=p.pitch;preferredFirstPerson=firstPerson;p.command={...idle(),firstPerson};
      renderer.remember(game);renderer.draw(game,1,0,false);hud(performance.now());
      return {tick:game.tick,hp:p.hp,masked:masked(p,game.tick)};
    },
    finish:()=>recording?.stop(),
  }});
  menu(
    map.id !== "industrial" ? map.name : "Sector Control",
    training
      ? "Learn by doing: eight resettable field exercises teach movement, every weapon, grenades, smoke, bayonets, artillery, destruction and squad combat. No match timer or random shelling. Visit the numbered boards, or use Escape to change exercise, resupply and choose faction equipment."
      : ctfMode
      ? `Capture the flag across the trench lines. Raid any of the enemy's three flags, carry it back to your support trench and defend your own. ${teamSize} soldiers per team · first to ${ctfRules.captureLimit} captures or eight minutes.${map.night ? " After dark you see about fifteen meters." : ""}`
      : map.id === "verdun"
      ? `France faces Imperial Germany across a longer forest front. Capture the ruined Broken Relay between the trench systems. ${teamSize} soldiers per team · five-flag domination. Verdun-inspired, 1917.`
      : map.id === "headland"
      ? `France pushes out along the headland from the mainland road; Imperial Germany holds the lighthouse on the tip. Take the park, the fountain square and the walled green. Low garden walls and street cover break up the approaches; shellfire clears a path through them. ${teamSize} soldiers per team · three-flag domination · first to 300 or eight minutes.`
      : map.sky
      ? `French boarders hold the stern of a German airship adrift above the clouds; its crew holds the bow. Fight along the keel, the gallery through the gas cells and the walk along the top for both engine stations and the bomb bay. ${teamSize}v${teamSize} · three-flag domination · no artillery.`
      : map.fort
      ? `France and Imperial Germany fight for the flooded cistern under Fort Vaux. The service passage and Sunken Yard connect the barracks and east casemate. ${teamSize}v${teamSize} · three-flag domination · no artillery.`
      : map.id === "village"
      ? `Fight through orchard gardens, workyards and paved courtyards to hold Saint-Martin Manor. Use low destructible cover between the houses; smoke screens the streets and artillery opens new routes. ${teamSize} soldiers per team · domination · first to 300 or eight minutes.`
      : map.id === "night-raid"
        ? `Trench front after dark. You can see about fifteen meters; beyond that, only what a lamp, a flare or a shell burst shows. Capture flags A–D and hold them to score. ${teamSize} soldiers per team · domination · first to 300 or eight minutes.`
      : map.id === "trenches"
        ? `Capture flags A–D in the front trenches and hold them to score. Use smoke and advancing squads to take enemy flags. Step down when pinned. ${teamSize} soldiers per team · domination · first to 300 or eight minutes.`
        : "Capture. Hold. Prevail. Lead Blue Team through an eight-minute fight for three industrial sectors.",
    "Begin operation",
    start,
    training ? `<details class="training-settings"><summary>Choose another battlefield</summary>${battlefieldChoices()}</details>` : `${battlefieldChoices()}${modeChoice(chosenMap, ctfMode, params)}<div class="brief"><b>01 / ${ctfMode ? "CAPTURE THE FLAG" : map.scoring === "domination" ? "DOMINATION" : map.scoring === "eliminations" ? "HOLD THE LINE" : "CAPTURE"}</b><p>${ctfMode ? ctfBrief({ map }) : map.scoring === "domination" ? `Capture flags ${map.sectors[0].id}–${map.sectors.at(-1)!.id}. Each uncontested flag earns one point every three seconds. Neutral flags take 15 seconds to capture; enemy flags must first be neutralized. Stay near the flag with a clear path to it. First to 300 points wins, or the higher score after eight minutes. Kills do not award team points.` : map.scoring === "eliminations" ? "Eliminate exposed enemies from the firing step. The trench floor hides you from opposing trenches. Near misses can drive bots into cover, opening a chance to advance." : "Hold sectors A, B, and C to earn points."}</p><b>02 / ENGAGE</b><p>Move with WASD. Press T to switch first/third person. Hold right mouse to aim through the iron sights; release to return to your chosen view. Click left mouse once per shot.${map.id !== "industrial" ? " Your five-round service rifle cycles its bolt between shots; R loads a clip. V thrusts with the bayonet; sprint forward before pressing V to charge. Charges turn slowly and leave a longer recovery. Press Z to blow your whistle: riflemen near you fix bayonets and go over the top with you, toward where you aim. Charges into alert rifles and machine guns die in the open; cover them with smoke, fire or shells. Machine gunners provide covering bursts." : ""} Press G for a brief overhand grenade throw: three per spawn, three-second fuse after release. Press C to crouch and move slowly behind cover; press C again to stand. Space stands you up to hop or mantle when there is room. Press F for a smoke grenade: ${smokeRules.perSpawn} per spawn, about 20 seconds of concealing smoke. Bots lose sight through it. Throws follow your look direction in a shallow arc; aim higher for more range. Throwing keeps your chosen view.${map.terrain ? ` Press Space to hop or climb out of a trench; walk over an edge to drop in.${map.id === "trenches" ? " Use raised firing steps to shoot and throw over the trench lip." : " Use ruined walls and sunken approaches for cover."}` : " Press Space for a small hop."}</p><b>03 / SURVIVE</b><p>${map.sky ? "Press Q to open the floor plan. Stair towers at each end and amidships climb to the gallery and the top walk; the engine stations' stairs reach the gallery. Rails keep you aboard, and grenades break only crates." : map.artillery === false ? "Press Q to open the floor plan. Use the service passage or sunken yard to go around a blocked gallery. Grenades can break timber cover." : "Press Q for the tactical map, then click a broad sector. Press Q or right-click to cancel. You can call from cover; blind calls drift farther, and shells scatter. The battle continues while choosing. First charge at 10 seconds, then a shared 30-second cooldown. Listen for falling shells and use earth cover; direct hits remain deadly."} Reload with R; trying to fire an empty weapon reloads it if you have reserve ammo. You redeploy five seconds after death.</p></div>`,
  );
  requestAnimationFrame(frame);
  // Build the bot navigation graph while the briefing is read rather than in
  // the Begin click; every match on this map then copies it.
  // Then compile the match's shaders on a stand-in deployment, so the first
  // frames after Begin don't stall on them.
  const prepare = () => {
    if (bots || training) prepareNavigation(map);
    if (started || renderReview) return;
    try {
      const standIn = new Game(new TestCollision(map), true, 30, 12345, undefined,
        { map, teamSize: training ? 4 : teamSize, humanPlayerIds: [0], ambientArtillery: false });
      standIn.selectLoadout(standIn.players[0], chosenLoadout);
      standIn.players[0].command.firstPerson = true;
      renderer.warmShaders(standIn);
    } catch (error) {
      console.warn("Shader warm-up skipped", error);
    }
  };
  if ("requestIdleCallback" in window) requestIdleCallback(prepare, { timeout: 2000 });
  else setTimeout(prepare, 500);
} catch (error) {
  menu(
    "Unable to initialize",
    "Sector Control needs a desktop browser with WebGL 2, a keyboard and a mouse. " + String(error),
    "Reload",
    () => location.reload(),
  );
  console.error(error);
}
