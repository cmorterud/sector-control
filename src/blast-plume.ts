// Fast, connected dirt column followed by slower drifting ground dust. Purely cosmetic.
export function blastPlume(age: number, index: number, power = 1, seed = 0) {
  const t = Math.max(0, age),
    core = index < 3;
  const sample = (salt: number) => {
    const v = Math.sin((index + seed * 0.17 + salt) * 127.1) * 43758.5453;
    return v - Math.floor(v);
  };
  const angle = index * 2.39996 + sample(7) * 0.9;
  const spread = core
    ? index * 0.16 * power
    : (0.25 + Math.sqrt(t) * (1.1 + sample(3) * 1.2)) * power;
  const rise = core
    ? Math.min(4.8 * power, t * 4.7 * power) * (1 - index * 0.39)
    : 0.15 + t * (0.25 + sample(2) * 0.35);
  const size =
    (0.45 + Math.sqrt(t) * (core ? 2.8 : 1.6 + sample(4) * 1.1)) * power;
  return {
    x: Math.sin(angle) * spread + (index === 0 ? 0 : t * 0.22),
    y: rise,
    z: Math.cos(angle) * spread + (index === 0 ? 0 : t * 0.1),
    size,
    height: size * (core ? 1.2 : 0.55 + sample(5) * 0.35),
    roll: core
      ? (sample(6) - 0.5) * 12
      : sample(6) * 360 + t * (sample(8) - 0.5) * 6,
  };
}
