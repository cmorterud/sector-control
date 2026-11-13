import { shotVoice, mechanicalVoice } from "./weapon-sound";
import { voiceLines, type VoiceLine } from "./soldier-chatter";
import type { SoundCue } from "./battlefield";
import { treeFallTime } from "./environment-effects";
import { forestVoice } from "./forest-sound";
import type { V3 } from "./simulation";

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
  prepareVoices() {
    this.speechLoading ??= Promise.all(
      voiceLines.flatMap((line) =>
        [0, 1].map(async (variant) => {
          try {
            const response = await fetch(
              `/audio/voices/${line}-${variant}.wav`,
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
    const speech = cue.kind === "voice";
    const background = ["forestWind","forestCreak","distantBattle"].includes(cue.kind);
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
    if (this.voices.size >= (important ? 40 : 28)) {
      const victim = [...this.voices.entries()]
        .sort((a, b) => a[1] - b[1])
        .find(([, rank]) => rank < priority);
      if (victim && (priority === 3 || speech)) {
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
    const foot = ["mud", "wood", "concrete", "leaves"].includes(cue.kind);
    const rifle =
      cue.kind === "rifle" ||
      cue.kind === "serviceRifle" ||
      cue.kind === "machineGun" || cue.kind === "pistol";
    const melee = cue.kind === "meleeSwing" || cue.kind === "meleeHit";
    const mechanism = ["bolt","clip","equip","magazine"].includes(cue.kind);
    const mechanical=mechanism?mechanicalVoice(cue.kind,cue.action,cue.weaponId):undefined;
    const shotPitch=shotVoice(cue.weaponId);
    const whistle = cue.kind === "whistle";
    const crack = cue.kind === "crack";
    const distant = Math.min(1, cue.distance / 100);
    const length = forest?.length ?? (mechanical ? mechanical.length : cue.kind === "flame" ? .14 : melee
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
                    ? 0.16
                    : cue.kind === "timber"
                      ? 1.5
                      : 0.65);
    const delay =
      cue.local || crack || foot || whistle
        ? 0
        : Math.min(0.35, cue.distance / 343);
    const start = c.currentTime + delay;
    const end = start + length;
    const filter = c.createBiquadFilter();
    filter.type = forest ? forest.band ? "bandpass" : "lowpass" : crack || whistle || mechanism ? "bandpass" : "lowpass";
    filter.Q.value = whistle ? 7 : crack ? 0.8 : 0.5;
    filter.frequency.value = forest?.frequency ?? (mechanical ? mechanical.frequency : cue.kind === "flame" ? 1500 : melee
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
                  ? 550
                  : cue.kind === "wood"
                    ? 1900
                    : foot
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
    const volume = cue.volume * (mechanical?.volume??1) * (cue.occluded ? 0.48 : 1);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, volume),
      start + (forest?.attack ?? (whistle ? 0.1 : explosion ? 0.001 : 0.004)),
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
    if (rifle) {
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * 0.025),
        start + 0.055,
      );
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * (0.08 + distant * 0.18)),
        start + 0.09,
      );
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
    if (cue.kind === "leaves") {
      for(const [offset,level] of [[.045,.28],[.08,.7],[.15,.18]])
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*level),start+offset);
    }
    if(cue.kind === "forestWind") envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.55),start+3.8);
    if(cue.kind === "forestCreak") {
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.22),start+.45);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.65),start+.9);
      filter.frequency.exponentialRampToValueAtTime(cue.occluded?160:240,end);
    }
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
        whistle ? 380 : explosion ? 32 : 70,
        end,
      );
      gain.gain.setValueAtTime(
        Math.max(0.0001, volume * (whistle ? 0.12 : explosion ? 0.6 : 0.3)),
        start,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      body.connect(gain).connect(filter);
      body.start(start);
      body.stop(end);
      sources.push(body);
      nodes.push(gain, body);
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
