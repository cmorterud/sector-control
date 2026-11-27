import { shotVoice, mechanicalVoice } from "./weapon-sound";
import { publicAsset } from "./public-assets";
import { voiceLines, type VoiceLine } from "./soldier-chatter";
import type { SoundCue } from "./battlefield";
import { treeFallTime } from "./environment-effects";
import { forestVoice } from "./forest-sound";
import type { V3 } from "./simulation";
import { shellVoices } from "./shell-sound";

// Local synthesized effects and bundled voice clips; no microphone or speech service.
export class BattleAudio {
  readonly context: AudioContext;
  readonly capture: MediaStreamAudioDestinationNode;
  private world: BiquadFilterNode;
  private worldGain: GainNode;
  private master: GainNode;
  private noise: AudioBuffer;
  private voices = new Map<() => void, number>();
  private running = false;
  private speech?: () => void;
  private voicesEnabled = true;
  private speechBuffers = new Map<string, AudioBuffer>();
  private speechLoading?: Promise<void>;
  stats = {
    stolen: 0,
    played: 0,
    dropped: 0,
    peakVoices: 0,
    spatial: 0,
    occluded: 0,
    byKind: {} as Record<string, number>,
    voiceMissing: 0,
  };
  constructor() {
    const c = (this.context = new AudioContext());
    this.world = c.createBiquadFilter();
    this.world.type = "lowpass";
    this.world.frequency.value = 18000;
    this.worldGain = c.createGain();
    this.master = c.createGain();
    this.master.gain.value = 0.65;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    this.world.connect(this.worldGain).connect(this.master).connect(limiter);
    limiter.connect(c.destination);
    this.capture = c.createMediaStreamDestination();
    limiter.connect(this.capture);
    this.noise = c.createBuffer(1, c.sampleRate * 8, c.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  // Rain: a steady bed of noise outside the voice budget, a high hiss of
  // drops on mud and water over a low drumming on helmets and groundsheets.
  // `level` follows the shower (src/weather.ts rainIntensity).
  private rainBed?: { sources: AudioBufferSourceNode[]; gain: GainNode; hiss: GainNode };
  rain(on: boolean, level = 1) {
    const c = this.context;
    if (!on) {
      if (this.rainBed) {
        const bed = this.rainBed;
        this.rainBed = undefined;
        bed.gain.gain.setTargetAtTime(0, c.currentTime, 0.2);
        for (const source of bed.sources) source.stop(c.currentTime + 1.2);
      }
      return;
    }
    if (!this.rainBed) {
      const gain = c.createGain(), hiss = c.createGain();
      gain.gain.value = 0;
      const voice = (rate: number, type: BiquadFilterType, frequency: number, q: number, level: number, out: AudioNode) => {
        const source = c.createBufferSource(), filter = c.createBiquadFilter(), g = c.createGain();
        source.buffer = this.noise;
        source.loop = true;
        source.playbackRate.value = rate;
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        g.gain.value = level;
        source.connect(filter).connect(g).connect(out);
        source.start(c.currentTime, Math.random() * 7);
        return source;
      };
      hiss.connect(gain);
      const sources = [
        voice(1, "bandpass", 5200, 0.35, 0.55, hiss),
        voice(0.83, "highpass", 2400, 0.5, 0.28, hiss),
        voice(0.61, "lowpass", 700, 0.6, 0.6, gain),
      ];
      gain.connect(this.world);
      this.rainBed = { sources, gain, hiss };
    }
    const t = c.currentTime;
    this.rainBed.gain.gain.setTargetAtTime(0.05 + 0.07 * level, t, 0.6);
    this.rainBed.hiss.gain.setTargetAtTime(0.7 + 0.5 * level, t, 0.6);
  }
  // For effects synthesized elsewhere (src/charge-audio.ts): the spatial mix
  // bus, and whether the battle is running.
  get bus(): AudioNode { return this.world; }
  get live() { return this.running; }
  prepareVoices() {
    this.speechLoading ??= Promise.all(
      voiceLines.flatMap((line) =>
        [0, 1].map(async (variant) => {
          try {
            const response = await fetch(
              publicAsset(`audio/voices/${line}-${variant}.wav`),
            );
            if (!response.ok) return;
            const buffer = await this.context.decodeAudioData(
              await response.arrayBuffer(),
            );
            this.speechBuffers.set(`${line}-${variant}`, buffer);
          } catch {
            /* Missing speech must not interrupt the game or replay late. */
          }
        }),
      ),
    ).then(() => {});
    return this.speechLoading;
  }
  chatter(enabled: boolean) {
    this.voicesEnabled = enabled;
    if (!enabled) this.speech?.();
  }
  volume(value: number) {
    this.master.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime,
      0.02,
    );
  }
  resume() {
    this.running = true;
    void this.context.resume();
  }
  pause() {
    this.running = false;
    for (const stop of [...this.voices.keys()]) stop();
    void this.context.suspend();
  }
  reset() {
    for (const stop of [...this.voices.keys()]) stop();
    this.stats = {
      stolen: 0,
      played: 0,
      dropped: 0,
      peakVoices: 0,
      spatial: 0,
      occluded: 0,
      byKind: {},
      voiceMissing: 0,
    };
    this.muffle(0);
  }
  listener(at: V3, yaw: number, pitch: number) {
    const l = this.context.listener,
      t = this.context.currentTime;
    l.positionX.setValueAtTime(at.x, t);
    l.positionY.setValueAtTime(at.y, t);
    l.positionZ.setValueAtTime(at.z, t);
    l.forwardX.setValueAtTime(Math.sin(yaw) * Math.cos(pitch), t);
    l.forwardY.setValueAtTime(Math.sin(pitch), t);
    l.forwardZ.setValueAtTime(-Math.cos(yaw) * Math.cos(pitch), t);
    l.upX.setValueAtTime(-Math.sin(yaw) * Math.sin(pitch), t);
    l.upY.setValueAtTime(Math.cos(pitch), t);
    l.upZ.setValueAtTime(Math.cos(yaw) * Math.sin(pitch), t);
  }
  muffle(amount: number) {
    const t = this.context.currentTime;
    this.world.frequency.setTargetAtTime(
      18000 * Math.pow(0.065, amount),
      t,
      0.035,
    );
    this.worldGain.gain.setTargetAtTime(1 - amount * 0.28, t, 0.035);
  }
  play(cue: SoundCue) {
    if (!this.running) return;
    if (cue.kind === "incoming") return this.incoming(cue);
    const speech = cue.kind === "voice";
    const background = ["forestWind","forestCreak","distantBattle","wireWind","distantGun","crow"].includes(cue.kind);
    const forest = forestVoice(cue.kind);
    if (speech && (!this.voicesEnabled || this.speech)) return;
    const spoken = speech
      ? this.speechBuffers.get(`${cue.line}-${Math.abs(cue.seed) % 2}`)
      : undefined;
    if (speech && !spoken) {
      this.stats.voiceMissing++;
      return;
    }
    const speechRate = 0.97 + (Math.abs(cue.seed) % 5) * 0.012;
    const important =
      speech ||
      (cue.local && !background) ||
      ["crack", "artillery", "grenade", "whistle", "timber"].includes(cue.kind);
    const priority = ["artillery", "grenade"].includes(cue.kind)
      ? 3
      : speech || (cue.local && !background) || cue.kind === "crack"
        ? 2
        : ["whistle", "timber"].includes(cue.kind)
          ? 1
          : 0;
    // The player's own gunfire must never drop out of a long burst.
    const ownShot = !!cue.local && ["rifle", "serviceRifle", "machineGun", "pistol", "heavyGun"].includes(cue.kind);
    if (this.voices.size >= (important ? 40 : 28)) {
      const victim = [...this.voices.entries()]
        .sort((a, b) => a[1] - b[1])
        .find(([, rank]) => rank < priority);
      if (victim && (priority === 3 || speech || ownShot)) {
        victim[0]();
        this.stats.stolen++;
      } else {
        this.stats.dropped++;
        return;
      }
    }
    this.stats.played++;
    this.stats.byKind[cue.kind] = (this.stats.byKind[cue.kind] ?? 0) + 1;
    this.stats.spatial += Number(!cue.local);
    this.stats.occluded += Number(!!cue.occluded);
    const c = this.context;
    const explosion = cue.kind === "artillery" || cue.kind === "grenade";
    const wet = cue.kind === "splash" || cue.kind === "drip";
    // A stride through rain-soaked mud: a heavy squelch, then the boot sucked free.
    const sludge = cue.kind === "sludge";
    const foot = wet || sludge || ["mud", "wood", "concrete", "leaves"].includes(cue.kind);
    const heavy = cue.kind === "heavyGun";
    const rifle =
      cue.kind === "rifle" ||
      cue.kind === "serviceRifle" ||
      cue.kind === "machineGun" || cue.kind === "pistol" || heavy;
    const brass = cue.kind === "brass", steam = cue.kind === "steam";
    const melee = cue.kind === "meleeSwing" || cue.kind === "meleeHit";
    const mechanism = ["bolt","clip","equip","magazine"].includes(cue.kind);
    const mechanical=mechanism?mechanicalVoice(cue.kind,cue.action,cue.weaponId):undefined;
    const shotPitch=shotVoice(cue.weaponId);
    const whistle = cue.kind === "whistle";
    const crack = cue.kind === "crack";
    const distant = Math.min(1, cue.distance / 100);
    const length = forest?.length ?? (mechanical ? mechanical.length : brass ? .26 : steam ? 1.4 : heavy ? .2 + distant * .4 : cue.kind === "flame" ? .14 : melee
      ? cue.kind === "meleeSwing"
        ? 0.17
        : 0.11
      : speech
        ? spoken!.duration / speechRate
        : explosion
          ? cue.kind === "artillery"
            ? 2.4
            : 1.6
          : mechanism
            ? cue.kind === "clip"
              ? 0.16
              : 0.09
            : whistle
              ? 0.75
              : rifle
                ? cue.kind === "machineGun"
                  ? 0.11 + distant * 0.25
                  : 0.16 + distant * 0.42
                : crack
                  ? 0.065
                  : foot
                    ? wet ? 0.23 : sludge ? 0.3 : 0.16
                    : cue.kind === "timber"
                      ? 1.5
                      : 0.65);
    const delay = (cue.delay ?? 0) + (
      cue.local || crack || foot || whistle
        ? 0
        : Math.min(0.35, cue.distance / 343));
    const start = c.currentTime + delay;
    const end = start + length;
    const filter = c.createBiquadFilter();
    filter.type = forest ? forest.band ? "bandpass" : "lowpass" : crack || whistle || mechanism || brass || steam ? "bandpass" : "lowpass";
    filter.Q.value = brass ? 9 : steam ? 0.6 : whistle ? 7 : cue.kind === "wireWind" ? 9 : cue.kind === "wireSnag" ? 6 : cue.kind === "crow" ? 5 : crack ? 0.8 : 0.5;
    filter.frequency.value = forest?.frequency ?? (mechanical ? mechanical.frequency : brass ? 4600 + (Math.abs(cue.seed * 37) % 7) * 160 : steam ? 5200 : heavy ? 9000 * shotPitch * (1 - distant * 0.85) : cue.kind === "flame" ? 1500 : melee
      ? cue.kind === "meleeSwing"
        ? 2400
        : 650
      : mechanism
        ? cue.kind === "clip"
          ? 2800
          : 1800
        : cue.kind === "serviceRifle"
          ? 13000 * (1 - distant * 0.85)
          : whistle
            ? 1700
            : crack
              ? 2800
              : explosion
                ? cue.kind === "artillery"
                  ? 12000
                  : 8500
                : cue.kind === "mud"
                  ? 420
                  : sludge
                    ? 360
                  : cue.kind === "wood"
                    ? 1900
                    : wet ? 3700 : foot
                      ? 2400
                      : cue.kind === "timber"
                        ? 1700
                        : speech
                          ? 4600 * (1 - distant * 0.5)
                          : 8500 * (1 - distant * 0.85));
    if (cue.occluded)
      filter.frequency.value = Math.min(
        filter.frequency.value,
        explosion ? 2200 : 1100,
      );
    if (explosion)
      filter.frequency.exponentialRampToValueAtTime(380, start + 0.22);
    if (whistle) filter.frequency.exponentialRampToValueAtTime(420, end);
    const envelope = c.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    // Mud is the default ground on trench maps, so it is heard on nearly every
    // stride: keep it a soft, dull squelch that sits under the battle.
    const mud = cue.kind === "mud";
    const volume = cue.volume * (mechanical?.volume??1) * (cue.occluded ? 0.48 : 1) * (mud ? 0.5 : sludge ? 0.62 : 1);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, volume),
      start + (forest?.attack ?? (whistle ? 0.1 : steam ? 0.04 : explosion ? 0.001 : mud ? 0.014 : sludge ? 0.022 : 0.004)),
    );
    if (explosion) {
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * 0.35),
        start + 0.075,
      );
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * 0.1),
        start + 0.45,
      );
    }
    if (rifle && !heavy) {
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * 0.025),
        start + 0.055,
      );
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * (0.08 + distant * 0.18)),
        start + 0.09,
      );
    }
    if (heavy) {
      // A fuller report that holds, then the slap-back off the trench walls.
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.22), start + 0.05);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.05), start + 0.085);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * (0.2 + distant * 0.2)), start + 0.11);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.06), start + 0.16);
    }
    if (cue.kind === "timber") {
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * 0.12),
        start + 0.12,
      );
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * 0.1),
        start + treeFallTime - 0.03,
      );
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * 0.85),
        start + treeFallTime + 0.005,
      );
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * 0.15),
        start + treeFallTime + 0.14,
      );
      filter.frequency.setTargetAtTime(
        cue.occluded ? 300 : 550,
        start + treeFallTime - 0.02,
        0.015,
      );
    }
    if (mud)
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, volume * .3), start + .06);
    if (sludge) {
      for (const [offset, level] of [[.075, .22], [.17, .5], [.23, .1]])
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, volume * level), start + offset);
      filter.frequency.exponentialRampToValueAtTime(cue.occluded ? 140 : 190, end);
    }
    // A case rings on landing, bounces once and rattles to rest.
    if (brass)
      for (const [offset, level] of [[.03, .08], [.07, .7], [.1, .06], [.15, .35], [.2, .03]])
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, volume * level), start + offset);
    if (steam) {
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, volume * .8), start + .25);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, volume * .35), start + .9);
    }
    if (cue.kind === "leaves") {
      for(const [offset,level] of [[.045,.28],[.08,.7],[.15,.18]])
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*level),start+offset);
    }
    if (wet) {
      for (const [offset, level] of [[.028,.3],[.057,.6],[.13,.1]])
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, volume * level), start + offset);
      filter.frequency.exponentialRampToValueAtTime(cue.occluded ? 400 : 750, end);
    }
    if(cue.kind === "forestWind") envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.55),start+3.8);
    if(cue.kind === "forestCreak") {
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.22),start+.45);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.65),start+.9);
      filter.frequency.exponentialRampToValueAtTime(cue.occluded?160:240,end);
    }
    if(cue.kind === "wireWind") envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.4),start+3.2);
    if(cue.kind === "distantGun")
      for(let k=0;k<8;k++) {
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),start+.01+k*.12);
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.06),start+.07+k*.12);
      }
    if(cue.kind === "crow")
      for(const [offset,level] of [[.2,.08],[.34,1],[.6,.05]])
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*level),start+offset);
    if(cue.kind === "distantBattle") {
      for(const [offset,level] of [[.12,.12],[.24,.6],[.4,.08],[.64,.3],[1,.035]])
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*level),start+offset);
    }
    if (speech)
      envelope.gain.setValueAtTime(Math.max(0.0001, volume), end - 0.045);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    filter.connect(envelope);
    const nodes: AudioNode[] = [filter, envelope];
    let output: AudioNode = this.world;
    if (!cue.local) {
      const pan = c.createPanner();
      pan.panningModel = "equalpower";
      pan.distanceModel = "inverse";
      pan.refDistance = explosion
        ? 12
        : whistle
          ? 30
          : crack
            ? 2
            : speech
              ? 7
              : 5;
      pan.rolloffFactor = 1;
      pan.maxDistance = 160;
      pan.positionX.value = cue.at.x;
      pan.positionY.value = cue.at.y;
      pan.positionZ.value = cue.at.z;
      envelope.connect(pan).connect(this.world);
      nodes.push(pan);
      output = pan;
    } else envelope.connect(this.world);
    if (speech) {
      const source = c.createBufferSource();
      source.buffer = spoken!;
      source.playbackRate.value = speechRate;
      source.connect(filter);
      let cleaned = false;
      const stop = () => {
        if (cleaned) return;
        cleaned = true;
        source.onended = null;
        source.stop();
        source.disconnect();
        for (const n of nodes) n.disconnect();
        this.voices.delete(stop);
        if (this.speech === stop) this.speech = undefined;
      };
      source.onended = stop;
      this.speech = stop;
      this.voices.set(stop, priority);
      this.stats.peakVoices = Math.max(this.stats.peakVoices, this.voices.size);
      source.start(start);
      source.stop(end);
      return;
    }
    const noise = c.createBufferSource();
    noise.buffer = this.noise;
    noise.playbackRate.value = forest?.rate ?? mechanical?.rate ?? ((cue.kind === "serviceRifle" ? .78 : .92)+Math.abs(Math.sin(cue.seed*2.4))*.16)*shotPitch;
    noise.loop = true;
    noise.connect(filter);
    noise.start(start, Math.abs(Math.sin(cue.seed)) * 0.15);
    noise.stop(end);
    const sources: AudioScheduledSourceNode[] = [noise];
    if (explosion) {
      // Broadband concussion and a separate unpitched low rumble; no tonal "ping".
      const rumble = c.createBufferSource(),
        low = c.createBiquadFilter(),
        gain = c.createGain();
      rumble.buffer = this.noise;
      rumble.loop = true;
      rumble.playbackRate.value = 0.7;
      low.type = "lowpass";
      low.frequency.value = 180;
      low.Q.value = 0.6;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume * 0.85, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      rumble.connect(low).connect(gain).connect(output);
      rumble.start(start, 0.2);
      rumble.stop(end);
      sources.push(rumble);
      nodes.push(rumble, low, gain);
    }
    if (rifle || cue.kind === "wood" || whistle) {
      const body = c.createOscillator(),
        gain = c.createGain();
      body.type = whistle ? "sine" : "triangle";
      body.frequency.setValueAtTime(
        whistle
          ? 1600
          : heavy
            ? 72 * shotPitch
            : cue.kind === "machineGun"
            ? 115
            : explosion
              ? 95
              : rifle
                ? cue.kind === "serviceRifle"
                  ? 95
                  : 155
                : 260,
        start,
      );
      body.frequency.exponentialRampToValueAtTime(
        whistle ? 380 : explosion || heavy ? 32 : 70,
        end,
      );
      gain.gain.setValueAtTime(
        Math.max(0.0001, volume * (whistle ? 0.12 : explosion ? 0.6 : heavy ? 0.62 : 0.3)),
        start,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      body.connect(gain).connect(filter);
      body.start(start);
      body.stop(end);
      sources.push(body);
      nodes.push(gain, body);
    }
    if (heavy && cue.local) {
      // The operator also hears the lock work and the belt jerk through.
      const clatter = c.createBufferSource(), band = c.createBiquadFilter(), gain = c.createGain();
      clatter.buffer = this.noise;
      clatter.loop = true;
      clatter.playbackRate.value = 1.3 * shotPitch;
      band.type = "bandpass";
      band.frequency.value = 3100 * shotPitch;
      band.Q.value = 3.5;
      gain.gain.setValueAtTime(0.0001, start + 0.035);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.32), start + 0.045);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.04), start + 0.075);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.18), start + 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      clatter.connect(band).connect(gain).connect(output);
      clatter.start(start, Math.abs(Math.sin(cue.seed * 3.1)) * 0.2);
      clatter.stop(end);
      sources.push(clatter);
      nodes.push(clatter, band, gain);
    }
    nodes.push(noise);
    let cleaned = false;
    const stop = () => {
      if (cleaned) return;
      cleaned = true;
      for (const source of sources) {
        source.onended = null;
        source.stop();
      }
      for (const node of nodes) node.disconnect();
      this.voices.delete(stop);
    };
    noise.onended = stop;
    this.voices.set(stop, priority);
    this.stats.peakVoices = Math.max(this.stats.peakVoices, this.voices.size);
  }
  // A shell or bomb on its way in (src/shell-sound.ts): a sweeping band of
  // torn air, a whistle or wail over it, a throb for tumbling bombs and a
  // heavy's low roar, swelling as it comes and moving along its real path.
  private incoming(cue: SoundCue) {
    const voice = shellVoices[cue.shell ?? "field"];
    const path = cue.path?.length ? cue.path : [{ t: 0, at: cue.at }, { t: voice.lead, at: cue.at }];
    if (this.voices.size >= 40) {
      const victim = [...this.voices.entries()].sort((a, b) => a[1] - b[1]).find(([, rank]) => rank < 3);
      if (!victim) {
        this.stats.dropped++;
        return;
      }
      victim[0]();
      this.stats.stolen++;
    }
    this.stats.played++;
    this.stats.byKind[cue.kind] = (this.stats.byKind[cue.kind] ?? 0) + 1;
    this.stats.spatial++;
    const c = this.context, start = c.currentTime + (cue.delay ?? 0);
    const length = Math.max(0.12, path.at(-1)!.t), end = start + length + 0.03;
    const sources: AudioScheduledSourceNode[] = [], nodes: AudioNode[] = [];
    // The swell, sampled into a curve: built to the burst, or up and away.
    const curve = new Float32Array(48);
    for (let i = 0; i < curve.length; i++) {
      const f = i / (curve.length - 1);
      const shape = voice.pass ? Math.pow(Math.sin(f * Math.PI), 1.5) : Math.pow(f, voice.swell);
      curve[i] = Math.max(0.0001, cue.volume * (0.015 + 0.985 * shape));
    }
    if (!voice.pass) curve[curve.length - 1] = cue.volume;
    const envelope = c.createGain();
    envelope.gain.value = 0.0001;
    envelope.gain.setValueCurveAtTime(curve, start, length);
    envelope.gain.setValueAtTime(voice.pass ? 0.0001 : cue.volume, start + length);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    nodes.push(envelope);
    let into: AudioNode = envelope;
    if (voice.flutter) {
      const throb = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
      throb.gain.value = 1 - voice.flutter.depth / 2;
      lfo.frequency.value = voice.flutter.rate * (0.94 + (Math.abs(cue.seed) % 7) * 0.02);
      depth.gain.value = voice.flutter.depth / 2;
      lfo.connect(depth).connect(throb.gain);
      envelope.connect(throb);
      into = throb;
      lfo.start(start);
      lfo.stop(end);
      sources.push(lfo);
      nodes.push(throb, depth, lfo);
    }
    const pan = c.createPanner();
    pan.panningModel = "equalpower";
    pan.distanceModel = "inverse";
    pan.refDistance = voice.reach >= 150 ? 45 : voice.reach <= 45 ? 14 : 30;
    pan.rolloffFactor = 1;
    pan.maxDistance = Math.max(160, voice.reach * 2);
    const [first] = path;
    pan.positionX.setValueAtTime(first.at.x, start);
    pan.positionY.setValueAtTime(first.at.y, start);
    pan.positionZ.setValueAtTime(first.at.z, start);
    for (const point of path.slice(1)) {
      pan.positionX.linearRampToValueAtTime(point.at.x, start + point.t);
      pan.positionY.linearRampToValueAtTime(point.at.y, start + point.t);
      pan.positionZ.linearRampToValueAtTime(point.at.z, start + point.t);
    }
    into.connect(pan).connect(this.world);
    nodes.push(pan);
    const noise = (rate: number, type: BiquadFilterType, from: number, to: number, q: number, level: number) => {
      const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
      source.buffer = this.noise;
      source.loop = true;
      source.playbackRate.value = rate;
      filter.type = type;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, start);
      filter.frequency.exponentialRampToValueAtTime(to, start + length);
      gain.gain.value = level;
      source.connect(filter).connect(gain).connect(envelope);
      source.start(start, Math.abs(Math.sin(cue.seed * 1.7)) * 6);
      source.stop(end);
      sources.push(source);
      nodes.push(source, filter, gain);
    };
    const { rush, tone } = voice;
    noise(1, "bandpass", rush.from, rush.to, rush.q, rush.level);
    if (voice.rumble) noise(0.6, "lowpass", 220, 110, 0.6, voice.rumble);
    if (tone)
      for (const [ratio, level] of tone.interval ? [[1, 1], [tone.interval, 0.6]] : [[1, 1]]) {
        const o = c.createOscillator(), gain = c.createGain();
        o.type = tone.type;
        o.frequency.setValueAtTime(tone.from * ratio, start);
        o.frequency.exponentialRampToValueAtTime(tone.to * ratio, start + length);
        gain.gain.value = tone.level * level;
        o.connect(gain).connect(envelope);
        o.start(start);
        o.stop(end);
        sources.push(o);
        nodes.push(o, gain);
      }
    let cleaned = false;
    const stop = () => {
      if (cleaned) return;
      cleaned = true;
      for (const source of sources) {
        source.onended = null;
        source.stop();
      }
      for (const node of nodes) node.disconnect();
      this.voices.delete(stop);
    };
    sources[0].onended = stop;
    this.voices.set(stop, 3);
    this.stats.peakVoices = Math.max(this.stats.peakVoices, this.voices.size);
  }
  tone(freq: number, length = 0.08, volume = 0.04) {
    if (!this.running || this.voices.size >= 40) return;
    const c = this.context,
      o = c.createOscillator(),
      gain = c.createGain(),
      end = c.currentTime + length;
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq / 3), end);
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(gain).connect(this.master);
    let cleaned = false;
    const stop = () => {
      if (cleaned) return;
      cleaned = true;
      o.onended = null;
      o.stop();
      o.disconnect();
      gain.disconnect();
      this.voices.delete(stop);
    };
    o.onended = stop;
    this.voices.set(stop, 2);
    this.stats.peakVoices = Math.max(this.stats.peakVoices, this.voices.size);
    o.start();
    o.stop(end);
  }
}
