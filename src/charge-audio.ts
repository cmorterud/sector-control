// The officer's trench whistle and the yell of men going over the top,
// synthesized like the rest of the battle audio: no recordings or speech.
import type { BattleAudio } from "./battle-audio";
import type { V3 } from "./simulation";

function output(audio: BattleAudio, at: V3 | null, ref: number) {
  const c = audio.context;
  if (!at) return { node: audio.bus as AudioNode, extra: [] as AudioNode[] };
  const pan = c.createPanner();
  pan.panningModel = "equalpower";
  pan.distanceModel = "inverse";
  pan.refDistance = ref;
  pan.maxDistance = 160;
  pan.positionX.value = at.x;
  pan.positionY.value = at.y;
  pan.positionZ.value = at.z;
  pan.connect(audio.bus);
  return { node: pan as AudioNode, extra: [pan as AudioNode] };
}
function cleanup(sources: AudioScheduledSourceNode[], nodes: AudioNode[]) {
  let done = 0;
  for (const s of sources)
    s.onended = () => {
      if (++done < sources.length) return;
      for (const n of [...sources, ...nodes]) n.disconnect();
    };
}

// A pea whistle: a short blast then a long one, with the pea's rattle (a
// fast tremolo) on a shrill tone around 2.9 kHz. `at` null plays it as yours.
export function playWhistle(audio: BattleAudio, at: V3 | null, volume = 0.16) {
  if (!audio.live) return;
  const c = audio.context, now = c.currentTime + 0.01;
  const { node, extra } = output(audio, at, 25);
  const tone = c.createOscillator(), rattle = c.createOscillator(), depth = c.createGain(), level = c.createGain();
  tone.type = "sine";
  tone.frequency.setValueAtTime(2750, now);
  tone.frequency.linearRampToValueAtTime(2950, now + 0.12);
  tone.frequency.setValueAtTime(2800, now + 0.3);
  tone.frequency.linearRampToValueAtTime(3000, now + 0.5);
  tone.frequency.linearRampToValueAtTime(2900, now + 1.15);
  rattle.frequency.value = 34;
  depth.gain.value = 0.3;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, now);
  for (const [from, to] of [[0, 0.17], [0.3, 1.15]]) {
    env.gain.exponentialRampToValueAtTime(volume, now + from + 0.025);
    env.gain.setValueAtTime(volume, now + to - 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, now + to);
  }
  // The rattle swings the level between about 40% and full.
  level.gain.value = 0.7;
  rattle.connect(depth).connect(level.gain);
  tone.connect(level).connect(env).connect(node);
  for (const s of [tone, rattle]) {
    s.start(now);
    s.stop(now + 1.2);
  }
  cleanup([tone, rattle], [depth, level, env, ...extra]);
}

// A ragged "hurrah" from `voices` men: buzzy throats through an "ah" formant,
// each rising then breaking, started a little apart.
export function playChargeYell(audio: BattleAudio, at: V3 | null, voices: number, volume = 0.05) {
  if (!audio.live || voices <= 0) return;
  const c = audio.context;
  const { node, extra } = output(audio, at, 12);
  const sources: AudioScheduledSourceNode[] = [], nodes: AudioNode[] = [...extra];
  for (let i = 0; i < Math.min(6, voices); i++) {
    const start = c.currentTime + 0.25 + i * 0.09 + (i % 2) * 0.05, length = 1.3 + (i % 3) * 0.25;
    const throat = c.createOscillator(), vibrato = c.createOscillator(), wobble = c.createGain();
    const low = c.createBiquadFilter(), high = c.createBiquadFilter(), env = c.createGain();
    const pitch = 150 + ((i * 37) % 90);
    throat.type = "sawtooth";
    throat.frequency.setValueAtTime(pitch, start);
    throat.frequency.linearRampToValueAtTime(pitch * 1.35, start + length * 0.4);
    throat.frequency.linearRampToValueAtTime(pitch * 1.1, start + length);
    vibrato.frequency.value = 5 + (i % 3);
    wobble.gain.value = pitch * 0.04;
    vibrato.connect(wobble).connect(throat.frequency);
    low.type = high.type = "bandpass";
    low.frequency.value = 720 + (i % 2) * 60;
    high.frequency.value = 1180 + (i % 3) * 70;
    low.Q.value = high.Q.value = 4;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(volume, start + 0.12);
    env.gain.setValueAtTime(volume, start + length * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, start + length);
    throat.connect(low).connect(env);
    throat.connect(high).connect(env);
    env.connect(node);
    for (const s of [throat, vibrato]) {
      s.start(start);
      s.stop(start + length);
      sources.push(s);
    }
    nodes.push(wobble, low, high, env);
  }
  cleanup(sources, nodes);
}
