import { it, expect, vi, afterEach } from "vitest";
import { BattleAudio } from "./battle-audio";
import type { SoundCue } from "./battlefield";
class Param {
  value = 0;
  ramps: { value: number; time: number }[] = [];
  starts: number[] = [];
  setValueAtTime(n: number) {
    this.starts.push(n);
    this.value = n;
  }
  exponentialRampToValueAtTime(n: number, time = 0) {
    this.value = n;
    this.ramps.push({ value: n, time });
  }
  setTargetAtTime(n: number) {
    this.value = n;
  }
}
class Node {
  gain = new Param();
  frequency = new Param();
  Q = new Param();
  playbackRate = new Param();
  positionX = new Param();
  positionY = new Param();
  positionZ = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  onended: (() => void) | null = null;
  disconnected = false;
  targets: Node[] = [];
  connect(n: Node) {
    this.targets.push(n);
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
  start() {}
  stop() {}
}
class Context {
  currentTime = 0;
  sampleRate = 1000;
  destination = new Node();
  state = "suspended";
  nodes: Node[] = [];
  listener = {
    positionX: new Param(),
    positionY: new Param(),
    positionZ: new Param(),
    forwardX: new Param(),
    forwardY: new Param(),
    forwardZ: new Param(),
    upX: new Param(),
    upY: new Param(),
    upZ: new Param(),
  };
  node() {
    const n = new Node();
    this.nodes.push(n);
    return n;
  }
  createGain = () => this.node();
  createBiquadFilter = () => this.node();
  createDynamicsCompressor = () => this.node();
  createPanner = () => this.node();
  createBufferSource = () => this.node();
  oscillators = 0;
  createOscillator = () => {
    this.oscillators++;
    return this.node();
  };
  createMediaStreamDestination = () =>
    Object.assign(this.node(), { stream: { gameAudio: true } });
  decodeAudioData(_data: ArrayBuffer) {
    return Promise.resolve({ duration: 0.8 });
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
}
afterEach(() => vi.unstubAllGlobals());
function setup() {
  vi.stubGlobal("AudioContext", Context);
  const a = new BattleAudio();
  const c = a.context as unknown as Context;
  a.resume();
  return { a, c };
}
const cue: SoundCue = {
  kind: "rifle",
  at: { x: 10, y: 2, z: 3 },
  volume: 0.3,
  distance: 10,
  seed: 1,
};
it("gives service rifles a deeper report and uses short unpitched bolt and clip mechanisms", () => {
  const { a, c } = setup();
  a.play({ ...cue, kind: "serviceRifle", local: true });
  expect(c.nodes.some((n) => n.frequency.starts.includes(95))).toBe(true);
  expect(a.stats.byKind.serviceRifle).toBe(1);
  const pitched = c.oscillators;
  a.play({ ...cue, kind: "bolt", local: true });
  a.play({ ...cue, kind: "clip", local: true });
  expect(c.oscillators).toBe(pitched);
  expect(a.stats.byKind.bolt).toBe(1);
  expect(a.stats.byKind.clip).toBe(1);
  expect(c.nodes.some((n) => n.frequency.value === 1800)).toBe(true);
  expect(c.nodes.some((n) => n.frequency.value === 2800)).toBe(true);
});
it("gives falling timber a delayed landing thud without a pitched oscillator", () => {
  const { a, c } = setup();
  a.play({ ...cue, kind: "timber", local: true });
  expect(c.oscillators).toBe(0);
  const envelope = c.nodes.find((n) =>
    n.gain.ramps.some((p) => p.time > 0.9 && p.time < 1 && p.value > 0.2),
  )!;
  expect(envelope).toBeDefined();
  expect(
    envelope.gain.ramps.some(
      (p) => p.time > 0.1 && p.time < 0.9 && p.value < 0.05,
    ),
  ).toBe(true);
  expect(envelope.gain.ramps.at(-1)!.time).toBeGreaterThan(1.4);
});
it("bounds simultaneous battlefield voices but reserves room for local fire and nearby blasts", () => {
  const { a } = setup();
  for (let i = 0; i < 100; i++) a.play(cue);
  expect(a.stats.played).toBe(28);
  expect(a.stats.dropped).toBe(72);
  for (let i = 0; i < 20; i++) a.play({ ...cue, kind: "artillery" });
  expect(a.stats.peakVoices).toBe(40);
  expect(a.stats.byKind.artillery).toBe(20);
  expect(a.stats.stolen).toBe(8);
  a.pause();
  a.resume();
  a.play({ ...cue, local: true });
  expect(a.stats.played).toBe(49);
});
it("disconnects all voices on pause and restart, cancels delayed sounds, and ignores paused play requests", () => {
  const { a, c } = setup();
  a.play(cue);
  a.play({ ...cue, kind: "grenade", distance: 85 });
  a.tone(500);
  const voices = c.nodes.slice(5); // world, world gain, master, limiter and capture are persistent.
  a.pause();
  expect(c.state).toBe("suspended");
  expect(voices.every((n) => n.disconnected)).toBe(true);
  a.play(cue);
  expect(a.stats.played).toBe(2);
  a.resume();
  a.play(cue);
  a.reset();
  expect(a.stats.played).toBe(0);
  expect(a.stats.peakVoices).toBe(0);
  a.play(cue);
  expect(a.stats.peakVoices).toBe(1);
});
it("rotates the listener with aim, recovers muffled hearing and clamps volume including mute", () => {
  const { a, c } = setup();
  a.listener({ x: 4, y: 2, z: 8 }, Math.PI / 2, 0);
  expect(c.listener.forwardX.value).toBeCloseTo(1);
  expect(c.listener.forwardZ.value).toBeCloseTo(0);
  expect(c.listener.upY.value).toBe(1);
  expect(c.listener.positionX.value).toBe(4);
  a.muffle(1);
  expect(c.nodes[0].frequency.value).toBeLessThan(1200);
  a.muffle(0);
  expect(c.nodes[0].frequency.value).toBe(18000);
  a.volume(-1);
  expect(c.nodes[2].gain.value).toBe(0);
  a.volume(5);
  expect(c.nodes[2].gain.value).toBe(1);
});
it("shares the limited game mix with capture and cleans up completed voice nodes", () => {
  const { a, c } = setup();
  expect(c.nodes[3].targets).toContain(c.destination);
  expect(c.nodes[3].targets).toContain(a.capture);
  a.play({ ...cue, occluded: true });
  expect(a.stats.occluded).toBe(1);
  expect(a.stats.spatial).toBe(1);
  const nodes = c.nodes.slice(5);
  const source = nodes.find((n) => n.onended)!;
  expect(source).toBeDefined();
  source.onended!();
  expect(nodes.every((n) => n.disconnected)).toBe(true);
  a.pause(); // already ended voices must also tolerate lifecycle cleanup.
});

it("uses unpitched explosion layers and guarantees a blast voice when rifle chatter saturates the mix", () => {
  const { a, c } = setup();
  a.play({ ...cue, kind: "artillery" });
  expect(c.oscillators).toBe(0);
  a.reset();
  for (let i = 0; i < 40; i++) a.play({ ...cue, local: true });
  expect(a.stats.peakVoices).toBe(40);
  a.play({ ...cue, kind: "grenade" });
  expect(a.stats.byKind.grenade).toBe(1);
  expect(a.stats.stolen).toBe(1);
  expect(a.stats.peakVoices).toBe(40);
});

it("loads bundled speech once, spatializes one voice at a time and cancels it on pause or mute", async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(16),
  }));
  vi.stubGlobal("fetch", fetch);
  const { a, c } = setup();
  await a.prepareVoices();
  expect(fetch).toHaveBeenCalledTimes(6);
  const spoken = { ...cue, kind: "voice" as const, line: "incoming" as const };
  a.play(spoken);
  expect(a.stats.byKind.voice).toBe(1);
  expect(c.oscillators).toBe(0);
  a.play(spoken);
  expect(a.stats.byKind.voice).toBe(1);
  expect(c.nodes.some((n) => n.positionX.value === 10)).toBe(true);
  a.chatter(false);
  a.play(spoken);
  expect(a.stats.byKind.voice).toBe(1);
  a.chatter(true);
  a.play(spoken);
  expect(a.stats.byKind.voice).toBe(2);
  a.pause();
  expect(c.nodes.filter((n) => n.onended !== null)).toHaveLength(0);
  a.resume();
  a.reset();
  await a.prepareVoices();
  expect(fetch).toHaveBeenCalledTimes(6);
});
it("drops unavailable speech without disrupting effects or replaying stale calls after loading", async () => {
  let release: ((v: {
    ok: boolean;
    arrayBuffer: () => Promise<ArrayBuffer>;
  }) => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise((resolve) => release.push(resolve))),
  );
  const { a } = setup(),
    pending = a.prepareVoices();
  a.play({ ...cue, kind: "voice", line: "smoke" });
  expect(a.stats.voiceMissing).toBe(1);
  a.play(cue);
  expect(a.stats.byKind.rifle).toBe(1);
  a.pause();
  for (const done of release)
    done({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await pending;
  expect(a.stats.byKind.voice ?? 0).toBe(0);
  a.resume();
  a.play({ ...cue, kind: "voice", line: "smoke" });
  expect(a.stats.byKind.voice).toBe(1);
});
