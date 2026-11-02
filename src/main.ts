import "./style.css";
import { Renderer } from "./rendering";
import { Game, idle, botCommand, type Command, type Event } from "./simulation";
import { PlaytestRecorder } from "./playtest";
import { mantleLanding, dist, groundHeight, industrialMap } from "./map";
import { trenchMap } from "./trench-map";
const root = document.querySelector<HTMLDivElement>("#ui")!;
root.innerHTML = `<div id="hud"><header><div class="brand">SC <span>SECTOR CONTROL</span></div><div class="match"><div><b class="blue" id="blue">0</b><span id="clock">08:00</span><b class="red" id="red">0</b></div><nav id="sectors"></nav></div><div class="hint">TAB · SCOREBOARD<br>ESC · PAUSE</div></header><div id="labels"></div><div id="reticle">＋</div><div id="hit">×</div><div id="capture"></div><footer><div id="health"></div><div class="controls">WASD MOVE　 SHIFT SPRINT　 RMB AIM　 LMB FIRE　 R RELOAD</div><div id="ammo"></div></footer><div id="damage"></div></div><div id="menu" class="overlay"></div><div id="scoreboard" class="overlay hidden"></div>`;
const el = (id: string) => document.getElementById(id)!;
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
let fire = false,
  aim = false,
  reload = false,
  mantle = false;
let audio: AudioContext | undefined;
let recording: PlaytestRecorder | undefined;
let rawFrameMs = 0;
const params = new URLSearchParams(location.search),
  bots = params.get("bots") !== "0",
  autoplay = params.has("autoplay"),
  demo = params.has("demo") || autoplay;
const duration = Number(params.get("duration") ?? 480);
const map = params.get("map") === "trenches" ? trenchMap : industrialMap;
const requestedTeamSize = Number(
  params.get("teamSize") ?? (map.id === "trenches" ? 25 : 5),
);
document.querySelector(".controls")!.textContent += "　 SPACE HOP / MANTLE";
const teamSize = Math.max(
  1,
  Math.min(
    25,
    Math.round(requestedTeamSize) || (map.id === "trenches" ? 25 : 5),
  ),
);
function sound(freq: number, length = 0.08, volume = 0.04) {
  if (!audio) return;
  const o = audio.createOscillator(),
    v = audio.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(freq, audio.currentTime);
  o.frequency.exponentialRampToValueAtTime(
    Math.max(30, freq / 3),
    audio.currentTime + length,
  );
  v.gain.setValueAtTime(volume, audio.currentTime);
  v.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + length);
  o.connect(v);
  v.connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + length);
}
function clear() {
  keys.clear();
  fire = false;
  aim = false;
  reload = false;
  mantle = false;
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
    `<section class="panel"><div class="eyebrow">LOCAL OPERATIONS / ${map.name.toUpperCase()}</div><h1>${title}</h1><p>${subtitle}</p>${extra}<button id="primary">${button} <span>→</span></button><div class="fine">DESKTOP · HEADPHONES RECOMMENDED · WEBGL 2</div></section>`;
  el("primary").onclick = action;
}
function resume() {
  audio ??= new AudioContext();
  void audio.resume();
  if (demo) {
    paused = false;
    last = performance.now();
    accumulator = 0;
    el("menu").classList.add("hidden");
    return;
  }
  const request = renderer.canvas.requestPointerLock();
  if (request) void request.catch(() => pause());
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
    { map, teamSize },
  );
  renderer.reset(game);
  if (params.has("playtest"))
    recording = new PlaytestRecorder(
      renderer.canvas,
      Math.max(5, Math.min(120, Number(params.get("clip") ?? 60) || 60)),
      params.get("video") !== "0",
    );
  yaw = game.players[0].yaw;
  pitch = 0;
  started = true;
  hitUntil = damageUntil = 0;
  clear();
  resume();
  sound(500, 0.3);
}
function pause() {
  paused = true;
  clear();
  accumulator = 0;
  if (started && game.phase === "playing")
    menu(
      "Operation paused",
      "The battlefield is paused. Resume when ready.",
      "Resume operation",
      resume,
      '<button class="secondary" id="restart">Restart match</button>',
    );
  const restart = el("restart");
  if (restart) restart.onclick = start;
}
function handle(e: Event) {
  renderer.effect(e);
  if (e.type === "fire") {
    if (e.actor === 0) {
      sound(110, 0.06, 0.09);
    } else if (dist(game.players[0], e.from) < 35) sound(90, 0.05, 0.012);
  }
  if (e.type === "impact" && e.hit && e.actor === 0) {
    hitUntil = performance.now() + 150;
    sound(700, 0.035, 0.02);
  }
  if (e.type === "damage" && e.actor === 0) {
    damageUntil = performance.now() + 250;
    sound(60, 0.2, 0.12);
  }
  if (e.type === "reload" && e.actor === 0) sound(240, 0.15);
  if (e.type === "capture") sound(740, 0.35);
  if (e.type === "end") {
    paused = true;
    document.exitPointerLock();
    sound(440, 0.6);
    const result =
      e.winner === "draw" ? "Draw" : e.winner === "blue" ? "Victory" : "Defeat";
    menu(
      result,
      `Operation complete · Blue ${game.scores.blue} / Red ${game.scores.red}`,
      "Deploy again",
      start,
      table(),
    );
  }
}
function table() {
  if (game.teamSize > 8)
    return `<div class="rosters">${(["blue", "red"] as const)
      .map(
        (team) =>
          `<div class="table"><b class="${team}">${team.toUpperCase()} · ${game.players.filter((p) => p.team === team).length}</b><div class="row"><span>SOLDIER</span><span>K</span><span>D</span><span>CAP</span></div>${game.players
            .filter((p) => p.team === team)
            .map(
              (p) =>
                `<div class="row ${team}"><span>${p.id === 0 ? "YOU" : `${team.toUpperCase()} ${p.teamIndex + 1}`}</span><span>${p.kills}</span><span>${p.deaths}</span><span>${p.captures}</span></div>`,
            )
            .join("")}</div>`,
      )
      .join("")}</div>`;
  return `<div class="table"><div class="row"><span>SOLDIER</span><span>K</span><span>D</span><span>CAP</span></div>${game.players.map((p) => `<div class="row ${p.team}"><span>${p.id === 0 ? "YOU" : `${p.team.toUpperCase()} ${p.teamIndex + 1}`}</span><span>${p.kills}</span><span>${p.deaths}</span><span>${p.captures}</span></div>`).join("")}</div>`;
}
function hud(now: number) {
  const p = game.players[0];
  el("blue").textContent = String(game.scores.blue);
  el("red").textContent = String(game.scores.red);
  const t = Math.ceil((game.duration - game.tick) / 30);
  el("clock").textContent = `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${(t % 60).toString().padStart(2, "0")}`;
  el("sectors").innerHTML = game.sectors
    .map(
      (s) =>
        `<span class="sector ${s.contested ? "contested" : (s.owner ?? "")}">${s.id}</span>`,
    )
    .join("");
  el("health").innerHTML =
    `<small>VITALS / BLUE TEAM</small><strong>${p.hp}<em> HP</em></strong><div class="bar"><i style="width:${p.hp}%"></i></div>${game.tick < p.protectedUntil && p.hp > 0 ? "<small>SPAWN PROTECTION</small>" : ""}`;
  el("ammo").innerHTML =
    `<small>AR-01 / ASSAULT RIFLE</small><strong>${p.ammo}<em> / ${p.reserve}</em></strong><small>${p.reloadAt ? "RELOADING · " + ((p.reloadAt - game.tick) / 30).toFixed(1) + "s" : "AUTO · 600 RPM"}</small>`;
  const sector = game.sectors.find((s) => dist(s, p) <= 8);
  if (sector)
    el("health").innerHTML +=
      `<small>SECTOR ${sector.id} · ${sector.contested ? "CONTESTED" : (sector.owner?.toUpperCase() ?? "NEUTRAL")}</small>`;
  const ledge =
    map.terrain &&
    !p.mantle &&
    !p.hop &&
    mantleLanding(p, { x: Math.sin(p.yaw), z: -Math.cos(p.yaw) }, map);
  el("capture").innerHTML =
    p.hp <= 0
      ? `<h2>SOLDIER DOWN</h2><p>Redeploying in ${Math.ceil((p.respawnAt - game.tick) / 30)}s</p>`
      : p.mantle
        ? "<small>CLIMBING TRENCH EDGE</small>"
        : ledge
          ? "<small>SPACE · MANTLE TRENCH EDGE</small>"
          : sector
            ? `<small>SECTOR ${sector.id} · ${sector.contested ? "CONTESTED" : sector.owner === p.team ? "DEFENDING" : sector.owner ? "NEUTRALIZING" : "CAPTURING"}</small><div class="bar"><i class="${sector.control < 0 ? "redbar" : ""}" style="width:${Math.abs(sector.control) * 100}%"></i></div>`
            : "";
  el("hit").style.opacity = now < hitUntil ? "1" : "0";
  el("damage").style.opacity = now < damageUntil ? ".65" : "0";
  if (keys.has("Tab")) {
    el("scoreboard").classList.remove("hidden");
    el("scoreboard").innerHTML =
      `<section class="panel"><div class="eyebrow">LIVE OPERATION</div><h2>Scoreboard</h2>${table()}</section>`;
  } else el("scoreboard").classList.add("hidden");
  el("labels").innerHTML = game.sectors
    .map((s) => {
      const v = renderer.project({
        x: s.x,
        y: groundHeight(s.x, s.z, map) + 4,
        z: s.z,
      });
      return v.z > 0
        ? `<div class="objective ${s.contested ? "contested" : (s.owner ?? "")}" style="left:${v.x}px;top:${v.y}px">${s.id}<small>${s.contested ? "CONTESTED" : Math.round(dist(p, s)) + "m"}</small><div class="bar"><i class="${s.control < 0 ? "redbar" : ""}" style="width:${Math.abs(s.control) * 100}%"></i></div></div>`
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
  c.sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  c.fire = fire;
  c.aim = aim;
  c.reload = reload;
  c.mantle = mantle;
  reload = false;
  mantle = false;
  return c;
}
window.addEventListener("keydown", (e) => {
  if (["Tab", "Space", "ArrowUp", "ArrowDown"].includes(e.code))
    e.preventDefault();
  if (paused) return;
  keys.add(e.code);
  if (e.code === "KeyR") reload = true;
  if (e.code === "Space" && !e.repeat) mantle = true;
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("mousemove", (e) => {
  if (paused) return;
  yaw += e.movementX * 0.002;
  pitch = Math.max(-1.1, Math.min(1.1, pitch - e.movementY * 0.002));
});
window.addEventListener("mousedown", (e) => {
  if (paused) return;
  if (e.button === 0) fire = true;
  if (e.button === 2) aim = true;
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 0) fire = false;
  if (e.button === 2) aim = false;
});
window.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === renderer?.canvas) {
    paused = false;
    last = performance.now();
    accumulator = 0;
    el("menu").classList.add("hidden");
  } else if (started && game.phase === "playing") pause();
});
document.addEventListener("pointerlockerror", () => {
  pause();
  el("menu").querySelector("p")!.textContent =
    "Mouse capture was denied. Click Resume to retry.";
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && started) {
    document.exitPointerLock();
    if (game.phase === "playing") pause();
  }
});
window.addEventListener("blur", () => {
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
      accumulator += dt;
      let steps = 0;
      while (accumulator >= 1 / 30 && steps++ < 4) {
        renderer.remember(game);
        const input =
          autoplay && game.players[0].hp > 0
            ? botCommand(game, game.players[0])
            : command();
        game.step(input);
        recording?.tick(game, input);
        for (const e of game.events) handle(e);
        accumulator -= 1 / 30;
        if (paused) break;
      }
    }
    renderer.draw(game, accumulator * 30, dt, params.has("overview"));
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
    map.id === "trenches" ? "Trench front" : "Sector Control",
    map.id === "trenches"
      ? `Advance through two trench lines, then cross the exposed no man’s land toward the enemy’s two lines. ${Math.max(1, Math.min(25, Math.round(teamSize) || 25))} soldiers per team · three sectors · eight minutes.`
      : "Capture. Hold. Prevail. Lead Blue Team through an eight-minute fight for three industrial sectors.",
    "Begin operation",
    start,
    `<nav class="map-choice" aria-label="Battlefield"><a href="/" ${map.id === "industrial" ? 'aria-current="page"' : ""}>Industrial <small>5 vs 5</small></a><a href="/?map=trenches" ${map.id === "trenches" ? 'aria-current="page"' : ""}>Trench front <small>25 vs 25</small></a></nav><div class="brief"><b>01 / CAPTURE</b><p>Hold sectors A, B, and C to earn points.</p><b>02 / ENGAGE</b><p>Move with WASD. Aim with right mouse. Fire with left mouse.${map.terrain ? " Press Space to hop, or near a bank to climb up or down. Use raised firing steps to shoot from cover." : " Press Space for a small hop."}</p><b>03 / SURVIVE</b><p>Reload with R. You redeploy five seconds after death.</p></div>`,
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
