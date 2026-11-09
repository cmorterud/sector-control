import { EscapePause } from "./escape-pause";
import { sighted } from "./player-view";
import { villageMap } from "./village-map";
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
  type Command,
  type Event,
  type Soldier,
} from "./simulation";
import { BattleAudio } from "./battle-audio";
import { BattlefieldFeedback } from "./battlefield";
import { weaponAim } from "./recoil";
import { CrouchToggle, eyeHeightOf } from "./crouch";
import { PlaytestRecorder } from "./playtest";
import { mantleLanding, dist, groundHeight, industrialMap } from "./map";
import { trenchMap } from "./trench-map";
const root = document.querySelector<HTMLDivElement>("#ui")!;
root.innerHTML = `<div id="hud"><header><div class="brand">SC <span>SECTOR CONTROL</span></div><div class="match"><div><b class="blue" id="blue">0</b><span id="clock">08:00</span><b class="red" id="red">0</b></div><nav id="sectors"></nav></div><div class="hint">TAB · SCOREBOARD<br>ESC · PAUSE</div></header><div id="labels"></div><div id="reticle">＋</div><div id="hit">×</div><div id="capture"></div><div id="artillery-status"></div><footer><div id="health"></div><div class="controls">WASD MOVE　 SHIFT SPRINT　 RMB AIM　 LMB FIRE　 R RELOAD　 V MELEE</div><div id="ammo"></div></footer><div id="suppression"></div><div id="damage"></div></div><div id="menu" class="overlay"></div><div id="scoreboard" class="overlay hidden"></div>`;
const el = (id: string) => document.getElementById(id)!;
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
let triggerDown = false;
let fire = false,
  aim = false,
  reload = false,
  mantle = false,
  grenade = false,
  smoke = false,
  melee = false;
let pendingArtillery: Command["artillery"];
const tacticalMap = new ArtilleryMap(
  () => game,
  (target) => {
    pendingArtillery = target;
  },
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
const duration = Number(params.get("duration") ?? 480);
const map =
  params.get("map") === "village"
    ? villageMap
    : params.get("map") === "trenches"
      ? trenchMap
      : industrialMap;
const requestedTeamSize = params.has("teamSize")
  ? Number(params.get("teamSize"))
  : undefined;
let preferredFirstPerson = params.get("view") === "first";
document.querySelector(".controls")!.textContent +=
  "　 G GRENADE　 F SMOKE　 C TOGGLE CROUCH　 SPACE HOP / MANTLE　 T CHANGE VIEW　 Q TACTICAL MAP";
const teamSize = resolveTeamSize(map, requestedTeamSize);
function sound(freq: number, length = 0.08, volume = 0.04) {
  audio?.tone(freq, length, volume);
}
function clear() {
  keys.clear();
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
    `<section class="panel"><div class="eyebrow">LOCAL OPERATIONS / ${map.name.toUpperCase()}</div><h1>${title}</h1><p>${subtitle}</p>${extra}<div class="audio-settings"><label>Battlefield volume <input id="volume" type="range" min="0" max="100" value="${Math.round(audioVolume * 100)}"></label><label><input id="camera-reactions" type="checkbox" ${cameraReactions ? "checked" : ""}> Blast camera motion</label></div><button id="primary">${button} <span>→</span></button><div class="fine">DESKTOP · HEADPHONES RECOMMENDED · WEBGL 2</div></section>`;
  el("primary").onclick = action;
  el("volume").oninput = (e) => {
    audioVolume = Number((e.target as HTMLInputElement).value) / 100;
    audio?.volume(audioVolume);
  };
  el("camera-reactions").onchange = (e) =>
    (cameraReactions = (e.target as HTMLInputElement).checked);
}
function unpause() {
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
  recording?.dispose();
  recording = undefined;
  game = new Game(
    renderer,
    bots,
    Math.round(
      (Number.isFinite(duration) && duration > 0 ? duration : 480) * 30,
    ),
    12345,
    undefined,
    { map, teamSize, humanPlayerIds: autoplay ? [] : [0] },
  );
  renderer.reset(game);
  battlefield.reset(game);
  audio ??= new BattleAudio();
  audio.reset();
  audio.volume(audioVolume);
  if (params.has("playtest"))
    recording = new PlaytestRecorder(
      renderer.canvas,
      Math.max(5, Math.min(120, Number(params.get("clip") ?? 60) || 60)),
      params.get("video") !== "0",
      audio.capture.stream,
    );
  yaw = game.players[0].yaw;
  pitch = 0;
  started = true;
  hitUntil = damageUntil = 0;
  artilleryNotice = "";
  artilleryNoticeUntil = 0;
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
  if (started && game.phase === "playing")
    menu(
      "Operation paused",
      "Press Escape or click Resume to continue.",
      "Resume operation",
      () => resume(),
      '<button class="secondary" id="restart">Restart match</button>',
    );
  const restart = el("restart");
  if (restart) restart.onclick = start;
}
function handle(e: Event) {
  if (e.type === "melee" && e.phase === "strike" && e.actor === 0 && e.damage)
    hitUntil = performance.now() + 150;
  if ((e.type === "death" || e.type === "respawn") && e.actor === 0)
    crouchInput.reset();
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
      `Operation complete · ${game.scoring === "domination" ? "Domination · " : game.scoring === "eliminations" ? "Eliminations · " : ""}Blue ${game.scores.blue} / Red ${game.scores.red}`,
      "Deploy again",
      start,
      table(),
    );
  }
}
function table() {
  const capture = game.scoring !== "eliminations";
  const style = capture ? "" : ' style="grid-template-columns:1fr 35px 35px"';
  const header = `<div class="row"${style}><span>SOLDIER</span><span>K</span><span>D</span>${capture ? "<span>CAP</span>" : ""}</div>`;
  const row = (p: Soldier) =>
    `<div class="row ${p.team}"${style}><span>${p.id === 0 ? "YOU" : `${p.team.toUpperCase()} ${p.teamIndex + 1}`}</span><span>${p.kills}</span><span>${p.deaths}</span>${capture ? `<span>${p.captures}</span>` : ""}</div>`;
  if (game.teamSize > 8)
    return `<div class="rosters">${(["blue", "red"] as const)
      .map((team) => {
        const players = game.players.filter((p) => p.team === team);
        return `<div class="table"><b class="${team}">${team.toUpperCase()} · ${players.length}</b>${header}${players.map(row).join("")}</div>`;
      })
      .join("")}</div>`;
  return `<div class="table">${header}${game.players.map(row).join("")}</div>`;
}
function hud(now: number) {
  const p = game.players[0];
  el("reticle").classList.toggle("hidden", sighted(p, game.tick));
  el("blue").textContent = String(game.scores.blue);
  el("red").textContent = String(game.scores.red);
  const t = Math.ceil((game.duration - game.tick) / 30);
  el("clock").textContent = `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${(t % 60).toString().padStart(2, "0")}`;
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
  el("health").innerHTML =
    `<small>VITALS / BLUE TEAM</small><strong>${p.hp}<em> HP</em></strong><div class="bar"><i style="width:${p.hp}%"></i></div>${game.tick < p.protectedUntil && p.hp > 0 ? "<small>SPAWN PROTECTION</small>" : ""}`;
  el("ammo").innerHTML =
    `<small>${weaponProfiles[p.weapon].label}</small><strong>${p.ammo}<em> / ${p.reserve}</em></strong><small>${p.melee ? (p.melee.kind === "charge" ? "BAYONET CHARGE / RECOVERY" : "MELEE / RECOVERY") : p.reloadAt ? "RELOADING · " + ((p.reloadAt - game.tick) / 30).toFixed(1) + "s" : p.weapon === "serviceRifle" && game.tick < p.nextShot ? "CYCLING BOLT · " + ((p.nextShot - game.tick) / 30).toFixed(1) + "s" : p.weapon === "serviceRifle" ? "BOLT ACTION · CLICK TO FIRE" : "SEMI · CLICK TO FIRE"}</small><small>G · GRENADES ${p.grenades}　 F · SMOKE ${p.smokes}</small>`;
  const readyIn = Math.max(
    0,
    Math.ceil((game.artillery.readyAt[p.team] - game.tick) / 30),
  );
  el("ammo").innerHTML +=
    `<small>Q · ARTILLERY ${readyIn ? readyIn + "s" : "READY"}</small>`;
  tacticalMap.update();
  el("artillery-status").textContent =
    now < artilleryNoticeUntil ? artilleryNotice : "";
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
          ? "<small>SPACE · MANTLE TRENCH EDGE</small>"
          : sector
            ? `<small>${game.scoring === "domination" ? "FLAG" : "SECTOR"} ${sector.id}${sector.name ? " · " + sector.name.toUpperCase() : ""} · ${sector.contested ? "CONTESTED" : sector.owner === p.team ? "DEFENDING" : sector.owner ? "NEUTRALIZING" : "CAPTURING"}</small><div class="bar"><i class="${sector.control < 0 ? "redbar" : ""}" style="width:${Math.abs(sector.control) * 100}%"></i></div>`
            : "";
  el("suppression").style.opacity =
    p.hp > 0 ? String(p.suppression * 0.22) : "0";
  el("hit").style.opacity = now < hitUntil ? "1" : "0";
  el("damage").style.opacity = now < damageUntil ? ".65" : "0";
  if (keys.has("Tab")) {
    el("scoreboard").classList.remove("hidden");
    el("scoreboard").innerHTML =
      `<section class="panel"><div class="eyebrow">LIVE OPERATION</div><h2>Scoreboard</h2>${table()}</section>`;
  } else el("scoreboard").classList.add("hidden");
  el("labels").classList.toggle("aiming", aim);
  el("labels").innerHTML =
    game.scoring === "eliminations"
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
  const x = Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
    z = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  c.x = x * Math.cos(yaw) + z * Math.sin(yaw);
  c.z = x * Math.sin(yaw) - z * Math.cos(yaw);
  c.yaw = yaw;
  c.pitch = pitch;
  c.crouch = crouchInput.active;
  c.sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  c.fire = fire && !tacticalMap.open;
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
  if (["Tab", "Space", "ArrowUp", "ArrowDown"].includes(e.code))
    e.preventDefault();
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
  if (
    mouseCaptureNeeded &&
    !e.repeat &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "Space",
      "KeyR",
      "KeyC",
      "KeyG",
      "KeyF",
      "KeyV",
      "KeyQ",
      "KeyT",
    ].includes(e.code)
  )
    captureMouse();
  keys.add(e.code);
  if (e.code === "KeyC" && game.players[0].hp > 0) crouchInput.press(e.repeat);
  if (e.code === "KeyQ" && !e.repeat) {
    fire = aim = grenade = smoke = mantle = melee = false;
    tacticalMap.toggle();
  }
  if (tacticalMap.open && e.code !== "KeyR") return;
  if (e.code === "KeyT" && !e.repeat) preferredFirstPerson = !preferredFirstPerson;
  if (e.code === "KeyR") reload = true;
  if (e.code === "Space" && !e.repeat) mantle = true;
  if (e.code === "KeyG" && !e.repeat) grenade = true;
  if (e.code === "KeyF" && !e.repeat) smoke = true;
  if (e.code === "KeyV" && !e.repeat) melee = true;
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
  const sensitivity = aim ? 0.0013 : 0.002;
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
function frame(now: number) {
  rawFrameMs = now - last;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (started) {
    if (!paused) {
      const p = game.players[0],
        view = weaponAim(p);
      audio?.listener(
        { x: p.x, y: p.y + eyeHeightOf(p), z: p.z },
        view.yaw,
        view.pitch,
      );
      audio?.muffle(battlefield.state(game.tick).muffle);
      accumulator += dt;
      let steps = 0;
      while (accumulator >= 1 / 30 && steps++ < 4) {
        renderer.remember(game);
        const input =
          autoplay && game.players[0].hp > 0
            ? botCommand(game, game.players[0])
            : command();
        input.firstPerson = preferredFirstPerson;
        game.step(input);
        if (!autoplay && game.players[0].melee) yaw = game.players[0].yaw;
        for (const e of game.events) handle(e);
        battlefield.step(game);
        if (recording)
          recording.log.presentation = {
            feedback: { ...battlefield.stats },
            audio: audio ? structuredClone(audio.stats) : undefined,
            recent: [...battlefield.recent],
            soldiers: { ...renderer.soldierStats },
          };
        recording?.tick(game, input);
        accumulator -= 1 / 30;
        if (paused) break;
      }
    }
    renderer.artilleryPreview = null;
    renderer.cameraReaction = battlefield.state(
      game.tick - 1 + accumulator * 30,
      cameraReactions && !paused,
    );
    renderer.draw(
      game,
      accumulator * 30,
      paused ? 0 : dt,
      params.has("overview"),
    );
    if (now - uiTime > 50) {
      hud(now);
      uiTime = now;
    }
  }
  requestAnimationFrame(frame);
}
try {
  renderer = new Renderer(document.querySelector("#game")!, map);
  // Copy the WebGL surface while its drawing buffer is still available.
  renderer.app.on("postrender", () => {
    if (started) recording?.frame(game, rawFrameMs, paused);
  });
  menu(
    map.id !== "industrial" ? map.name : "Sector Control",
    map.id === "village"
      ? `Fight through the orchard, ruined schoolhouse and market courtyards. Cross the exposed road under smoke; artillery opens walls and leaves rubble. ${teamSize} soldiers per team · domination · first to 300 or eight minutes.`
      : map.id === "trenches"
        ? `Capture flags A–D in the front trenches and hold them to score. Use smoke and advancing squads to take enemy flags. Step down when pinned. ${teamSize} soldiers per team · domination · first to 300 or eight minutes.`
        : "Capture. Hold. Prevail. Lead Blue Team through an eight-minute fight for three industrial sectors.",
    "Begin operation",
    start,
    `<nav class="map-choice" aria-label="Battlefield"><a href="/" ${map.id === "industrial" ? 'aria-current="page"' : ""}>Industrial <small>5 vs 5</small></a><a href="/?map=trenches" ${map.id === "trenches" ? 'aria-current="page"' : ""}>Trench front <small>50 vs 50</small></a><a href="/?map=village" ${map.id === "village" ? 'aria-current="page"' : ""}>Village front <small>50 vs 50</small></a></nav><div class="brief"><b>01 / ${map.scoring === "domination" ? "DOMINATION" : map.scoring === "eliminations" ? "HOLD THE LINE" : "CAPTURE"}</b><p>${map.scoring === "domination" ? "Capture flags A–D. Each uncontested flag earns one point every three seconds. Neutral flags take 15 seconds to capture; enemy flags must first be neutralized. Stay near the flag with a clear path to it. First to 300 points wins, or the higher score after eight minutes. Kills do not award team points." : map.scoring === "eliminations" ? "Eliminate exposed enemies from the firing step. The trench floor hides you from opposing trenches. Near misses can drive bots into cover, opening a chance to advance." : "Hold sectors A, B, and C to earn points."}</p><b>02 / ENGAGE</b><p>Move with WASD. Press T to switch first/third person. Hold right mouse to aim through the iron sights; release to return to your chosen view. Click left mouse once per shot.${map.id !== "industrial" ? " Your five-round service rifle cycles its bolt between shots; R loads a clip. V thrusts with the bayonet; sprint forward before pressing V to charge. Charges turn slowly and leave a longer recovery. Machine gunners provide covering bursts." : ""} Press G for a brief overhand grenade throw: three per spawn, three-second fuse after release. Press C to crouch and move slowly behind cover; press C again to stand. Space stands you up to hop or mantle when there is room. Press F for a smoke grenade: two per spawn, about 20 seconds of concealing smoke. Bots lose sight through it. Throws follow your look direction in a shallow arc; aim higher for more range. Throwing keeps your chosen view.${map.terrain ? ` Press Space to hop or climb out of a trench; walk over an edge to drop in.${map.id === "trenches" ? " Use raised firing steps to shoot and throw over the trench lip." : " Use ruined walls and sunken approaches for cover."}` : " Press Space for a small hop."}</p><b>03 / SURVIVE</b><p>Press Q for the tactical map, then click a broad sector. Press Q or right-click to cancel. You can call from cover; blind calls drift farther, and shells scatter. The battle continues while choosing. First charge at 10 seconds, then a shared 30-second cooldown. Listen for falling shells and use earth cover; direct hits remain deadly. Reload with R. You redeploy five seconds after death.</p></div>`,
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
