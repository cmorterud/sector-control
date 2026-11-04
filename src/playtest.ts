import type { Command, Event, Game } from "./simulation";

// Keep a fixed deadline so render timing jitter does not lower the capture rate.
export class CaptureCadence {
  private nextFrame = 0;
  shouldCapture(now: number) {
    const interval = 1000 / 30;
    if (now < this.nextFrame) return false;
    this.nextFrame += interval;
    // After a long stall, resume normally instead of bursting through old frames.
    if (this.nextFrame < now - interval) this.nextFrame = now + interval;
    return true;
  }
}

export class PlaytestLog {
  readonly version = 2;
  readonly startedAt = new Date().toISOString();
  commands: { tick: number; command: Command }[] = [];
  events: Event[] = [];
  samples: { seconds: number; state: ReturnType<Game["snapshot"]> }[] = [];
  frames: number[] = [];
  errors: string[] = [];
  recordTick(game: Game, command: Command, seconds: number) {
    this.commands.push({ tick: game.tick, command: { ...command } });
    this.events.push(...structuredClone(game.events));
    if (game.tick === 1 || game.tick % 30 === 0)
      this.samples.push({ seconds, state: game.snapshot() });
  }
  summary() {
    const sorted = [...this.frames].sort((a, b) => a - b);
    const average =
      this.frames.reduce((a, b) => a + b, 0) / Math.max(1, this.frames.length);
    return {
      ticks: this.commands.length,
      frames: this.frames.length,
      averageFps: average ? 1000 / average : 0,
      p95FrameMs: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
      slowFramesOver33ms: this.frames.filter((ms) => ms > 1000 / 30).length,
      errors: [...this.errors],
      shots: this.events.filter((e) => e.type === "fire").length,
      targetAcquisitions: this.events.filter(
        (e) => e.type === "botAttention" && e.phase === "acquired",
      ).length,
      attentionBreaks: this.events.filter(
        (e) => e.type === "botAttention" && e.phase === "distracted",
      ).length,
      impacts: this.events.filter((e) => e.type === "impact").length,
      kills: this.events.filter((e) => e.type === "death").length,
      captures: this.events.filter((e) => e.type === "capture").length,
      grenadesThrown: this.events.filter((e) => e.type === "grenadeThrow")
        .length,
      grenadeExplosions: this.events.filter(
        (e) => e.type === "grenadeExplosion",
      ).length,
      stanceChanges: this.events.filter((e) => e.type === "stance").length,
      falls: this.events.filter((e) => e.type === "fall" && e.phase === "start")
        .length,
      fallLandings: this.events.filter(
        (e) => e.type === "fall" && e.phase === "land",
      ).length,
      smokeThrows: this.events.filter((e) => e.type === "smokeThrow").length,
      smokeClouds: this.events.filter((e) => e.type === "smokeBloom").length,
      suppressions: this.events.filter((e) => e.type === "suppression").length,
      ducks: this.events.filter((e) => e.type === "duck" && e.phase === "start")
        .length,
      assaults: this.events.filter((e) => e.type === "assaultStart").length,
      craterArrivals: this.events.filter(
        (e) => e.type === "assaultProgress" && e.stage === "crater",
      ).length,
      trenchArrivals: this.events.filter(
        (e) => e.type === "assaultProgress" && e.stage === "trench",
      ).length,
      artilleryCalls: this.events.filter((e) => e.type === "artilleryCall")
        .length,
      artilleryImpacts: this.events.filter((e) => e.type === "artilleryImpact")
        .length,
      artilleryEvades: this.events.filter((e) => e.type === "artilleryEvade")
        .length,
      destructionEvents: this.events.filter((e) => e.type === "destruction")
        .length,
      craters: this.events.filter(
        (e) => e.type === "destruction" && e.change.crater,
      ).length,
      destroyedCover: this.events
        .flatMap((e) => (e.type === "destruction" ? e.change.objects : []))
        .filter((object) => object.stage === 2).length,
    };
  }
}

export function eventTimeline(events: readonly Event[]) {
  return (
    events
      .map(
        ({ id, tick, type, ...details }) =>
          `[${(tick / 30).toFixed(3)}s / tick ${tick}] #${id} ${type} ${JSON.stringify(details)}`,
      )
      .join("\n") + "\n"
  );
}

// Opt-in, game-only recording. No desktop capture, microphone, or upload.
export class PlaytestRecorder {
  readonly log = new PlaytestLog();
  private canvas = document.createElement("canvas");
  private context: CanvasRenderingContext2D;
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private panel: HTMLDivElement;
  private started = performance.now();
  private captureCadence = new CaptureCadence();
  private finished = false;
  private published = false;
  private urls: string[] = [];
  private onError = (e: ErrorEvent) => this.log.errors.push(e.message);
  private onRejection = (e: PromiseRejectionEvent) =>
    this.log.errors.push(String(e.reason));

  constructor(
    private source: HTMLCanvasElement,
    private limitSeconds = 60,
    recordVideo = true,
  ) {
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.context = this.canvas.getContext("2d")!;
    this.panel = document.createElement("div");
    this.panel.className = "playtest";
    this.panel.textContent = "PLAYTEST · recording game + diagnostics";
    document.body.append(this.panel);
    window.addEventListener("error", this.onError);
    window.addEventListener("unhandledrejection", this.onRejection);
    if (!recordVideo) {
      this.panel.textContent = "PLAYTEST · recording diagnostics only";
      return;
    }
    try {
      if (typeof MediaRecorder === "undefined")
        throw new Error("MediaRecorder unavailable");
      const mimeType = [
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      this.stream = this.canvas.captureStream(30);
      this.recorder = new MediaRecorder(this.stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 2_500_000,
      });
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      this.recorder.onstop = () => this.publish();
      this.recorder.onerror = () => {
        this.log.errors.push("Video encoding failed");
        this.stop();
      };
      this.recorder.start(1000);
    } catch (error) {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.log.errors.push(String(error));
      this.panel.textContent =
        "PLAYTEST · diagnostics only (video unavailable)";
    }
  }
  tick(game: Game, command: Command) {
    if (!this.finished)
      this.log.recordTick(
        game,
        command,
        (performance.now() - this.started) / 1000,
      );
  }
  frame(game: Game, frameMs: number, paused: boolean) {
    if (this.finished) return;
    const now = performance.now();
    if (!paused && frameMs > 0) this.log.frames.push(frameMs);
    if (this.recorder && this.captureCadence.shouldCapture(now)) {
      const c = this.context,
        p = game.players[0];
      c.drawImage(this.source, 0, 0, 1280, 720);
      // DOM overlays are separate from WebGL; draw a diagnostic HUD into the video.
      c.fillStyle = "#102323dd";
      c.fillRect(0, 0, 1280, 60);
      c.fillRect(0, 660, 1280, 60);
      c.font = "20px monospace";
      c.fillStyle = "#edf0e7";
      c.fillText(
        `BLUE ${game.scores.blue} : ${game.scores.red} RED | rounds ${game.projectiles.length} | tick ${game.tick} | ${(game.tick / 30).toFixed(1)}s | ${paused ? "PAUSED" : game.phase}`,
        20,
        36,
      );
      c.fillText(
        `HP ${p.hp} | ammo ${p.ammo}/${p.reserve} | grenades ${p.grenades} | ${p.mode} | pos ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`,
        20,
        695,
      );
      c.fillText(
        game.scoring === "eliminations"
          ? "TRENCH DUEL | ELIMINATIONS"
          : game.sectors
              .map(
                (s) =>
                  `${s.id}: ${s.contested ? "CONTESTED" : (s.owner ?? "neutral")} ${Math.round(Math.abs(s.control) * 100)}%`,
              )
              .join(" | "),
        20,
        640,
      );
      c.fillStyle = "#fff";
      c.fillRect(635, 359, 10, 2);
      c.fillRect(639, 355, 2, 10);
    }
    if (
      (now - this.started) / 1000 >= this.limitSeconds ||
      game.phase === "ended"
    )
      this.stop();
  }
  stop() {
    if (this.finished) return;
    this.finished = true;
    window.removeEventListener("error", this.onError);
    window.removeEventListener("unhandledrejection", this.onRejection);
    if (this.recorder && this.recorder.state !== "inactive")
      this.recorder.stop();
    else this.publish();
  }
  private publish() {
    if (this.published) return;
    this.published = true;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.panel.replaceChildren();
    const summary = this.log.summary();
    const title = document.createElement("div");
    title.textContent = `PLAYTEST COMPLETE · ${summary.averageFps.toFixed(0)} FPS avg · ${summary.errors.length} errors`;
    this.panel.append(title);
    const link = (blob: Blob, name: string) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      this.urls.push(a.href);
      a.download = `sector-control-${this.log.startedAt.replace(/[:.]/g, "-")}.${name}`;
      a.textContent = `Save ${name}`;
      this.panel.append(a);
    };
    if (this.chunks.length) {
      const mime = this.recorder?.mimeType || "video/webm";
      link(
        new Blob(this.chunks, { type: mime }),
        mime.includes("mp4") ? "mp4" : "webm",
      );
      this.chunks = [];
    }
    link(
      new Blob([JSON.stringify({ ...this.log, summary }, null, 2)], {
        type: "application/json",
      }),
      "json",
    );
    link(
      new Blob(
        [
          `Sector Control event timeline · ${this.log.startedAt}\n` +
            eventTimeline(this.log.events),
        ],
        { type: "text/plain" },
      ),
      "events.txt",
    );
  }
  dispose() {
    this.stop();
    // Prevent asynchronous onstop from resurrecting a previous match's report.
    if (this.recorder) this.recorder.onstop = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.panel.remove();
  }
}
